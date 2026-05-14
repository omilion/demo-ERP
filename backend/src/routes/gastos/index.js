export default async function gastosRoutes(fastify) {
  const adminOnly = async (request, reply) => {
    if (request.user?.role !== 'admin') return reply.code(403).send({ error: 'Solo admin' })
  }

  fastify.get('/', { preHandler: [fastify.authenticate] }, async () => {
    return fastify.prisma.gasto.findMany({ orderBy: { nombre: 'asc' } })
  })

  fastify.post('/', { preHandler: [fastify.authenticate, adminOnly] }, async (request, reply) => {
    const { nombre, activo = true } = request.body || {}
    if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
    try { return await fastify.prisma.gasto.create({ data: { nombre, activo } }) }
    catch (e) { if (e.code === 'P2002') return reply.code(409).send({ error: 'ya existe' }); throw e }
  })

  fastify.put('/:id', { preHandler: [fastify.authenticate, adminOnly] }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    const { nombre, activo } = request.body || {}
    const data = {}
    if (nombre !== undefined) data.nombre = nombre
    if (activo !== undefined) data.activo = activo
    try { return await fastify.prisma.gasto.update({ where: { id }, data }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })

  fastify.delete('/:id', { preHandler: [fastify.authenticate, adminOnly] }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    try { return await fastify.prisma.gasto.delete({ where: { id } }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })
}
