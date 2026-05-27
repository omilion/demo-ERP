function parseId(value) {
  const id = Number.parseInt(value, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim() : ''
}

async function ensureActiveCategoria(prisma, id) {
  if (!id) return null
  return prisma.categoriaBodegaTaller.findFirst({ where: { id, activo: true } })
}

async function findDuplicateCategoria(prisma, { id, nombre }) {
  if (!nombre) return null
  return prisma.categoriaBodegaTaller.findFirst({
    where: {
      activo: true,
      nombre: { equals: nombre, mode: 'insensitive' },
      ...(id ? { id: { not: id } } : {}),
    },
  })
}

async function findDuplicateSubcategoria(prisma, { id, nombre, categoriaId }) {
  if (!nombre || !categoriaId) return null
  return prisma.subcategoriaBodegaTaller.findFirst({
    where: {
      activo: true,
      categoriaId,
      nombre: { equals: nombre, mode: 'insensitive' },
      ...(id ? { id: { not: id } } : {}),
    },
  })
}

export default async function categoriasBodegaTallerRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async () => {
    return fastify.prisma.categoriaBodegaTaller.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      include: { subcategorias: { where: { activo: true }, orderBy: { nombre: 'asc' } } },
    })
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const nombre = cleanName(request.body?.nombre)
    if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
    const duplicate = await findDuplicateCategoria(fastify.prisma, { nombre })
    if (duplicate) return reply.code(409).send({ error: 'Categoria ya existe' })
    try {
      const categoria = await fastify.prisma.categoriaBodegaTaller.create({ data: { nombre } })
      return reply.code(201).send(categoria)
    } catch (error) {
      if (error.code === 'P2002') return reply.code(409).send({ error: 'Categoria ya existe' })
      throw error
    }
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })

    const data = {}
    if (request.body?.nombre !== undefined) {
      const nombre = cleanName(request.body.nombre)
      if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
      const duplicate = await findDuplicateCategoria(fastify.prisma, { id, nombre })
      if (duplicate) return reply.code(409).send({ error: 'Categoria ya existe' })
      data.nombre = nombre
    }
    try {
      return await fastify.prisma.categoriaBodegaTaller.update({ where: { id }, data })
    } catch (error) {
      if (error.code === 'P2025') return reply.code(404).send({ error: 'No encontrada' })
      if (error.code === 'P2002') return reply.code(409).send({ error: 'Categoria ya existe' })
      throw error
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const usados = await fastify.prisma.bodegaTaller.count({ where: { activo: true, categoriaId: id } })
    if (usados > 0) return reply.code(409).send({ error: 'Categoria en uso por materiales de taller' })
    try {
      await fastify.prisma.categoriaBodegaTaller.update({ where: { id }, data: { activo: false } })
      return reply.code(204).send()
    } catch (error) {
      if (error.code === 'P2025') return reply.code(404).send({ error: 'No encontrada' })
      throw error
    }
  })

  fastify.get('/:id/subcategorias', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const categoriaId = parseId(request.params.id)
    if (!categoriaId) return reply.code(400).send({ error: 'ID invalido' })
    return fastify.prisma.subcategoriaBodegaTaller.findMany({
      where: { categoriaId, activo: true },
      orderBy: { nombre: 'asc' },
    })
  })

  fastify.post('/:id/subcategorias', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const categoriaId = parseId(request.params.id)
    const nombre = cleanName(request.body?.nombre)
    if (!categoriaId) return reply.code(400).send({ error: 'ID invalido' })
    if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })

    const categoria = await ensureActiveCategoria(fastify.prisma, categoriaId)
    if (!categoria) return reply.code(404).send({ error: 'Categoria no encontrada' })

    const duplicate = await findDuplicateSubcategoria(fastify.prisma, { nombre, categoriaId })
    if (duplicate) return reply.code(409).send({ error: 'Subcategoria ya existe en la categoria' })

    const subcategoria = await fastify.prisma.subcategoriaBodegaTaller.create({ data: { nombre, categoriaId } })
    return reply.code(201).send(subcategoria)
  })

  fastify.put('/subcategorias/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })

    const current = await fastify.prisma.subcategoriaBodegaTaller.findUnique({ where: { id } })
    if (!current || !current.activo) return reply.code(404).send({ error: 'No encontrada' })

    const data = {}
    const nextNombre = request.body?.nombre !== undefined ? cleanName(request.body.nombre) : current.nombre
    if (!nextNombre) return reply.code(400).send({ error: 'nombre requerido' })
    if (request.body?.nombre !== undefined) data.nombre = nextNombre

    let nextCategoriaId = current.categoriaId
    if (request.body?.categoriaId !== undefined) {
      nextCategoriaId = parseId(request.body.categoriaId)
      if (!nextCategoriaId) return reply.code(400).send({ error: 'categoriaId invalido' })
      const categoria = await ensureActiveCategoria(fastify.prisma, nextCategoriaId)
      if (!categoria) return reply.code(404).send({ error: 'Categoria no encontrada' })
      data.categoriaId = nextCategoriaId
    }
    const duplicate = await findDuplicateSubcategoria(fastify.prisma, {
      id,
      nombre: nextNombre,
      categoriaId: nextCategoriaId,
    })
    if (duplicate) return reply.code(409).send({ error: 'Subcategoria ya existe en la categoria' })

    return fastify.prisma.$transaction(async tx => {
      const updated = await tx.subcategoriaBodegaTaller.update({ where: { id }, data })
      if (data.categoriaId !== undefined && data.categoriaId !== current.categoriaId) {
        await tx.bodegaTaller.updateMany({
          where: { subcategoriaId: id },
          data: { categoriaId: data.categoriaId },
        })
      }
      return updated
    })
  })

  fastify.delete('/subcategorias/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const usados = await fastify.prisma.bodegaTaller.count({ where: { activo: true, subcategoriaId: id } })
    if (usados > 0) return reply.code(409).send({ error: 'Subcategoria en uso por materiales de taller' })
    try {
      await fastify.prisma.subcategoriaBodegaTaller.update({ where: { id }, data: { activo: false } })
      return reply.code(204).send()
    } catch (error) {
      if (error.code === 'P2025') return reply.code(404).send({ error: 'No encontrada' })
      throw error
    }
  })
}
