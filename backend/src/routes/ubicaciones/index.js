function parseId(value) {
  const id = Number.parseInt(value, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim() : ''
}

async function findDuplicate(prisma, { id, nombre }) {
  if (!nombre) return null
  return prisma.ubicacion.findFirst({
    where: {
      activo: true,
      nombre: { equals: nombre, mode: 'insensitive' },
      ...(id ? { id: { not: id } } : {}),
    },
  })
}

export default async function ubicacionesRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'read')],
  }, async () => {
    return {
      items: await fastify.prisma.ubicacion.findMany({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
      }),
    }
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const nombre = cleanName(request.body?.nombre)
    if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
    const duplicate = await findDuplicate(fastify.prisma, { nombre })
    if (duplicate) return reply.code(409).send({ error: 'Ubicacion ya existe' })
    const ubicacion = await fastify.prisma.ubicacion.create({ data: { nombre } })
    return reply.code(201).send(ubicacion)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const nombre = cleanName(request.body?.nombre)
    if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
    const duplicate = await findDuplicate(fastify.prisma, { id, nombre })
    if (duplicate) return reply.code(409).send({ error: 'Ubicacion ya existe' })
    try {
      const updated = await fastify.prisma.ubicacion.update({ where: { id }, data: { nombre } })
      await fastify.prisma.producto.updateMany({ where: { ubicacionId: id }, data: { ubicacion: nombre } })
      return updated
    } catch (error) {
      if (error.code === 'P2025') return reply.code(404).send({ error: 'Ubicacion no encontrada' })
      throw error
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const current = await fastify.prisma.ubicacion.findFirst({ where: { id, activo: true } })
    if (!current) return reply.code(404).send({ error: 'Ubicacion no encontrada' })
    const usados = await fastify.prisma.producto.count({
      where: {
        activo: true,
        OR: [
          { ubicacionId: id },
          { ubicacion: { equals: current.nombre, mode: 'insensitive' } },
        ],
      },
    })
    if (usados > 0) return reply.code(409).send({ error: 'Ubicacion en uso por productos' })
    await fastify.prisma.ubicacion.update({ where: { id }, data: { activo: false } })
    return reply.code(204).send()
  })
}
