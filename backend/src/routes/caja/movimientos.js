import { z } from 'zod'
import { resolveOrdenForWrite } from '../relation-guards.js'
import { computeTotal } from '../ventas/helpers.js'

const MEDIOS_PAGO = [
  'Efectivo',
  'Debito',
  'Credito',
  'Débito',
  'Crédito',
  'Transferencia',
  'Cheque',
  'Referencial',
  'Webpay',
  'Transbank',
]

const optionalPositiveInt = z.number().int().positive().optional()

const Schema = z.object({
  tipo: z.enum(['Ingreso', 'Egreso']),
  monto: z.number().positive(),
  medioPago: z.enum(MEDIOS_PAGO),
  referencia: z.string().optional(),
  ordenId: optionalPositiveInt,
  documento: z.string().optional(),
  nDoc: z.string().optional(),
  tipoDocumento: z.string().optional(),
  cuotas: optionalPositiveInt,
  pagaCon: z.number().min(0).optional(),
  nMedioPago: z.string().optional(),
  origenMedioPago: z.string().optional(),
  gastoTipoId: optionalPositiveInt,
  origenTipo: z.string().trim().min(1).optional(),
  origenId: optionalPositiveInt,
})

const PagoCobranzaSchema = z.object({
  monto: z.number().positive(),
  medioPago: z.enum(MEDIOS_PAGO).default('Efectivo'),
  referencia: z.string().optional(),
  documento: z.string().optional(),
  nDoc: z.string().optional(),
  tipoDocumento: z.string().optional(),
  cuotas: optionalPositiveInt,
  pagaCon: z.number().min(0).optional(),
  nMedioPago: z.string().optional(),
  origenMedioPago: z.string().optional(),
})

