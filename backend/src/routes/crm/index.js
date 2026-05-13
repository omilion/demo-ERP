export default async function crmRoutes(fastify) {
  fastify.register(async function (f) {
    // GET /api/crm?ejecutiva=...&estado=...&prioridad=...&search=...&page=1
    f.get('/', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const { ejecutiva, estado, prioridad, search, page = '1' } = request.query
      const LIMIT = 100
      const offset = (parseInt(page) - 1) * LIMIT

      const where = {}
      if (ejecutiva) where.ejecutiva = { contains: ejecutiva, mode: 'insensitive' }
      if (prioridad) where.prioridad = prioridad
      if (estado !== undefined && estado !== '') where.estado = parseInt(estado)
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
