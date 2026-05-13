import { computeEstado } from './helpers.js'

export default async function listProductos(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'read')],
  }, async (request, reply) => {
    const { bodega, search } = request.query
    if (bodega && !['Inventario', 'Taller'].includes(bodega)) {
      return reply.code(400).send({ error: 'bodega debe ser Inventario o Taller' })
    }
    const where = { activo: true }
    if (bodega) where.bodega = bodega
    if (search) where.OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { codigoInterno: { contains: search, mode: 'insensitive' } },
    ]
    const LIMIT = 500
    const [productos, total] = await Promise.all([
      fastify.prisma.producto.findMany({
        where,
        orderBy: { codigoInterno: 'asc' },
        take: LIMIT,
      }),
      fastify.prisma.producto.count({ where }),
    ])
    return { items: productos.map(p => ({ ...p, estado: computeEstado(p) })), total, limit: LIMIT }
  })
}
