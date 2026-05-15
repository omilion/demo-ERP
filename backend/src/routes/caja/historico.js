export default async function historicoRoutes(fastify) {
  // GET /api/caja/historico?year=2024&medioPago=...&search=...&tipo=ingreso
  fastify.get('/historico', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'read')],
  }, async (request) => {
    const { year, medioPago, search, tipo, nInterno, ordenId, nDoc, page = '1' } = request.query
    const LIMIT = 100
    const offset = (parseInt(page) - 1) * LIMIT

    const where = {}
    if (year) {
      const y = parseInt(year)
      where.fecha = { gte: new Date(`${y}-01-01`), lt: new Date(`${y + 1}-01-01`) }
    }
    if (medioPago) where.medioPago = { contains: medioPago, mode: 'insensitive' }
    if (tipo) where.tipo = tipo
    if (ordenId) where.ordenId = parseInt(ordenId, 10)
    if (nDoc) where.nDoc = { contains: nDoc, mode: 'insensitive' }
    if (nInterno) {
      // resolver nInterno → ordenId
      const ordenes = await fastify.prisma.orden.findMany({
        where: { nInterno: parseInt(nInterno, 10) }, select: { id: true },
      })
      const ids = ordenes.map(o => o.id)
      if (ids.length === 0) return { items: [], total: 0, limit: LIMIT, stats: { totalIngresos: 0, totalEgresos: 0 } }
      where.ordenId = { in: ids }
    }
    if (search) {
      where.OR = [
        { referencia: { contains: search, mode: 'insensitive' } },
        { usuario: { contains: search, mode: 'insensitive' } },
        { documento: { contains: search, mode: 'insensitive' } },
        { nDoc: { contains: search, mode: 'insensitive' } },
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
