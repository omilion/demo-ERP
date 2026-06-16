import { rowsToCsv, sendCsv } from '../../utils/csv.js'
import { parseDate } from '../operational-utils.js'
import { computeTotal } from '../ventas/helpers.js'

const TIPO_VENTA_TODOS = 'Todos'
const TIPOS_VENTA = [
  'Venta sala',
  'Venta directa',
  'Normal',
  'Venta Web',
  'Convenio Marco',
  'Licitaci\u00f3n',
]
const LICITACION_MOJIBAKE = 'Licitaci\u00c3\u00b3n'

function aliasKey(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
}

const TIPO_ALIASES = new Map([
  ...TIPOS_VENTA.map(tipo => [aliasKey(tipo), tipo]),
  [aliasKey('Venta Sala'), 'Venta sala'],
  [aliasKey('Venta Directa'), 'Venta directa'],
  [aliasKey('venta-sala'), 'Venta sala'],
  [aliasKey('venta-directa'), 'Venta directa'],
  [aliasKey('venta-web'), 'Venta Web'],
  [aliasKey('convenio-marco'), 'Convenio Marco'],
  [aliasKey('licitacion'), 'Licitaci\u00f3n'],
])

const TIPO_DB_VARIANTS = {
  'Venta sala': ['Venta sala', 'Venta Sala'],
  'Venta directa': ['Venta directa', 'Venta Directa'],
  Normal: ['Normal'],
  'Venta Web': ['Venta Web'],
  'Convenio Marco': ['Convenio Marco'],
  'Licitaci\u00f3n': ['Licitaci\u00f3n', LICITACION_MOJIBAKE],
}

function parseTipoVenta(value) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined
  const raw = String(value).trim()
  if (aliasKey(raw) === aliasKey(TIPO_VENTA_TODOS)) return null
  if (raw === LICITACION_MOJIBAKE) return 'Licitaci\u00f3n'
  const tipo = TIPO_ALIASES.get(aliasKey(raw))
  return tipo || { error: 'tipoVenta invalido' }
}

function normalizeOrdenTipoVenta(value) {
  if (!value) return null
  if (value === LICITACION_MOJIBAKE) return 'Licitaci\u00f3n'
  return TIPO_ALIASES.get(aliasKey(value)) || String(value)
}

function buildDateRange(desde, hasta) {
  const gte = desde ? parseDate(desde) : null
  const lte = hasta ? parseDate(hasta, true) : null
  if ((desde && !gte) || (hasta && !lte)) return { error: 'Rango de fechas invalido' }
  return { gte, lte }
}

function applyDateRange(where, range) {
  if (!range.gte && !range.lte) return where
  where.createdAt = {}
  if (range.gte) where.createdAt.gte = range.gte
  if (range.lte) where.createdAt.lte = range.lte
  return where
}

function parsePositiveInt(value, field) {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return { error: `${field} invalido` }
  return parsed
}

function parseLimit(value, defaultValue = 200, max = 1000) {
  if (value === undefined || value === null || value === '') return defaultValue
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return { error: 'limit invalido' }
  return Math.min(parsed, max)
}

function parseOffset(value) {
  if (value === undefined || value === null || value === '') return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return { error: 'offset invalido' }
  return parsed
}

function endOfRuleDay(value) {
  if (!value) return null
  const date = new Date(value)
  date.setHours(23, 59, 59, 999)
  return date
}

function ruleInForce(rule, fecha) {
  const saleDate = new Date(fecha)
  if (rule.vigenteDesde && saleDate < new Date(rule.vigenteDesde)) return false
  if (rule.vigenteHasta && saleDate > endOfRuleDay(rule.vigenteHasta)) return false
  return true
}

function rankRule(rule, vendedorId, tipoVenta) {
  const vendedorRank = rule.vendedorId === vendedorId ? 2 : rule.vendedorId == null ? 1 : 0
  const tipoRank = rule.tipoVenta === tipoVenta ? 2 : rule.tipoVenta == null ? 1 : 0
  if (!vendedorRank || !tipoRank) return null
  return {
    vendedorRank,
    tipoRank,
    prioridad: Number(rule.prioridad || 0),
    id: rule.id,
  }
}

function compareRank(a, b) {
  if (a.vendedorRank !== b.vendedorRank) return b.vendedorRank - a.vendedorRank
  if (a.tipoRank !== b.tipoRank) return b.tipoRank - a.tipoRank
  if (a.prioridad !== b.prioridad) return b.prioridad - a.prioridad
  return a.id - b.id
}

