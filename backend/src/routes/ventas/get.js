import { computeTotal, attachCliente, attachProductos } from './helpers.js'

export default async function getVenta(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const [o, odts, pagos] = await Promise.all([
      fastify.prisma.orden.findUnique({ where: { id }, include: { items: true } }),
      fastify.prisma.odt.findMany({ where: { ordenId: id }, orderBy: { createdAt: 'desc' } }),
      fastify.prisma.movimientoCaja.findMany({ where: { ordenId: id }, orderBy: { createdAt: 'desc' } }),
    ])
    if (!o) return reply.code(404).send({ error: 'Venta no encontrada' })
    const withCliente = await attachCliente(fastify, o)
    const items = await attachProductos(fastify, o.items)
    return { ...withCliente, items, total: computeTotal(o.items, o.descuentoPct), odts, pagos }
  })
}
