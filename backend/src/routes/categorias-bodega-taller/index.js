export default async function categoriasBodegaTallerRoutes(fastify) {
  // ── Categorías ────────────────────────────────────────────────────────────
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async () => {
    return fastify.prisma.categoriaBodegaTaller.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      include: { subcategorias: { where: { activo: true }, orderBy: { nombre: 'asc' } } },
    })
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const { nombre } = request.body || {}
    if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
    try {
      const c = await fastify.prisma.categoriaBodegaTaller.create({ data: { nombre } })
      return reply.code(201).send(c)
    } catch (e) {
      if (e.code === 'P2002') return reply.code(409).send({ error: 'Categoría ya existe' })
      throw e
    }
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      return await fastify.prisma.categoriaBodegaTaller.update({
        where: { id },
        data: request.body,
      })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrada' })
      throw e
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    await fastify.prisma.categoriaBodegaTaller.update({ where: { id }, data: { activo: false } })
    return reply.code(204).send()
  })

  // ── Subcategorías ─────────────────────────────────────────────────────────
  fastify.get('/:id/subcategorias', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const categoriaId = parseInt(request.params.id, 10)
    return fastify.prisma.subcategoriaBodegaTaller.findMany({
      where: { categoriaId, activo: true },
      orderBy: { nombre: 'asc' },
    })
  })

  fastify.post('/:id/subcategorias', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const categoriaId = parseInt(request.params.id, 10)
    const { nombre } = request.body || {}
    if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
    const s = await fastify.prisma.subcategoriaBodegaTaller.create({ data: { nombre, categoriaId } })
    return reply.code(201).send(s)
  })

  fastify.put('/subcategorias/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      return await fastify.prisma.subcategoriaBodegaTaller.update({ where: { id }, data: request.body })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrada' })
      throw e
    }
  })

  fastify.delete('/subcategorias/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    await fastify.prisma.subcategoriaBodegaTaller.update({ where: { id }, data: { activo: false } })
    return reply.code(204).send()
  })
}
