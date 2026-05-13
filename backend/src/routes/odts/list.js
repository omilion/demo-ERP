export default async function listOdts(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const { tipo, estado, search } = request.query
    const LIMIT = 100

    const where = {}
    if (tipo) where.tipo = tipo
    if (estado) where.estado = estado
    if (search) {
      const isNum = /^\d+$/.test(search.trim())
      where.OR = [
        { clienteNombre: { contains: search, mode: 'insensitive' } },
        { descripcion: { contains: search, mode: 'insensitive' } },
        ...(isNum ? [{ id: parseInt(search, 10) }] : []),
      ]
    }

    const [odts, total] = await Promise.all([
      fastify.prisma.odt.findMany({
        where,
        // En proceso → Pendiente → Terminada, luego más recientes primero
        orderBy: [{ estado: 'asc' }, { createdAt: 'desc' }],
        take: LIMIT,
      }),
      fastify.prisma.odt.count({ where }),
    ])

    return { items: odts, total, limit: LIMIT }
  })
}
