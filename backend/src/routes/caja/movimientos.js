import { z } from 'zod'
import { resolveOrdenForWrite } from '../relation-guards.js'

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

function cleanText(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

export async function resolveCajaMovementTraceability(prisma, data) {
  let ordenId = data.ordenId ?? null
  const gastoTipoId = data.gastoTipoId ?? null

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

  if (data.tipo === 'Ingreso' && gastoTipoId) {
    return { status: 400, error: 'gastoTipoId solo aplica a egresos' }
  }

  if (data.tipo === 'Egreso' && !ordenId && !gastoTipoId) {
    return { status: 400, error: 'gastoTipoId u ordenId requerido para egreso' }
  }

  const origenTipo = cleanText(data.origenTipo)
    || (ordenId ? 'orden' : gastoTipoId ? 'gasto' : 'manual')
  const origenId = data.origenId ?? ordenId ?? gastoTipoId ?? null

  if (origenTipo === 'orden' && origenId && ordenId && origenId !== ordenId) {
    return { status: 409, error: 'origenId no coincide con ordenId' }
  }

  if (origenTipo === 'gasto' && origenId && gastoTipoId && origenId !== gastoTipoId) {
    return { status: 409, error: 'origenId no coincide con gastoTipoId' }
  }

  return { ordenId, gastoTipoId, origenTipo, origenId }
}

export default async function movimientosRoutes(fastify) {
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
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'write')],
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
