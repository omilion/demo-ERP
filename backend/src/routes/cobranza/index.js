export default async function cobranzaHistoricoRoutes(fastify) {
  fastify.register(async function (f) {
    // GET /api/cobranza-historico?ejecutiva=...&estado=...&search=...&mes=...&page=1
    f.get('/', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const { ejecutiva, estado, search, mes, page = '1' } = request.query
      const LIMIT = 100
      const offset = (parseInt(page) - 1) * LIMIT

      const where = {}
      if (ejecutiva) where.ejecutiva = { contains: ejecutiva, mode: 'insensitive' }
      if (estado) where.estado = { equals: estado, mode: 'insensitive' }
      if (mes) where.mesAnio = { contains: mes, mode: 'insensitive' }
      if (search) {
        where.OR = [
          { cliente: { contains: search, mode: 'insensitive' } },
          { rut: { contains: search, mode: 'insensitive' } },
        ]
      }

      const [items, total] = await Promise.all([
        f.prisma.cobranzaHistorico.findMany({
          where,
          orderBy: { fechaFactura: 'desc' },
          take: LIMIT,
          skip: offset,
        }),
        f.prisma.cobranzaHistorico.count({ where }),
      ])

      // Aggregates for filtered period
      const agg = await f.prisma.$queryRaw`
        SELECT
          COALESCE(SUM(CASE WHEN UPPER(estado) = 'CANCELADA' THEN monto ELSE 0 END), 0)::numeric AS cobrado,
          COALESCE(SUM(CASE WHEN UPPER(estado) = 'PENDIENTE' THEN valor_factura ELSE 0 END), 0)::numeric AS pendiente,
          COUNT(CASE WHEN UPPER(estado) = 'CANCELADA' THEN 1 END)::int AS n_canceladas,
          COUNT(CASE WHEN UPPER(estado) = 'PENDIENTE' THEN 1 END)::int AS n_pendientes,
          COUNT(CASE WHEN UPPER(estado) = 'NULA' THEN 1 END)::int AS n_nulas
        FROM ventas.cobranza_historico
      `
      const s = agg[0]
      const stats = {
        cobrado: Number(s.cobrado),
        pendiente: Number(s.pendiente),
        n_canceladas: s.n_canceladas,
        n_pendientes: s.n_pendientes,
        n_nulas: s.n_nulas,
      }

      return { items, total, limit: LIMIT, stats }
    })

    // GET /api/cobranza-historico/cliente/:rut — historial por cliente (G8)
    f.get('/cliente/:rut', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const { rut } = request.params
      const items = await f.prisma.cobranzaHistorico.findMany({
        where: { rut },
        orderBy: { fechaFactura: 'desc' },
      })
      const totales = items.reduce((acc, r) => {
        const monto = r.monto || 0
        const valor = r.valorFactura || 0
        const est = (r.estado || '').toUpperCase()
        if (est === 'CANCELADA') acc.cobrado += monto
        if (est === 'PENDIENTE') acc.pendiente += valor
        return acc
      }, { cobrado: 0, pendiente: 0 })
      return { rut, cliente: items[0]?.cliente, items, totales, count: items.length }
    })

    // GET /api/cobranza-historico/ejecutivas
    f.get('/ejecutivas', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async () => {
      const rows = await f.prisma.$queryRaw`
        SELECT ejecutiva, COUNT(*)::int AS total
        FROM ventas.cobranza_historico
        WHERE ejecutiva IS NOT NULL AND ejecutiva != ''
        GROUP BY ejecutiva ORDER BY total DESC
      `
      return rows
    })

    // GET /api/cobranza-historico/meses
    f.get('/meses', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async () => {
      const rows = await f.prisma.$queryRaw`
        SELECT mes_anio, COUNT(*)::int AS total
        FROM ventas.cobranza_historico
        WHERE mes_anio IS NOT NULL AND mes_anio != ''
        GROUP BY mes_anio ORDER BY MIN(fecha_factura) DESC
        LIMIT 24
      `
      return rows
    })
  })
}
