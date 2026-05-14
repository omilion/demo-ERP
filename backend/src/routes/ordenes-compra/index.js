export default async function ordenesCompraRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request) => {
    const { search, estado, canal, page = '1' } = request.query
    const LIMIT = 100
    const offset = (parseInt(page) - 1) * LIMIT

    const where = {}
    if (estado) where.estadoCompra = estado
    if (canal) where.canal = canal
    if (search) {
      where.OR = [
        { nCompra: { contains: search, mode: 'insensitive' } },
        { emailComprador: { contains: search, mode: 'insensitive' } },
        { codigoVendedor: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await Promise.all([
      fastify.prisma.ordenCompraOnline.findMany({
        where,
        orderBy: { fechaHora: 'desc' },
        take: LIMIT,
        skip: offset,
      }),
      fastify.prisma.ordenCompraOnline.count({ where }),
    ])
    return { items, total, limit: LIMIT }
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const oc = await fastify.prisma.ordenCompraOnline.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!oc) return reply.code(404).send({ error: 'OC no encontrada' })
    return oc
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      await fastify.prisma.ordenCompraOnline.delete({ where: { id } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'OC no encontrada' })
      throw e
    }
  })
}
