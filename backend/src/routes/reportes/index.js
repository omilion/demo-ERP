import { rowsToCsv, sendCsv } from '../../utils/csv.js'
import { can } from '../../middleware/rbac.js'
import { normalizeTipoMovimiento, parseDate, parsePositiveInt } from '../operational-utils.js'
import { buildOrdenScopeWhere, getPrimerRegistroInterno, mergeWhere, parseOrdenScope } from '../historico/corte.js'
import { attachOperarios, attachOrdenes, normalizeOdtFechaField, tipoTallerFilter } from '../odts/operations.js'
import { computeEstado } from '../productos/helpers.js'
import { getUserSucursalId, withMovimientoSucursalScope } from '../caja/scope.js'
import { attachClientes, computeDiscountAmount, computeTotal } from '../ventas/helpers.js'
import { buildCobranzaHistoricoFilters } from '../cobranza/index.js'
import { buildCobranzaHistoricoScopeWhere, mergeCobranzaWhere } from '../cobranza/scope.js'
import { attachConsultaPreciosData } from '../productos/pricing.js'
import { buildProveedorWhere, proveedorOrderBy } from '../proveedores/helpers.js'
import { buildBodegaTallerWhere, enrichBodegaTallerItems, filterStockCriticoItems } from '../bodega-taller/helpers.js'
import { GRAFIAS_CONVENIO_MARCO, GRAFIAS_LICITACION, TIPOS_VENTA_MOSTRADOR, grafiasDeTipoVenta } from '../ventas/estados-normalize.js'
import { registerComisionesReportRoutes } from './comisiones.js'
import { registerMovimientosAnormalesReportRoutes } from './movimientos-anormales.js'
import ExcelJS from 'exceljs'

const VENTA_DIRECTA_TIPOS = TIPOS_VENTA_MOSTRADOR

function buildDateRange(desde, hasta) {
  const gte = desde ? parseDate(desde) : null
  const lte = hasta ? parseDate(hasta, true) : null
  if ((desde && !gte) || (hasta && !lte)) return { error: 'Rango de fechas inválido' }
  return { gte, lte }
}

function previousDateRange(range) {
  if (!range.gte || !range.lte) return null
  const duration = range.lte.getTime() - range.gte.getTime() + 1
  const lte = new Date(range.gte.getTime() - 1)
  return { gte: new Date(lte.getTime() - duration + 1), lte }
}

function percentageChange(current, previous) {
  if (!previous) return null
  return (Number(current || 0) - Number(previous || 0)) / Math.abs(Number(previous))
}

function applyRange(where, field, range) {
  if (!range.gte && !range.lte) return where
  where[field] = {}
  if (range.gte) where[field].gte = range.gte
  if (range.lte) where[field].lte = range.lte
  return where
}

function periodKey(date, periodo = 'mes') {
  if (!date) return 'sin-fecha'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return 'sin-fecha'
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return periodo === 'dia' ? `${year}-${month}-${day}` : `${year}-${month}`
}

function addMetric(bucket, key, amount, count = 1) {
  const normalized = key || 'sin-dato'
  if (!bucket[normalized]) bucket[normalized] = { count: 0, total: 0 }
  bucket[normalized].count += count
  bucket[normalized].total += Number(amount || 0)
}

function totalOrden(orden) {
  return computeTotal(orden.items || [], orden.descuentoPct, orden.cargos || [], orden.descuentoMonto)
}

function totalLicitacion(licitacion) {
  const subtotal = (licitacion.items || []).reduce((s, i) => {
    const qty = i.cantAdjudicados || i.cantidad || 0
    return s + qty * (i.precio || 0)
  }, 0)
  return subtotal - computeDiscountAmount(subtotal, licitacion.descuentoPct)
}

function classifyLicitacion(licitacion) {
  const estado = String(licitacion.estado || '').toLowerCase()
  if (estado.includes('perd') || estado.includes('rechaz') || estado.includes('no adjudic')) return 'perdida'
  if (estado.includes('gan') || estado.includes('adjudic') || licitacion.ordenId || (licitacion.items || []).some(i => (i.cantAdjudicados || 0) > 0)) return 'ganada'
  return 'pendiente'
}

function requireRead(...modules) {
  return async (request, reply) => {
    const allowed = modules.every(module => can(request.user?.role, module, 'read', request.user?.permisosExtra))
    if (!allowed) return reply.status(403).send({ error: 'Forbidden' })
  }
}

function canReadModule(user, module) {
  return can(user?.role, module, 'read', user?.permisosExtra)
}

