export default async function categoriasRoutes(fastify) {
  // ── Categorías ────────────────────────────────────────────────────────────
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async () => {
    return fastify.prisma.categoria.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      include: { subcategorias: { where: { activo: true }, orderBy: { nombre: 'asc' } } },
    })
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const { nombre, porcDesc, mostrar } = request.body || {}
    if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
    const c = await fastify.prisma.categoria.create({
      data: { nombre, porcDesc: parseFloat(porcDesc) || 0, mostrar: mostrar !== false },
    })
    return reply.code(201).send(c)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      const data = { ...request.body }
      if (data.porcDesc !== undefined) data.porcDesc = parseFloat(data.porcDesc)
      return await fastify.prisma.categoria.update({ where: { id }, data })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Categoría no encontrada' })
      throw e
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    await fastify.prisma.categoria.update({ where: { id }, data: { activo: false } })
    return reply.code(204).send()
  })

  // ── Subcategorías ─────────────────────────────────────────────────────────
  fastify.get('/:id/subcategorias', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const categoriaId = parseInt(request.params.id, 10)
    return fastify.prisma.subcategoria.findMany({
      where: { categoriaId, activo: true },
      orderBy: { nombre: 'asc' },
    })
  })

  fastify.post('/:id/subcategorias', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const categoriaId = parseInt(request.params.id, 10)
    const { nombre } = request.body || {}
    if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
    const s = await fastify.prisma.subcategoria.create({ data: { nombre, categoriaId } })
    return reply.code(201).send(s)
  })
}
