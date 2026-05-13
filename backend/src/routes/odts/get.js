export default async function getOdt(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const o = await fastify.prisma.odt.findUnique({ where: { id } })
    if (!o) return reply.code(404).send({ error: 'ODT no encontrada' })
    return o
  })
}
