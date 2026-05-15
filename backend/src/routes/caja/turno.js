import { z } from 'zod'

const AbrirSchema = z.object({
  cajaId: z.number().int().default(1),
})

export default async function turnoRoutes(fastify) {
  fastify.get('/turno', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'read')],
  }, async (request, reply) => {
    const turno = await fastify.prisma.turno.findFirst({
      where: { estado: 'abierto' },
      include: { movimientos: { orderBy: { createdAt: 'desc' } }, caja: true },
      orderBy: { apertura: 'desc' },
    })
    return turno ?? null
  })

  fastify.post('/turno', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'write')],
  }, async (request, reply) => {
    const parsed = AbrirSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const open = await fastify.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (open) return reply.code(409).send({ error: 'Ya hay un turno abierto' })
    const turno = await fastify.prisma.turno.create({
      data: { cajaId: parsed.data.cajaId, userId: request.user.id, estado: 'abierto' },
      include: { movimientos: true, caja: true },
    })
    return reply.code(201).send(turno)
  })

  fastify.post('/turno/:id/cerrar', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const turno = await fastify.prisma.turno.findUnique({
      where: { id }, include: { movimientos: { where: { eliminado: false } } },
    })
    if (!turno) return reply.code(404).send({ error: 'Turno no encontrado' })
    if (turno.estado !== 'abierto') return reply.code(400).send({ error: 'El turno ya está cerrado' })
    // Snapshot por medio de pago
    const totals = { efectivo: 0, debito: 0, credito: 0, transferencia: 0, chequeDia: 0, chequeFecha: 0, webpay: 0, transbank: 0, otros: 0 }
    for (const m of turno.movimientos) {
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
    const total = Object.values(totals).reduce((s, v) => s + v, 0)
    const { obs } = request.body || {}
    const [updated] = await fastify.prisma.$transaction([
      fastify.prisma.turno.update({
        where: { id }, data: { estado: 'cerrado', cierre: new Date() },
        include: { movimientos: true, caja: true },
      }),
      fastify.prisma.cierreCaja.upsert({
        where: { turnoId: id },
        create: { turnoId: id, ...totals, total, obs: obs || null },
        update: { ...totals, total, obs: obs || null },
      }),
    ])
    return updated
  })

  fastify.get('/turno/:id/cierre', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const cierre = await fastify.prisma.cierreCaja.findUnique({ where: { turnoId: id } })
    if (!cierre) return reply.code(404).send({ error: 'Sin cierre registrado' })
    return cierre
  })
}
