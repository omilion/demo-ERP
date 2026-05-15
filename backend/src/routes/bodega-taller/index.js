export default async function bodegaTallerRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request) => {
    const { search, stockCritico, categoriaId, subcategoriaId, page = '1' } = request.query
    const LIMIT = 200
    const offset = (parseInt(page) - 1) * LIMIT

    const where = { activo: true }
    if (search) {
      where.OR = [
        { codigoInterno: { contains: search, mode: 'insensitive' } },
        { nombre: { contains: search, mode: 'insensitive' } },
        { codigoBarra: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (categoriaId) where.categoriaId = parseInt(categoriaId, 10)
    if (subcategoriaId) where.subcategoriaId = parseInt(subcategoriaId, 10)

    const [items, total] = await Promise.all([
      fastify.prisma.bodegaTaller.findMany({ where, orderBy: { nombre: 'asc' }, take: LIMIT, skip: offset }),
      fastify.prisma.bodegaTaller.count({ where }),
    ])
    let filtered = items
    if (stockCritico === 'true') filtered = items.filter(i => i.stock <= i.stockCritico)
    return { items: filtered, total, limit: LIMIT }
  })

  // Autocomplete para búsqueda rápida (G7)
  fastify.get('/autocomplete', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request) => {
    const q = (request.query.q || '').trim()
    if (q.length < 2) return []
    const items = await fastify.prisma.bodegaTaller.findMany({
      where: {
        activo: true,
        OR: [
          { codigoInterno: { contains: q, mode: 'insensitive' } },
          { nombre: { contains: q, mode: 'insensitive' } },
          { codigoBarra: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, codigoInterno: true, nombre: true, unidadMedida: true, stock: true, precio: true },
      orderBy: { nombre: 'asc' },
      take: 20,
    })
    return items
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const item = await fastify.prisma.bodegaTaller.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Material no encontrado' })
    return item
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const { codigoInterno, codigoBarra, nombre, unidadMedida, stock, stockCritico, precio, categoriaId, subcategoriaId } = request.body || {}
    if (!codigoInterno || !nombre) return reply.code(400).send({ error: 'codigoInterno y nombre requeridos' })
    const item = await fastify.prisma.bodegaTaller.create({
      data: {
        codigoInterno, codigoBarra, nombre, unidadMedida,
        categoriaId: categoriaId != null ? parseInt(categoriaId, 10) : null,
        subcategoriaId: subcategoriaId != null ? parseInt(subcategoriaId, 10) : null,
        stock: stock != null ? parseFloat(stock) : 0,
        stockCritico: stockCritico != null ? parseFloat(stockCritico) : 0,
        precio: precio != null ? parseFloat(precio) : null,
      },
    })
    return reply.code(201).send(item)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const body = request.body || {}
    const data = {}
    for (const f of ['codigoBarra', 'nombre', 'unidadMedida', 'stockCritico', 'stock', 'precio', 'activo', 'categoriaId', 'subcategoriaId']) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    try {
      const item = await fastify.prisma.bodegaTaller.update({ where: { id }, data })
      return item
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
      throw e
    }
  })
}