function cleanText(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

export async function resolveCajaMovementTraceability(prisma, data) {
  let ordenId = data.ordenId ?? null
  const gastoTipoId = data.gastoTipoId ?? null
  const origenTipoInput = cleanText(data.origenTipo)
  const allowedOrigenTipos = new Set(['manual', 'orden', 'gasto'])

  if (data.tipo === 'Ingreso' && gastoTipoId) {
    return { status: 400, error: 'gastoTipoId solo aplica a egresos' }
  }

  if (data.tipo === 'Ingreso' && ordenId) {
    return {
      status: 400,
      error: 'Los pagos de venta deben registrarse por cobranza',
    }
  }

  if (ordenId) {
    const resolvedOrden = await resolveOrdenForWrite(prisma, { ordenId })
    if (resolvedOrden.error) return resolvedOrden
  }

  if (gastoTipoId) {
    const gasto = await prisma.gasto.findUnique({
      where: { id: gastoTipoId },
      select: { id: true, activo: true },
    })
    if (!gasto) return { status: 404, error: 'Tipo de gasto no encontrado' }
    if (!gasto.activo) return { status: 409, error: 'Tipo de gasto inactivo' }
  }

  if (data.tipo === 'Egreso' && !ordenId && !gastoTipoId) {
    return { status: 400, error: 'gastoTipoId u ordenId requerido para egreso' }
  }

  const origenTipo = origenTipoInput || (ordenId ? 'orden' : gastoTipoId ? 'gasto' : 'manual')
  if (!allowedOrigenTipos.has(origenTipo)) {
    return { status: 400, error: 'origenTipo invalido' }
  }

  const origenId = data.origenId ?? ordenId ?? gastoTipoId ?? null

  if (origenTipo === 'manual' && (ordenId || gastoTipoId || origenId)) {
    return { status: 400, error: 'Movimiento manual no debe tener origen asociado' }
  }

  if (origenTipo === 'orden' && !ordenId) {
    return { status: 400, error: 'origenTipo orden requiere ordenId' }
  }

  if (origenTipo === 'gasto' && !gastoTipoId) {
    return { status: 400, error: 'origenTipo gasto requiere gastoTipoId' }
  }

  if (origenTipo === 'orden' && origenId !== ordenId) {
    return { status: 409, error: 'origenId no coincide con ordenId' }
  }

  if (origenTipo === 'gasto' && origenId !== gastoTipoId) {
    return { status: 409, error: 'origenId no coincide con gastoTipoId' }
  }

  return { ordenId, gastoTipoId, origenTipo, origenId }
}

export default async function movimientosRoutes(fastify) {
  fastify.post('/cobranza/orden/:id/pago', {
    preHandler: [fastify.authenticate, fastify.rbac('cobranza', 'write')],
  }, async (request, reply) => {
    const ordenId = parseInt(request.params.id, 10)
    if (isNaN(ordenId) || ordenId <= 0) return reply.code(400).send({ error: 'ID invalido' })

    const parsed = PagoCobranzaSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })

    const d = parsed.data
    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        const lockedTurnos = await tx.$queryRaw`
          SELECT id, estado
          FROM caja.turnos
          WHERE estado = 'abierto'
          ORDER BY apertura DESC
          LIMIT 1
          FOR UPDATE
        `
        const turno = lockedTurnos[0]
        if (!turno) {
          const err = new Error('No hay turno abierto')
          err.statusCode = 400
          throw err
        }

        const orden = await tx.orden.findUnique({
          where: { id: ordenId },
          include: { items: true },
        })
        if (!orden || orden.eliminada) {
          const err = new Error('Venta no encontrada')
          err.statusCode = 404
          throw err
        }

        const total = computeTotal(orden.items, orden.descuentoPct)
        const abonoActual = orden.abono || 0
        const saldo = Math.max(0, total - abonoActual)
        if (saldo <= 0) {
          const err = new Error('La venta ya esta pagada')
          err.statusCode = 409
          throw err
        }
        if (d.monto > saldo) {
          const err = new Error('El monto excede el saldo pendiente')
          err.statusCode = 409
          throw err
        }

        const usuario = request.user?.nombre || request.user?.username || null
        const fecha = new Date()
        const applied = await tx.orden.updateMany({
          where: {
            id: ordenId,
            eliminada: false,
            OR: [
              { abono: null },
              { abono: { lte: total - d.monto } },
            ],
          },
          data: {
            abono: { increment: d.monto },
            userMod: usuario,
            fecham: fecha,
          },
        })
        if (applied.count !== 1) {
          const err = new Error('El saldo de la venta cambio; vuelve a intentar')
          err.statusCode = 409
          throw err
        }

        const ordenConAbono = await tx.orden.findUnique({
          where: { id: ordenId },
          include: { items: true },
        })
        const estadoPago = (ordenConAbono.abono || 0) >= total ? 'Pagada' : 'Parcial'
        const ordenActualizada = await tx.orden.update({
          where: { id: ordenId },
          data: { estadoPago },
          include: { items: true },
        })
        const referencia = cleanText(d.referencia)
          || `Pago venta ${orden.nInterno ? `N interno ${orden.nInterno}` : `#${orden.id}`}`
        const movimiento = await tx.movimientoCaja.create({
          data: {
            turnoId: turno.id,
            tipo: 'Ingreso',
            monto: Math.abs(d.monto),
            medioPago: d.medioPago,
            referencia,
            ordenId,
            documento: d.documento,
            nDoc: d.nDoc,
            tipoDocumento: d.tipoDocumento,
            estadoPagoDoc: estadoPago,
            cuotas: d.cuotas,
            pagaCon: d.pagaCon,
            nMedioPago: d.nMedioPago,
            origenMedioPago: d.origenMedioPago,
            origenTipo: 'orden',
            origenId: ordenId,
            usuario,
            fecha,
          },
        })

        return {
          movimiento,
          orden: {
            ...ordenActualizada,
            total,
            saldo: Math.max(0, total - (ordenActualizada.abono || 0)),
          },
        }
      })

      return reply.code(201).send(result)
    } catch (e) {
      if (e.statusCode) return reply.code(e.statusCode).send({ error: e.message })
      throw e
    }
  })

  fastify.post('/turno/:id/movimientos', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'write')],
  }, async (request, reply) => {
    const turnoId = parseInt(request.params.id, 10)
    if (isNaN(turnoId) || turnoId <= 0) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })

    const d = parsed.data
    const traceability = await resolveCajaMovementTraceability(fastify.prisma, d)
    if (traceability.error) return reply.code(traceability.status || 400).send({ error: traceability.error })

    const result = await fastify.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw`
        SELECT id, estado
        FROM caja.turnos
        WHERE id = ${turnoId}
        FOR UPDATE
      `
      const turno = lockedRows[0]
      if (!turno) return { status: 404, payload: { error: 'Turno no encontrado' } }
      if (turno.estado !== 'abierto') return { status: 400, payload: { error: 'Turno cerrado' } }

      const mov = await tx.movimientoCaja.create({
        data: {
          turnoId,
          tipo: d.tipo,
          monto: d.tipo === 'Egreso' ? -Math.abs(d.monto) : Math.abs(d.monto),
          medioPago: d.medioPago,
          referencia: d.referencia,
          ordenId: traceability.ordenId,
          documento: d.documento,
          nDoc: d.nDoc,
          tipoDocumento: d.tipoDocumento,
          cuotas: d.cuotas,
          pagaCon: d.pagaCon,
          nMedioPago: d.nMedioPago,
          origenMedioPago: d.origenMedioPago,
          gastoTipoId: traceability.gastoTipoId,
          origenTipo: traceability.origenTipo,
          origenId: traceability.origenId,
          usuario: request.user?.nombre || request.user?.username || null,
          fecha: new Date(),
        },
      })
      return { status: 201, payload: mov }
    })

    return reply.code(result.status).send(result.payload)
  })

  fastify.delete('/movimientos/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id) || id <= 0) return reply.code(400).send({ error: 'ID invalido' })
    const mov = await fastify.prisma.movimientoCaja.findUnique({
      where: { id },
      select: { id: true, turno: { select: { estado: true } } },
    })
    if (!mov) return reply.code(404).send({ error: 'no encontrado' })
    if (mov.turno?.estado === 'cerrado') {
      return reply.code(409).send({ error: 'No se puede eliminar movimiento de turno cerrado' })
    }

    await fastify.prisma.movimientoCaja.update({
      where: { id }, data: { eliminado: true, userMod: request.user?.nombre || null, fecham: new Date() },
    })
    return reply.code(204).send()
  })
}
