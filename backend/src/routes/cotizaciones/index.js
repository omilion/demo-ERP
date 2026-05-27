import { getUserSucursalId } from '../caja/scope.js'
import { applyVentaStockDeltas, buildReplacementStockDeltas, buildStockDeltasFromItems, isVentaDirectaStockTipo } from '../ventas/stock.js'
import { computeVentaFinancialState } from '../ventas/financial.js'
import { can as canAccess } from '../../middleware/rbac.js'
import { rowsToCsv, sendCsv } from '../../utils/csv.js'

function scopedWhere(user, where = {}) {
  const sucursalId = getUserSucursalId(user)
  return sucursalId ? { ...where, sucursalId } : where
}

function scopedItemWhere(user, itemId) {
  const sucursalId = getUserSucursalId(user)
  return sucursalId ? { id: itemId, cotizacion: { sucursalId } } : { id: itemId }
}

function httpError(statusCode, message, extra = {}) {
  const err = new Error(message)
  err.statusCode = statusCode
  Object.assign(err, extra)
  return err
}

function normalizeLicitacionId(value) {
  return String(value ?? '').replace(/\s+/g, '').trim()
}

async function validateLicitacionIdForCreate(prisma, idLicitacion) {
  const normalized = normalizeLicitacionId(idLicitacion)
  if (!normalized) throw httpError(400, 'idLicitacion requerido')
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cotizacion-licitacion-id:${normalized.toLowerCase()}`})::bigint)`
  const existing = await prisma.cotizacionLicitacion.findFirst({
    where: { idLicitacion: { equals: normalized, mode: 'insensitive' } },
    select: { id: true },
  })
  if (existing) throw httpError(409, 'El ID de licitacion ya existe')
  return normalized
}

function buildVentaObservacionesFromCotizacion(cot) {
  return [cot.obs || null, cot.ordenCompra ? `OC: ${cot.ordenCompra}` : null].filter(Boolean).join('\n') || null
}

function userCan(user, module, permission) {
  return canAccess(user?.role, module, permission, user?.permisosExtra)
}

function cleanOptionalText(value) {
  if (value === undefined) return undefined
  if (value === null) return null
  const text = String(value).trim()
  return text || null
}

