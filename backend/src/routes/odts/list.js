export default async function listOdts(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const { tipo, estado } = request.query
    const where = {}
    if (tipo) where.tipo = tipo
    if (estado) where.estado = estado
    return fastify.prisma.odt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
  })
}
