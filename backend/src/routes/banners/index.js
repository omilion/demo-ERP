export default async function bannersRoutes(fastify) {
  // Público (sin auth) - para web tienda
  fastify.get('/public', async () => {
    const now = new Date()
    return fastify.prisma.banner.findMany({
      where: {
        activo: true,
        AND: [
          { OR: [{ desde: null }, { desde: { lte: now } }] },
          { OR: [{ hasta: null }, { hasta: { gte: now } }] },
        ],
      },
      orderBy: { orden: 'asc' },
    })
  })

  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async () => {
    return fastify.prisma.banner.findMany({ orderBy: { orden: 'asc' } })
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, async (req, reply) => {
      if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    }],
  }, async (request, reply) => {
    const b = request.body || {}
    if (!b.titulo) return reply.code(400).send({ error: 'titulo requerido' })
    const banner = await fastify.prisma.banner.create({
      data: {
        titulo: b.titulo,
        subtitulo: b.subtitulo || null,
        imagenUrl: b.imagenUrl || null,
        link: b.link || null,
        orden: b.orden != null ? parseInt(b.orden, 10) : 0,
        activo: b.activo !== false,
        desde: b.desde ? new Date(b.desde) : null,
        hasta: b.hasta ? new Date(b.hasta) : null,
      },
    })
    return reply.code(201).send(banner)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, async (req, reply) => {
      if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    }],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    const b = request.body || {}
    const data = {}
    for (const f of ['titulo', 'subtitulo', 'imagenUrl', 'link', 'activo']) {
      if (b[f] !== undefined) data[f] = b[f]
    }
    if (b.orden !== undefined) data.orden = parseInt(b.orden, 10)
    if (b.desde !== undefined) data.desde = b.desde ? new Date(b.desde) : null
    if (b.hasta !== undefined) data.hasta = b.hasta ? new Date(b.hasta) : null
    try { return await fastify.prisma.banner.update({ where: { id }, data }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, async (req, reply) => {
      if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    }],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    try { return await fastify.prisma.banner.delete({ where: { id } }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })
}
