export default async function bodegaTallerRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request) => {
    const { search, stockCritico, page = '1' } = request.query
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
    const [items, total] = await Promise.all([
      fastify.prisma.bodegaTaller.findMany({ where, orderBy: { nombre: 'asc' }, take: LIMIT, skip: offset }),
      fastify.prisma.bodegaTaller.count({ where }),
    ])
    let filtered = items
    if (stockCritico === 'true') filtered = items.filter(i => i.stock <= i.stockCritico)
    return { items: filtered, total, limit: LIMIT }
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

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const body = request.body || {}
    const data = {}
    for (const f of ['codigoBarra', 'nombre', 'unidadMedida', 'stockCritico', 'stock', 'precio', 'activo']) {
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
