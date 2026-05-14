export default async function accesosRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, async (req, reply) => {
      if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    }],
  }, async (request) => {
    const { search, origen, page = '1' } = request.query
    const LIMIT = 200
    const offset = (parseInt(page) - 1) * LIMIT

    const where = {}
    if (origen) where.origen = origen
    if (search) {
      where.OR = [
        { usuario: { contains: search, mode: 'insensitive' } },
        { estado: { contains: search, mode: 'insensitive' } },
      ]
    }
    const [items, total] = await Promise.all([
      fastify.prisma.accesoLog.findMany({
        where,
        orderBy: { fecha: 'desc' },
        take: LIMIT,
        skip: offset,
      }),
      fastify.prisma.accesoLog.count({ where }),
    ])
    return { items, total, limit: LIMIT }
  })
}
