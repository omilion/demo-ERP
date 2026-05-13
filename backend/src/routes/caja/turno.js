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
    const turno = await fastify.prisma.turno.findUnique({ where: { id } })
    if (!turno) return reply.code(404).send({ error: 'Turno no encontrado' })
    if (turno.estado !== 'abierto') return reply.code(400).send({ error: 'El turno ya está cerrado' })
    return fastify.prisma.turno.update({
      where: { id },
      data: { estado: 'cerrado', cierre: new Date() },
      include: { movimientos: true, caja: true },
    })
  })
}