function parseStrictInt(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

function parseStrictNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function buildCotizacionItemCreateData(input = {}, label = 'item') {
  const codigoInterno = cleanOptionalText(input.codigoInterno)
  const nombre = cleanOptionalText(input.nombre)
  const descripcion = cleanOptionalText(input.descripcion)
  const cantidad = parseStrictInt(input.cantidad)
  const cantAdjudicados = input.cantAdjudicados === undefined || input.cantAdjudicados === null || input.cantAdjudicados === ''
    ? 0
    : parseStrictInt(input.cantAdjudicados)
  const precio = input.precio === undefined || input.precio === null || input.precio === ''
    ? 0
    : parseStrictNumber(input.precio)

  if (!codigoInterno && !nombre) return { error: `${label}: codigoInterno o nombre requerido` }
  if (!Number.isInteger(cantidad) || cantidad < 1) return { error: `${label}: cantidad debe ser mayor a 0` }
  if (!Number.isInteger(cantAdjudicados) || cantAdjudicados < 0) return { error: `${label}: cantAdjudicados invalido` }
  if (cantAdjudicados > cantidad) return { error: `${label}: cantAdjudicados no puede superar cantidad` }
  if (!Number.isFinite(precio) || precio < 0) return { error: `${label}: precio invalido` }

  return {
    data: {
      codigoInterno,
      nombre,
      descripcion,
      cantidad,
      cantAdjudicados,
      precio,
    },
  }
}

function buildCotizacionItemPatchData(body = {}, current = {}) {
  const data = {}
  if (body.codigoInterno !== undefined) data.codigoInterno = cleanOptionalText(body.codigoInterno)
  if (body.nombre !== undefined) data.nombre = cleanOptionalText(body.nombre)
  if (body.descripcion !== undefined) data.descripcion = cleanOptionalText(body.descripcion)
  if (body.cantidad !== undefined) {
    const cantidad = parseStrictInt(body.cantidad)
    if (!Number.isInteger(cantidad) || cantidad < 1) return { error: 'cantidad debe ser mayor a 0' }
    data.cantidad = cantidad
  }
  if (body.cantAdjudicados !== undefined) {
    const cantAdjudicados = parseStrictInt(body.cantAdjudicados)
    if (!Number.isInteger(cantAdjudicados) || cantAdjudicados < 0) return { error: 'cantAdjudicados invalido' }
    data.cantAdjudicados = cantAdjudicados
  }
  if (body.precio !== undefined) {
    const precio = parseStrictNumber(body.precio)
    if (!Number.isFinite(precio) || precio < 0) return { error: 'precio invalido' }
    data.precio = precio
  }

  const merged = { ...current, ...data }
  if (!cleanOptionalText(merged.codigoInterno) && !cleanOptionalText(merged.nombre)) {
    return { error: 'codigoInterno o nombre requerido' }
  }
  if (Number(merged.cantAdjudicados || 0) > Number(merged.cantidad || 0)) {
    return { error: 'cantAdjudicados no puede superar cantidad' }
  }
  return { data }
}

function parseReportLimit(value) {
  if (String(value || '').toLowerCase() === 'all') return null
  const parsed = Number.parseInt(value ?? '500', 10)
  if (!Number.isInteger(parsed) || parsed < 1) return 500
  return Math.min(parsed, 1000)
}

function parseReportPage(value) {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function reportDateRange(fechaDesde, fechaHasta) {
  const range = {}
  if (fechaDesde) range.gte = new Date(fechaDesde)
  if (fechaHasta) range.lte = new Date(`${fechaHasta}T23:59:59`)
  return Object.keys(range).length ? range : null
}

function normalizeRutSearch(value) {
  const text = String(value ?? '').trim()
  if (!text || /[^0-9kK.\-\s]/.test(text)) return ''
  return text.toUpperCase().replace(/[^0-9K]/g, '')
}

async function buildReportWhere(prisma, query = {}, user = null) {
  const { fechaDesde, fechaHasta, rutCliente, idLicitacion, estado, search, todosEstados } = query
  const where = scopedWhere(user)
  const hasFilter = Boolean(fechaDesde || fechaHasta || rutCliente || idLicitacion || estado || search)
  if (!hasFilter && todosEstados !== 'true') where.estado = { equals: 'Pendiente', mode: 'insensitive' }
  const dateRange = reportDateRange(fechaDesde, fechaHasta)
  if (dateRange) where.fechaCreacion = dateRange
  if (estado) where.estado = { equals: estado, mode: 'insensitive' }
  if (rutCliente) {
    const normalizedRut = normalizeRutSearch(rutCliente)
    if (normalizedRut) {
      const matches = await prisma.$queryRaw`
        SELECT id
        FROM ventas.cotizacion_licitacion
        WHERE regexp_replace(upper(COALESCE(rut_cliente, '')), '[^0-9K]', '', 'g') LIKE ${`%${normalizedRut}%`}
      `
      const ids = matches.map(row => Number(row.id)).filter(Boolean)
      where.id = { in: ids.length ? ids : [-1] }
    } else {
      where.rutCliente = { contains: rutCliente, mode: 'insensitive' }
    }
  }
  if (idLicitacion) where.idLicitacion = { contains: idLicitacion, mode: 'insensitive' }
  if (search) {
    const text = String(search).trim()
    where.OR = [
      { idLicitacion: { contains: text, mode: 'insensitive' } },
      { rutCliente: { contains: text, mode: 'insensitive' } },
      { referencia: { contains: text, mode: 'insensitive' } },
      { ordenCompra: { contains: text, mode: 'insensitive' } },
      { obs: { contains: text, mode: 'insensitive' } },
      { usuario: { contains: text, mode: 'insensitive' } },
    ]
  }
  return where
}

function computeCotizacionTotals(items = []) {
  const totalNeto = items.reduce((sum, item) => {
    return sum + Number(item.cantidad || 0) * Number(item.precio || 0)
  }, 0)
  const totalAdjudicado = items.reduce((sum, item) => {
    return sum + Number(item.cantAdjudicados || 0) * Number(item.precio || 0)
  }, 0)
  const iva = Math.round(totalNeto * 0.19)
  return { totalNeto, iva, totalConIva: totalNeto + iva, totalAdjudicado }
}

function formatReportDate(value, withTime = false) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  if (!withTime) return `${dd}-${mm}-${yyyy}`
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`
}

async function hydrateReportRows(prisma, cotizaciones = [], { includeItems = true } = {}) {
  const rutClientes = [...new Set(cotizaciones.map(c => c.rutCliente).filter(Boolean))]
  const ordenIds = [...new Set(cotizaciones.map(c => c.ordenId).filter(Boolean))]
  const legacyLicitacionIds = [...new Set(cotizaciones.filter(c => !c.ordenId).map(c => c.idLicitacion).filter(Boolean))]
  const [clientes, ordenesDirectas, legacyOrdenes] = await Promise.all([
    rutClientes.length
      ? prisma.cliente.findMany({
          where: { rut: { in: rutClientes } },
          select: { rut: true, nombre: true, razonSocial: true, email: true },
        })
      : [],
    ordenIds.length
      ? prisma.orden.findMany({
          where: { id: { in: ordenIds } },
          select: { id: true, nInterno: true, tipo: true, sucursalId: true, licitacion: true },
        })
      : [],
    legacyLicitacionIds.length
      ? prisma.orden.findMany({
          where: {
            eliminada: false,
            OR: legacyLicitacionIds.map(id => ({ licitacion: { equals: id, mode: 'insensitive' } })),
            tipo: { contains: 'Licit', mode: 'insensitive' },
          },
          select: { id: true, nInterno: true, tipo: true, sucursalId: true, licitacion: true },
        })
      : [],
  ])
  const clienteByRut = Object.fromEntries(clientes.map(c => [c.rut, c]))
  const ordenes = [...ordenesDirectas, ...legacyOrdenes]
  const ordenById = Object.fromEntries(ordenes.map(o => [o.id, o]))
  const legacyOrdenesByLicitacion = ordenes.reduce((acc, orden) => {
    if (!orden.licitacion) return acc
    const key = String(orden.licitacion).toLowerCase()
    if (!acc[key]) acc[key] = []
    acc[key].push(orden)
    return acc
  }, {})

  return cotizaciones.map(c => {
    const items = c.items || []
    const cliente = c.rutCliente ? clienteByRut[c.rutCliente] : null
    const orden = c.ordenId
      ? ordenById[c.ordenId]
      : (legacyOrdenesByLicitacion[String(c.idLicitacion).toLowerCase()] || []).find(o => !c.sucursalId || o.sucursalId === c.sucursalId) || null
    const totals = computeCotizacionTotals(items)
    return {
      ...c,
      ordenId: c.ordenId || orden?.id || null,
      items: includeItems ? items : undefined,
      nItems: c._count?.items ?? items.length,
      detalle: items.map(i => `${i.nombre || i.codigoInterno || 'Item'} X ${i.cantidad || 0} / Adjudicados ${i.cantAdjudicados || 0}`).join(' | '),
      clienteNombre: cliente?.nombre || '',
      clienteRazonSocial: cliente?.razonSocial || '',
      clienteEmail: cliente?.email || '',
      ordenNInterno: orden?.nInterno || null,
      ventaVinculada: Boolean(orden),
      ...totals,
    }
  })
}

function reportSummaryColumns() {
  return [
    { key: 'idLicitacion', label: 'ID' },
    { key: 'ordenCompra', label: 'Orden Compra' },
    { key: 'fechaCreacion', label: 'Fecha Creacion', format: v => formatReportDate(v, true) },
    { key: 'fecha', label: 'Fecha Licitacion', format: v => formatReportDate(v) },
    { key: 'plazo', label: 'Plazo' },
    { key: 'totalNeto', label: 'Total Neto' },
    { key: 'iva', label: 'IVA' },
    { key: 'totalConIva', label: 'Total C/IVA' },
    { key: 'usuario', label: 'Creada por' },
    { key: 'estado', label: 'Estado' },
    { key: 'rutCliente', label: 'Cliente' },
    { key: 'clienteRazonSocial', label: 'Razon Social' },
    { key: 'clienteEmail', label: 'Email' },
  ]
}

function reportDetailRows(rows = []) {
  return rows.flatMap(row => {
    const items = row.items || []
    if (!items.length) return [{ ...row, detalleItem: '', cantidadItem: '', adjudicadaItem: '' }]
    return items.map(item => ({
      ...row,
      detalleItem: item.nombre || item.codigoInterno || '',
      cantidadItem: item.cantidad ?? 0,
      adjudicadaItem: item.cantAdjudicados ?? 0,
    }))
  })
}

export default async function cotizacionesRoutes(fastify) {
  // ── List ──────────────────────────────────────────────────────────────────
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'read')],
  }, async (request) => {
    const { search, estado, rutCliente, idLicitacion, fechaDesde, fechaHasta, page = '1' } = request.query
    const LIMIT = 100
    const offset = (parseInt(page) - 1) * LIMIT

    const where = scopedWhere(request.user)
    if (estado) where.estado = estado
    if (rutCliente) where.rutCliente = rutCliente
    if (idLicitacion) where.idLicitacion = idLicitacion
    if (fechaDesde || fechaHasta) {
      where.fechaCreacion = {}
      if (fechaDesde) where.fechaCreacion.gte = new Date(fechaDesde)
      if (fechaHasta) where.fechaCreacion.lte = new Date(fechaHasta + 'T23:59:59')
    }
    if (search) {
      where.OR = [
        { idLicitacion: { contains: search, mode: 'insensitive' } },
        { referencia: { contains: search, mode: 'insensitive' } },
        { ordenCompra: { contains: search, mode: 'insensitive' } },
        { obs: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await Promise.all([
      fastify.prisma.cotizacionLicitacion.findMany({
        where,
        orderBy: { fechaCreacion: 'desc' },
        take: LIMIT,
        skip: offset,
      }),
      fastify.prisma.cotizacionLicitacion.count({ where }),
    ])
    return { items, total, limit: LIMIT }
  })

  // Reportes legacy de licitaciones: filtros, tabla operacional y agregados.
  fastify.get('/reportes', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'read')],
  }, async (request, reply) => {
    const page = parseReportPage(request.query.page)
    const limit = parseReportLimit(request.query.limit)
    const where = await buildReportWhere(fastify.prisma, request.query, request.user)
    const [byEstado, byCliente, total, totalItems, rows] = await Promise.all([
      fastify.prisma.cotizacionLicitacion.groupBy({
        by: ['estado'], where, _count: { _all: true },
      }),
      fastify.prisma.cotizacionLicitacion.groupBy({
        by: ['rutCliente'], where, _count: { _all: true },
      }),
      fastify.prisma.cotizacionLicitacion.count({ where }),
      fastify.prisma.cotizacionLicitacionItem.findMany({
        where: { cotizacion: { is: where } },
        select: { cantidad: true, cantAdjudicados: true, precio: true },
      }),
      fastify.prisma.cotizacionLicitacion.findMany({
        where,
        include: { items: true, _count: { select: { items: true } } },
        orderBy: { fechaCreacion: 'desc' },
        ...(limit ? { take: limit, skip: (page - 1) * limit } : {}),
      }),
    ])
    if (!rows) return reply.code(404).send({ error: 'Reporte no encontrado' })
    const hydrated = await hydrateReportRows(fastify.prisma, rows)
    const totals = computeCotizacionTotals(totalItems)
    const porEstado = Object.fromEntries(byEstado.map(g => [g.estado, g._count._all]))
    const porCliente = Object.fromEntries(byCliente.filter(g => g.rutCliente).map(g => [g.rutCliente, g._count._all]))
    return {
      items: hydrated.map(({ _count, ...c }) => c),
      total,
      limit: limit || total,
      page,
      stats: {
        porEstado,
        porCliente,
        totalCotizado: totals.totalNeto,
        totalNeto: totals.totalNeto,
        iva: totals.iva,
        totalConIva: totals.totalConIva,
        totalAdjudicado: totals.totalAdjudicado,
      },
    }
  })

  fastify.get('/reportes/export', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'read')],
  }, async (request, reply) => {
    const formato = String(request.query.formato || 'resumen').toLowerCase()
    if (!['resumen', 'detalle'].includes(formato)) return reply.code(400).send({ error: 'formato invalido' })
    const rows = await fastify.prisma.cotizacionLicitacion.findMany({
      where: await buildReportWhere(fastify.prisma, request.query, request.user),
      include: { items: true, _count: { select: { items: true } } },
      orderBy: { fechaCreacion: 'desc' },
    })
    const hydrated = await hydrateReportRows(fastify.prisma, rows)
    const columns = formato === 'detalle'
      ? [
          ...reportSummaryColumns(),
          { key: 'detalleItem', label: 'Detalle' },
          { key: 'cantidadItem', label: 'Cantidad' },
          { key: 'adjudicadaItem', label: 'Adjudicada' },
        ]
      : reportSummaryColumns()
    const exportRows = formato === 'detalle' ? reportDetailRows(hydrated) : hydrated
    const csv = rowsToCsv(exportRows, columns)
    return sendCsv(reply, `licitaciones_${formato}_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  // ── Get by id ─────────────────────────────────────────────────────────────
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const c = await fastify.prisma.cotizacionLicitacion.findFirst({
      where: scopedWhere(request.user, { id }),
      include: { items: true },
    })
    if (!c) return reply.code(404).send({ error: 'Cotización no encontrada' })

    // Attach cliente if rutCliente exists
    let cliente = null
    if (c.rutCliente) {
      cliente = await fastify.prisma.cliente.findUnique({
        where: { rut: c.rutCliente },
        select: {
          id: true,
          nombre: true,
          rut: true,
          email: true,
          telefono: true,
          razonSocial: true,
          giro: true,
          direccion: true,
          region: true,
          comuna: true,
          ciudad: true,
        },
      })
    }

    let items = c.items || []
    const codigos = [...new Set(items.map(i => i.codigoInterno).filter(Boolean))]
    if (codigos.length) {
      const productos = await fastify.prisma.producto.findMany({
        where: { codigoInterno: { in: codigos } },
        select: { codigoInterno: true, fotoUrl: true, fotoUrlGrande: true, fotosGaleria: true },
      })
      const productoByCodigo = Object.fromEntries(productos.map(p => [p.codigoInterno, p]))
      items = items.map(item => {
        const producto = item.codigoInterno ? productoByCodigo[item.codigoInterno] : null
        return {
          ...item,
          fotoUrl: producto?.fotoUrl || null,
          fotoUrlGrande: producto?.fotoUrlGrande || null,
          fotosGaleria: producto?.fotosGaleria || null,
        }
      })
    }

    // Attach orden vinculada + ODTs + despachos + guías (vista 360°)
    let orden = null, odts = [], despachos = [], guias = []
    if (userCan(request.user, 'ventas', 'read')) {
      const ordenWhere = c.ordenId
        ? { id: c.ordenId }
        : {
            eliminada: false,
            licitacion: { equals: c.idLicitacion, mode: 'insensitive' },
            tipo: { contains: 'Licit', mode: 'insensitive' },
          }
      orden = await fastify.prisma.orden.findFirst({
        where: scopedWhere(request.user, ordenWhere),
        include: { items: true, cargos: true },
      })
      if (orden) {
        const [pagos, multas, odtsResult, despachosResult, guiasResult] = await Promise.all([
          fastify.prisma.movimientoCaja.findMany({ where: { ordenId: orden.id, eliminado: false } }),
          fastify.prisma.multa.findMany({ where: { ordenId: orden.id } }),
          fastify.prisma.odt.findMany({ where: { ordenId: orden.id }, orderBy: { createdAt: 'desc' } }),
          fastify.prisma.despacho.findMany({ where: { ordenId: orden.id, eliminado: false }, orderBy: { fechaEntrega: 'desc' } }),
          fastify.prisma.guiaDespacho.findMany({ where: { ordenId: orden.id, eliminado: false }, orderBy: { fechaGuia: 'desc' } }),
        ])
        orden = { ...orden, ...computeVentaFinancialState(orden, { movimientos: pagos, multas }), pagos, multas }
        odts = odtsResult
        despachos = despachosResult
        guias = guiasResult
      }
    }
    return { ...c, items, cliente, orden, odts, despachos, guias }
  })

  // ── Create ────────────────────────────────────────────────────────────────
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'write')],
  }, async (request, reply) => {
    const { idLicitacion, fecha, rutCliente, estado, obs, plazo, ordenCompra, sucursalId, referencia, items = [] } = request.body || {}
    if (!fecha) return reply.code(400).send({ error: 'fecha requerida' })
    if (!Array.isArray(items)) return reply.code(400).send({ error: 'items debe ser un arreglo' })
    const itemData = []
    for (const [idx, item] of items.entries()) {
      const parsedItem = buildCotizacionItemCreateData(item, `item ${idx + 1}`)
      if (parsedItem.error) return reply.code(400).send({ error: parsedItem.error })
      itemData.push(parsedItem.data)
    }
    const usuario = request.user?.nombre || request.user?.email || 'Sistema'
    const userSucursalId = getUserSucursalId(request.user)

    try {
      const c = await fastify.prisma.$transaction(async (tx) => {
        const normalizedId = await validateLicitacionIdForCreate(tx, idLicitacion)
        return tx.cotizacionLicitacion.create({
          data: {
            idLicitacion: normalizedId,
            fecha: new Date(fecha),
            rutCliente,
            estado: estado || 'Pendiente',
            obs,
            plazo,
            ordenCompra,
            sucursalId: userSucursalId ?? (sucursalId ? parseInt(sucursalId, 10) : null),
            referencia,
            usuario,
            items: itemData.length > 0 ? {
              create: itemData,
            } : undefined,
          },
          include: { items: true },
        })
      })
      return reply.code(201).send(c)
    } catch (e) {
      if (e.statusCode) return reply.code(e.statusCode).send({ error: e.message })
      throw e
    }
  })

  // ── Update ────────────────────────────────────────────────────────────────
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const body = request.body || {}
    const data = {}
    if (body.estado !== undefined) data.estado = body.estado
    if (body.rutCliente !== undefined) data.rutCliente = body.rutCliente
    if (body.obs !== undefined) data.obs = body.obs
    if (body.plazo !== undefined) data.plazo = body.plazo
    if (body.ordenCompra !== undefined) data.ordenCompra = body.ordenCompra
    if (body.referencia !== undefined) data.referencia = body.referencia
    if (body.fecha !== undefined) data.fecha = body.fecha ? new Date(body.fecha) : null
    try {
      const current = await fastify.prisma.cotizacionLicitacion.findFirst({
        where: scopedWhere(request.user, { id }),
        select: { id: true },
      })
      if (!current) return reply.code(404).send({ error: 'Cotización no encontrada' })
      const c = await fastify.prisma.cotizacionLicitacion.update({ where: { id }, data })
      return c
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Cotización no encontrada' })
      throw e
    }
  })

  // ── Delete ────────────────────────────────────────────────────────────────
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      await fastify.prisma.$transaction(async (tx) => {
        const sucursalId = getUserSucursalId(request.user)
        const locked = sucursalId
          ? await tx.$queryRaw`SELECT id FROM ventas.cotizacion_licitacion WHERE id = ${id} AND sucursal_id = ${sucursalId} FOR UPDATE`
          : await tx.$queryRaw`SELECT id FROM ventas.cotizacion_licitacion WHERE id = ${id} FOR UPDATE`
        if (!locked.length) throw httpError(404, 'Cotización no encontrada')
        const current = await tx.cotizacionLicitacion.findUnique({
          where: { id },
          select: { id: true, idLicitacion: true, ordenId: true },
        })
        if (!current) throw httpError(404, 'Cotización no encontrada')
        if (current.ordenId) throw httpError(409, 'No se puede eliminar una licitacion con venta vinculada')
        const linkedLegacyVenta = await tx.orden.findFirst({
          where: scopedWhere(request.user, {
            eliminada: false,
            licitacion: { equals: current.idLicitacion, mode: 'insensitive' },
            tipo: { contains: 'Licit', mode: 'insensitive' },
          }),
          select: { id: true },
        })
        if (linkedLegacyVenta) throw httpError(409, 'No se puede eliminar una licitacion con venta vinculada')
        await tx.cotizacionLicitacion.delete({ where: { id } })
      })
      return reply.code(204).send()
    } catch (e) {
      if (e.statusCode) return reply.code(e.statusCode).send({ error: e.message })
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Cotización no encontrada' })
      throw e
    }
  })

  // ── Items (add/remove) ────────────────────────────────────────────────────
  fastify.post('/:id/items', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'write')],
  }, async (request, reply) => {
    const cotizacionId = parseInt(request.params.id, 10)
    if (isNaN(cotizacionId)) return reply.code(400).send({ error: 'ID inválido' })
    const parsedItem = buildCotizacionItemCreateData(request.body || {})
    if (parsedItem.error) return reply.code(400).send({ error: parsedItem.error })
    const cotizacion = await fastify.prisma.cotizacionLicitacion.findFirst({
      where: scopedWhere(request.user, { id: cotizacionId }),
      select: { id: true },
    })
    if (!cotizacion) return reply.code(404).send({ error: 'Cotización no encontrada' })
    const item = await fastify.prisma.cotizacionLicitacionItem.create({
      data: {
        cotizacionId,
        ...parsedItem.data,
      },
    })
    return reply.code(201).send(item)
  })

  fastify.put('/:id/items/:itemId', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'write')],
  }, async (request, reply) => {
    const itemId = parseInt(request.params.itemId, 10)
    if (isNaN(itemId)) return reply.code(400).send({ error: 'ID inválido' })
    const body = request.body || {}
    try {
      const current = await fastify.prisma.cotizacionLicitacionItem.findFirst({
        where: scopedItemWhere(request.user, itemId),
        select: { id: true, codigoInterno: true, nombre: true, descripcion: true, cantidad: true, cantAdjudicados: true, precio: true },
      })
      if (!current) return reply.code(404).send({ error: 'Item no encontrado' })
      const parsedPatch = buildCotizacionItemPatchData(body, current)
      if (parsedPatch.error) return reply.code(400).send({ error: parsedPatch.error })
      const data = parsedPatch.data
      const item = await fastify.prisma.cotizacionLicitacionItem.update({ where: { id: itemId }, data })
      return item
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Item no encontrado' })
      throw e
    }
  })

  fastify.delete('/:id/items/:itemId', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'delete')],
  }, async (request, reply) => {
    const itemId = parseInt(request.params.itemId, 10)
    if (isNaN(itemId)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      const current = await fastify.prisma.cotizacionLicitacionItem.findFirst({
        where: scopedItemWhere(request.user, itemId),
        select: { id: true },
      })
      if (!current) return reply.code(404).send({ error: 'Item no encontrado' })
      await fastify.prisma.cotizacionLicitacionItem.delete({ where: { id: itemId } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Item no encontrado' })
      throw e
    }
  })

  // Crear venta desde licitación adjudicada
  fastify.post('/:id/crear-venta', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'write'), fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM ventas.cotizacion_licitacion
          WHERE id = ${id}
          FOR UPDATE
        `
        const cot = await tx.cotizacionLicitacion.findFirst({
          where: scopedWhere(request.user, { id }),
          include: { items: true },
        })
        if (!cot) throw httpError(404, 'Licitación no encontrada')
        if (cot.ordenId) throw httpError(409, 'La licitacion ya tiene una venta vinculada', { ordenId: cot.ordenId })
        if (String(cot.estado || '').trim() !== 'Adjudicada') {
          throw httpError(409, 'La licitacion debe estar Adjudicada para pasar a venta')
        }
        if (!String(cot.plazo || '').trim()) throw httpError(400, 'Plazo requerido para pasar a venta')
        if (!String(cot.ordenCompra || '').trim()) throw httpError(400, 'Orden de compra requerida para pasar a venta')
        const adjItems = cot.items.filter(i => (i.cantAdjudicados || 0) > 0)
        if (adjItems.length === 0) throw httpError(400, 'No hay items adjudicados')

        let clienteId = null
        if (cot.rutCliente) {
          const cliente = await tx.cliente.findUnique({
            where: { rut: cot.rutCliente },
            select: { id: true, activo: true },
          })
          if (cliente && !cliente.activo) {
            throw httpError(409, 'Cliente inactivo no puede generar ventas')
          }
          clienteId = cliente?.id ?? null
        }
        if (!clienteId) throw httpError(400, 'Cliente canonico requerido para crear venta')

        const codigos = adjItems.map(i => i.codigoInterno).filter(Boolean)
        const productos = await tx.producto.findMany({
          where: { codigoInterno: { in: codigos } },
          select: { id: true, codigoInterno: true, nombre: true, descripcion: true },
        })
        const prodMap = Object.fromEntries(productos.map(p => [p.codigoInterno, p]))

        const ordenItems = []
        const faltantes = []
        for (const it of adjItems) {
          const prod = prodMap[it.codigoInterno]
          if (!prod) { faltantes.push(it.codigoInterno || it.nombre); continue }
          ordenItems.push({
            productoId: prod.id,
            codigoInterno: it.codigoInterno,
            nombre: it.nombre || prod.nombre,
            descripcion: it.descripcion || prod.descripcion,
            cantidad: it.cantAdjudicados,
            precioUnitario: it.precio || 0,
          })
        }
        if (faltantes.length) {
          throw httpError(400, `Productos adjudicados no encontrados en catálogo: ${faltantes.join(', ')}`)
        }
        if (ordenItems.length === 0) {
          throw httpError(400, `Ningún producto encontrado en catálogo (faltan: ${faltantes.join(', ')})`)
        }

        const orden = await tx.orden.create({
          data: {
            tipo: 'Licitación',
            clienteId,
            rutCliente: cot.rutCliente,
            licitacion: cot.idLicitacion,
            observaciones: buildVentaObservacionesFromCotizacion(cot),
            userId: request.user.id,
            creadorNombre: request.user.nombre || request.user.email || 'Sistema',
            sucursalId: cot.sucursalId ?? getUserSucursalId(request.user),
            items: { create: ordenItems },
          },
          include: { items: true },
        })
        const stock = await applyVentaStockDeltas(tx, {
          deltas: isVentaDirectaStockTipo(orden.tipo) ? buildStockDeltasFromItems(ordenItems, 1) : new Map(),
          ordenId: orden.id,
          nInterno: orden.nInterno,
          tipo: orden.tipo,
          userId: request.user.id,
          user: request.user,
          motivo: `Licitacion adjudicada ${orden.nInterno || orden.id}`,
        })
        if (stock.error) throw httpError(stock.status || 400, stock.error)
        await tx.cotizacionLicitacion.update({
          where: { id },
          data: { ordenId: orden.id },
        })
        return { orden, faltantes }
      })
      return reply.code(201).send(result)
    } catch (e) {
      if (e.statusCode) return reply.code(e.statusCode).send({ error: e.message, ...(e.ordenId ? { ordenId: e.ordenId } : {}) })
      throw e
    }
  })

  fastify.post('/:id/actualizar-venta', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'write'), fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM ventas.cotizacion_licitacion
          WHERE id = ${id}
          FOR UPDATE
        `
        const cot = await tx.cotizacionLicitacion.findFirst({
          where: scopedWhere(request.user, { id }),
          include: { items: true },
        })
        if (!cot) throw httpError(404, 'Licitación no encontrada')
        if (!cot.ordenId) throw httpError(404, 'La licitacion no tiene venta vinculada')

        await tx.$queryRaw`
          SELECT id
          FROM ventas.ordenes
          WHERE id = ${cot.ordenId}
          FOR UPDATE
        `
        const orden = await tx.orden.findFirst({
          where: scopedWhere(request.user, { id: cot.ordenId }),
          include: { items: { where: { eliminado: false } }, cargos: true },
        })
        if (!orden) throw httpError(404, 'Venta vinculada no encontrada')
        const activeCajaMovements = await tx.movimientoCaja.count({ where: { ordenId: orden.id, eliminado: false } })
        if (Number(orden.abono || 0) > 0 || orden.estadoPago !== 'No pagada' || activeCajaMovements > 0) {
          throw httpError(409, 'No se puede actualizar una venta con pagos o documentos de caja registrados')
        }
        if (orden.items.some(item => Number(item.nEntregados || 0) > 0)) {
          throw httpError(409, 'No se puede actualizar una venta con entregas registradas')
        }
        const [activeDespachos, activeGuias] = await Promise.all([
          tx.despacho.count({ where: { ordenId: orden.id, eliminado: false } }),
          tx.guiaDespacho.count({ where: { ordenId: orden.id, eliminado: false } }),
        ])
        if (activeDespachos > 0) throw httpError(409, 'No se puede actualizar una venta con despachos registrados')
        if (activeGuias > 0) throw httpError(409, 'No se puede actualizar una venta con guias registradas')
        if (String(cot.estado || '').trim() !== 'Adjudicada') {
          throw httpError(409, 'La licitacion debe estar Adjudicada para actualizar la venta')
        }
        if (!String(cot.plazo || '').trim()) throw httpError(400, 'Plazo requerido para actualizar la venta')
        if (!String(cot.ordenCompra || '').trim()) throw httpError(400, 'Orden de compra requerida para actualizar la venta')

        const adjItems = cot.items.filter(i => (i.cantAdjudicados || 0) > 0)
        if (adjItems.length === 0) throw httpError(400, 'No hay items adjudicados')
        const codigos = adjItems.map(i => i.codigoInterno).filter(Boolean)
        const productos = await tx.producto.findMany({
          where: { codigoInterno: { in: codigos } },
          select: { id: true, codigoInterno: true, nombre: true, descripcion: true },
        })
        const prodMap = Object.fromEntries(productos.map(p => [p.codigoInterno, p]))
        const ordenItems = []
        const faltantes = []
        for (const it of adjItems) {
          const prod = prodMap[it.codigoInterno]
          if (!prod) { faltantes.push(it.codigoInterno || it.nombre); continue }
          ordenItems.push({
            productoId: prod.id,
            codigoInterno: it.codigoInterno,
            nombre: it.nombre || prod.nombre,
            descripcion: it.descripcion || prod.descripcion,
            cantidad: it.cantAdjudicados,
            precioUnitario: it.precio || 0,
          })
        }
        if (faltantes.length) {
          throw httpError(400, `Productos adjudicados no encontrados en catálogo: ${faltantes.join(', ')}`)
        }
        if (ordenItems.length === 0) {
          throw httpError(400, `Ningún producto encontrado en catálogo (faltan: ${faltantes.join(', ')})`)
        }

        const stock = await applyVentaStockDeltas(tx, {
          deltas: buildReplacementStockDeltas(orden.items, ordenItems, orden.tipo, orden.tipo),
          ordenId: orden.id,
          nInterno: orden.nInterno,
          tipo: orden.tipo,
          userId: request.user.id,
          user: request.user,
          motivo: `Actualizacion licitacion ${orden.nInterno || orden.id}`,
        })
        if (stock.error) throw httpError(stock.status || 400, stock.error)

        await tx.ordenItem.deleteMany({ where: { ordenId: orden.id } })
        await tx.ordenItem.createMany({ data: ordenItems.map(item => ({ ...item, ordenId: orden.id })) })
        const updated = await tx.orden.update({
          where: { id: orden.id },
          data: {
            rutCliente: cot.rutCliente,
            licitacion: cot.idLicitacion,
            observaciones: buildVentaObservacionesFromCotizacion(cot),
          },
          include: { items: true },
        })
        return { orden: updated, faltantes }
      })
      return reply.code(200).send(result)
    } catch (e) {
      if (e.statusCode) return reply.code(e.statusCode).send({ error: e.message })
      throw e
    }
  })
}
