export default async function locationsRoutes(fastify) {
  // ── Regiones ──────────────────────────────────────────────────────────────
  fastify.get('/regiones', {
    preHandler: [fastify.authenticate],
  }, async () => {
    return fastify.prisma.region.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
    })
  })

  // ── Comunas ───────────────────────────────────────────────────────────────
  fastify.get('/comunas', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { codigoRegion } = request.query
    const where = { activo: true }
    if (codigoRegion) where.codigoRegion = parseInt(codigoRegion, 10)
    return fastify.prisma.comuna.findMany({
      where,
      orderBy: { nombre: 'asc' },
    })
  })

  // ── Sucursales ────────────────────────────────────────────────────────────
  fastify.get('/sucursales', {
    preHandler: [fastify.authenticate],
  }, async () => {
    return fastify.prisma.sucursal.findMany({
      where: { activo: true },
      orderBy: { id: 'asc' },
    })
  })

  fastify.post('/sucursales', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const { nombre, direccion, comuna, region, telefono } = request.body || {}
    if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
    const s = await fastify.prisma.sucursal.create({
      data: { nombre, direccion, comuna, region, telefono },
    })
    return reply.code(201).send(s)
  })

  fastify.put('/sucursales/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      return await fastify.prisma.sucursal.update({ where: { id }, data: request.body || {} })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Sucursal no encontrada' })
      throw e
    }
  })
}
