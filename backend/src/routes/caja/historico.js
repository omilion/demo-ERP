export default async function historicoRoutes(fastify) {
  // GET /api/caja/historico?year=2024&medioPago=...&search=...&tipo=ingreso
  fastify.get('/historico', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'read')],
  }, async (request) => {
    const { year, medioPago, search, tipo, page = '1' } = request.query
    const LIMIT = 100
    const offset = (parseInt(page) - 1) * LIMIT

    const where = { turnoId: null }
    if (year) {
      const y = parseInt(year)
      where.fecha = { gte: new Date(`${y}-01-01`), lt: new Date(`${y + 1}-01-01`) }
    }
    if (medioPago) where.medioPago = { contains: medioPago, mode: 'insensitive' }
    if (tipo) where.tipo = tipo
    if (search) {
      where.OR = [
        { referencia: { contains: search, mode: 'insensitive' } },
        { usuario: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await Promise.all([
      fastify.prisma.movimientoCaja.findMany({
        where,
        orderBy: { fecha: 'desc' },
        take: LIMIT,
        skip: offset,
      }),
      fastify.prisma.movimientoCaja.count({ where }),
    ])

    // Stats for the filtered set
    const allFiltered = await fastify.prisma.movimientoCaja.findMany({
      where,
      select: { tipo: true, monto: true },
    })
    const totalIngresos = allFiltered.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const totalEgresos = allFiltered.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Math.abs(m.monto), 0)

    return { items, total, limit: LIMIT, stats: { totalIngresos, totalEgresos } }
  })

  // GET /api/caja/historico/years
  fastify.get('/historico/years', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'read')],
  }, async () => {
    const rows = await fastify.prisma.$queryRaw`
      SELECT DISTINCT EXTRACT(YEAR FROM fecha)::int AS year
      FROM caja.movimientos_caja
      WHERE turno_id IS NULL AND fecha IS NOT NULL
      ORDER BY year DESC
    `
    return rows.map(r => r.year)
  })
}
