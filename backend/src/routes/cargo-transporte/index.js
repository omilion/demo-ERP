export default async function cargoTransporteRoutes(fastify) {
  const adminOnly = async (request, reply) => {
    if (request.user?.role !== 'admin') return reply.code(403).send({ error: 'Solo admin' })
  }

  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async () => {
    return fastify.prisma.cargoTransporte.findMany({ orderBy: { nombre: 'asc' } })
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, adminOnly],
  }, async (request, reply) => {
    const { nombre, valor, activo = true } = request.body || {}
    if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
    return fastify.prisma.cargoTransporte.create({
      data: { nombre, valor: parseFloat(valor) || 0, activo },
    })
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, adminOnly],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    const { nombre, valor, activo } = request.body || {}
    const data = {}
    if (nombre !== undefined) data.nombre = nombre
    if (valor !== undefined) data.valor = parseFloat(valor) || 0
    if (activo !== undefined) data.activo = activo
    try { return await fastify.prisma.cargoTransporte.update({ where: { id }, data }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, adminOnly],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    try { return await fastify.prisma.cargoTransporte.delete({ where: { id } }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })
}
