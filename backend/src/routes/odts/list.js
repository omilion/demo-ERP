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

    const ESTADO_ORDER = { Prioritaria: 0, 'En proceso': 1, Pendiente: 2, Terminada: 3 }

    const [odts, total] = await Promise.all([
      fastify.prisma.odt.findMany({ where, orderBy: { createdAt: 'desc' }, take: LIMIT }),
      fastify.prisma.odt.count({ where }),
    ])

    odts.sort((a, b) => {
      const oa = ESTADO_ORDER[a.estado] ?? 99
      const ob = ESTADO_ORDER[b.estado] ?? 99
      if (oa !== ob) return oa - ob
      return new Date(b.createdAt) - new Date(a.createdAt)
    })

    return { items: odts, total, limit: LIMIT }
  })
}
