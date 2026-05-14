export default async function bitacoraRoutes(fastify) {
  // GET /odts/:id/bitacora
  fastify.get('/:id/bitacora', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const odtId = parseInt(request.params.id, 10)
    if (isNaN(odtId)) return reply.code(400).send({ error: 'ID inválido' })
    const entries = await fastify.prisma.bitacoraTaller.findMany({
      where: { odtId },
      orderBy: { createdAt: 'asc' },
    })
    return entries
  })

  // POST /odts/:id/bitacora
  fastify.post('/:id/bitacora', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const odtId = parseInt(request.params.id, 10)
    if (isNaN(odtId)) return reply.code(400).send({ error: 'ID inválido' })
    const { texto } = request.body || {}
    if (!texto?.trim()) return reply.code(400).send({ error: 'texto requerido' })
    const usuario = request.user?.nombre || request.user?.email || 'Sistema'
    const entry = await fastify.prisma.bitacoraTaller.create({
      data: { odtId, usuario, texto: texto.trim() },
    })
    return reply.code(201).send(entry)
  })

  // DELETE /odts/:id/bitacora/:entryId
  fastify.delete('/:id/bitacora/:entryId', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const entryId = parseInt(request.params.entryId, 10)
    if (isNaN(entryId)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      await fastify.prisma.bitacoraTaller.delete({ where: { id: entryId } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Entrada no encontrada' })
      throw e
    }
  })
}
