import { z } from 'zod'

const CreateSchema = z.object({
  numero: z.string().min(1),
  fecha: z.string().min(1),
  transportista: z.string().min(1),
})

export default async function ordenTransporteRoutes(fastify) {
  const readAuth = { preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')] }
  const writeAuth = { preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')] }

  fastify.get('/:id/ordenes-transporte', readAuth, async (request, reply) => {
    const ordenId = parseInt(request.params.id, 10)
    if (isNaN(ordenId)) return reply.code(400).send({ error: 'ID invalido' })
    const items = await fastify.prisma.ordenTransporte.findMany({
      where: { ordenId },
      orderBy: { createdAt: 'desc' },
    })
    return { items }
  })

  fastify.post('/:id/ordenes-transporte', writeAuth, async (request, reply) => {
    const ordenId = parseInt(request.params.id, 10)
    if (isNaN(ordenId)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = CreateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const orden = await fastify.prisma.orden.findUnique({ where: { id: ordenId }, select: { id: true } })
    if (!orden) return reply.code(404).send({ error: 'Venta no encontrada' })
    const created = await fastify.prisma.ordenTransporte.create({
      data: {
        ordenId,
        numero: parsed.data.numero,
        fecha: new Date(parsed.data.fecha),
        transportista: parsed.data.transportista,
        usuario: request.user?.nombre || null,
      },
    })
    return reply.code(201).send(created)
  })

  fastify.delete('/ordenes-transporte/:id', writeAuth, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    try {
      await fastify.prisma.ordenTransporte.delete({ where: { id } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
      throw e
    }
  })
}
