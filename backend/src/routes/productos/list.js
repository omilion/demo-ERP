import { computeEstado } from './helpers.js'

export default async function listProductos(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'read')],
  }, async (request, reply) => {
    const { bodega, search, visibleWeb, destacadoWeb, categoria, proveedor, idMarco, ubicacion, estadoInventario, estado } = request.query
    if (bodega && !['Inventario', 'Taller'].includes(bodega)) {
      return reply.code(400).send({ error: 'bodega debe ser Inventario o Taller' })
    }
    const where = { activo: true }
    if (bodega) where.bodega = bodega
    if (visibleWeb === 'true') where.visibleWeb = true
    if (destacadoWeb === 'true') where.destacadoWeb = true
    if (categoria) where.categoria = { contains: categoria, mode: 'insensitive' }
    if (proveedor) where.proveedor = { contains: proveedor, mode: 'insensitive' }
    if (idMarco) where.idMarco = { contains: idMarco, mode: 'insensitive' }
    if (ubicacion) where.ubicacion = { contains: ubicacion, mode: 'insensitive' }
    if (estadoInventario) where.estadoInventario = estadoInventario
    // estado computado: 'sin-stock' | 'critico' | 'normal'
    if (estado === 'sin-stock') where.stock = 0
    else if (estado === 'critico') {
      // stock > 0 AND stock < stockCritico — Prisma no compara columnas, fallback raw
      // Aproximación: stockCritico > 0 AND stock entre 1 y 9999. Filtramos finos en memoria post-fetch.
    }
    if (search) where.OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { codigoInterno: { contains: search, mode: 'insensitive' } },
      { codigoBarra: { contains: search, mode: 'insensitive' } },
    ]
    const LIMIT = 500
    // Para filtro estado=critico no podemos comparar columnas; traemos amplio + filtramos
    const fetchTake = estado === 'critico' ? 5000 : LIMIT
    const [productos, total] = await Promise.all([
      fastify.prisma.producto.findMany({
        where,
        orderBy: [{ stock: 'asc' }, { nombre: 'asc' }],
        take: fetchTake,
      }),
      fastify.prisma.producto.count({ where }),
    ])
    let items = productos.map(p => ({ ...p, estado: computeEstado(p) }))
    if (estado === 'critico') items = items.filter(p => p.estado === 'Crítico').slice(0, LIMIT)
    items.sort((a, b) => {
      const order = { 'Sin stock': 0, 'Crítico': 1, 'Normal': 2 }
      const diff = (order[a.estado] ?? 2) - (order[b.estado] ?? 2)
      return diff !== 0 ? diff : a.nombre.localeCompare(b.nombre, 'es')
    })
    return { items, total: estado === 'critico' ? items.length : total, limit: LIMIT }
  })
}
