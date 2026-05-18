import { parsePage } from '../operational-utils.js'

export default async function cobranzaHistoricoRoutes(fastify) {
  fastify.register(async function (f) {
    // GET /api/cobranza-historico?ejecutiva=...&estado=...&search=...&mes=...&page=1
    f.get('/', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const { ejecutiva, estado, search, mes, page = '1' } = request.query
      const LIMIT = 100
      const offset = (parsePage(page) - 1) * LIMIT

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

      const grouped = await f.prisma.cobranzaHistorico.groupBy({
        by: ['estado'],
        where,
        _sum: { monto: true, valorFactura: true },
        _count: { _all: true },
      })
      const byEstado = Object.fromEntries(grouped.map(g => [(g.estado || '').toUpperCase(), g]))
      const stats = {
        cobrado: Number(byEstado.CANCELADA?._sum.monto || 0),
        pendiente: Number(byEstado.PENDIENTE?._sum.valorFactura || 0),
        n_canceladas: byEstado.CANCELADA?._count._all || 0,
        n_pendientes: byEstado.PENDIENTE?._count._all || 0,
        n_nulas: byEstado.NULA?._count._all || 0,
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
