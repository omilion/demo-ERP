import { normalizeTipoMovimiento, parseOptionalInt, parsePage, parsePositiveInt } from '../operational-utils.js'
import { withMovimientoSucursalScope } from './scope.js'

export default async function historicoRoutes(fastify) {
  // GET /api/caja/historico?year=2024&medioPago=...&search=...&tipo=ingreso
  fastify.get('/historico', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'read')],
  }, async (request, reply) => {
    const { year, desde, hasta, medioPago, search, tipo, nInterno, ordenId, nDoc, tipoVenta, estado = 'activos', page = '1' } = request.query
    const LIMIT = 100
    const offset = (parsePage(page) - 1) * LIMIT

    const where = {}
    if (estado === 'anulados') where.eliminado = true
    else if (estado === 'todos') {}
    else where.eliminado = false
    if (year) {
      const y = parseOptionalInt(year)
      if (!y || y < 2000 || y > 2100) return reply.code(400).send({ error: 'year invalido' })
      where.fecha = { gte: new Date(`${y}-01-01`), lt: new Date(`${y + 1}-01-01`) }
    }
    if (desde || hasta) {
      const range = {}
      if (desde) {
        const d = new Date(`${desde}T00:00:00`)
        if (Number.isNaN(d.getTime())) return reply.code(400).send({ error: 'desde invalido' })
        range.gte = d
      }
      if (hasta) {
        const h = new Date(`${hasta}T23:59:59.999`)
        if (Number.isNaN(h.getTime())) return reply.code(400).send({ error: 'hasta invalido' })
        range.lte = h
      }
      where.fecha = { ...(where.fecha || {}), ...range }
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
    if (nInterno || tipoVenta) {
      const parsedNInterno = parsePositiveInt(nInterno)
      if (nInterno && !parsedNInterno) return reply.code(400).send({ error: 'nInterno invalido' })
      const ordenes = await fastify.prisma.orden.findMany({
        where: {
          ...(nInterno ? { nInterno: parsedNInterno } : {}),
          ...(tipoVenta ? { tipo: { contains: tipoVenta, mode: 'insensitive' } } : {}),
        },
        select: { id: true },
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
        { gastoTipo: { nombre: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const scopedWhere = withMovimientoSucursalScope(request.user, where)

    const [items, total] = await Promise.all([
      fastify.prisma.movimientoCaja.findMany({
        where: scopedWhere,
        orderBy: { fecha: 'desc' },
        take: LIMIT,
        skip: offset,
        include: { gastoTipo: { select: { id: true, nombre: true, activo: true } } },
      }),
      fastify.prisma.movimientoCaja.count({ where: scopedWhere }),
    ])

    const statsWhere = {
      AND: [
        scopedWhere,
        { NOT: { medioPago: { equals: 'Referencial', mode: 'insensitive' } } },
      ],
    }
    const grouped = await fastify.prisma.movimientoCaja.groupBy({
      by: ['tipo'],
      where: statsWhere,
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
  }, async (request) => {
    const rows = await fastify.prisma.movimientoCaja.findMany({
      where: withMovimientoSucursalScope(request.user, { fecha: { not: null }, eliminado: false }),
      select: { fecha: true },
    })
    return [...new Set(rows.map(r => r.fecha?.getFullYear()).filter(Boolean))].sort((a, b) => b - a)
  })
}