function findApplicableRule(rules, { vendedorId, tipoVenta, fecha }) {
  const ranked = []
  for (const rule of rules) {
    if (!ruleInForce(rule, fecha)) continue
    const rank = rankRule(rule, vendedorId, tipoVenta)
    if (!rank) continue
    ranked.push({ rule, rank })
  }
  ranked.sort((a, b) => compareRank(a.rank, b.rank))
  return ranked[0]?.rule || null
}

function commissionFromRule(rule, baseMonto) {
  if (!rule || baseMonto <= 0) return { porcentajeAplicado: null, comisionEstimada: 0, tramoId: null }
  if (rule.modalidad === 'FIJA') {
    const porcentaje = Number(rule.porcentaje || 0)
    return {
      porcentajeAplicado: porcentaje,
      comisionEstimada: Math.round(baseMonto * porcentaje) / 100,
      tramoId: null,
    }
  }

  const tramo = (rule.tramos || []).find(item => (
    baseMonto >= Number(item.montoDesde || 0)
    && (item.montoHasta == null || baseMonto < Number(item.montoHasta))
  ))
  const porcentaje = tramo ? Number(tramo.porcentaje || 0) : 0
  return {
    porcentajeAplicado: tramo ? porcentaje : null,
    comisionEstimada: tramo ? Math.round(baseMonto * porcentaje) / 100 : 0,
    tramoId: tramo?.id || null,
  }
}

function ruleScope(rule) {
  if (!rule) return null
  if (rule.vendedorId && rule.tipoVenta) return 'vendedor_tipo'
  if (rule.vendedorId && !rule.tipoVenta) return 'vendedor_todos'
  if (!rule.vendedorId && rule.tipoVenta) return 'global_tipo'
  return 'global_todos'
}

function isNcDoc(doc) {
  const text = String(doc || '').toLowerCase()
  return text.includes('nota de credito') || text.includes('nota credito')
}

function isNcMovimiento(mov) {
  // Fuente principal: campo dedicado numeroNCInterna (si esta presente, es una NC).
  // Fallback: tipoDocumento/documento con etiqueta explicita de nota de credito.
  if (mov.numeroNCInterna) return true
  return isNcDoc(mov.documento) || isNcDoc(mov.tipoDocumento)
}