function canReadAll(user, modules = []) {
  return modules.every(module => canReadModule(user, module))
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function matchesNormalizedContains(value, search) {
  return normalizeSearchText(value).includes(normalizeSearchText(search))
}

function matchesProveedorLegacy(producto, proveedor) {
  if (!proveedor) return true
  if (producto.proveedorId === proveedor.id) return true
  const legacyValues = [
    proveedor.codigoProveedor != null ? String(proveedor.codigoProveedor) : '',
    proveedor.nombre,
    proveedor.razonSocial,
  ].filter(Boolean)
  return legacyValues.some(value => matchesNormalizedContains(producto.proveedor, value))
}

async function buildProductosExportWhere(fastify, query = {}) {
  const { bodega, search, codigoBarra, codigoInterno, nombre, visibleWeb, destacadoWeb, categoria, categoriaId, subcategoriaId, subcategoria, proveedor, proveedorId, idMarco, ubicacion, ubicacionId, estadoInventario, estado } = query
  const where = { activo: true }
  const andFilters = []
  if (bodega && !['Inventario', 'Taller'].includes(bodega)) return { error: 'bodega debe ser Inventario o Taller' }
  if (bodega) where.bodega = bodega
  if (visibleWeb === 'true') where.visibleWeb = true
  else if (visibleWeb === 'false') where.visibleWeb = false
  if (destacadoWeb === 'true') where.destacadoWeb = true
  if (categoriaId) {
    const parsedCategoriaId = Number.parseInt(categoriaId, 10)
    if (Number.isNaN(parsedCategoriaId)) return { error: 'categoriaId inválido' }
    const selectedCategoria = await fastify.prisma.categoria.findFirst({
      where: { id: parsedCategoriaId, activo: true },
      select: { nombre: true },
    })
    if (selectedCategoria?.nombre) {
      andFilters.push({
        OR: [
          { categoriaId: parsedCategoriaId },
          { categoria: { contains: selectedCategoria.nombre, mode: 'insensitive' } },
        ],
      })
    } else {
      where.categoriaId = parsedCategoriaId
    }
  } else if (categoria) where.categoria = { contains: categoria, mode: 'insensitive' }
  if (subcategoriaId) {
    const parsedSubcategoriaId = Number.parseInt(subcategoriaId, 10)
    if (Number.isNaN(parsedSubcategoriaId)) return { error: 'subcategoriaId inválido' }
    where.subcategoriaId = parsedSubcategoriaId
  }
  else if (subcategoria) where.subcategoria = { is: { nombre: { contains: subcategoria, mode: 'insensitive' } } }
  if (proveedorId) {
    const parsedProveedorId = Number.parseInt(proveedorId, 10)
    if (Number.isNaN(parsedProveedorId)) return { error: 'proveedorId inválido' }
    where.proveedorId = parsedProveedorId
  } else if (proveedor) where.proveedor = { contains: proveedor, mode: 'insensitive' }
  if (idMarco) where.idMarco = { contains: idMarco, mode: 'insensitive' }
  if (ubicacionId) {
    const parsedUbicacionId = Number.parseInt(ubicacionId, 10)
    if (Number.isNaN(parsedUbicacionId)) return { error: 'ubicacionId invÃ¡lido' }
    const selectedUbicacion = await fastify.prisma.ubicacion.findFirst({
      where: { id: parsedUbicacionId, activo: true },
      select: { nombre: true },
    })
    if (selectedUbicacion?.nombre) {
      andFilters.push({
        OR: [
          { ubicacionId: parsedUbicacionId },
          { ubicacion: { contains: selectedUbicacion.nombre, mode: 'insensitive' } },
        ],
      })
    } else {
      where.ubicacionId = parsedUbicacionId
    }
  } else if (ubicacion) where.ubicacion = { contains: ubicacion, mode: 'insensitive' }
  if (estadoInventario) where.estadoInventario = estadoInventario
  if (codigoBarra) where.codigoBarra = { equals: codigoBarra, mode: 'insensitive' }
  if (codigoInterno) where.codigoInterno = { contains: codigoInterno, mode: 'insensitive' }
  if (estado === 'sin-stock') where.stock = 0
  else if (estado === 'critico') {
    where.stock = { gt: 0 }
    where.stockCritico = { gt: 0 }
  }
  if (search) andFilters.push({
    OR: [
      { nombre: { contains: search, mode: 'insensitive' } },
      { codigoInterno: { contains: search, mode: 'insensitive' } },
      { codigoBarra: { contains: search, mode: 'insensitive' } },
      { idMarco: { contains: search, mode: 'insensitive' } },
      { proveedor: { contains: search, mode: 'insensitive' } },
      { categoria: { contains: search, mode: 'insensitive' } },
      { subcategoria: { is: { nombre: { contains: search, mode: 'insensitive' } } } },
    ],
  })
  if (andFilters.length) where.AND = andFilters
  return { where }
}

async function buildProductosExport(fastify, query = {}) {
  const built = await buildProductosExportWhere(fastify, query)
  if (built.error) return built
  const { where } = built
  const productos = await fastify.prisma.producto.findMany({
    where,
    include: { subcategoria: true },
    orderBy: [{ codigoInterno: 'asc' }],
  })
  return productos
    .map(p => ({ ...p, estado: computeEstado(p), subcategoriaNombre: p.subcategoria?.nombre || '' }))
    .filter(p => query.estado === 'critico' ? p.estado === 'Crítico' : true)
    .map(p => ({
      ...p,
      visibleWebTexto: p.visibleWeb ? 'Si' : 'No',
      precioVenta: p.precioWeb ?? p.precioLista,
    }))
}

async function buildPreciosExport(fastify, query = {}) {
  const providerFilterId = query.proveedorId ? Number.parseInt(query.proveedorId, 10) : null
  if (query.proveedorId && Number.isNaN(providerFilterId)) return { error: 'proveedorId inválido' }
  const whereQuery = { ...query }
  delete whereQuery.proveedorId
  const built = await buildProductosExportWhere(fastify, whereQuery)
  if (built.error) return built
  const { where } = built
  const proveedorFilter = providerFilterId
    ? await fastify.prisma.proveedor.findFirst({
        where: { id: providerFilterId, activo: true },
        select: { id: true, codigoProveedor: true, nombre: true, razonSocial: true },
      })
    : null
  const productos = await fastify.prisma.producto.findMany({
    where,
    include: { subcategoria: true },
    orderBy: [{ codigoInterno: 'asc' }],
  })
  const productosConPrecios = await attachConsultaPreciosData(
    fastify.prisma,
    productos.map(p => ({ ...p, estado: computeEstado(p), subcategoriaNombre: p.subcategoria?.nombre || '' })),
  )
  return productosConPrecios
    .filter(p => query.estado === 'critico' ? p.estado === 'Crítico' : true)
    .filter(p => query.nombre ? matchesNormalizedContains(p.nombre, query.nombre) : true)
    .filter(p => providerFilterId ? matchesProveedorLegacy(p, proveedorFilter || { id: providerFilterId }) : true)
    .map(p => {
      const c = p.consultaPrecios || {}
      return {
        ...p,
        visibleWebTexto: p.visibleWeb ? 'Si' : 'No',
        categoriaExport: c.categoriaNombre || p.categoria || '',
        subcategoriaNombre: c.subcategoriaNombre || p.subcategoriaNombre || '',
        proveedorExport: c.proveedorNombre || p.proveedor || '',
        precioVentaSalaIva: c.precioNormalSalaVentaIva ?? 0,
        precioConDescuento: c.precioConDescuento ?? 0,
        precioConvenioMarco: c.precioConvMarco ?? p.precioMarco ?? 0,
        precioLicitacion: c.precioLicitacion ?? 0,
      }
    })
}

export function buildClientesExportWhere(query = {}) {
  const { search, tipo, region, ciudad, email, segmento, estado, activo } = query
  const where = {}
  if (estado === 'inactivo') where.activo = false
  else if (estado === 'todos') {}
  else if (activo !== undefined) where.activo = activo === 'true'
  else where.activo = true
  if (tipo) where.tipo = tipo
  if (region) where.region = { contains: region, mode: 'insensitive' }
  if (ciudad) where.ciudad = { contains: ciudad, mode: 'insensitive' }
  if (email) where.email = { contains: email, mode: 'insensitive' }
  if (segmento) where.segmento = segmento
  if (search) where.OR = [
    { nombre: { contains: search, mode: 'insensitive' } },
    { razonSocial: { contains: search, mode: 'insensitive' } },
    { rut: { contains: search } },
    { email: { contains: search, mode: 'insensitive' } },
    { telefono: { contains: search, mode: 'insensitive' } },
    { direccion: { contains: search, mode: 'insensitive' } },
    { region: { contains: search, mode: 'insensitive' } },
    { comuna: { contains: search, mode: 'insensitive' } },
    { ciudad: { contains: search, mode: 'insensitive' } },
  ]
  return where
}

async function buildClientesExport(fastify, query) {
  const { conDeuda } = query
  const where = buildClientesExportWhere(query)

  const [clientes, saldos] = await Promise.all([
    fastify.prisma.cliente.findMany({ where, orderBy: { nombre: 'asc' } }),
    fastify.prisma.$queryRaw`
      SELECT o.cliente_id,
        COALESCE(SUM(
          COALESCE(t.subtotal, 0) + COALESCE(c.cargos, 0) - ROUND((COALESCE(t.subtotal, 0) + COALESCE(c.cargos, 0)) * COALESCE(o.descuento_pct, 0) / 100.0) - o.abono
        ), 0)::float AS saldo
      FROM ventas.ordenes o
      LEFT JOIN (
        SELECT orden_id, SUM(cantidad * precio_unitario) AS subtotal
        FROM ventas.orden_items
        GROUP BY orden_id
      ) t ON t.orden_id = o.id
      LEFT JOIN (
        SELECT orden_id, SUM(valor) AS cargos
        FROM ventas.orden_cargos
        GROUP BY orden_id
      ) c ON c.orden_id = o.id
      WHERE o.estado_pago != 'Pagada' AND o.cliente_id IS NOT NULL
      GROUP BY o.cliente_id
    `,
  ])
  const saldoMap = {}
  for (const row of saldos) saldoMap[Number(row.cliente_id)] = Number(row.saldo)
  const rows = clientes.map(c => ({ ...c, saldo: saldoMap[c.id] ?? 0 }))
  return conDeuda === 'true' ? rows.filter(c => c.saldo > 0) : rows
}

async function buildCajaExportWhere(fastify, query, reply, user = null) {
  const { desde, hasta, year, medioPago, search, tipo, nInterno, ordenId, nDoc, turnoId, tipoVenta, estado = 'activos' } = query
  const where = {}
  if (estado === 'anulados') where.eliminado = true
  else if (estado === 'todos') {}
  else where.eliminado = false
  if (turnoId) {
    const parsedTurnoId = parsePositiveInt(turnoId)
    if (!parsedTurnoId) return { error: reply.code(400).send({ error: 'turnoId invalido' }) }
    where.turnoId = parsedTurnoId
  }
  if (year) {
    const y = parsePositiveInt(year)
    if (!y || y < 2000 || y > 2100) return { error: reply.code(400).send({ error: 'year invalido' }) }
    where.fecha = { gte: new Date(`${y}-01-01`), lt: new Date(`${y + 1}-01-01`) }
  }
  if (desde || hasta) {
    const range = buildDateRange(desde, hasta)
    if (range.error) return { error: reply.code(400).send({ error: range.error }) }
    applyRange(where, 'fecha', range)
  }
  if (medioPago) where.medioPago = { contains: medioPago, mode: 'insensitive' }
  if (tipo) {
    const tipoNormalizado = normalizeTipoMovimiento(tipo)
    if (!tipoNormalizado) return { error: reply.code(400).send({ error: 'tipo invalido' }) }
    where.tipo = tipoNormalizado
  }
  if (ordenId) {
    const parsedOrdenId = parsePositiveInt(ordenId)
    if (!parsedOrdenId) return { error: reply.code(400).send({ error: 'ordenId invalido' }) }
    where.ordenId = parsedOrdenId
  }
  if (nDoc) where.nDoc = { contains: nDoc, mode: 'insensitive' }
  if (nInterno || tipoVenta) {
    const parsedNInterno = parsePositiveInt(nInterno)
    if (nInterno && !parsedNInterno) return { error: reply.code(400).send({ error: 'nInterno invalido' }) }
    const ordenes = await fastify.prisma.orden.findMany({
      where: {
        ...(nInterno ? { nInterno: parsedNInterno } : {}),
        ...(tipoVenta ? { tipo: { contains: tipoVenta, mode: 'insensitive' } } : {}),
      },
      select: { id: true },
    })
    const ids = ordenes.map(o => o.id)
    if (ids.length === 0) return { where: { id: -1 } }
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
  return { where: withMovimientoSucursalScope(user, where) }
}

function addWhereAnd(where, clause) {
  where.AND = [...(where.AND || []), clause]
}

async function findOrdenIdsByNInterno(prisma, nInterno) {
  const ordenes = await prisma.orden.findMany({
    where: { nInterno },
    select: { id: true },
    take: 500,
  })
  return ordenes.map(o => o.id)
}

export async function buildOdtExportWhere(fastify, query = {}, user = null) {
  const { tipo, estado, operarioId, search, nInterno, fechaDesde, fechaHasta, fechaCampo, includeEliminados } = query
  const where = {}
  const sucursalId = getUserSucursalId(user)
  if (sucursalId) addWhereAnd(where, { OR: [{ sucursalId }, { sucursalId: null }] })
  if (includeEliminados !== 'true') where.eliminado = false
  if (tipo) addWhereAnd(where, tipoTallerFilter(tipo))
  if (estado) where.estado = estado
  if (operarioId) {
    const parsedOperarioId = parsePositiveInt(operarioId)
    if (!parsedOperarioId) return { error: 'Operario invalido' }
    where.operarioId = parsedOperarioId
  }
  const dateField = normalizeOdtFechaField(fechaCampo)
  if (!dateField) return { error: 'Campo de fecha invalido' }
  const range = buildDateRange(fechaDesde, fechaHasta)
  if (range.error) return { error: range.error }
  applyRange(where, dateField, range)
  if (nInterno) {
    const parsedNInterno = parsePositiveInt(nInterno)
    if (!parsedNInterno) return { error: 'nInterno invalido' }
    const ordenIds = await findOrdenIdsByNInterno(fastify.prisma, parsedNInterno)
    addWhereAnd(where, {
      OR: [
        { ordenId: parsedNInterno },
        ...(ordenIds.length ? [{ ordenId: { in: ordenIds } }] : []),
      ],
    })
  }
  if (search) {
    const isNum = /^\d+$/.test(search.trim())
    const numeric = isNum ? parsePositiveInt(search) : null
    const ordenIds = numeric ? await findOrdenIdsByNInterno(fastify.prisma, numeric) : []
    addWhereAnd(where, {
      OR: [
        { clienteNombre: { contains: search, mode: 'insensitive' } },
        { descripcion: { contains: search, mode: 'insensitive' } },
        ...(numeric ? [{ id: numeric }, { ordenId: numeric }] : []),
        ...(ordenIds.length ? [{ ordenId: { in: ordenIds } }] : []),
      ],
    })
  }
  return { where }
}

export async function buildVentasExportWhere(fastify, query = {}) {
  const {
    desde,
    hasta,
    fechaDesde,
    fechaHasta,
    fechaDocDesde,
    fechaDocHasta,
    tipo,
    rut,
    nInterno,
    oc,
    guia,
    odt,
    estadoPago,
    estadoEntrega,
    search,
    scope: scopeParam,
    documento,
    nDoc,
    creador,
  } = query
  const scope = parseOrdenScope(scopeParam, 'operacional')
  if (!scope) return { error: 'scope invalido' }
  let where = { eliminada: false }
  if (desde || hasta || fechaDesde || fechaHasta) {
    const range = buildDateRange(fechaDesde || desde, fechaHasta || hasta)
    if (range.error) return { error: range.error }
    applyRange(where, 'createdAt', range)
  }
  // Se nombran todas las grafias: filtrar por una sola dejaba fuera en silencio
  // las ordenes escritas con la otra (2.648 licitaciones sin tilde, entre otras).
  if (tipo === 'venta-sala' || tipo === 'venta-directa') where.tipo = { in: VENTA_DIRECTA_TIPOS }
  else if (tipo === 'convenio-marco') where.tipo = { in: [...GRAFIAS_CONVENIO_MARCO] }
  else if (tipo === 'licitacion-convenio') where.tipo = { in: [...GRAFIAS_LICITACION, ...GRAFIAS_CONVENIO_MARCO] }
  else if (tipo) {
    // Se resuelve contra el catalogo en vez de pasar el slug crudo: asi un
    // tipo nuevo trae filtro que funciona, con todas sus grafias. Un valor
    // desconocido se filtra tal cual, que devuelve vacio; ignorarlo
    // devolveria todas las ventas, que es peor.
    const grafias = grafiasDeTipoVenta(tipo)
    where.tipo = grafias.length ? { in: grafias } : tipo
  }
  if (rut) where.rutCliente = { contains: rut, mode: 'insensitive' }
  if (nInterno) {
    const parsedNInterno = parsePositiveInt(nInterno)
    if (!parsedNInterno) return { error: 'nInterno invalido' }
    where.nInterno = parsedNInterno
  }
  if (oc) where.licitacion = { contains: oc, mode: 'insensitive' }
  if (guia) {
    const parsedGuia = parsePositiveInt(guia)
    if (!parsedGuia) return { error: 'guia invalida' }
    if (!fastify.prisma.guiaDespacho?.findMany) {
      where.guias = parsedGuia
    } else {
      const guias = await fastify.prisma.guiaDespacho.findMany({
        where: { eliminado: false, nGuia: { contains: guia, mode: 'insensitive' } },
        select: { ordenId: true, nInterno: true },
      })
      const ordenIds = [...new Set(guias.map(g => g.ordenId).filter(Boolean))]
      const internos = [...new Set(guias.map(g => g.nInterno).filter(Boolean))]
      const conditions = []
      if (ordenIds.length) conditions.push({ id: { in: ordenIds } })
      if (internos.length) conditions.push({ nInterno: { in: internos } })
      conditions.push({ guias: parsedGuia })
      where = mergeWhere(where, { OR: conditions })
    }
  }
  if (estadoPago) where.estadoPago = estadoPago
  if (estadoEntrega) where.estadoEntrega = estadoEntrega
  if (creador) where.creadorNombre = { contains: creador, mode: 'insensitive' }
  if (documento || nDoc || fechaDocDesde || fechaDocHasta) {
    if (!fastify.prisma.movimientoCaja?.findMany) return { error: 'Filtro de documentos no disponible' }
    const docWhere = { eliminado: false, ordenId: { not: null } }
    if (documento) docWhere.documento = { contains: documento, mode: 'insensitive' }
    if (nDoc) docWhere.nDoc = { contains: nDoc, mode: 'insensitive' }
    if (fechaDocDesde || fechaDocHasta) {
      const range = buildDateRange(fechaDocDesde, fechaDocHasta)
      if (range.error) return { error: 'Rango de fechas de documento invalido' }
      applyRange(docWhere, 'fecha', range)
    }
    const documentos = await fastify.prisma.movimientoCaja.findMany({
      where: docWhere,
      select: { ordenId: true },
      take: 5000,
    })
    const ids = [...new Set(documentos.map(d => d.ordenId).filter(Boolean))]
    where = mergeWhere(where, { id: ids.length ? { in: ids } : -1 })
  }
  if (odt) {
    const parsedOdt = parsePositiveInt(odt)
    if (!parsedOdt) return { error: 'odt invalida' }
    const odts = await fastify.prisma.odt.findMany({ where: { id: parsedOdt }, select: { ordenId: true } })
    const ids = odts.map(o => o.ordenId).filter(Boolean)
    where.id = ids.length ? { in: ids } : -1
  }
  if (search) {
    const text = search.trim()
    const isNum = /^\d+$/.test(text)
    const [clientes, documentos] = await Promise.all([
      fastify.prisma.cliente.findMany({
        where: {
          OR: [
            { nombre: { contains: text, mode: 'insensitive' } },
            { razonSocial: { contains: text, mode: 'insensitive' } },
            { rut: { contains: text, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 100,
      }),
      fastify.prisma.movimientoCaja.findMany({
        where: {
          eliminado: false,
          OR: [
            { documento: { contains: text, mode: 'insensitive' } },
            { nDoc: { contains: text, mode: 'insensitive' } },
          ],
        },
        select: { ordenId: true },
        take: 500,
      }),
    ])
    const clienteIds = clientes.map(c => c.id)
    const ordenIds = [...new Set(documentos.map(d => d.ordenId).filter(Boolean))]
    where.OR = [
      { creadorNombre: { contains: search, mode: 'insensitive' } },
      { rutCliente: { contains: search, mode: 'insensitive' } },
      { emailCliente: { contains: search, mode: 'insensitive' } },
      { observaciones: { contains: search, mode: 'insensitive' } },
      ...(clienteIds.length ? [{ clienteId: { in: clienteIds } }] : []),
      ...(ordenIds.length ? [{ id: { in: ordenIds } }] : []),
      ...(isNum ? [{ nInterno: parseInt(search, 10) }, { id: parseInt(search, 10) }] : []),
    ]
  }
  const corte = await getPrimerRegistroInterno(fastify.prisma)
  where = mergeWhere(where, buildOrdenScopeWhere(scope, corte))
  return { where }
}

async function buildVentasGerenciales(fastify, query, user, { includeComparison = true } = {}) {
  const { desde, hasta, rut, cliente, vendedor, tipo, periodo = 'mes' } = query
  const range = buildDateRange(desde, hasta)
  if (range.error) return { error: range.error }
  const corte = await getPrimerRegistroInterno(fastify.prisma)
  const tipoText = String(tipo || '').toLowerCase()
  const sucursalId = getUserSucursalId(user)
  const ordenWhere = mergeWhere(applyRange({ eliminada: false, ...(sucursalId ? { sucursalId } : {}) }, 'createdAt', range), buildOrdenScopeWhere('operacional', corte))
  if (rut || cliente) ordenWhere.rutCliente = { contains: rut || cliente, mode: 'insensitive' }
  if (vendedor) ordenWhere.creadorNombre = { contains: vendedor, mode: 'insensitive' }
  if (tipoText === 'venta-sala' || tipoText === 'venta-directa') ordenWhere.tipo = { in: VENTA_DIRECTA_TIPOS }
  else if (tipoText === 'convenio-marco' || tipoText === 'convenio') ordenWhere.tipo = { in: [...GRAFIAS_CONVENIO_MARCO] }
  else if (tipo) ordenWhere.tipo = { contains: tipo.replace(/-/g, ' '), mode: 'insensitive' }

  const ocWhere = applyRange({}, 'fechaHora', range)
  if (sucursalId) ocWhere.sucursalId = sucursalId
  if (vendedor) ocWhere.codigoVendedor = { contains: vendedor, mode: 'insensitive' }
  if (cliente) ocWhere.emailComprador = { contains: cliente, mode: 'insensitive' }

  const licWhere = applyRange({}, 'fecha', range)
  if (sucursalId) licWhere.sucursalId = sucursalId
  if (rut || cliente) licWhere.rutCliente = { contains: rut || cliente, mode: 'insensitive' }
  if (vendedor) licWhere.usuario = { contains: vendedor, mode: 'insensitive' }

  const includeOrdenes = !tipo || ['venta', 'normal', 'sala', 'directa', 'convenio'].some(t => tipoText.includes(t))
  const includeOc = !tipo || tipoText.includes('web')
  const includeLic = !tipo || tipoText.includes('licit')

  const [ordenes, ocs, licitaciones] = await Promise.all([
    includeOrdenes ? fastify.prisma.orden.findMany({ where: ordenWhere, include: { items: true, cargos: true } }) : [],
    includeOc ? fastify.prisma.ordenCompraOnline.findMany({ where: ocWhere }) : [],
    includeLic ? fastify.prisma.cotizacionLicitacion.findMany({ where: licWhere, include: { items: true } }) : [],
  ])

  const byPeriodo = {}
  const byCliente = {}
  const byVendedor = {}
  const byTipo = {}
  let total = 0
  let count = 0
  const push = ({ fecha, cliente: rowCliente, vendedor: rowVendedor, tipo: rowTipo, monto }) => {
    total += monto
    count += 1
    addMetric(byPeriodo, periodKey(fecha, periodo), monto)
    addMetric(byCliente, rowCliente, monto)
    addMetric(byVendedor, rowVendedor, monto)
    addMetric(byTipo, rowTipo, monto)
  }

  for (const o of ordenes) push({ fecha: o.createdAt, cliente: o.rutCliente, vendedor: o.creadorNombre, tipo: o.tipo, monto: totalOrden(o) })
  for (const o of ocs) push({ fecha: o.fechaHora, cliente: o.emailComprador, vendedor: o.codigoVendedor, tipo: 'Venta Web', monto: o.total || 0 })
  for (const l of licitaciones) push({ fecha: l.fecha, cliente: l.rutCliente, vendedor: l.usuario, tipo: 'Licitacion', monto: totalLicitacion(l) })

  const result = {
    filtros: { desde: desde || null, hasta: hasta || null, periodo },
    total,
    count,
    fuentes: {
      ordenes: { count: ordenes.length, total: ordenes.reduce((s, o) => s + totalOrden(o), 0) },
      ocOnline: { count: ocs.length, total: ocs.reduce((s, o) => s + (o.total || 0), 0) },
      licitaciones: { count: licitaciones.length, total: licitaciones.reduce((s, l) => s + totalLicitacion(l), 0) },
    },
    byPeriodo,
    byCliente,
    byVendedor,
    byTipo,
  }
  const previousRange = includeComparison ? previousDateRange(range) : null
  if (previousRange) {
    const previous = await buildVentasGerenciales(fastify, {
      ...query,
      desde: previousRange.gte.toISOString().slice(0, 10),
      hasta: previousRange.lte.toISOString().slice(0, 10),
    }, user, { includeComparison: false })
    result.comparativo = {
      periodoAnterior: {
        desde: previousRange.gte,
        hasta: previousRange.lte,
        total: previous.total,
        count: previous.count,
      },
      variacionVentas: percentageChange(total, previous.total),
      variacionOperaciones: percentageChange(count, previous.count),
    }
  }
  return result
}

async function buildCobranzaCajaGerencial(fastify, query = {}, user = null) {
  const range = buildDateRange(query.desde, query.hasta)
  if (range.error) return { error: range.error }
  const cobranzaWhere = mergeCobranzaWhere(
    applyRange({}, 'fechaFactura', range),
    await buildCobranzaHistoricoScopeWhere(fastify.prisma, user),
  )
  const cajaWhere = withMovimientoSucursalScope(
    user,
    applyRange({
      eliminado: false,
      NOT: { medioPago: { equals: 'Referencial', mode: 'insensitive' } },
    }, 'fecha', range),
  )
  const [cobranza, caja] = await Promise.all([
    fastify.prisma.cobranzaHistorico.findMany({ where: cobranzaWhere }),
    fastify.prisma.movimientoCaja.findMany({ where: cajaWhere }),
  ])
  const byEstado = {}
  const antiguedad = {
    '0-30': { count: 0, total: 0 },
    '31-60': { count: 0, total: 0 },
    '61-90': { count: 0, total: 0 },
    '91+': { count: 0, total: 0 },
  }
  const fechaCorte = range.lte || new Date()
  let porCobrar = 0
  let cobrado = 0
  for (const c of cobranza) {
    const estado = String(c.estado || 'sin-dato').toUpperCase()
    const valor = Number(c.valorFactura || 0)
    const monto = Number(c.monto || 0)
    if (!byEstado[estado]) byEstado[estado] = { count: 0, valorFactura: 0, monto: 0 }
    byEstado[estado].count += 1
    byEstado[estado].valorFactura += valor
    byEstado[estado].monto += monto
    if (estado === 'PENDIENTE') porCobrar += valor
    if (estado === 'CANCELADA') cobrado += monto
    if (estado === 'PENDIENTE' && c.fechaFactura) {
      const days = Math.max(0, Math.floor((fechaCorte.getTime() - new Date(c.fechaFactura).getTime()) / 86_400_000))
      const bucket = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '91+'
      antiguedad[bucket].count += 1
      antiguedad[bucket].total += valor
    }
  }
  const cajaStats = caja.reduce((acc, m) => {
    const monto = Number(m.monto || 0)
    if (String(m.tipo).toLowerCase() === 'ingreso') acc.ingresos += monto
    if (String(m.tipo).toLowerCase() === 'egreso') acc.egresos += Math.abs(monto)
    addMetric(acc.byMedioPago, m.medioPago, monto)
    return acc
  }, { ingresos: 0, egresos: 0, byMedioPago: {} })
  return { cuentasPorCobrar: { porCobrar, cobrado, count: cobranza.length, byEstado, antiguedad }, caja: { ...cajaStats, count: caja.length } }
}

async function buildStockGerencial(fastify, query = {}) {
  const range = buildDateRange(query.desde, query.hasta)
  if (range.error) return { error: range.error }
  const [critico, movProductos, movMateriales, movTelas] = await Promise.all([
    Promise.all([
      fastify.prisma.producto.findMany({ where: { activo: true, stockCritico: { gt: 0 } }, select: { id: true, codigoInterno: true, nombre: true, stock: true, stockCritico: true } }),
      fastify.prisma.bodegaTaller.findMany({ where: { activo: true, stockCritico: { gt: 0 } }, select: { id: true, codigoInterno: true, nombre: true, stock: true, stockCritico: true } }),
    ]),
    fastify.prisma.movimientoBodega.findMany({ where: applyRange({}, 'createdAt', range) }),
    fastify.prisma.bodegaTallerMovimiento.findMany({ where: applyRange({}, 'createdAt', range) }),
    fastify.prisma.telaMovimiento.findMany({ where: applyRange({}, 'fecha', range) }),
  ])
  const [productos, materiales] = critico
  const productosCriticos = productos.filter(p => (p.stock || 0) <= (p.stockCritico || 0))
  const materialesCriticos = materiales.filter(m => (m.stock || 0) <= (m.stockCritico || 0))
  const movimientos = { productos: {}, materiales: {}, telas: {}, total: movProductos.length + movMateriales.length + movTelas.length }
  for (const m of movProductos) addMetric(movimientos.productos, m.tipo, m.cantidad, 1)
  for (const m of movMateriales) addMetric(movimientos.materiales, m.tipo, m.cantidad, 1)
  for (const m of movTelas) addMetric(movimientos.telas, m.tipo, m.cantidad, 1)
  return {
    stockCritico: {
      productos: productosCriticos,
      materiales: materialesCriticos,
      totales: { productosCriticos: productosCriticos.length, materialesCriticos: materialesCriticos.length },
    },
    movimientos,
  }
}

async function buildLicitacionesGerencial(fastify, query = {}, user = null) {
  const range = buildDateRange(query.desde, query.hasta)
  if (range.error) return { error: range.error }
  const where = applyRange({}, 'fecha', range)
  const sucursalId = user?.role === 'admin' ? null : getUserSucursalId(user)
  if (sucursalId) where.sucursalId = sucursalId
  const licitaciones = await fastify.prisma.cotizacionLicitacion.findMany({ where, include: { items: true } })
  const byResultado = { ganada: { count: 0, total: 0 }, perdida: { count: 0, total: 0 }, pendiente: { count: 0, total: 0 } }
  for (const l of licitaciones) addMetric(byResultado, classifyLicitacion(l), totalLicitacion(l))
  return { count: licitaciones.length, byResultado }
}

async function buildOperacionesGerencial(fastify, query = {}) {
  const range = buildDateRange(query.desde, query.hasta)
  if (range.error) return { error: range.error }
  const now = new Date()
  const [odts, despachos, guias] = await Promise.all([
    fastify.prisma.odt.findMany({ where: { eliminado: false, ...(range.lte ? { createdAt: { lte: range.lte } } : {}) } }),
    fastify.prisma.despacho.findMany({ where: { eliminado: false, ...(range.lte ? { OR: [{ fechaEntrega: null }, { fechaEntrega: { lte: range.lte } }] } : {}) } }),
    fastify.prisma.guiaDespacho.findMany({ where: { eliminado: false }, select: { ordenId: true, odtId: true, origenTipo: true, origenId: true } }),
  ])
  const odtsPendientes = odts.filter(o => String(o.estado || '').toLowerCase() !== 'terminada')
  const guiasKeys = new Set(guias.flatMap(g => [
    g.ordenId ? `orden:${g.ordenId}` : null,
    g.odtId ? `odt:${g.odtId}` : null,
    g.origenTipo && g.origenId ? `${g.origenTipo}:${g.origenId}` : null,
  ].filter(Boolean)))
  const despachosPendientes = despachos.filter(d => {
    const keys = [
      d.ordenId ? `orden:${d.ordenId}` : null,
      d.odtId ? `odt:${d.odtId}` : null,
      d.origenTipo && d.origenId ? `${d.origenTipo}:${d.origenId}` : null,
    ].filter(Boolean)
    return keys.length === 0 || keys.every(k => !guiasKeys.has(k))
  })
  const byEstadoOdt = {}
  for (const o of odtsPendientes) addMetric(byEstadoOdt, o.estado, 0, 1)
  const odtsVencidas = odtsPendientes.filter(o => o.fechaEntregaCompromiso && new Date(o.fechaEntregaCompromiso) < now)
  const odtsEnRiesgo = odtsPendientes.filter(o => {
    if (!o.fechaEntregaCompromiso) return false
    const days = (new Date(o.fechaEntregaCompromiso).getTime() - now.getTime()) / 86_400_000
    return days >= 0 && days <= 7
  })
  return {
    taller: { pendientes: odtsPendientes.length, vencidas: odtsVencidas.length, enRiesgo: odtsEnRiesgo.length, byEstado: byEstadoOdt },
    despachos: {
      pendientes: despachosPendientes.length,
      vencidos: despachosPendientes.filter(d => d.fechaEntrega && new Date(d.fechaEntrega) < now).length,
    },
  }
}

function sortedMetricEntries(bucket = {}, valueKey = 'total') {
  return Object.entries(bucket)
    .map(([label, data]) => ({ label, ...data }))
    .sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0))
}

function pushGerencialRow(rows, seccion, indicador, valor, detalle = '') {
  rows.push({ seccion, indicador, valor, detalle })
}

function buildGerencialExportRows(reportes = {}, query = {}) {
  const rows = []
  pushGerencialRow(rows, 'Filtros', 'Desde', query.desde || 'Sin filtro')
  pushGerencialRow(rows, 'Filtros', 'Hasta', query.hasta || 'Sin filtro')
  pushGerencialRow(rows, 'Filtros', 'Generado', new Date())

  const ventas = reportes.ventas
  if (ventas) {
    pushGerencialRow(rows, 'Ventas', 'Total periodo', ventas.total, `${ventas.count} operaciones`)
    pushGerencialRow(rows, 'Ventas', 'Ticket promedio', ventas.count ? Math.round(Number(ventas.total || 0) / ventas.count) : 0)
    pushGerencialRow(rows, 'Ventas', 'Fuente ordenes', ventas.fuentes?.ordenes?.total || 0, `${ventas.fuentes?.ordenes?.count || 0} operaciones`)
    pushGerencialRow(rows, 'Ventas', 'Fuente OC online', ventas.fuentes?.ocOnline?.total || 0, `${ventas.fuentes?.ocOnline?.count || 0} operaciones`)
    pushGerencialRow(rows, 'Ventas', 'Fuente licitaciones', ventas.fuentes?.licitaciones?.total || 0, `${ventas.fuentes?.licitaciones?.count || 0} operaciones`)
    for (const item of sortedMetricEntries(ventas.byTipo).slice(0, 8)) {
      pushGerencialRow(rows, 'Ventas por tipo', item.label, item.total || 0, `${item.count || 0} operaciones`)
    }
  }

  const cobranzaCaja = reportes.cobranzaCaja
  if (cobranzaCaja) {
    pushGerencialRow(rows, 'Cobranza', 'CxC pendiente', cobranzaCaja.cuentasPorCobrar?.porCobrar || 0, `${cobranzaCaja.cuentasPorCobrar?.count || 0} documentos`)
    pushGerencialRow(rows, 'Cobranza', 'Cobrado historico', cobranzaCaja.cuentasPorCobrar?.cobrado || 0)
    for (const item of sortedMetricEntries(cobranzaCaja.cuentasPorCobrar?.byEstado, 'valorFactura').slice(0, 8)) {
      pushGerencialRow(rows, 'Cobranza por estado', item.label, item.valorFactura || 0, `${item.count || 0} documentos`)
    }
    const ingresos = Number(cobranzaCaja.caja?.ingresos || 0)
    const egresos = Number(cobranzaCaja.caja?.egresos || 0)
    pushGerencialRow(rows, 'Caja', 'Ingresos', ingresos, `${cobranzaCaja.caja?.count || 0} movimientos`)
    pushGerencialRow(rows, 'Caja', 'Egresos', egresos)
    pushGerencialRow(rows, 'Caja', 'Neto', ingresos - egresos)
  }

  const stock = reportes.stock
  if (stock) {
    pushGerencialRow(rows, 'Stock', 'Productos criticos', stock.stockCritico?.totales?.productosCriticos || 0)
    pushGerencialRow(rows, 'Stock', 'Materiales criticos', stock.stockCritico?.totales?.materialesCriticos || 0)
    pushGerencialRow(rows, 'Stock', 'Movimientos periodo', stock.movimientos?.total || 0)
  }

  const licitaciones = reportes.licitaciones
  if (licitaciones) {
    pushGerencialRow(rows, 'Licitaciones', 'Total periodo', licitaciones.count || 0)
    for (const key of ['ganada', 'perdida', 'pendiente']) {
      const item = licitaciones.byResultado?.[key] || {}
      pushGerencialRow(rows, 'Licitaciones', key, item.total || 0, `${item.count || 0} licitaciones`)
    }
  }

  const operaciones = reportes.operaciones
  if (operaciones) {
    pushGerencialRow(rows, 'Operacion', 'ODT pendientes', operaciones.taller?.pendientes || 0)
    pushGerencialRow(rows, 'Operacion', 'Despachos pendientes', operaciones.despachos?.pendientes || 0)
    pushGerencialRow(rows, 'Operacion', 'Despachos vencidos', operaciones.despachos?.vencidos || 0)
    for (const item of sortedMetricEntries(operaciones.taller?.byEstado, 'count').slice(0, 8)) {
      pushGerencialRow(rows, 'ODT por estado', item.label, item.count || 0)
    }
  }

  return rows
}

function styleGerencialWorksheet(sheet, title) {
  sheet.views = [{ state: 'frozen', ySplit: 3 }]
  sheet.mergeCells('A1:D1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = title
  titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14532D' } }
  titleCell.alignment = { vertical: 'middle' }
  sheet.getRow(1).height = 28
  sheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } }
  sheet.columns.forEach(column => { column.width = 24 })
}

async function buildGerencialXlsx(reportes, query = {}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Plastimar Sisgestion'
  workbook.created = new Date()
  const resumen = workbook.addWorksheet('Resumen gerencial')
  styleGerencialWorksheet(resumen, 'ReporterÃ­a gerencial Plastimar')
  resumen.getCell('A2').value = `PerÃ­odo: ${query.desde || 'Inicio'} a ${query.hasta || 'Hoy'}`
  resumen.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } }
  resumen.getRow(3).values = ['SecciÃ³n', 'Indicador', 'Valor', 'Detalle']
  const rows = buildGerencialExportRows(reportes, query)
  rows.forEach(row => resumen.addRow([row.seccion, row.indicador, row.valor, row.detalle]))
  resumen.getColumn(3).numFmt = '#,##0'
  resumen.autoFilter = { from: 'A3', to: `D${Math.max(3, rows.length + 3)}` }

  const ventas = reportes.ventas
  if (ventas) {
    const sheet = workbook.addWorksheet('Comercial')
    styleGerencialWorksheet(sheet, 'Comercial')
    sheet.getRow(3).values = ['Indicador', 'Valor', 'PerÃ­odo anterior', 'VariaciÃ³n']
    const previous = ventas.comparativo?.periodoAnterior || {}
    sheet.addRows([
      ['Ventas del perÃ­odo', ventas.total || 0, previous.total || 0, ventas.comparativo?.variacionVentas ?? null],
      ['Operaciones', ventas.count || 0, previous.count || 0, ventas.comparativo?.variacionOperaciones ?? null],
    ])
    sheet.getColumn(2).numFmt = '#,##0'
    sheet.getColumn(3).numFmt = '#,##0'
    sheet.getColumn(4).numFmt = '0.0%;[Red]-0.0%'
    sheet.addRow([])
    sheet.addRow(['Ventas por tipo', 'Monto'])
    Object.entries(ventas.byTipo || {}).sort(([, a], [, b]) => b.total - a.total).forEach(([label, value]) => sheet.addRow([label, value.total || 0]))
  }

  const operaciones = reportes.operaciones
  if (operaciones) {
    const sheet = workbook.addWorksheet('Operaciones')
    styleGerencialWorksheet(sheet, 'Operaciones')
    sheet.getRow(3).values = ['Indicador', 'Valor']
    sheet.addRows([
      ['OT pendientes', operaciones.taller?.pendientes || 0],
      ['OT vencidas', operaciones.taller?.vencidas || 0],
      ['OT en riesgo (7 dÃ­as)', operaciones.taller?.enRiesgo || 0],
      ['Despachos pendientes', operaciones.despachos?.pendientes || 0],
      ['Despachos vencidos', operaciones.despachos?.vencidos || 0],
    ])
  }

  const riesgos = workbook.addWorksheet('Finanzas y riesgos')
  styleGerencialWorksheet(riesgos, 'Finanzas y riesgos')
  riesgos.getRow(3).values = ['Indicador', 'Valor', 'Detalle']
  const cobranza = reportes.cobranzaCaja
  if (cobranza) {
    riesgos.addRow(['CxC pendiente', cobranza.cuentasPorCobrar?.porCobrar || 0, 'Cuentas pendientes del perÃ­odo'])
    Object.entries(cobranza.cuentasPorCobrar?.antiguedad || {}).forEach(([label, value]) => riesgos.addRow([`CxC ${label} dÃ­as`, value.total || 0, `${value.count || 0} documentos`]))
    riesgos.addRow(['Caja neta', Number(cobranza.caja?.ingresos || 0) - Number(cobranza.caja?.egresos || 0), 'Ingresos menos egresos'])
  }
  if (reportes.stock) riesgos.addRow(['Stock crÃ­tico', Number(reportes.stock.stockCritico?.totales?.productosCriticos || 0) + Number(reportes.stock.stockCritico?.totales?.materialesCriticos || 0), 'Productos y materiales'])
  if (reportes.licitaciones) riesgos.addRow(['Licitaciones pendientes', reportes.licitaciones.byResultado?.pendiente?.count || 0, 'Pendientes de resoluciÃ³n'])
  riesgos.getColumn(2).numFmt = '#,##0'
  return workbook.xlsx.writeBuffer()
}

export default async function reportesRoutes(fastify) {
  registerComisionesReportRoutes(fastify)
  registerMovimientosAnormalesReportRoutes(fastify)

  fastify.get('/gerencial/ventas', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const reporte = await buildVentasGerenciales(fastify, request.query, request.user)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return reporte
  })

  fastify.get('/gerencial/cobranza-caja', {
    preHandler: [fastify.authenticate, requireRead('caja', 'cobranza')],
  }, async (request, reply) => {
    const reporte = await buildCobranzaCajaGerencial(fastify, request.query, request.user)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return reporte
  })

  fastify.get('/gerencial/stock', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request, reply) => {
    const reporte = await buildStockGerencial(fastify, request.query)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return reporte
  })

  fastify.get('/gerencial/licitaciones', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'read')],
  }, async (request, reply) => {
    const reporte = await buildLicitacionesGerencial(fastify, request.query, request.user)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return reporte
  })

  fastify.get('/gerencial/operaciones', {
    preHandler: [fastify.authenticate, requireRead('taller', 'despacho')],
  }, async (request, reply) => {
    const reporte = await buildOperacionesGerencial(fastify, request.query)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return reporte
  })
  // Reporte stock crítico (productos + materiales bodega taller) — G6
  fastify.get('/stock-critico', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async () => {
    // Filtra en SQL (stock <= stock_critico, solo items con threshold > 0)
    // — sin el filtro stock_critico>0, casi todos los items con stock=0 matchearían
    const [productosCriticos, materialesCriticos] = await Promise.all([
      fastify.prisma.$queryRaw`
        SELECT id, codigo_interno AS "codigoInterno", nombre, stock,
               stock_critico AS "stockCritico", precio_lista AS "precioLista", bodega
        FROM catalogo.productos
        WHERE activo = true
          AND COALESCE(stock_critico, 0) > 0
          AND COALESCE(stock, 0) <= COALESCE(stock_critico, 0)
        ORDER BY nombre ASC
      `,
      fastify.prisma.$queryRaw`
        SELECT id, codigo_interno AS "codigoInterno", nombre, stock,
               stock_critico AS "stockCritico", precio, categoria_id AS "categoriaId"
        FROM taller.bodega_taller
        WHERE activo = true
          AND COALESCE(stock_critico, 0) > 0
          AND COALESCE(stock, 0) <= COALESCE(stock_critico, 0)
        ORDER BY nombre ASC
      `,
    ])

    return {
      generadoEn: new Date().toISOString(),
      productos: productosCriticos,
      materiales: materialesCriticos,
      totales: {
        productosCriticos: productosCriticos.length,
        materialesCriticos: materialesCriticos.length,
      },
    }
  })

  // G11: exports CSV — productos, clientes, proveedores, ventas, caja
  fastify.get('/export/gerencial', {
    preHandler: [fastify.authenticate, fastify.rbac('reportes', 'read')],
  }, async (request, reply) => {
    const reportes = {}
    if (canReadModule(request.user, 'ventas') || canReadModule(request.user, 'cobranza')) {
      const ventas = await buildVentasGerenciales(fastify, request.query, request.user, { includeComparison: false })
      if (ventas.error) return reply.code(400).send({ error: ventas.error })
      reportes.ventas = ventas
    }
    if (canReadAll(request.user, ['caja', 'cobranza'])) {
      const cobranzaCaja = await buildCobranzaCajaGerencial(fastify, request.query, request.user)
      if (cobranzaCaja.error) return reply.code(400).send({ error: cobranzaCaja.error })
      reportes.cobranzaCaja = cobranzaCaja
    }
    if (canReadModule(request.user, 'bodega')) {
      const stock = await buildStockGerencial(fastify, request.query)
      if (stock.error) return reply.code(400).send({ error: stock.error })
      reportes.stock = stock
    }
    if (canReadModule(request.user, 'licitaciones')) {
      const licitaciones = await buildLicitacionesGerencial(fastify, request.query, request.user)
      if (licitaciones.error) return reply.code(400).send({ error: licitaciones.error })
      reportes.licitaciones = licitaciones
    }
    if (canReadAll(request.user, ['taller', 'despacho'])) {
      const operaciones = await buildOperacionesGerencial(fastify, request.query)
      if (operaciones.error) return reply.code(400).send({ error: operaciones.error })
      reportes.operaciones = operaciones
    }

    const rows = buildGerencialExportRows(reportes, request.query)
    if (rows.length <= 3) return reply.code(403).send({ error: 'Sin permisos para exportar reportes gerenciales' })
    const csv = rowsToCsv(rows, [
      { key: 'seccion', label: 'Seccion' },
      { key: 'indicador', label: 'Indicador' },
      { key: 'valor', label: 'Valor' },
      { key: 'detalle', label: 'Detalle' },
    ])
    return sendCsv(reply, `reporte_gerencial_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/gerencial.xlsx', {
    preHandler: [fastify.authenticate, fastify.rbac('reportes', 'read')],
  }, async (request, reply) => {
    const reportes = {}
    if (canReadModule(request.user, 'ventas') || canReadModule(request.user, 'cobranza')) reportes.ventas = await buildVentasGerenciales(fastify, request.query, request.user)
    if (canReadAll(request.user, ['caja', 'cobranza'])) reportes.cobranzaCaja = await buildCobranzaCajaGerencial(fastify, request.query, request.user)
    if (canReadModule(request.user, 'bodega')) reportes.stock = await buildStockGerencial(fastify, request.query)
    if (canReadModule(request.user, 'licitaciones')) reportes.licitaciones = await buildLicitacionesGerencial(fastify, request.query, request.user)
    if (canReadAll(request.user, ['taller', 'despacho'])) reportes.operaciones = await buildOperacionesGerencial(fastify, request.query)
    if (!Object.keys(reportes).length) return reply.code(403).send({ error: 'Sin permisos para exportar reportes gerenciales' })
    const buffer = await buildGerencialXlsx(reportes, request.query)
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="reporte_gerencial_${new Date().toISOString().slice(0, 10)}.xlsx"`)
      .send(Buffer.from(buffer))
  })

  fastify.get('/export/productos', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request, reply) => {
    const productos = await buildPreciosExport(fastify, request.query)
    if (productos.error) return reply.code(400).send({ error: productos.error })
    const csv = rowsToCsv(productos, [
      { key: 'fotoUrl', label: 'Foto' },
      { key: 'codigoInterno', label: 'Cod Interno' },
      { key: 'idMarco', label: 'ID Marco' },
      { key: 'codigoBarra', label: 'Cod Barra' },
      { key: 'visibleWebTexto', label: 'Mostrar Web' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'categoriaExport', label: 'Categoría' },
      { key: 'subcategoriaNombre', label: 'Subcategoría' },
      { key: 'porcDesc', label: 'Descuento' },
      { key: 'precioLista', label: 'Precio Costo' },
      { key: 'precioVentaSalaIva', label: 'Precio venta + IVA' },
      { key: 'precioConDescuento', label: 'Precio con descuento' },
      { key: 'precioConvenioMarco', label: 'Precio Conv. Marco' },
      { key: 'precioLicitacion', label: 'Precio Licitación' },
      { key: 'stockCritico', label: 'Stock Critico' },
      { key: 'stock', label: 'Stock' },
      { key: 'estadoInventario', label: 'Estado Inventario' },
      { key: 'proveedorExport', label: 'Proveedor' },
      { key: 'unidadMedida', label: 'Unidad' },
      { key: 'ubicacion', label: 'Ubicación' },
      { key: 'descripcionLicitacion', label: 'Descripcion Licitacion' },
      { key: 'linkCompra', label: 'Link Compra' },
      { key: 'edad', label: 'Edad' },
      { key: 'materialidad', label: 'Materialidad' },
      { key: 'estado', label: 'Estado Stock' },
    ])
    return sendCsv(reply, `productos_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/clientes', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'read')],
  }, async (request, reply) => {
    const clientes = await buildClientesExport(fastify, request.query)
    const csv = rowsToCsv(clientes, [
      { key: 'rut', label: 'RUT' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'razonSocial', label: 'Razón Social' },
      { key: 'direccion', label: 'Dirección' },
      { key: 'comuna', label: 'Comuna' },
      { key: 'ciudad', label: 'Ciudad' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'segmento', label: 'Segmento' },
      { key: 'limiteCredito', label: 'Limite Credito' },
      { key: 'saldo', label: 'Saldo Deuda' },
      { key: 'region', label: 'Región' },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'email', label: 'Email' },
      { key: 'giro', label: 'Giro' },
    ])
    return sendCsv(reply, `clientes_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/proveedores', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'read')],
  }, async (request, reply) => {
    const proveedores = await fastify.prisma.proveedor.findMany({
      where: buildProveedorWhere(request.query),
      orderBy: proveedorOrderBy(),
    })
    const csv = rowsToCsv(proveedores, [
      { key: 'codigoProveedor', label: 'Cod proveedor' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'rut', label: 'RUT' },
      { key: 'giro', label: 'Giro' },
      { key: 'razonSocial', label: 'Razón Social' },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'email', label: 'Email' },
      { key: 'direccion', label: 'Dirección' },
      { key: 'region', label: 'Region' },
      { key: 'comuna', label: 'Comuna' },
      { key: 'porcVentaSala', label: 'Porcentaje Venta Sala' },
      { key: 'porcMarco', label: 'Porcentaje Convenio Marco' },
      { key: 'porcLicitacion', label: 'Porcentaje Licitación' },
    ])
    return sendCsv(reply, `proveedores_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/ventas', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const { desde, hasta, tipo, rut, nInterno, oc, guia, odt, estadoPago, estadoEntrega, search, scope: scopeParam } = request.query
    const scope = parseOrdenScope(scopeParam, 'operacional')
    if (!scope) return reply.code(400).send({ error: 'scope invalido' })
    let where = { eliminada: false }
    const sucursalId = getUserSucursalId(request.user)
    if (sucursalId) where.sucursalId = sucursalId
    if (desde || hasta) {
      const range = buildDateRange(desde, hasta)
      if (range.error) return reply.code(400).send({ error: range.error })
      applyRange(where, 'createdAt', range)
    }
    if (tipo === 'venta-sala' || tipo === 'venta-directa') where.tipo = { in: VENTA_DIRECTA_TIPOS }
    else if (tipo === 'convenio-marco') where.tipo = { in: [...GRAFIAS_CONVENIO_MARCO] }
    else if (tipo === 'licitacion-convenio') where.tipo = { in: [...GRAFIAS_LICITACION, ...GRAFIAS_CONVENIO_MARCO] }
    else if (tipo) {
      const grafias = grafiasDeTipoVenta(tipo)
      where.tipo = grafias.length ? { in: grafias } : tipo
    }
    if (rut) where.rutCliente = { contains: rut, mode: 'insensitive' }
    if (nInterno) where.nInterno = parseInt(nInterno, 10)
    if (oc) where.licitacion = { contains: oc, mode: 'insensitive' }
    if (guia) {
      const parsedGuia = parsePositiveInt(guia)
      if (!parsedGuia) return reply.code(400).send({ error: 'guia invalida' })
      const guias = await fastify.prisma.guiaDespacho.findMany({
        where: { eliminado: false, nGuia: { contains: guia, mode: 'insensitive' } },
        select: { ordenId: true, nInterno: true },
      })
      const ordenIds = [...new Set(guias.map(g => g.ordenId).filter(Boolean))]
      const internos = [...new Set(guias.map(g => g.nInterno).filter(Boolean))]
      const conditions = []
      if (ordenIds.length) conditions.push({ id: { in: ordenIds } })
      if (internos.length) conditions.push({ nInterno: { in: internos } })
      conditions.push({ guias: parsedGuia })
      where = mergeWhere(where, { OR: conditions })
    }
    if (estadoPago) where.estadoPago = estadoPago
    if (estadoEntrega) where.estadoEntrega = estadoEntrega
    if (odt) {
      const odts = await fastify.prisma.odt.findMany({ where: { id: parseInt(odt, 10) }, select: { ordenId: true } })
      const ids = odts.map(o => o.ordenId).filter(Boolean)
      where.id = ids.length ? { in: ids } : -1
    }
    if (search) {
      const isNum = /^\d+$/.test(search.trim())
      where.OR = [
        { creadorNombre: { contains: search, mode: 'insensitive' } },
        { rutCliente: { contains: search, mode: 'insensitive' } },
        { observaciones: { contains: search, mode: 'insensitive' } },
        ...(isNum ? [{ nInterno: parseInt(search, 10) }, { id: parseInt(search, 10) }] : []),
      ]
    }
    const corte = await getPrimerRegistroInterno(fastify.prisma)
    where = mergeWhere(where, buildOrdenScopeWhere(scope, corte))
    const ventas = await fastify.prisma.orden.findMany({
      where,
      include: { items: true, cargos: true },
      orderBy: { createdAt: 'desc' },
    })
    const rows = ventas.map(o => {
      const total = computeTotal(o.items || [], o.descuentoPct, o.cargos || [], o.descuentoMonto)
      return {
        ...o,
        total,
        saldo: Math.max(0, total - Number(o.abono || 0)),
      }
    })
    const csv = rowsToCsv(rows, [
      { key: 'nInterno', label: 'N° Interno' },
      { key: 'createdAt', label: 'Fecha' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'rutCliente', label: 'RUT' },
      { key: 'creadorNombre', label: 'Vendedor' },
      { key: 'descuentoPct', label: 'Desc %' },
      { key: 'total', label: 'Total' },
      { key: 'abono', label: 'Abono' },
      { key: 'saldo', label: 'Saldo' },
      { key: 'facturado', label: 'Facturado' },
      { key: 'estadoPago', label: 'Pago' },
      { key: 'estadoEntrega', label: 'Entrega' },
      { key: 'licitacion', label: 'OC / Ref' },
      { key: 'observaciones', label: 'Observaciones' },
    ])
    return sendCsv(reply, `ventas_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/cobranza', {
    preHandler: [fastify.authenticate, fastify.rbac('cobranza', 'read')],
  }, async (request, reply) => {
    const builtFilters = buildCobranzaHistoricoFilters(request.query)
    if (builtFilters.error) return reply.code(400).send({ error: builtFilters.error })
    const { filters } = builtFilters
    const where = mergeCobranzaWhere(filters, await buildCobranzaHistoricoScopeWhere(fastify.prisma, request.user))
    const items = await fastify.prisma.cobranzaHistorico.findMany({
      where, orderBy: { fechaFactura: 'desc' },
    })
    const csv = rowsToCsv(items, [
      { key: 'fechaFactura', label: 'Fecha Factura' },
      { key: 'ndoc', label: 'N° Doc' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'rut', label: 'RUT' },
      { key: 'valorFactura', label: 'Valor Factura' },
      { key: 'monto', label: 'Monto Cobrado' },
      { key: 'montoMenos', label: 'Monto Menos' },
      { key: 'nc', label: 'NC' },
      { key: 'multas', label: 'Multas' },
      { key: 'estado', label: 'Estado' },
      { key: 'ejecutiva', label: 'Ejecutiva' },
      { key: 'fechaGestion', label: 'Fecha Gestion' },
      { key: 'ingresoPago', label: 'Ingreso Pago' },
      { key: 'fechaPago', label: 'Fecha Pago' },
      { key: 'banco', label: 'Banco' },
      { key: 'comision', label: 'Comision' },
      { key: 'pagoCom', label: 'Pago Comision' },
      { key: 'despacho', label: 'Despacho' },
      { key: 'reclamo', label: 'Reclamo' },
      { key: 'observacion', label: 'Observacion' },
      { key: 'mesAnio', label: 'Período' },
    ])
    return sendCsv(reply, `cobranza_historico_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/cobranza-activa', {
    preHandler: [fastify.authenticate, fastify.rbac('cobranza', 'read')],
  }, async (request, reply) => {
    const built = await buildVentasExportWhere(fastify, request.query)
    if (built.error) return reply.code(400).send({ error: built.error })
    const sucursalId = getUserSucursalId(request.user)
    const where = mergeWhere(
      built.where,
      { eliminada: false },
      sucursalId ? { sucursalId } : {},
    )
    const ventas = await fastify.prisma.orden.findMany({
      where,
      include: { items: true, cargos: true },
      orderBy: { createdAt: 'asc' },
    })
    const withClientes = await attachClientes(fastify, ventas)
    const pagos = ventas.length
      ? await fastify.prisma.movimientoCaja.findMany({
          where: { ordenId: { in: ventas.map(v => v.id) }, eliminado: false },
          orderBy: { fecha: 'asc' },
        })
      : []
    const pagosMap = {}
    for (const pago of pagos) (pagosMap[pago.ordenId] ||= []).push(pago)

    const rows = withClientes.map(o => {
      const total = computeTotal(o.items || [], o.descuentoPct, o.cargos || [], o.descuentoMonto)
      const saldo = Math.max(0, total - Number(o.abono || 0))
      const pagosOrden = pagosMap[o.id] || []
      const documentosReferenciales = pagosOrden
        .filter(p => String(p.medioPago || '').toLowerCase() === 'referencial')
        .map(p => `${p.documento || ''} ${p.nDoc || ''} ${p.estadoPagoDoc || ''}`.trim())
        .filter(Boolean)
        .join(' | ')
      const pagosRegistrados = pagosOrden
        .filter(p => String(p.medioPago || '').toLowerCase() !== 'referencial')
        .map(p => `${p.medioPago || ''} ${Math.abs(Number(p.monto || 0))}`.trim())
        .filter(Boolean)
        .join(' | ')
      return {
        ...o,
        clienteNombre: o.cliente?.nombre || o.rutCliente || '',
        clienteRut: o.cliente?.rut || o.rutCliente || '',
        total,
        saldo,
        documentosReferenciales,
        pagosRegistrados,
      }
    })
    const csv = rowsToCsv(rows, [
      { key: 'nInterno', label: 'N Interno' },
      { key: 'id', label: 'ID Venta' },
      { key: 'createdAt', label: 'Fecha' },
      { key: 'clienteNombre', label: 'Cliente' },
      { key: 'clienteRut', label: 'RUT' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'total', label: 'Total Venta' },
      { key: 'abono', label: 'Abono' },
      { key: 'saldo', label: 'Saldo Pendiente' },
      { key: 'estadoPago', label: 'Estado Pago' },
      { key: 'documentosReferenciales', label: 'Documentos Referenciales' },
      { key: 'pagosRegistrados', label: 'Pagos Registrados' },
      { key: 'creadorNombre', label: 'Vendedor' },
      { key: 'observaciones', label: 'Observaciones' },
    ])
    return sendCsv(reply, `cobranza_activa_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/caja', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'read')],
  }, async (request, reply) => {
    const built = await buildCajaExportWhere(fastify, request.query, reply, request.user)
    if (built.error) return built.error
    const { where } = built
    const movs = await fastify.prisma.movimientoCaja.findMany({
      where,
      orderBy: { fecha: 'desc' },
      include: { gastoTipo: { select: { nombre: true } } },
    })
    const csv = rowsToCsv(movs, [
      { key: 'fecha', label: 'Fecha' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'gastoTipo', label: 'Gasto', format: (_v, row) => row.gastoTipo?.nombre || '' },
      { key: 'referencia', label: 'Referencia' },
      { key: 'monto', label: 'Monto' },
      { key: 'medioPago', label: 'Medio Pago' },
      { key: 'documento', label: 'Documento' },
      { key: 'tipoDocumento', label: 'Tipo Documento' },
      { key: 'nDoc', label: 'N° Doc' },
      { key: 'estadoDoc', label: 'Estado Doc' },
      { key: 'estadoPagoDoc', label: 'Estado Pago Doc' },
      { key: 'ordenId', label: 'Orden ID' },
      { key: 'usuario', label: 'Usuario' },
      { key: 'eliminado', label: 'Anulado', format: v => v ? 'Si' : 'No' },
    ])
    return sendCsv(reply, `caja_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/odts', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const built = await buildOdtExportWhere(fastify, request.query, request.user)
    if (built.error) return reply.code(400).send({ error: built.error })
    const odts = await fastify.prisma.odt.findMany({
      where: built.where,
      orderBy: { createdAt: 'desc' },
    })
    const enriched = await attachOperarios(fastify.prisma, await attachOrdenes(fastify.prisma, odts))
    const rows = enriched.map(o => ({
      ...o,
      responsable: o.operario
        ? [o.operario.nombres, o.operario.apellidoPaterno, o.operario.apellidoMaterno].filter(Boolean).join(' ')
        : '',
    }))
    const csv = rowsToCsv(rows, [
      { key: 'id', label: 'ID' },
      { key: 'nInterno', label: 'N Interno' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'clienteNombre', label: 'Cliente' },
      { key: 'descripcion', label: 'Descripcion' },
      { key: 'obsGeneral', label: 'Obs ODT' },
      { key: 'estado', label: 'Estado' },
      { key: 'prioridad', label: 'Prioridad' },
      { key: 'responsable', label: 'Responsable' },
      { key: 'createdAt', label: 'Creada' },
      { key: 'fechaIngreso', label: 'Ingreso' },
      { key: 'plazo', label: 'Plazo' },
      { key: 'fechaInicio', label: 'Inicio' },
      { key: 'fechaTermino', label: 'Termino' },
      { key: 'ordenId', label: 'Orden' },
    ])
    return sendCsv(reply, `odts_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/bodega-taller', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const filter = await buildBodegaTallerWhere(fastify.prisma, request.query, request.user)
    if (filter.error) return reply.code(400).send({ error: filter.error })
    const rawItems = await fastify.prisma.bodegaTaller.findMany({
      where: filter.where,
      orderBy: { nombre: 'asc' },
      take: 10000,
    })
    const items = await enrichBodegaTallerItems(
      fastify.prisma,
      filter.stockCritico ? filterStockCriticoItems(rawItems) : rawItems,
    )
    const csv = rowsToCsv(items, [
      { key: 'categoriaNombre', label: 'Categoría' },
      { key: 'codigoBarra', label: 'Cod Barra' },
      { key: 'codigoInterno', label: 'Cod Interno' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'proveedorNombre', label: 'Proveedor' },
      { key: 'stock', label: 'Stock' },
      { key: 'stockCritico', label: 'Stock Critico' },
      { key: 'subcategoriaNombre', label: 'Subcategoría' },
      { key: 'unidadMedida', label: 'Unid. Medida' },
      { key: 'sucursalNombre', label: 'Sucursal' },
      { key: 'precio', label: 'Precio' },
    ])
    return sendCsv(reply, `bodega_taller_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })
}
