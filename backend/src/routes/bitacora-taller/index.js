// Bitácora del taller — entradas diarias por operario sobre ODTs

export default async function bitacoraTallerRoutes(fastify) {
  // GET /api/bitacora-taller?desde=&hasta=&operario=&odtId=&page=1
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request) => {
    const { desde, hasta, operario, odtId, page = '1' } = request.query
    const LIMIT = 100
    const skip = (parseInt(page, 10) - 1) * LIMIT
    const where = {}
    if (operario) where.usuario = { contains: operario, mode: 'insensitive' }
    if (odtId) where.odtId = parseInt(odtId, 10)
    if (desde || hasta) {
      where.fecha = {}
      if (desde) where.fecha.gte = new Date(desde)
      if (hasta) where.fecha.lte = new Date(hasta + 'T23:59:59')
    }
    const [items, total] = await Promise.all([
      fastify.prisma.bitacoraTaller.findMany({
        where, orderBy: { fecha: 'desc' }, take: LIMIT, skip,
      }),
      fastify.prisma.bitacoraTaller.count({ where }),
    ])
    return { items, total, limit: LIMIT }
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const { odtId, texto, fecha, usuarioReporta } = request.body || {}
    if (!odtId || !texto) return reply.code(400).send({ error: 'odtId y texto requeridos' })
    return fastify.prisma.bitacoraTaller.create({
      data: {
        odtId: parseInt(odtId, 10),
        usuario: request.user?.nombre || request.user?.username || 'sistema',
        usuarioReporta: usuarioReporta || null,
        fecha: fecha ? new Date(fecha) : new Date(),
        texto,
      },
    })
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    const { texto, fecha, usuarioReporta } = request.body || {}
    const data = {}
    if (texto !== undefined) data.texto = texto
    if (fecha !== undefined) data.fecha = fecha ? new Date(fecha) : null
    if (usuarioReporta !== undefined) data.usuarioReporta = usuarioReporta
    try { return await fastify.prisma.bitacoraTaller.update({ where: { id }, data }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrada' }); throw e }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    try { return await fastify.prisma.bitacoraTaller.delete({ where: { id } }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrada' }); throw e }
  })
}
