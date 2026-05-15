import { computeEstado } from './helpers.js'

export default async function listProductos(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'read')],
  }, async (request, reply) => {
    const { bodega, search, visibleWeb, destacadoWeb } = request.query
    if (bodega && !['Inventario', 'Taller'].includes(bodega)) {
      return reply.code(400).send({ error: 'bodega debe ser Inventario o Taller' })
    }
    const where = { activo: true }
    if (bodega) where.bodega = bodega
    if (visibleWeb === 'true') where.visibleWeb = true
    if (destacadoWeb === 'true') where.destacadoWeb = true
    if (search) where.OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { codigoInterno: { contains: search, mode: 'insensitive' } },
      { codigoBarra: { contains: search, mode: 'insensitive' } },
    ]
    const LIMIT = 500
    const [productos, total] = await Promise.all([
      fastify.prisma.producto.findMany({
        where,
        // Stock crítico y sin stock primero, luego por nombre
        orderBy: [{ stock: 'asc' }, { nombre: 'asc' }],
        take: LIMIT,
      }),
      fastify.prisma.producto.count({ where }),
    ])
    const items = productos.map(p => ({ ...p, estado: computeEstado(p) }))
    // Re-sort: sin stock → crítico → normal (Prisma no puede ordenar por campo computado)
    items.sort((a, b) => {
      const order = { 'Sin stock': 0, 'Crítico': 1, 'Normal': 2 }
      const diff = (order[a.estado] ?? 2) - (order[b.estado] ?? 2)
      return diff !== 0 ? diff : a.nombre.localeCompare(b.nombre, 'es')
    })
    return { items, total, limit: LIMIT }
  })
}