function addSummary(bucket, key, row) {
  const normalized = key || 'Sin dato'
  if (!bucket[normalized]) {
    bucket[normalized] = {
      count: 0,
      totalVendido: 0,
      totalCobrado: 0,
      totalMultas: 0,
      totalNC: 0,
      totalComision: 0,
    }
  }
  bucket[normalized].count += 1
  bucket[normalized].totalVendido += row.totalVendido
  bucket[normalized].totalCobrado += row.totalCobrado
  bucket[normalized].totalMultas += row.totalMultas
  bucket[normalized].totalNC += row.totalNC
  bucket[normalized].totalComision += row.comisionEstimada
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function mapOrdenComision(orden, rules, cobradoByOrden = new Map(), multasByOrden = new Map(), ncByOrden = new Map()) {
  const tipoVenta = normalizeOrdenTipoVenta(orden.tipo)
  const totalVendido = roundMoney(computeTotal(orden.items || [], orden.descuentoPct, orden.cargos || [], orden.descuentoMonto))
  const totalCobrado = roundMoney(Math.max(0, Math.min(totalVendido, cobradoByOrden.get(orden.id) || 0)))

  const totalMultas = roundMoney(multasByOrden.get(orden.id) || 0)
  const totalNC = roundMoney(ncByOrden.get(orden.id) || 0)

  const rule = findApplicableRule(rules, {
    vendedorId: orden.userId,
    tipoVenta,
    fecha: orden.createdAt,
  })

  // base of commission depends on rule's base (COBRADO vs VENDIDO)
  const baseMonto = rule?.base === 'COBRADO' ? totalCobrado : totalVendido
  const baseAjustada = Math.max(0, roundMoney(baseMonto - totalMultas - totalNC))

  // Restricted eligibility check:
  // "una comisión solo debe pagarse si la venta está despachada, facturada y completamente pagada."
  const isPaid = orden.estadoPago === 'Pagada'
  const isDelivered = orden.estadoEntrega === 'Entregada'
  const isBilled = Number(orden.facturado || 0) > 0
  const isEligible = isPaid && isDelivered && isBilled

  // Commission is only paid (calculated) if the order is eligible
  const commissionBase = isEligible ? baseAjustada : 0
  const commission = commissionFromRule(rule, commissionBase)

  return {
    ordenId: orden.id,
    nInterno: orden.nInterno,
    fecha: orden.createdAt,
    tipoVenta,
    vendedorId: orden.userId,
    vendedorNombre: orden.creadorNombre || orden.vendedor?.nombre || null,
    totalVendido,
    totalCobrado,
    totalMultas,
    totalNC,
    baseRegla: rule?.base || null,
    baseComision: roundMoney(baseAjustada),
    comisionEstimada: roundMoney(commission.comisionEstimada),
    porcentajeAplicado: commission.porcentajeAplicado,
    tramoId: commission.tramoId,
    reglaId: rule?.id || null,
    reglaNombre: rule?.nombre || null,
    reglaScope: ruleScope(rule),
    reglaTipoVenta: rule?.tipoVenta || null,
    reglaTipoVentaLabel: rule?.tipoVenta || TIPO_VENTA_TODOS,
    reglaVendedorId: rule?.vendedorId || null,
    modalidad: rule?.modalidad || null,
    estadoPago: orden.estadoPago,
    estadoEntrega: orden.estadoEntrega,
    isEligible,
    facturado: Number(orden.facturado || 0),
  }
}

function buildSummary(rows) {
  const byVendedor = {}
  const byTipo = {}
  const totales = {
    count: rows.length,
    totalVendido: 0,
    totalCobrado: 0,
    totalMultas: 0,
    totalNC: 0,
    totalComision: 0,
  }

  for (const row of rows) {
    totales.totalVendido += row.totalVendido
    totales.totalCobrado += row.totalCobrado
    totales.totalMultas += row.totalMultas
    totales.totalNC += row.totalNC
    totales.totalComision += row.comisionEstimada
    addSummary(byVendedor, row.vendedorNombre || String(row.vendedorId || ''), row)
    addSummary(byTipo, row.tipoVenta, row)
  }

  for (const key of ['totalVendido', 'totalCobrado', 'totalMultas', 'totalNC', 'totalComision']) {
    totales[key] = roundMoney(totales[key])
  }
  for (const bucket of [byVendedor, byTipo]) {
    for (const item of Object.values(bucket)) {
      item.totalVendido = roundMoney(item.totalVendido)
      item.totalCobrado = roundMoney(item.totalCobrado)
      item.totalMultas = roundMoney(item.totalMultas || 0)
      item.totalNC = roundMoney(item.totalNC || 0)
      item.totalComision = roundMoney(item.totalComision)
    }
  }
  return { totales, byVendedor, byTipo }
}

export async function buildComisionesReporte(fastify, query = {}, { exportAll = false } = {}) {
  const range = buildDateRange(query.desde || query.fechaDesde, query.hasta || query.fechaHasta)
  if (range.error) return { error: range.error }
  const cobroRange = buildDateRange(query.cobroDesde, query.cobroHasta)
  if (cobroRange.error) return { error: cobroRange.error }

  const tipoVenta = parseTipoVenta(query.tipoVenta || query.tipo)
  if (tipoVenta?.error) return tipoVenta
  const vendedorId = parsePositiveInt(query.vendedorId, 'vendedorId')
  if (vendedorId?.error) return vendedorId
  const limit = exportAll ? parseLimit(query.limit, 5000, 10000) : parseLimit(query.limit)
  if (limit?.error) return limit
  const offset = exportAll ? 0 : parseOffset(query.offset)
  if (offset?.error) return offset

  let where = applyDateRange({ eliminada: false }, range)
  if (tipoVenta) where.tipo = { in: TIPO_DB_VARIANTS[tipoVenta] || [tipoVenta] }
  if (vendedorId) where.userId = vendedorId
  if (query.estadoPago) where.estadoPago = String(query.estadoPago)
  if (query.vendedor) where.creadorNombre = { contains: String(query.vendedor), mode: 'insensitive' }

  const [total, ordenes] = await Promise.all([
    fastify.prisma.orden.count({ where }),
    fastify.prisma.orden.findMany({
      where,
      include: { items: true, cargos: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: offset,
    }),
  ])

  const ordenIds = ordenes.map(orden => orden.id)
  const vendedorIds = [...new Set(ordenes.map(orden => orden.userId).filter(Boolean))]
  const pagosWhere = {
    ordenId: { in: ordenIds.length ? ordenIds : [-1] },
    eliminado: false,
    tipo: { equals: 'Ingreso', mode: 'insensitive' },
    monto: { gt: 0 },
    NOT: { medioPago: { equals: 'Referencial', mode: 'insensitive' } },
  }
  if (cobroRange.gte || cobroRange.lte) {
    pagosWhere.fecha = {}
    if (cobroRange.gte) pagosWhere.fecha.gte = cobroRange.gte
    if (cobroRange.lte) pagosWhere.fecha.lte = cobroRange.lte
  }

  const [rules, pagos, multas, ncMovements] = await Promise.all([
    fastify.prisma.comisionRegla.findMany({
      where: {
        activo: true,
        OR: [
          { vendedorId: null },
          ...(vendedorIds.length ? [{ vendedorId: { in: vendedorIds } }] : []),
        ],
      },
      include: {
        tramos: {
          orderBy: [
            { montoDesde: 'asc' },
            { id: 'asc' },
          ],
        },
      },
    }),
    fastify.prisma.movimientoCaja.findMany({
      where: pagosWhere,
      select: { ordenId: true, monto: true },
    }),
    fastify.prisma.multa.findMany({
      where: { ordenId: { in: ordenIds.length ? ordenIds : [-1] } },
      select: { ordenId: true, monto: true }
    }),
    fastify.prisma.movimientoCaja.findMany({
      where: {
        ordenId: { in: ordenIds.length ? ordenIds : [-1] },
        eliminado: false,
      },
      select: { ordenId: true, monto: true, documento: true, tipoDocumento: true, numeroNCInterna: true }
    })
  ])

  const cobradoByOrden = new Map()
  for (const pago of pagos) {
    if (!pago.ordenId) continue
    cobradoByOrden.set(pago.ordenId, (cobradoByOrden.get(pago.ordenId) || 0) + Number(pago.monto || 0))
  }

  const multasByOrden = new Map()
  for (const m of multas) {
    if (!m.ordenId) continue
    multasByOrden.set(m.ordenId, (multasByOrden.get(m.ordenId) || 0) + Number(m.monto || 0))
  }

  const ncByOrden = new Map()
  for (const mov of ncMovements) {
    if (!mov.ordenId || !isNcMovimiento(mov)) continue
    ncByOrden.set(mov.ordenId, (ncByOrden.get(mov.ordenId) || 0) + Math.abs(Number(mov.monto || 0)))
  }

  const rows = ordenes.map(orden => mapOrdenComision(orden, rules, cobradoByOrden, multasByOrden, ncByOrden))
  const resumen = buildSummary(rows)

  return {
    filtros: {
      desde: query.desde || query.fechaDesde || null,
      hasta: query.hasta || query.fechaHasta || null,
      tipoVenta: tipoVenta === null ? TIPO_VENTA_TODOS : tipoVenta || null,
      vendedorId: vendedorId || null,
      vendedor: query.vendedor || null,
      estadoPago: query.estadoPago || null,
      cobroDesde: query.cobroDesde || null,
      cobroHasta: query.cobroHasta || null,
    },
    pagination: {
      total,
      limit,
      offset,
    },
    ...resumen,
    rows,
  }
}

export function registerComisionesReportRoutes(fastify) {
  const adminRead = fastify.rbac('admin', 'read', { allowExtra: false })

  fastify.get('/comisiones', {
    preHandler: [fastify.authenticate, adminRead],
  }, async (request, reply) => {
    const reporte = await buildComisionesReporte(fastify, request.query)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return reporte
  })

  fastify.get('/export/comisiones', {
    preHandler: [fastify.authenticate, adminRead],
  }, async (request, reply) => {
    const reporte = await buildComisionesReporte(fastify, request.query, { exportAll: true })
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    const csv = rowsToCsv(reporte.rows, [
      { key: 'nInterno', label: 'N Interno' },
      { key: 'fecha', label: 'Fecha' },
      { key: 'tipoVenta', label: 'Tipo venta' },
      { key: 'vendedorNombre', label: 'Vendedor' },
      { key: 'totalVendido', label: 'Total vendido' },
      { key: 'totalCobrado', label: 'Total cobrado' },
      { key: 'totalMultas', label: 'Multas' },
      { key: 'totalNC', label: 'Notas Credito' },
      { key: 'baseRegla', label: 'Base regla' },
      { key: 'baseComision', label: 'Base comision' },
      { key: 'porcentajeAplicado', label: 'Porcentaje aplicado' },
      { key: 'comisionEstimada', label: 'Comision estimada' },
      { key: 'reglaNombre', label: 'Regla' },
      { key: 'reglaScope', label: 'Alcance regla' },
      { key: 'estadoPago', label: 'Estado pago' },
      { key: 'estadoEntrega', label: 'Estado entrega' },
      { key: 'isEligible', label: 'Elegible' },
    ])
    return sendCsv(reply, `comisiones_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })
}
