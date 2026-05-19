import { z } from 'zod'

const AbrirSchema = z.object({
  cajaId: z.number().int().default(1),
})

function acumularTotales(movimientos) {
  const totals = { efectivo: 0, debito: 0, credito: 0, transferencia: 0, chequeDia: 0, chequeFecha: 0, webpay: 0, transbank: 0, otros: 0 }
  for (const m of movimientos) {
    const mp = (m.medioPago || '').toLowerCase()
    const monto = m.monto || 0
    if (mp === 'efectivo') totals.efectivo += monto
    else if (mp === 'débito' || mp === 'debito') totals.debito += monto
    else if (mp === 'crédito' || mp === 'credito') totals.credito += monto
    else if (mp === 'transferencia') totals.transferencia += monto
    else if (mp === 'cheque') totals.chequeDia += monto
    else if (mp === 'webpay') totals.webpay += monto
    else if (mp === 'transbank') totals.transbank += monto
    else totals.otros += monto
  }
  return totals
}

export default async function turnoRoutes(fastify) {
  fastify.get('/turno', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'read')],
  }, async () => {
    const turno = await fastify.prisma.turno.findFirst({
      where: { estado: 'abierto' },
      include: { movimientos: { where: { eliminado: false }, orderBy: { createdAt: 'desc' } }, caja: true },
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('caja-turno-open')::bigint)`
      const caja = await tx.caja.findUnique({
        where: { id: parsed.data.cajaId },
        select: { id: true, activa: true },
      })
      if (!caja) return { status: 404, payload: { error: 'Caja no encontrada' } }
      if (!caja.activa) return { status: 409, payload: { error: 'Caja inactiva' } }
      const open = await tx.turno.findFirst({ where: { estado: 'abierto' } })
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
    const { obs } = request.body || {}

    const result = await fastify.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw`
        SELECT id, estado
        FROM caja.turnos
        WHERE id = ${id}
        FOR UPDATE
      `
      const lockedTurno = lockedRows[0]
      if (!lockedTurno) return { status: 404, payload: { error: 'Turno no encontrado' } }
      if (lockedTurno.estado !== 'abierto') {
        return { status: 400, payload: { error: 'El turno ya esta cerrado' } }
      }

      const movimientos = await tx.movimientoCaja.findMany({
        where: { turnoId: id, eliminado: false },
      })
      const totals = acumularTotales(movimientos)
      const total = Object.values(totals).reduce((s, v) => s + v, 0)

      const updated = await tx.turno.update({
        where: { id },
        data: { estado: 'cerrado', cierre: new Date() },
        include: { movimientos: { where: { eliminado: false } }, caja: true },
      })
      await tx.cierreCaja.upsert({
        where: { turnoId: id },
        create: { turnoId: id, ...totals, total, obs: obs || null },
        update: { ...totals, total, obs: obs || null },
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
    const cierre = await fastify.prisma.cierreCaja.findUnique({ where: { turnoId: id } })
    if (!cierre) return reply.code(404).send({ error: 'Sin cierre registrado' })
    return cierre
  })
}
