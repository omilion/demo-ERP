export default async function crmRoutes(fastify) {
  fastify.register(async function (f) {
    // GET /api/crm?ejecutiva=...&estado=...&prioridad=...&search=...&page=1
    f.get('/', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const { ejecutiva, estado, prioridad, search, page = '1', fechaDesde, fechaHasta } = request.query
      const LIMIT = 500
      const offset = (parseInt(page) - 1) * LIMIT

      const where = {}
      if (ejecutiva) where.ejecutiva = { contains: ejecutiva, mode: 'insensitive' }
      if (prioridad) where.prioridad = prioridad
      if (estado !== undefined && estado !== '') where.estado = parseInt(estado)
      if (fechaDesde || fechaHasta) {
        where.fecha = {}
        if (fechaDesde) where.fecha.gte = new Date(fechaDesde)
        if (fechaHasta) where.fecha.lte = new Date(fechaHasta + 'T23:59:59')
      }
      if (search) {
        where.OR = [
          { nombre: { contains: search, mode: 'insensitive' } },
          { rsocial: { contains: search, mode: 'insensitive' } },
          { rut: { contains: search, mode: 'insensitive' } },
          { ncotizacion: { contains: search, mode: 'insensitive' } },
        ]
      }

      const [items, total] = await Promise.all([
        f.prisma.crmRegistro.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: LIMIT,
          skip: offset,
        }),
        f.prisma.crmRegistro.count({ where }),
      ])

      return { items, total, limit: LIMIT }
    })

    // PATCH /api/crm/:id — update estado (and optionally other fields)
    f.patch('/:id', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request, reply) => {
      const { id } = request.params
      const { estado, prioridad, fechaProximo, resultado } = request.body ?? {}
      const data = {}
      if (estado !== undefined) data.estado = parseInt(estado)
      if (prioridad !== undefined) data.prioridad = prioridad
      if (fechaProximo !== undefined) data.fechaProximo = fechaProximo ? new Date(fechaProximo) : null
      if (resultado !== undefined) data.resultado = resultado
      if (Object.keys(data).length === 0) return reply.status(400).send({ error: 'Nothing to update' })
      const updated = await f.prisma.crmRegistro.update({ where: { id: parseInt(id) }, data })
      return updated
    })

    // GET /api/crm/ejecutivas — unique list
    f.get('/ejecutivas', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async () => {
      const rows = await f.prisma.$queryRaw`
        SELECT ejecutiva, COUNT(*)::int AS total
        FROM ventas.crm_registros
        WHERE ejecutiva IS NOT NULL
        GROUP BY ejecutiva
        ORDER BY total DESC
      `
      return rows
    })
  })
}
