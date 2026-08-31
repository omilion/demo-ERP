import { parseDate, parsePage, parsePositiveInt } from '../operational-utils.js'
import { buildCobranzaHistoricoScopeWhere, mergeCobranzaWhere } from './scope.js'
import cobranzaGestionRoutes from './gestion.js'
import { normalizeEstadoCobranza } from './estados.js'

const FECHA_FIELDS = {
  factura: 'fechaFactura',
  fechaFactura: 'fechaFactura',
  pago: 'fechaPago',
  fechaPago: 'fechaPago',
  gestion: 'fechaGestion',
  fechaGestion: 'fechaGestion',
  ingresoPago: 'ingresoPago',
}

export function buildCobranzaHistoricoFilters(query = {}) {
  const {
    ejecutiva,
    estado,
    search,
    mes,
    fechaCampo = 'fechaFactura',
    fechaDesde,
    fechaHasta,
    ndoc,
    interno,
    rut,
    cliente,
  } = query
  const filters = {}
  if (ejecutiva) filters.ejecutiva = { contains: ejecutiva, mode: 'insensitive' }
  if (estado) {
    const canonical = normalizeEstadoCobranza(estado)
    if (!canonical) return { error: 'estado de cobranza invalido' }
    filters.estado = canonical
  }
  if (mes) filters.mesAnio = { contains: mes, mode: 'insensitive' }
  if (rut) filters.rut = { contains: rut, mode: 'insensitive' }
  if (cliente) filters.cliente = { contains: cliente, mode: 'insensitive' }
  if (ndoc) {
    const parsed = parsePositiveInt(ndoc)
    if (!parsed) return { error: 'ndoc invalido' }
    filters.ndoc = parsed
  }
  if (interno) {
    const parsed = parsePositiveInt(interno)
    if (!parsed) return { error: 'interno invalido' }
    filters.interno = parsed
  }
  if (fechaDesde || fechaHasta) {
    const field = FECHA_FIELDS[fechaCampo]
    if (!field) return { error: 'fechaCampo invalido' }
    const gte = parseDate(fechaDesde)
    const lte = parseDate(fechaHasta, true)
    if ((fechaDesde && !gte) || (fechaHasta && !lte)) return { error: 'Rango de fechas invalido' }
    filters[field] = {}
    if (gte) filters[field].gte = gte
    if (lte) filters[field].lte = lte
  }
  if (search) {
    filters.OR = [
      { cliente: { contains: search, mode: 'insensitive' } },
      { rut: { contains: search, mode: 'insensitive' } },
      { ndoc: /^\d+$/.test(String(search).trim()) ? Number.parseInt(search, 10) : -1 },
      { interno: /^\d+$/.test(String(search).trim()) ? Number.parseInt(search, 10) : -1 },
    ]
  }
  return { filters }
}

export default async function cobranzaHistoricoRoutes(fastify) {
  fastify.register(async function (f) {
    await cobranzaGestionRoutes(f)
    // GET /api/cobranza-historico?ejecutiva=...&estado=...&search=...&mes=...&page=1
    f.get('/', {
      preHandler: [f.authenticate, f.rbac('cobranza', 'read')],
    }, async (request, reply) => {
      const { page = '1' } = request.query
      const LIMIT = 100
      const offset = (parsePage(page) - 1) * LIMIT

      const built = buildCobranzaHistoricoFilters(request.query)
      if (built.error) return reply.code(400).send({ error: built.error })
      const { filters } = built
      const where = mergeCobranzaWhere(filters, await buildCobranzaHistoricoScopeWhere(f.prisma, request.user))

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
      preHandler: [f.authenticate, f.rbac('cobranza', 'read')],
    }, async (request) => {
      const { rut } = request.params
      const where = mergeCobranzaWhere({ rut }, await buildCobranzaHistoricoScopeWhere(f.prisma, request.user))
      const items = await f.prisma.cobranzaHistorico.findMany({
        where,
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
      preHandler: [f.authenticate, f.rbac('cobranza', 'read')],
    }, async (request, reply) => {
      const where = mergeCobranzaWhere(
        { ejecutiva: { not: null } },
        await buildCobranzaHistoricoScopeWhere(f.prisma, request.user),
      )
      const rows = await f.prisma.cobranzaHistorico.groupBy({
        by: ['ejecutiva'],
        where,
        _count: { _all: true },
      })
      return rows
        .filter(r => r.ejecutiva)
        .map(r => ({ ejecutiva: r.ejecutiva, total: r._count._all }))
        .sort((a, b) => b.total - a.total)
    })

    // GET /api/cobranza-historico/meses
    f.get('/meses', {
      preHandler: [f.authenticate, f.rbac('cobranza', 'read')],
    }, async (request, reply) => {
      const where = mergeCobranzaWhere(
        { mesAnio: { not: null } },
        await buildCobranzaHistoricoScopeWhere(f.prisma, request.user),
      )
      const rows = await f.prisma.cobranzaHistorico.groupBy({
        by: ['mesAnio'],
        where,
        _count: { _all: true },
        _min: { fechaFactura: true },
      })
      return rows
        .filter(r => r.mesAnio)
        .map(r => ({ mes_anio: r.mesAnio, total: r._count._all, fecha: r._min.fechaFactura }))
        .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0))
        .slice(0, 24)
    })
  })
}
