import { computeTotal, attachClientes } from './helpers.js'

export default async function listVentas(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const { estadoPago, estadoEntrega, tipo } = request.query
    const where = {}
    if (estadoPago) where.estadoPago = estadoPago
    if (estadoEntrega) where.estadoEntrega = estadoEntrega
    if (tipo) where.tipo = tipo
    const ordenes = await fastify.prisma.orden.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    })
    const withClientes = await attachClientes(fastify, ordenes)
    return withClientes.map(o => ({ ...o, total: computeTotal(o.items, o.descuentoPct) }))
  })
}
