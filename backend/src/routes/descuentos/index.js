export default async function descuentosRoutes(fastify) {
  // List both catalogs
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async () => {
    const [normales, marco] = await Promise.all([
      fastify.prisma.descuentoPorc.findMany({ where: { activo: true }, orderBy: { valor: 'asc' } }),
      fastify.prisma.descuentoPorcMarco.findMany({ where: { activo: true }, orderBy: { valor: 'asc' } }),
    ])
    return { normales, marco }
  })

  // Create
  for (const [path, model] of [['normales', 'descuentoPorc'], ['marco', 'descuentoPorcMarco']]) {
    fastify.post(`/${path}`, {
      preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
    }, async (request, reply) => {
      const valor = parseFloat(request.body?.valor)
      if (!valor && valor !== 0) return reply.code(400).send({ error: 'valor requerido' })
      const item = await fastify.prisma[model].create({ data: { valor } })
      return reply.code(201).send(item)
    })

    fastify.delete(`/${path}/:id`, {
      preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
      try {
        await fastify.prisma[model].update({ where: { id }, data: { activo: false } })
        return reply.code(204).send()
      } catch (e) {
        if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
        throw e
      }
    })
  }
}
