import { z } from 'zod'
import { getUserSucursalId, isReferencialMedioPago, normalizeMedioPago, withCajaSucursalScope, withTurnoSucursalScope } from './scope.js'

const AbrirSchema = z.object({
  cajaId: z.number().int().default(1),
})

const CierreSchema = z.object({
  obs: z.string().optional(),
  conteo: z.object({
    efectivo: z.number().min(0).default(0),
    debito: z.number().min(0).default(0),
    credito: z.number().min(0).default(0),
    transferencia: z.number().min(0).default(0),
    chequeDia: z.number().min(0).default(0),
    chequeFecha: z.number().min(0).default(0),
    webpay: z.number().min(0).default(0),
    transbank: z.number().min(0).default(0),
    otros: z.number().min(0).default(0),
  }).optional(),
})

function acumularTotales(movimientos) {
  const totals = { efectivo: 0, debito: 0, credito: 0, transferencia: 0, chequeDia: 0, chequeFecha: 0, webpay: 0, transbank: 0, otros: 0 }
  for (const m of movimientos) {
    if (isReferencialMedioPago(m.medioPago)) continue
    const mp = normalizeMedioPago(m.medioPago)
    const monto = m.monto || 0
    if (mp === 'efectivo') totals.efectivo += monto
    else if (mp === 'débito' || mp === 'debito') totals.debito += monto
    else if (mp === 'crédito' || mp === 'credito') totals.credito += monto
    else if (mp === 'transferencia') totals.transferencia += monto
    else if (mp === 'cheque' || mp === 'cheque dia') totals.chequeDia += monto
    else if (mp === 'cheque fecha') totals.chequeFecha += monto
    else if (mp === 'webpay') totals.webpay += monto
    else if (mp === 'transbank') totals.transbank += monto
    else totals.otros += monto
  }
  return totals
}

export default async function turnoRoutes(fastify) {
  fastify.get('/turno', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'read')],
  }, async (request) => {
    const turno = await fastify.prisma.turno.findFirst({
      where: withTurnoSucursalScope(request.user, { estado: 'abierto' }),
      include: {
        movimientos: {
          where: { eliminado: false },
          orderBy: { createdAt: 'desc' },
          include: { gastoTipo: { select: { id: true, nombre: true, activo: true } } },
        },
        caja: true,
      },
      orderBy: { apertura: 'desc' },
    })
    return turno ?? null
  })

  fastify.post('/turno', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'write')],
  }, async (request, reply) => {
    const parsed = AbrirSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const result = await fastify.prisma.$transaction(async (tx) => {
      const sucursalId = getUserSucursalId(request.user)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`caja-turno-open-${sucursalId || 'global'}`})::bigint)`
      const caja = await tx.caja.findFirst({
        where: withCajaSucursalScope(request.user, { id: parsed.data.cajaId }),
        select: { id: true, activa: true, sucursalId: true },
      })
      if (!caja) return { status: 404, payload: { error: 'Caja no encontrada' } }
      if (!caja.activa) return { status: 409, payload: { error: 'Caja inactiva' } }
      const open = await tx.turno.findFirst({ where: withTurnoSucursalScope(request.user, { estado: 'abierto' }) })
      if (open) return { status: 409, payload: { error: 'Ya hay un turno abierto' } }
      const turno = await tx.turno.create({
        data: { cajaId: parsed.data.cajaId, userId: request.user.id, estado: 'abierto' },
        include: { movimientos: true, caja: true },
      })
      return { status: 201, payload: turno }
    })
    return reply.code(result.status).send(result.payload)
  })

  fastify.post('/turno/:id/cerrar', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id) || id <= 0) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = CierreSchema.safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const { obs, conteo } = parsed.data

    const result = await fastify.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw`
        SELECT id
        FROM caja.turnos
        WHERE id = ${id}
        FOR UPDATE
      `
      if (!lockedRows[0]) return { status: 404, payload: { error: 'Turno no encontrado' } }
      const lockedTurno = await tx.turno.findFirst({
        where: withTurnoSucursalScope(request.user, { id }),
        select: { id: true, estado: true },
      })
      if (!lockedTurno) return { status: 404, payload: { error: 'Turno no encontrado' } }
      if (lockedTurno.estado !== 'abierto') {
        return { status: 400, payload: { error: 'El turno ya esta cerrado' } }
      }

      const movimientos = await tx.movimientoCaja.findMany({
        where: { turnoId: id, eliminado: false },
      })
      const totals = acumularTotales(movimientos)
      const total = Object.values(totals).reduce((s, v) => s + v, 0)
      const counted = conteo || totals
      const totalContado = Object.values(counted).reduce((s, v) => s + v, 0)
      const diferencia = totalContado - total

      const updated = await tx.turno.update({
        where: { id },
        data: { estado: 'cerrado', cierre: new Date(), cerradoPorId: request.user.id },
        include: {
          movimientos: {
            where: { eliminado: false },
            include: { gastoTipo: { select: { id: true, nombre: true, activo: true } } },
          },
          caja: true,
        },
      })
      await tx.cierreCaja.upsert({
        where: { turnoId: id },
        create: {
          turnoId: id,
          cerradoPorId: request.user.id,
          cerradoPorNombre: request.user?.nombre || null,
          ...totals,
          total,
          efectivoContado: counted.efectivo,
          debitoContado: counted.debito,
          creditoContado: counted.credito,
          chequeDiaContado: counted.chequeDia,
          chequeFechaContado: counted.chequeFecha,
          transferenciaContado: counted.transferencia,
          webpayContado: counted.webpay,
          transbankContado: counted.transbank,
          otrosContado: counted.otros,
          totalContado,
          diferencia,
          obs: obs || null,
        },
        update: {
          cerradoPorId: request.user.id,
          cerradoPorNombre: request.user?.nombre || null,
          ...totals,
          total,
          efectivoContado: counted.efectivo,
          debitoContado: counted.debito,
          creditoContado: counted.credito,
          chequeDiaContado: counted.chequeDia,
          chequeFechaContado: counted.chequeFecha,
          transferenciaContado: counted.transferencia,
          webpayContado: counted.webpay,
          transbankContado: counted.transbank,
          otrosContado: counted.otros,
          totalContado,
          diferencia,
          obs: obs || null,
        },
      })
      return { status: 200, payload: updated }
    })

    return reply.code(result.status).send(result.payload)
  })

  fastify.get('/turno/:id/cierre', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id) || id <= 0) return reply.code(400).send({ error: 'ID invalido' })
    const cierre = await fastify.prisma.cierreCaja.findFirst({
      where: { turnoId: id, turno: withTurnoSucursalScope(request.user, {}) },
    })
    if (!cierre) return reply.code(404).send({ error: 'Sin cierre registrado' })
    return cierre
  })
}
