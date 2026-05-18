import { normalizeTipoMovimiento, parseOptionalInt, parsePage, parsePositiveInt } from '../operational-utils.js'

export default async function historicoRoutes(fastify) {
  // GET /api/caja/historico?year=2024&medioPago=...&search=...&tipo=ingreso
  fastify.get('/historico', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'read')],
  }, async (request, reply) => {
    const { year, medioPago, search, tipo, nInterno, ordenId, nDoc, page = '1' } = request.query
    const LIMIT = 100
    const offset = (parsePage(page) - 1) * LIMIT

    const where = {}
    if (year) {
      const y = parseOptionalInt(year)
      if (!y || y < 2000 || y > 2100) return reply.code(400).send({ error: 'year invalido' })
      where.fecha = { gte: new Date(`${y}-01-01`), lt: new Date(`${y + 1}-01-01`) }
    }
    if (medioPago) where.medioPago = { contains: medioPago, mode: 'insensitive' }
    if (tipo) {
      const tipoNormalizado = normalizeTipoMovimiento(tipo)
      if (!tipoNormalizado) return reply.code(400).send({ error: 'tipo invalido' })
      where.tipo = tipoNormalizado
    }
    if (ordenId) {
      const parsedOrdenId = parsePositiveInt(ordenId)
      if (!parsedOrdenId) return reply.code(400).send({ error: 'ordenId invalido' })
      where.ordenId = parsedOrdenId
    }
    if (nDoc) where.nDoc = { contains: nDoc, mode: 'insensitive' }
    if (nInterno) {
      const parsedNInterno = parsePositiveInt(nInterno)
      if (!parsedNInterno) return reply.code(400).send({ error: 'nInterno invalido' })
      // resolver nInterno → ordenId
      const ordenes = await fastify.prisma.orden.findMany({
        where: { nInterno: parsedNInterno }, select: { id: true },
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

    const grouped = await fastify.prisma.movimientoCaja.groupBy({
      by: ['tipo'],
      where,
      _sum: { monto: true },
    })
    const totalIngresos = grouped
      .filter(g => (g.tipo || '').toLowerCase() === 'ingreso')
      .reduce((s, g) => s + (g._sum.monto || 0), 0)
    const totalEgresos = grouped
      .filter(g => (g.tipo || '').toLowerCase() === 'egreso')
      .reduce((s, g) => s + Math.abs(g._sum.monto || 0), 0)

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
