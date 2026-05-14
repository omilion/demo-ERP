// Historial de movimientos de materiales en taller

export default async function historialMaterialesRoutes(fastify) {
  // GET /api/historial-materiales?desde=&hasta=&operario=&taller=&codigoInterno=&odtId=&page=1
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request) => {
    const { desde, hasta, operario, taller, codigoInterno, odtId, page = '1' } = request.query
    const LIMIT = 100
    const skip = (parseInt(page, 10) - 1) * LIMIT
    const where = {}
    if (operario) where.usuario = { contains: operario, mode: 'insensitive' }
    if (taller) where.taller = { contains: taller, mode: 'insensitive' }
    if (codigoInterno) where.codigoInterno = { contains: codigoInterno, mode: 'insensitive' }
    if (odtId) where.odtId = parseInt(odtId, 10)
    if (desde || hasta) {
      where.fecha = {}
      if (desde) where.fecha.gte = new Date(desde)
      if (hasta) where.fecha.lte = new Date(hasta + 'T23:59:59')
    }
    const [items, total, agg] = await Promise.all([
      fastify.prisma.tallerHistorialMaterial.findMany({
        where, orderBy: { fecha: 'desc' }, take: LIMIT, skip,
      }),
      fastify.prisma.tallerHistorialMaterial.count({ where }),
      fastify.prisma.tallerHistorialMaterial.aggregate({
        where, _sum: { egreso: true, ingreso: true },
      }),
    ])
    return {
      items, total, limit: LIMIT,
      totalEgreso: agg._sum.egreso || 0,
      totalIngreso: agg._sum.ingreso || 0,
    }
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const { odtId, codigoInterno, nombre, egreso, ingreso, unidad, taller, fecha } = request.body || {}
    if (!codigoInterno) return reply.code(400).send({ error: 'codigoInterno requerido' })
    return fastify.prisma.tallerHistorialMaterial.create({
      data: {
        odtId: odtId ? parseInt(odtId, 10) : null,
        codigoInterno, nombre: nombre || null,
        egreso: parseFloat(egreso) || 0,
        ingreso: parseFloat(ingreso) || 0,
        unidad: unidad || null, taller: taller || null,
        usuario: request.user?.nombre || request.user?.username || 'sistema',
        fecha: fecha ? new Date(fecha) : new Date(),
      },
    })
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    try { return await fastify.prisma.tallerHistorialMaterial.delete({ where: { id } }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })
}
