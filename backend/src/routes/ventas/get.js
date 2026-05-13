import { computeTotal, attachCliente } from './helpers.js'

export default async function getVenta(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const o = await fastify.prisma.orden.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!o) return reply.code(404).send({ error: 'Venta no encontrada' })
    const withCliente = await attachCliente(fastify, o)
    return { ...withCliente, total: computeTotal(o.items, o.descuentoPct) }
  })
}
