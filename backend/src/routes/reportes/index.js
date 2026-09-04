import { sendExport } from '../../utils/export.js'
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
import { GRAFIAS_CONVENIO_MARCO, GRAFIAS_LICITACION, TIPO_VENTA_VALUES, TIPOS_VENTA_MOSTRADOR, grafiasDeTipoVenta, normalizeTipoVenta } from '../ventas/estados-normalize.js'
import { registerComisionesReportRoutes } from './comisiones.js'
import { registerMovimientosAnormalesReportRoutes } from './movimientos-anormales.js'
import ExcelJS from 'exceljs'

const VENTA_DIRECTA_TIPOS = TIPOS_VENTA_MOSTRADOR
// Las vistas directivas se cargan por pestaña y nunca deben convertir una
// consulta de detalle amplia en una respuesta parcial que parezca exacta.
const GERENCIAL_ANALYTICS_DETAIL_LIMIT = 25_000

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

function localDateKey(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

function getGerencialSections(user) {
  return {
    ventas: canReadModule(user, 'ventas'),
    cobranzaCaja: canReadAll(user, ['caja', 'cobranza']),
    stock: canReadModule(user, 'bodega'),
    licitaciones: canReadModule(user, 'licitaciones'),
    operaciones: canReadAll(user, ['taller', 'despacho']),
  }
}

// El selector usa tipos canónicos, pero el desglose histórico aún puede traer
// "Venta directa". Esa grafía se conserva como equivalencia de mostrador;
// "Normal" sigue siendo un tipo independiente.
function resolveGerencialTipoVenta(tipo) {
  const raw = String(tipo || '').trim()
  if (!raw) return { raw: '', canonico: null, grafias: null }

  const key = normalizeSearchText(raw).replace(/[\s-]+/g, ' ')
  if (key === 'venta directa') return { raw, canonico: 'Venta Sala', grafias: VENTA_DIRECTA_TIPOS }

  const canonico = normalizeTipoVenta(raw)
  if (canonico === 'Venta Sala') return { raw, canonico, grafias: VENTA_DIRECTA_TIPOS }
  if (canonico) return { raw, canonico, grafias: grafiasDeTipoVenta(canonico) }

  // Permite investigar una grafía legacy no catalogada, sin incorporarla al
  // selector oficial de tipos de venta.
  return { raw, canonico: null, grafias: null }
}

async function resolveGerencialVendedor(prisma, vendedor) {
  const texto = String(vendedor || '').trim()
  if (!texto) return null

  // La UI selecciona a la persona; Venta Web guarda su código, por lo que se
  // resuelve antes de consultar cada fuente para no mezclar responsables.
  const usuario = await prisma.user.findFirst({
    where: {
      activo: true,
      role: 'vendedor',
      OR: [
        { nombre: { equals: texto, mode: 'insensitive' } },
        { codigoVendedor: { equals: texto, mode: 'insensitive' } },
      ],
    },
    select: { nombre: true, codigoVendedor: true },
  })

  return {
    nombre: usuario?.nombre || texto,
    codigo: usuario?.codigoVendedor || texto,
  }
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
    if (Number.isNaN(parsedUbicacionId)) return { error: 'ubicacionId inválido' }
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
  const tipoFiltro = resolveGerencialTipoVenta(tipo)
  const vendedorFiltro = await resolveGerencialVendedor(fastify.prisma, vendedor)
  const sucursalUsuarioId = getUserSucursalId(user)
  const sucursalFiltroId = query.sucursalId ? parsePositiveInt(query.sucursalId) : null
  if (query.sucursalId && !sucursalFiltroId) return { error: 'sucursalId inválido' }
  const sucursalId = sucursalUsuarioId || sucursalFiltroId
  const ordenWhere = mergeWhere(applyRange({ eliminada: false, ...(sucursalId ? { sucursalId } : {}) }, 'createdAt', range), buildOrdenScopeWhere('operacional', corte))
  if (rut || cliente) ordenWhere.rutCliente = { contains: rut || cliente, mode: 'insensitive' }
  if (vendedorFiltro) ordenWhere.creadorNombre = { contains: vendedorFiltro.nombre, mode: 'insensitive' }
  if (tipoFiltro.grafias) ordenWhere.tipo = { in: tipoFiltro.grafias }
  else if (tipoFiltro.raw) ordenWhere.tipo = { contains: tipoFiltro.raw.replace(/-/g, ' '), mode: 'insensitive' }

  const ocWhere = applyRange({}, 'fechaHora', range)
  if (sucursalId) ocWhere.sucursalId = sucursalId
  if (vendedorFiltro) ocWhere.codigoVendedor = { contains: vendedorFiltro.codigo, mode: 'insensitive' }
  if (cliente) ocWhere.emailComprador = { contains: cliente, mode: 'insensitive' }

  const licWhere = applyRange({}, 'fecha', range)
  if (sucursalId) licWhere.sucursalId = sucursalId
  if (rut || cliente) licWhere.rutCliente = { contains: rut || cliente, mode: 'insensitive' }
  if (vendedorFiltro) licWhere.usuario = { contains: vendedorFiltro.nombre, mode: 'insensitive' }

  const includeOrdenes = !tipo || Boolean(tipoFiltro.grafias || tipoFiltro.raw)
  const includeOc = !tipo || tipoFiltro.canonico === 'Venta Web'
  const includeLic = !tipo || tipoFiltro.canonico === 'Licitación'

  const [ordenes, ocs, licitaciones] = await Promise.all([
    includeOrdenes ? fastify.prisma.orden.findMany({
      where: ordenWhere,
      // El dashboard no necesita traer columnas de despacho, CRM ni auditoria
      // para calcular los KPIs. Reducir el payload baja memoria y latencia sin
      // alterar la formula mientras se construye la capa analitica definitiva.
      select: {
        id: true, createdAt: true, rutCliente: true, creadorNombre: true, tipo: true,
        descuentoPct: true, descuentoMonto: true,
        items: { select: { cantidad: true, precioUnitario: true } },
        cargos: { select: { valor: true } },
      },
    }) : [],
    includeOc ? fastify.prisma.ordenCompraOnline.findMany({
      where: ocWhere,
      select: { fechaHora: true, emailComprador: true, codigoVendedor: true, total: true },
    }) : [],
    includeLic ? fastify.prisma.cotizacionLicitacion.findMany({
      where: licWhere,
      select: {
        fecha: true, rutCliente: true, usuario: true, ordenId: true, estado: true, descuentoPct: true,
        items: { select: { cantidad: true, precio: true, cantAdjudicados: true } },
      },
    }) : [],
  ])

  const byPeriodo = {}
  const byCliente = {}
  const byVendedor = {}
  const byTipo = {}
  // Cliente y vendedor no tienen una llave canÃ³nica entre Ã³rdenes, web y
  // licitaciones (RUT/correo/cÃ³digo/usuario). Para no presentar tres listas
  // distintas como un ranking Ãºnico, se entregan ademÃ¡s los desgloses limpios
  // de Ã³rdenes internas, que sÃ­ comparten el mismo modelo.
  const ordenesPorCliente = {}
  const ordenesPorVendedor = {}
  const ordenesPorTipo = {}
  let total = 0
  let count = 0
  const push = ({ fecha, cliente: rowCliente, vendedor: rowVendedor, tipo: rowTipo, fuente, monto }) => {
    total += monto
    count += 1
    addMetric(byPeriodo, periodKey(fecha, periodo), monto)
    // La misma persona puede llegar como RUT, correo, nombre, codigo o usuario
    // segun la fuente. Se conserva el desglose para compatibilidad, pero cada
    // clave declara su origen: no es un ranking canÃ³nico hasta normalizarlo.
    addMetric(byCliente, fuente ? `${fuente} | ${rowCliente || 'sin-dato'}` : rowCliente, monto)
    addMetric(byVendedor, fuente ? `${fuente} | ${rowVendedor || 'sin-dato'}` : rowVendedor, monto)
    addMetric(byTipo, rowTipo, monto)
  }

  // Una licitacion adjudicada se convierte en orden de venta y conserva el vinculo en
  // `ordenId`. Al sumar las tres fuentes sin mirar ese vinculo, ese negocio se contaba
  // dos veces: como orden y como licitacion. En produccion son 2.390 licitaciones
  // apuntando a 2.375 ordenes, asi que el total mostrado no era ingreso.
  //
  // Se descarta la licitacion cuya orden ya esta en este mismo resultado. Si la orden
  // quedo fuera del rango o del filtro, la licitacion se conserva: lo que se evita es
  // contar dos veces, no perder el negocio.
  const ordenIdsEnResultado = new Set(ordenes.map(o => o.id))
  const licitacionesUnicas = licitaciones.filter(l => !(l.ordenId && ordenIdsEnResultado.has(l.ordenId)))
  const duplicadas = licitaciones.length - licitacionesUnicas.length

  for (const o of ordenes) {
    const monto = totalOrden(o)
    push({ fecha: o.createdAt, cliente: o.rutCliente, vendedor: o.creadorNombre, tipo: o.tipo, fuente: 'Orden interna', monto })
    addMetric(ordenesPorCliente, o.rutCliente, monto)
    addMetric(ordenesPorVendedor, o.creadorNombre, monto)
    addMetric(ordenesPorTipo, o.tipo, monto)
  }
  for (const o of ocs) push({ fecha: o.fechaHora, cliente: o.emailComprador, vendedor: o.codigoVendedor, tipo: 'Venta Web', fuente: 'Venta web', monto: o.total || 0 })
  for (const l of licitacionesUnicas) push({ fecha: l.fecha, cliente: l.rutCliente, vendedor: l.usuario, tipo: 'Licitacion', fuente: 'Licitacion', monto: totalLicitacion(l) })

  const result = {
    filtros: { desde: desde || null, hasta: hasta || null, periodo },
    total,
    count,
    fuentes: {
      ordenes: { count: ordenes.length, total: ordenes.reduce((s, o) => s + totalOrden(o), 0) },
      ocOnline: { count: ocs.length, total: ocs.reduce((s, o) => s + (o.total || 0), 0) },
      licitaciones: {
        count: licitacionesUnicas.length,
        total: licitacionesUnicas.reduce((s, l) => s + totalLicitacion(l), 0),
        // Cuantas se descartaron por estar ya contadas como orden. Se informa en vez
        // de ocultarse: si el numero es alto, el vinculo licitacion-orden esta sano.
        duplicadasConOrden: duplicadas,
      },
    },
    // Cuantas de las licitaciones sumadas todavia no estan adjudicadas.
    //
    // No se excluyen aca: si una cotizacion pendiente cuenta o no como venta es la
    // definicion del KPI, y esa decision es de Finanzas y Comercial, no del reporte.
    // Pero tampoco se esconde: hoy inflan la CANTIDAD de ventas -y con ella hunden el
    // ticket promedio- sin que nada lo advirtiera.
    advertencias: (() => {
      const pendientes = licitacionesUnicas.filter(l => {
        const estado = String(l.estado || '').trim().toLowerCase()
        return estado && estado !== 'adjudicada'
      }).length
      return pendientes
        ? [{
          tipo: 'licitaciones_no_adjudicadas_incluidas',
          cantidad: pendientes,
          detalle: `${pendientes} licitación(es) sin adjudicar están sumadas en el total y la cantidad`,
        }]
        : []
    })(),
    desgloses: {
      // No se mezclan fuentes hasta contar con una identidad cliente/vendedor
      // comÃºn. La UI los rotula explÃ­citamente como Ã³rdenes internas.
      ordenesInternas: {
        byCliente: ordenesPorCliente,
        byVendedor: ordenesPorVendedor,
        byTipo: ordenesPorTipo,
      },
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

const COMMERCIAL_DETAIL_ORDER_LIMIT = 25_000

function commercialTipoLabel(tipo) {
  const key = normalizeSearchText(tipo).replace(/[\s-]+/g, ' ')
  if (key === 'venta directa') return 'Venta Sala'
  return normalizeTipoVenta(tipo) || tipo || 'Sin tipo'
}

function sumOrdenesComerciales(ordenes = []) {
  return ordenes.reduce((acc, orden) => {
    const total = totalOrden(orden)
    acc.ventas += total
    acc.ordenes += 1
    acc.unidades += (orden.items || []).reduce((sum, item) => sum + Number(item.cantidad || 0), 0)
    return acc
  }, { ventas: 0, ordenes: 0, unidades: 0 })
}

function shiftRangeOneYear(range) {
  if (!range.gte || !range.lte) return null
  const gte = new Date(range.gte)
  const lte = new Date(range.lte)
  gte.setFullYear(gte.getFullYear() - 1)
  lte.setFullYear(lte.getFullYear() - 1)
  return { gte, lte }
}

function rangeMetadata(range) {
  if (!range?.gte || !range?.lte) return null
  return {
    desde: localDateKey(range.gte),
    hasta: localDateKey(range.lte),
  }
}

async function buildComercialOrdenWhere(fastify, query = {}, user = null, range) {
  const corte = await getPrimerRegistroInterno(fastify.prisma)
  const tipoFiltro = resolveGerencialTipoVenta(query.tipo)
  const vendedorFiltro = await resolveGerencialVendedor(fastify.prisma, query.vendedor)
  const sucursalUsuarioId = getUserSucursalId(user)
  const sucursalFiltroId = query.sucursalId ? parsePositiveInt(query.sucursalId) : null
  if (query.sucursalId && !sucursalFiltroId) return { error: 'sucursalId inválido' }

  const where = mergeWhere(
    applyRange({
      eliminada: false,
      ...(sucursalUsuarioId ? { sucursalId: sucursalUsuarioId } : sucursalFiltroId ? { sucursalId: sucursalFiltroId } : {}),
    }, 'createdAt', range),
    buildOrdenScopeWhere('operacional', corte),
  )

  if (query.cliente) where.rutCliente = { contains: query.cliente, mode: 'insensitive' }
  if (vendedorFiltro) where.creadorNombre = { contains: vendedorFiltro.nombre, mode: 'insensitive' }
  if (tipoFiltro.grafias) where.tipo = { in: tipoFiltro.grafias }
  else if (tipoFiltro.raw) where.tipo = { contains: tipoFiltro.raw.replace(/-/g, ' '), mode: 'insensitive' }
  return { where }
}

async function loadComercialOrdenes(fastify, query, user, range, { detail = false } = {}) {
  const built = await buildComercialOrdenWhere(fastify, query, user, range)
  if (built.error) return built

  if (detail) {
    const count = await fastify.prisma.orden.count({ where: built.where })
    if (count > COMMERCIAL_DETAIL_ORDER_LIMIT) {
      return {
        error: `El rango contiene ${count.toLocaleString('es-CL')} órdenes. Acótelo para proteger el servidor y obtener el detalle comercial.`,
      }
    }
  }

  const ordenes = await fastify.prisma.orden.findMany({
    where: built.where,
    select: {
      id: true,
      createdAt: true,
      tipo: true,
      clienteId: true,
      rutCliente: true,
      creadorNombre: true,
      sucursalId: true,
      descuentoPct: true,
      descuentoMonto: true,
      items: {
        where: { eliminado: false },
        select: { productoId: true, codigoInterno: true, nombre: true, cantidad: true, precioUnitario: true },
      },
      cargos: { select: { valor: true } },
    },
    ...(detail ? { take: COMMERCIAL_DETAIL_ORDER_LIMIT } : {}),
  })
  return { ordenes }
}

function calculateUnitCost(producto, historicalCostByCode) {
  const snapshot = producto?.costeoSnapshots?.[0]
  if (Number(snapshot?.costoTransferencia || 0) > 0) return { costo: Number(snapshot.costoTransferencia), origen: 'costeo' }

  const proveedores = (producto?.proveedores || []).filter(p => Number(p.costo || 0) > 0)
  if (proveedores.length) {
    const weightedQty = proveedores.reduce((sum, p) => sum + Math.max(0, Number(p.cantidad || 0)), 0)
    const costo = weightedQty > 0
      ? proveedores.reduce((sum, p) => sum + Number(p.costo || 0) * Math.max(0, Number(p.cantidad || 0)), 0) / weightedQty
      : proveedores.reduce((sum, p) => sum + Number(p.costo || 0), 0) / proveedores.length
    return { costo, origen: 'proveedor' }
  }

  const historical = historicalCostByCode.get(producto?.codigoInterno)
  if (Number(historical || 0) > 0) return { costo: Number(historical), origen: 'compra_historica' }
  return { costo: null, origen: null }
}

function toRankRows(bucket = {}, sortKey = 'ventas', limit = 10) {
  return Object.entries(bucket)
    .map(([label, metric]) => ({ label, ...metric }))
    .sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0))
    .slice(0, limit)
}

async function buildComercialGerencial(fastify, query = {}, user = null) {
  const range = buildDateRange(query.desde, query.hasta)
  if (range.error) return { error: range.error }
  if (!range.gte || !range.lte) return { error: 'Desde y hasta son obligatorios para el análisis comercial' }
  const previousRange = previousDateRange(range)
  const lastYearRange = shiftRangeOneYear(range)

  const [current, previous, lastYear] = await Promise.all([
    loadComercialOrdenes(fastify, query, user, range, { detail: true }),
    loadComercialOrdenes(fastify, query, user, previousRange, { detail: true }),
    loadComercialOrdenes(fastify, query, user, lastYearRange, { detail: true }),
  ])
  if (current.error || previous.error || lastYear.error) return { error: current.error || previous.error || lastYear.error }

  const ordenes = current.ordenes
  const actual = sumOrdenesComerciales(ordenes)
  const periodoAnterior = sumOrdenesComerciales(previous.ordenes)
  const mismoPeriodoAnoAnterior = sumOrdenesComerciales(lastYear.ordenes)
  const productIds = [...new Set(ordenes.flatMap(orden => orden.items.map(item => item.productoId).filter(Boolean)))]
  const canReadCosts = canReadModule(user, 'bodega')
  const canReadClients = canReadModule(user, 'clientes')

  const [productos, clientes] = await Promise.all([
    productIds.length ? fastify.prisma.producto.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true, codigoInterno: true, nombre: true, categoria: true, stock: true, stockCritico: true,
        subcategoria: { select: { nombre: true, categoria: { select: { nombre: true } } } },
        ...(canReadCosts ? {
          proveedores: { where: { activo: true }, select: { costo: true, cantidad: true } },
          costeoSnapshots: { take: 1, orderBy: { createdAt: 'desc' }, select: { costoTransferencia: true } },
        } : {}),
      },
    }) : [],
    canReadClients
      ? fastify.prisma.cliente.findMany({
        where: { id: { in: [...new Set(ordenes.map(orden => orden.clienteId).filter(Boolean))] } },
        select: { id: true, rut: true, nombre: true, razonSocial: true },
      })
      : [],
  ])

  const historicalCostByCode = new Map()
  if (canReadCosts) {
    const codes = productos.map(producto => producto.codigoInterno).filter(Boolean)
    if (codes.length) {
      const costs = await fastify.prisma.detalleFacturaProveedor.groupBy({
        by: ['codigoInterno'],
        where: { codigoInterno: { in: codes }, precio: { gt: 0 } },
        _avg: { precio: true },
      })
      costs.forEach(row => historicalCostByCode.set(row.codigoInterno, Number(row._avg.precio || 0)))
    }
  }

  const productosById = new Map(productos.map(producto => [producto.id, producto]))
  const clientesById = new Map(clientes.map(cliente => [cliente.id, cliente]))
  const canales = {}
  const vendedores = {}
  const clientesMetric = {}
  const productosMetric = {}
  const tendencia = {}
  let ventasLineas = 0
  let ventasConCosto = 0
  let costoEstimado = 0
  let lineasConCosto = 0
  let lineasTotal = 0

  for (const orden of ordenes) {
    const total = totalOrden(orden)
    const tipo = commercialTipoLabel(orden.tipo)
    const vendedor = orden.creadorNombre || 'Sin vendedor asignado'
    const cliente = clientesById.get(orden.clienteId)
    const clienteLabel = cliente?.razonSocial || cliente?.nombre || orden.rutCliente || 'Sin cliente identificado'
    const clientKey = cliente?.id ? `id:${cliente.id}` : orden.rutCliente ? `rut:${orden.rutCliente}` : `orden:${orden.id}`
    const day = periodKey(orden.createdAt, 'dia')

    for (const [bucket, key] of [[canales, tipo], [vendedores, vendedor], [tendencia, day]]) {
      if (!bucket[key]) bucket[key] = { ventas: 0, ordenes: 0, unidades: 0 }
      bucket[key].ventas += total
      bucket[key].ordenes += 1
      bucket[key].unidades += orden.items.reduce((sum, item) => sum + Number(item.cantidad || 0), 0)
    }
    if (!clientesMetric[clientKey]) clientesMetric[clientKey] = { nombre: clienteLabel, ventas: 0, ordenes: 0, unidades: 0 }
    clientesMetric[clientKey].ventas += total
    clientesMetric[clientKey].ordenes += 1
    clientesMetric[clientKey].unidades += orden.items.reduce((sum, item) => sum + Number(item.cantidad || 0), 0)

    for (const item of orden.items) {
      const producto = productosById.get(item.productoId)
      const key = item.productoId ? `id:${item.productoId}` : `codigo:${item.codigoInterno || item.nombre || item.id}`
      const ventaLinea = Number(item.cantidad || 0) * Number(item.precioUnitario || 0)
      const categoria = producto?.subcategoria?.categoria?.nombre || producto?.categoria || 'Sin categoría'
      const label = producto?.nombre || item.nombre || item.codigoInterno || 'Producto sin nombre'
      if (!productosMetric[key]) productosMetric[key] = {
        productoId: item.productoId || null,
        codigo: producto?.codigoInterno || item.codigoInterno || null,
        nombre: label,
        categoria,
        ventas: 0,
        unidades: 0,
        costo: 0,
        ventasConCosto: 0,
        lineasConCosto: 0,
        stock: producto?.stock ?? null,
        stockCritico: producto?.stockCritico ?? null,
      }
      const metric = productosMetric[key]
      metric.ventas += ventaLinea
      metric.unidades += Number(item.cantidad || 0)
      ventasLineas += ventaLinea
      lineasTotal += 1

      if (canReadCosts) {
        const cost = calculateUnitCost(producto, historicalCostByCode)
        if (cost.costo != null) {
          const costoLinea = Number(item.cantidad || 0) * cost.costo
          metric.costo += costoLinea
          metric.ventasConCosto += ventaLinea
          metric.lineasConCosto += 1
          costoEstimado += costoLinea
          ventasConCosto += ventaLinea
          lineasConCosto += 1
        }
      }
    }
  }

  const totalClientes = Object.keys(clientesMetric).length
  const recurrentesPeriodo = Object.values(clientesMetric).filter(cliente => cliente.ordenes >= 2).length
  const durationDays = Math.max(1, Math.round((range.lte.getTime() - range.gte.getTime()) / 86_400_000) + 1)
  const productosRank = Object.values(productosMetric)
    .map(producto => {
      const margen = producto.ventasConCosto - producto.costo
      const margenPct = producto.ventasConCosto > 0 ? margen / producto.ventasConCosto : null
      const diasCobertura = producto.stock != null && producto.unidades > 0
        ? producto.stock / (producto.unidades / durationDays)
        : null
      return { ...producto, margen, margenPct, diasCobertura }
    })
    .sort((a, b) => b.ventas - a.ventas)

  const inventario = canReadCosts
    ? await fastify.prisma.producto.findMany({
      where: { activo: true, stock: { gt: 0 } },
      select: {
        id: true, codigoInterno: true, nombre: true, categoria: true, stock: true, stockCritico: true,
        proveedores: { where: { activo: true }, select: { costo: true, cantidad: true } },
        costeoSnapshots: { take: 1, orderBy: { createdAt: 'desc' }, select: { costoTransferencia: true } },
      },
    })
    : []
  const vendidosIds = new Set(productIds)
  const inventarioValorizado = inventario.map(producto => {
    const cost = calculateUnitCost(producto, historicalCostByCode)
    return {
      productoId: producto.id,
      codigo: producto.codigoInterno,
      nombre: producto.nombre,
      categoria: producto.categoria || 'Sin categoría',
      stock: producto.stock,
      stockCritico: producto.stockCritico,
      costoUnitario: cost.costo,
      valor: cost.costo != null ? producto.stock * cost.costo : null,
      vendidoEnPeriodo: vendidosIds.has(producto.id),
    }
  })
  const inventarioConCosto = inventarioValorizado.filter(producto => producto.valor != null)
  const sinVentaPeriodo = inventarioConCosto
    .filter(producto => !producto.vendidoEnPeriodo)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8)

  const ventasComparables = actual.ventas
  const variation = base => base.ventas > 0 ? (actual.ventas - base.ventas) / base.ventas : null
  const margin = ventasConCosto - costoEstimado
  const brechas = [
    { codigo: 'metas', titulo: 'Metas y presupuesto', detalle: 'No existe una fuente de metas o presupuesto aprobada; no se muestra cumplimiento ni forecast.' },
    { codigo: 'comisiones', titulo: 'Comisiones', detalle: 'La fuente de comisiones no está normalizada por venta; no se incluye como KPI ejecutivo.' },
    { codigo: 'ltv', titulo: 'LTV y canasta', detalle: 'La identidad histórica de clientes no está normalizada entre órdenes, web y licitaciones; se muestra recurrencia solo dentro del período filtrado.' },
  ]
  if (canReadCosts && ventasLineas > 0 && ventasConCosto === 0) {
    brechas.unshift({ codigo: 'costos', titulo: 'Costo no trazable', detalle: 'Las líneas vendidas del período no tienen costo de costeo, proveedor ni compra histórica utilizable; el margen y la valorización se bloquean en vez de mostrarse como $0.' })
  }

  return {
    meta: {
      generadoEn: new Date().toISOString(),
      estado: 'operacional_estimado',
      mensajeEstado: 'Ventas basadas en órdenes internas operacionales. El margen usa costo de costeo, proveedor o compra histórica disponible; no es margen neto contable.',
      limiteOrdenesDetalle: COMMERCIAL_DETAIL_ORDER_LIMIT,
    },
    filtros: { desde: query.desde, hasta: query.hasta, tipo: query.tipo || null, vendedor: query.vendedor || null, cliente: query.cliente || null, sucursalId: query.sucursalId || null },
    kpis: {
      ventas: actual.ventas,
      ordenes: actual.ordenes,
      unidades: actual.unidades,
      ticketPromedio: actual.ordenes ? actual.ventas / actual.ordenes : 0,
      clientesUnicos: totalClientes,
      clientesRecurrentesPeriodo: recurrentesPeriodo,
      tasaRecompraPeriodo: totalClientes ? recurrentesPeriodo / totalClientes : 0,
      margen: canReadCosts ? {
        visible: true,
        monto: margin,
        pct: ventasConCosto ? margin / ventasConCosto : null,
        coberturaVentasPct: ventasLineas ? ventasConCosto / ventasLineas : 0,
        coberturaLineasPct: lineasTotal ? lineasConCosto / lineasTotal : 0,
      } : { visible: false },
      comparativos: {
        periodoAnterior: {
          ...periodoAnterior,
          rango: rangeMetadata(previousRange),
          criterio: 'Mismo número de días inmediatamente anteriores al inicio del período seleccionado.',
          variacionVentas: variation(periodoAnterior),
        },
        mismoPeriodoAnoAnterior: {
          ...mismoPeriodoAnoAnterior,
          rango: rangeMetadata(lastYearRange),
          criterio: 'Mismas fechas del año calendario anterior.',
          variacionVentas: variation(mismoPeriodoAnoAnterior),
        },
      },
      inventario: canReadCosts ? {
        visible: true,
        productosConStock: inventarioValorizado.length,
        valorizacionEstimada: inventarioConCosto.reduce((sum, producto) => sum + Number(producto.valor || 0), 0),
        coberturaValorizacionPct: inventarioValorizado.length ? inventarioConCosto.length / inventarioValorizado.length : 0,
        sinVentaPeriodo: sinVentaPeriodo.length,
      } : { visible: false },
    },
    tendencia: toRankRows(tendencia, 'ventas', 500).sort((a, b) => a.label.localeCompare(b.label)),
    rankings: {
      canales: toRankRows(canales),
      vendedores: toRankRows(vendedores),
      clientes: canReadClients ? Object.values(clientesMetric).sort((a, b) => b.ventas - a.ventas).slice(0, 10) : [],
      productos: productosRank.slice(0, 12),
      coberturaInventario: productosRank.filter(producto => producto.diasCobertura != null).sort((a, b) => a.diasCobertura - b.diasCobertura).slice(0, 12),
    },
    inventario: canReadCosts ? { sinVentaPeriodo } : null,
    brechas,
  }
}

async function findGerencialDetail(model, args, label) {
  const count = await model.count({ where: args.where })
  if (count > GERENCIAL_ANALYTICS_DETAIL_LIMIT) {
    return { error: `${label} supera el lÃ­mite seguro de ${GERENCIAL_ANALYTICS_DETAIL_LIMIT.toLocaleString('es-CL')} registros. Acota el perÃ­odo para no afectar la operaciÃ³n.` }
  }
  const items = await model.findMany({ ...args, take: GERENCIAL_ANALYTICS_DETAIL_LIMIT })
  return { count, items }
}

function gerencialDateLabel(value) {
  return localDateKey(value) || 'Sin fecha'
}

function gerencialRangeMetadata(range, criterio) {
  return {
    desde: localDateKey(range.gte),
    hasta: localDateKey(range.lte),
    criterio,
  }
}

function gerencialOdtScope(user, rawSucursalId) {
  const sucursalId = getUserSucursalId(user) || parsePositiveInt(rawSucursalId)
  return sucursalId ? { OR: [{ sucursalId }, { sucursalId: null }] } : null
}

function tallyByLabel(items, getLabel) {
  const bucket = {}
  items.forEach(item => {
    const label = getLabel(item) || 'Sin dato'
    bucket[label] = (bucket[label] || 0) + 1
  })
  return Object.entries(bucket)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

function operationalTrend({ ingresos = [], terminadas = [], despachosIngresados = [], entregas = [] } = {}) {
  const byDay = new Map()
  const ensure = label => {
    if (!byDay.has(label)) byDay.set(label, { label, ingresos: 0, terminadas: 0, despachosIngresados: 0, entregas: 0 })
    return byDay.get(label)
  }
  ingresos.forEach(item => { const label = gerencialDateLabel(item.createdAt); if (label !== 'Sin fecha') ensure(label).ingresos += 1 })
  terminadas.forEach(item => { const label = gerencialDateLabel(item.fechaTermino); if (label !== 'Sin fecha') ensure(label).terminadas += 1 })
  despachosIngresados.forEach(item => { const label = gerencialDateLabel(item.createdAt); if (label !== 'Sin fecha') ensure(label).despachosIngresados += 1 })
  entregas.forEach(item => { const label = gerencialDateLabel(item.fechaEntrega); if (label !== 'Sin fecha') ensure(label).entregas += 1 })
  return [...byDay.values()].sort((a, b) => a.label.localeCompare(b.label))
}

function operationalBacklogAging(backlog = [], now = new Date()) {
  const labels = ['0-2 días', '3-7 días', '8-14 días', '15+ días', 'Sin fecha de ingreso']
  const bucket = Object.fromEntries(labels.map(label => [label, 0]))
  backlog.forEach(item => {
    if (!item.createdAt) { bucket['Sin fecha de ingreso'] += 1; return }
    const days = Math.max(0, Math.floor((now.getTime() - new Date(item.createdAt).getTime()) / 86_400_000))
    const label = days <= 2 ? '0-2 días' : days <= 7 ? '3-7 días' : days <= 14 ? '8-14 días' : '15+ días'
    bucket[label] += 1
  })
  return labels.map(label => ({ label, value: bucket[label] }))
}

function averageCycleHours(items = []) {
  const hours = items.map(item => {
    const start = item.fechaInicio || item.createdAt
    if (!start || !item.fechaTermino) return null
    const value = (new Date(item.fechaTermino).getTime() - new Date(start).getTime()) / 3_600_000
    return Number.isFinite(value) && value >= 0 ? value : null
  }).filter(value => value != null)
  return hours.length ? hours.reduce((sum, value) => sum + value, 0) / hours.length : null
}

async function buildOperacionesGerencialV1(fastify, query = {}, user = null) {
  const range = buildDateRange(query.desde, query.hasta)
  if (range.error) return { error: range.error }
  if (!range.gte || !range.lte) return { error: 'Desde y hasta son obligatorios para la actividad operacional' }

  const odtScope = gerencialOdtScope(user, query.sucursalId)
  const openWhere = {
    eliminado: false,
    estado: { notIn: ['Terminada', 'Entregada', 'Anulada'] },
    ...(odtScope ? { AND: [odtScope] } : {}),
  }
  const createdWhere = {
    eliminado: false,
    createdAt: { gte: range.gte, lte: range.lte },
    ...(odtScope ? { AND: [odtScope] } : {}),
  }
  const completedWhere = {
    eliminado: false,
    fechaTermino: { gte: range.gte, lte: range.lte },
    ...(odtScope ? { AND: [odtScope] } : {}),
  }
  const openDispatchWhere = { eliminado: false, fechaEntrega: null }
  const dispatchCreatedWhere = { eliminado: false, createdAt: { gte: range.gte, lte: range.lte } }
  const deliveredWhere = { eliminado: false, fechaEntrega: { gte: range.gte, lte: range.lte } }
  const odtSelect = { id: true, estado: true, prioridad: true, clienteNombre: true, createdAt: true, fechaInicio: true, fechaEntregaCompromiso: true, plazo: true, fechaTermino: true, sucursalId: true, ordenId: true }
  const despachoSelect = {
    id: true, interno: true, contacto: true, comuna: true, transporte: true, tipoDespacho: true, createdAt: true, fechaInterno: true, fechaEntrega: true, parcial: true, tieneMulta: true, ordenId: true, odtId: true,
    trackingEventos: { where: { estado: 'Incidencia' }, select: { id: true, tipoIncidente: true, fechaEvento: true } },
  }

  const [backlog, ingresos, terminadas, despachosPendientes, despachosIngresados, entregas] = await Promise.all([
    findGerencialDetail(fastify.prisma.odt, { where: openWhere, select: odtSelect }, 'El backlog de Ã³rdenes de taller'),
    findGerencialDetail(fastify.prisma.odt, { where: createdWhere, select: odtSelect }, 'Las Ã³rdenes ingresadas del perÃ­odo'),
    findGerencialDetail(fastify.prisma.odt, { where: completedWhere, select: odtSelect }, 'Las Ã³rdenes terminadas del perÃ­odo'),
    findGerencialDetail(fastify.prisma.despacho, { where: openDispatchWhere, select: despachoSelect }, 'Los despachos pendientes'),
    findGerencialDetail(fastify.prisma.despacho, { where: dispatchCreatedWhere, select: despachoSelect }, 'Los despachos ingresados del período'),
    findGerencialDetail(fastify.prisma.despacho, { where: deliveredWhere, select: despachoSelect }, 'Las entregas del perÃ­odo'),
  ])
  const problem = [backlog, ingresos, terminadas, despachosPendientes, despachosIngresados, entregas].find(result => result.error)
  if (problem?.error) return problem

  const now = new Date()
  const dueDate = odt => odt.fechaEntregaCompromiso || odt.plazo || null
  const overdue = backlog.items.filter(odt => dueDate(odt) && new Date(dueDate(odt)) < now)
  const atRisk = backlog.items.filter(odt => {
    const due = dueDate(odt)
    if (!due) return false
    const days = (new Date(due).getTime() - now.getTime()) / 86_400_000
    return days >= 0 && days <= 7
  })
  const withoutCommitment = backlog.items.filter(odt => !dueDate(odt))
  const orderedBacklog = [...backlog.items].sort((a, b) => {
    const severity = item => dueDate(item) ? new Date(dueDate(item)).getTime() : Number.MAX_SAFE_INTEGER
    return severity(a) - severity(b) || new Date(a.createdAt) - new Date(b.createdAt)
  }).slice(0, 20)
  const despachoDelPeriodo = [...new Map([...despachosIngresados.items, ...entregas.items].map(item => [item.id, item])).values()]
  const despachosConIncidencia = despachoDelPeriodo.filter(item => item.trackingEventos?.length).length
  const despachosConMulta = despachoDelPeriodo.filter(item => item.tieneMulta).length
  const despachosParciales = despachoDelPeriodo.filter(item => item.parcial).length
  const tasaCierre = ingresos.count ? terminadas.count / ingresos.count : null

  return {
    meta: {
      generadoEn: new Date().toISOString(),
      estado: 'operacional_actual',
      mensajeEstado: 'El backlog, sus vencimientos y los despachos pendientes son estado actual al momento de consultar. El perÃ­odo seleccionado solo gobierna ingresos, terminaciones y entregas ocurridas en ese rango.',
      limiteDetalle: GERENCIAL_ANALYTICS_DETAIL_LIMIT,
    },
    filtros: { ...gerencialRangeMetadata(range, 'Actividad creada, terminada o entregada dentro del rango seleccionado.'), sucursalId: query.sucursalId || null },
    kpis: {
      backlog: backlog.count,
      vencidas: overdue.length,
      enRiesgo: atRisk.length,
      sinCompromiso: withoutCommitment.length,
      ingresos: ingresos.count,
      terminadas: terminadas.count,
      tasaCierre,
      cicloPromedioHoras: averageCycleHours(terminadas.items),
      despachosPendientes: despachosPendientes.count,
      despachosIngresados: despachosIngresados.count,
      entregas: entregas.count,
      relacionEntregasVsIngresos: despachosIngresados.count ? entregas.count / despachosIngresados.count : null,
      despachosConIncidencia,
      despachosConMulta,
      despachosParciales,
    },
    tendencia: operationalTrend({ ingresos: ingresos.items, terminadas: terminadas.items, despachosIngresados: despachosIngresados.items, entregas: entregas.items }),
    estadoOdt: tallyByLabel(backlog.items, item => item.estado),
    prioridadOdt: tallyByLabel(backlog.items, item => item.prioridad),
    antiguedadBacklog: operationalBacklogAging(backlog.items, now),
    backlog: orderedBacklog.map(odt => ({ ...odt, compromiso: dueDate(odt), diasAtraso: dueDate(odt) ? Math.floor((now.getTime() - new Date(dueDate(odt)).getTime()) / 86_400_000) : null })),
    despachos: despachosPendientes.items.sort((a, b) => new Date(a.fechaInterno || a.createdAt) - new Date(b.fechaInterno || b.createdAt)).slice(0, 20),
    analisisDespachos: {
      porTipo: tallyByLabel(despachosIngresados.items, item => item.tipoDespacho),
      porTransporte: tallyByLabel(despachosIngresados.items, item => item.transporte),
      porComuna: tallyByLabel(despachosIngresados.items, item => item.comuna),
    },
    brechas: [
      { codigo: 'despacho-exitoso', titulo: 'Despacho exitoso', detalle: 'Una entrega registrada no equivale a entrega exitosa. Para medir cumplimiento real faltan fecha comprometida estructurada y comprobante de recepción o conformidad.' },
      { codigo: 'backlog-historico', titulo: 'Backlog histÃ³rico', detalle: 'El sistema no conserva snapshots diarios de estado; no se puede reconstruir con certeza cuÃ¡ntas OT estaban abiertas en una fecha pasada.' },
      { codigo: 'cumplimiento', titulo: 'Cumplimiento de plazo', detalle: 'No se muestra una tasa OTIF: sin hitos histÃ³ricos de compromiso, entrega y conformidad, cualquier porcentaje serÃ­a engaÃ±oso.' },
    ],
  }
}

function isPendingCobranza(item) {
  return String(item?.estado || '').trim().toUpperCase() === 'PENDIENTE'
}

function cobranzaBucket(item, cutoff) {
  if (!item.fechaFactura) return 'Sin fecha'
  const days = Math.max(0, Math.floor((cutoff.getTime() - new Date(item.fechaFactura).getTime()) / 86_400_000))
  return days <= 30 ? '0-30 dÃ­as' : days <= 60 ? '31-60 dÃ­as' : days <= 90 ? '61-90 dÃ­as' : '91+ dÃ­as'
}

function cajaTotals(items) {
  return items.reduce((acc, item) => {
    const amount = Math.abs(Number(item.monto || 0))
    if (String(item.tipo || '').toLowerCase() === 'ingreso') acc.ingresos += amount
    if (String(item.tipo || '').toLowerCase() === 'egreso') acc.egresos += amount
    return acc
  }, { ingresos: 0, egresos: 0 })
}

function cajaTrend(items) {
  const days = new Map()
  items.forEach(item => {
    const label = gerencialDateLabel(item.fecha)
    if (label === 'Sin fecha') return
    const current = days.get(label) || { label, ingresos: 0, egresos: 0, neto: 0 }
    const amount = Math.abs(Number(item.monto || 0))
    if (String(item.tipo || '').toLowerCase() === 'ingreso') current.ingresos += amount
    if (String(item.tipo || '').toLowerCase() === 'egreso') current.egresos += amount
    current.neto = current.ingresos - current.egresos
    days.set(label, current)
  })
  return [...days.values()].sort((a, b) => a.label.localeCompare(b.label))
}

async function buildFinanzasGerencialV1(fastify, query = {}, user = null) {
  const range = buildDateRange(query.desde, query.hasta)
  if (range.error) return { error: range.error }
  if (!range.gte || !range.lte) return { error: 'Desde y hasta son obligatorios para el flujo financiero' }
  const previous = previousDateRange(range)
  const cobranzaScope = await buildCobranzaHistoricoScopeWhere(fastify.prisma, user)
  const buildCajaWhere = targetRange => withMovimientoSucursalScope(user, applyRange({ eliminado: false, NOT: { medioPago: { equals: 'Referencial', mode: 'insensitive' } } }, 'fecha', targetRange))
  const issuedWhere = mergeCobranzaWhere(applyRange({}, 'fechaFactura', range), cobranzaScope)
  const openCxcWhere = mergeCobranzaWhere({ fechaFactura: { lte: range.lte }, estado: { equals: 'PENDIENTE', mode: 'insensitive' } }, cobranzaScope)
  const cobranzaSelect = { id: true, interno: true, ndoc: true, cliente: true, rut: true, fechaFactura: true, valorFactura: true, monto: true, estado: true, ejecutiva: true }
  const cajaSelect = { id: true, tipo: true, monto: true, medioPago: true, fecha: true, referencia: true, ordenId: true, sucursalId: true }

  const [cajaActual, cajaAnterior, documentosPeriodo, cxcAbierta] = await Promise.all([
    findGerencialDetail(fastify.prisma.movimientoCaja, { where: buildCajaWhere(range), select: cajaSelect }, 'Los movimientos de caja del perÃ­odo'),
    findGerencialDetail(fastify.prisma.movimientoCaja, { where: buildCajaWhere(previous), select: cajaSelect }, 'Los movimientos de caja comparables'),
    findGerencialDetail(fastify.prisma.cobranzaHistorico, { where: issuedWhere, select: cobranzaSelect }, 'Los documentos de cobranza del perÃ­odo'),
    findGerencialDetail(fastify.prisma.cobranzaHistorico, { where: openCxcWhere, select: cobranzaSelect }, 'La cartera pendiente'),
  ])
  const problem = [cajaActual, cajaAnterior, documentosPeriodo, cxcAbierta].find(result => result.error)
  if (problem?.error) return problem

  const actual = cajaTotals(cajaActual.items)
  const anterior = cajaTotals(cajaAnterior.items)
  const neto = actual.ingresos - actual.egresos
  const netoAnterior = anterior.ingresos - anterior.egresos
  const cxcMonto = cxcAbierta.items.reduce((sum, item) => sum + Math.max(0, Number(item.valorFactura || 0)), 0)
  const aging = ['0-30 dÃ­as', '31-60 dÃ­as', '61-90 dÃ­as', '91+ dÃ­as', 'Sin fecha'].map(label => ({ label, monto: 0, documentos: 0 }))
  const agingByLabel = new Map(aging.map(item => [item.label, item]))
  cxcAbierta.items.forEach(item => {
    const target = agingByLabel.get(cobranzaBucket(item, range.lte))
    target.monto += Math.max(0, Number(item.valorFactura || 0))
    target.documentos += 1
  })
  const mediosPago = {}
  cajaActual.items.forEach(item => {
    if (String(item.tipo || '').toLowerCase() !== 'ingreso') return
    const label = item.medioPago || 'Sin medio de pago'
    mediosPago[label] = (mediosPago[label] || 0) + Math.abs(Number(item.monto || 0))
  })

  return {
    meta: {
      generadoEn: new Date().toISOString(),
      estado: 'operacional_no_contable',
      mensajeEstado: 'Flujo construido desde movimientos de caja y cartera registrada. No es saldo bancario, balance, utilidad ni margen neto contable.',
      limiteDetalle: GERENCIAL_ANALYTICS_DETAIL_LIMIT,
    },
    filtros: gerencialRangeMetadata(range, 'Flujo por fecha de movimiento de caja; documentos emitidos por fecha de factura.'),
    kpis: {
      ingresos: actual.ingresos,
      egresos: actual.egresos,
      flujoNeto: neto,
      documentosEmitidos: documentosPeriodo.count,
      carteraPendienteRegistrada: cxcMonto,
      documentosPendientes: cxcAbierta.count,
      comparativoFlujo: {
        rango: gerencialRangeMetadata(previous, 'Mismo nÃºmero de dÃ­as inmediatamente anteriores al inicio del perÃ­odo seleccionado.'),
        flujoNeto: netoAnterior,
        variacion: percentageChange(neto, netoAnterior),
      },
    },
    tendencia: cajaTrend(cajaActual.items),
    antiguedad: aging.filter(item => item.documentos > 0),
    mediosPago: Object.entries(mediosPago).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    cartera: cxcAbierta.items.sort((a, b) => new Date(a.fechaFactura || 0) - new Date(b.fechaFactura || 0)).slice(0, 20),
    brechas: [
      { codigo: 'saldo-bancario', titulo: 'Saldo bancario no conciliado', detalle: 'No se muestra saldo de banco ni disponibilidad real: esta fuente contiene movimientos ERP, no conciliaciÃ³n bancaria certificada.' },
      { codigo: 'pagos-parciales', titulo: 'Pagos parciales', detalle: 'La cartera pendiente usa el valor de documentos que continÃºan con estado PENDIENTE. Hasta normalizar abonos y notas de crÃ©dito no se debe interpretar como deuda neta definitiva.' },
    ],
  }
}

async function buildRiesgosGerencialV1(fastify, query = {}, user = null) {
  const range = buildDateRange(query.desde, query.hasta)
  if (range.error) return { error: range.error }
  if (!range.gte || !range.lte) return { error: 'Desde y hasta son obligatorios para riesgos' }
  const canReadStock = canReadModule(user, 'bodega')
  const canReadLicitaciones = canReadModule(user, 'licitaciones')
  const canReadSales = canReadModule(user, 'ventas')
  const [stock, licitaciones, lotes, excepciones] = await Promise.all([
    canReadStock ? buildStockGerencial(fastify, query) : null,
    canReadLicitaciones ? buildLicitacionesGerencial(fastify, query, user) : null,
    canReadStock ? findGerencialDetail(fastify.prisma.bodegaTallerLote, {
      where: { estadoCalidad: { notIn: ['aprobado', 'Aprobado', 'APROBADO'] }, cantidadDisponible: { gt: 0 } },
      select: { id: true, codigo: true, cantidadDisponible: true, estadoCalidad: true, observacion: true, recibidoAt: true, item: { select: { id: true, codigoInterno: true, nombre: true } } },
    }, 'Los lotes de calidad no aprobada') : null,
    canReadSales ? findGerencialDetail(fastify.prisma.excepcionAlerta, {
      where: { estado: { notIn: ['RESUELTA', 'CERRADA'] } },
      select: { id: true, estado: true, severidad: true, venceAt: true, createdAt: true, ordenId: true, regla: { select: { codigo: true, nombre: true, rolResponsable: true } } },
    }, 'Las alertas de excepciÃ³n abiertas') : null,
  ])
  const problem = [stock, licitaciones, lotes, excepciones].find(result => result?.error)
  if (problem?.error) return problem
  const now = new Date()
  const products = stock?.stockCritico?.productos || []
  const materials = stock?.stockCritico?.materiales || []
  const pendingBid = licitaciones?.byResultado?.pendiente || { count: 0, total: 0 }
  const overdueExceptions = (excepciones?.items || []).filter(item => item.venceAt && new Date(item.venceAt) < now)
  const withoutThreshold = canReadStock ? await Promise.all([
    fastify.prisma.producto.count({ where: { activo: true, stockCritico: { lte: 0 } } }),
    fastify.prisma.bodegaTaller.count({ where: { activo: true, stockCritico: { lte: 0 } } }),
  ]) : [0, 0]

  return {
    meta: {
      generadoEn: new Date().toISOString(),
      estado: 'riesgo_operacional_actual',
      mensajeEstado: 'Stock crÃ­tico, calidad de lotes y excepciones son estado actual. Las licitaciones se acotan por fecha de creaciÃ³n del perÃ­odo seleccionado.',
      limiteDetalle: GERENCIAL_ANALYTICS_DETAIL_LIMIT,
    },
    filtros: gerencialRangeMetadata(range, 'Movimientos y licitaciones del perÃ­odo; riesgos de stock, calidad y excepciones al momento de consultar.'),
    kpis: {
      productosCriticos: products.length,
      materialesCriticos: materials.length,
      lotesBloqueados: lotes?.count || 0,
      excepcionesAbiertas: excepciones?.count || 0,
      excepcionesVencidas: overdueExceptions.length,
      licitacionesPendientes: pendingBid.count,
      montoLicitacionesPendientes: pendingBid.total,
      umbralesSinConfigurar: withoutThreshold[0] + withoutThreshold[1],
    },
    stock: { productos: products.slice(0, 20), materiales: materials.slice(0, 20), movimientos: stock?.movimientos || null },
    lotes: (lotes?.items || []).sort((a, b) => String(a.estadoCalidad).localeCompare(String(b.estadoCalidad))).slice(0, 20),
    excepciones: (excepciones?.items || []).sort((a, b) => new Date(a.venceAt || 0) - new Date(b.venceAt || 0)).slice(0, 20),
    licitaciones: { pendiente: pendingBid, resumen: licitaciones?.byResultado || null },
    brechas: [
      { codigo: 'cobertura', titulo: 'Cobertura y quiebre proyectado', detalle: 'No se calcula dÃ­a de quiebre por SKU: faltan demanda pronosticada y lead time confiable por proveedor.' },
      { codigo: 'stock-snapshot', titulo: 'HistÃ³rico de stock', detalle: 'El stock crÃ­tico es la existencia actual; sin snapshots diarios no se puede asegurar la fecha histÃ³rica en que ocurriÃ³ un quiebre.' },
    ],
  }
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

// Contrato estable para la portada gerencial. Antes el navegador coordinaba cinco
// endpoints de KPI y siete listados al montar la vista; eso multiplicaba round trips,
// estados de carga y posibilidades de obtener cortes distintos. Este resumen conserva
// la autorizacion por seccion y calcula solo lo que el usuario puede leer.
async function buildGerencialResumen(fastify, query = {}, user = null, { includeComparison = true } = {}) {
  const range = buildDateRange(query.desde, query.hasta)
  if (range.error) return { error: range.error }

  const sections = getGerencialSections(user)
  const builders = [
    ['ventas', sections.ventas, () => buildVentasGerenciales(fastify, query, user, { includeComparison })],
    ['cobranzaCaja', sections.cobranzaCaja, () => buildCobranzaCajaGerencial(fastify, query, user)],
    ['stock', sections.stock, () => buildStockGerencial(fastify, query, user)],
    ['licitaciones', sections.licitaciones, () => buildLicitacionesGerencial(fastify, query, user)],
    ['operaciones', sections.operaciones, () => buildOperacionesGerencial(fastify, query, user)],
  ].filter(([, allowed]) => allowed)

  const results = await Promise.all(builders.map(async ([name,, build]) => [name, await build()]))
  const invalid = results.find(([, report]) => report?.error)
  if (invalid) return { error: invalid[1].error }

  return {
    meta: {
      version: 'gerencial.v1',
      generadoEn: new Date().toISOString(),
      estado: 'operacional_no_certificado',
      // Este sello impide presentar el resumen como un balance o resultado financiero
      // mientras Finanzas no apruebe la definicion de ingresos, CxC y costos.
      mensajeEstado: 'Datos operacionales sujetos a conciliacion financiera.',
    },
    filtros: {
      desde: query.desde || null,
      hasta: query.hasta || null,
      tipo: query.tipo || null,
      vendedor: query.vendedor || null,
      cliente: query.cliente || null,
      periodo: query.periodo || 'mes',
    },
    secciones: Object.fromEntries(results),
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
    const duplicadas = Number(ventas.fuentes?.licitaciones?.duplicadasConOrden || 0)
    if (duplicadas) {
      pushGerencialRow(rows, 'Ventas', 'Licitaciones excluidas por duplicado', duplicadas, 'Ya estaban representadas por una orden interna del mismo resultado')
    }
    for (const aviso of ventas.advertencias || []) {
      pushGerencialRow(rows, 'Advertencia de datos', aviso.tipo || 'advertencia', aviso.cantidad || 0, aviso.detalle || '')
    }
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
  styleGerencialWorksheet(resumen, 'Reportería gerencial Plastimar')
  resumen.getCell('A2').value = `Período: ${query.desde || 'Inicio'} a ${query.hasta || 'Hoy'}`
  resumen.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } }
  resumen.getRow(3).values = ['Sección', 'Indicador', 'Valor', 'Detalle']
  const rows = buildGerencialExportRows(reportes, query)
  rows.forEach(row => resumen.addRow([row.seccion, row.indicador, row.valor, row.detalle]))
  resumen.getColumn(3).numFmt = '#,##0'
  resumen.autoFilter = { from: 'A3', to: `D${Math.max(3, rows.length + 3)}` }

  const ventas = reportes.ventas
  if (ventas) {
    const sheet = workbook.addWorksheet('Comercial')
    styleGerencialWorksheet(sheet, 'Comercial')
    sheet.getRow(3).values = ['Indicador', 'Valor', 'Período anterior', 'Variación']
    const previous = ventas.comparativo?.periodoAnterior || {}
    sheet.addRows([
      ['Ventas del período', ventas.total || 0, previous.total || 0, ventas.comparativo?.variacionVentas ?? null],
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
      ['OT en riesgo (7 días)', operaciones.taller?.enRiesgo || 0],
      ['Despachos pendientes', operaciones.despachos?.pendientes || 0],
      ['Despachos vencidos', operaciones.despachos?.vencidos || 0],
    ])
  }

  const riesgos = workbook.addWorksheet('Finanzas y riesgos')
  styleGerencialWorksheet(riesgos, 'Finanzas y riesgos')
  riesgos.getRow(3).values = ['Indicador', 'Valor', 'Detalle']
  const cobranza = reportes.cobranzaCaja
  if (cobranza) {
    riesgos.addRow(['CxC pendiente', cobranza.cuentasPorCobrar?.porCobrar || 0, 'Cuentas pendientes del período'])
    Object.entries(cobranza.cuentasPorCobrar?.antiguedad || {}).forEach(([label, value]) => riesgos.addRow([`CxC ${label} días`, value.total || 0, `${value.count || 0} documentos`]))
    riesgos.addRow(['Caja neta', Number(cobranza.caja?.ingresos || 0) - Number(cobranza.caja?.egresos || 0), 'Ingresos menos egresos'])
  }
  if (reportes.stock) riesgos.addRow(['Stock crítico', Number(reportes.stock.stockCritico?.totales?.productosCriticos || 0) + Number(reportes.stock.stockCritico?.totales?.materialesCriticos || 0), 'Productos y materiales'])
  if (reportes.licitaciones) riesgos.addRow(['Licitaciones pendientes', reportes.licitaciones.byResultado?.pendiente?.count || 0, 'Pendientes de resolución'])
  riesgos.getColumn(2).numFmt = '#,##0'
  return workbook.xlsx.writeBuffer()
}

async function buildComercialXlsx(reporte, query = {}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Plastimar Sisgestion'
  workbook.created = new Date()

  const resumen = workbook.addWorksheet('Control comercial')
  styleGerencialWorksheet(resumen, 'Centro de control comercial')
  resumen.getCell('A2').value = `Período: ${query.desde || 'Inicio'} a ${query.hasta || 'Hoy'}`
  resumen.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } }
  resumen.getRow(3).values = ['Indicador', 'Valor', 'Detalle']
  const filtrosAplicados = [
    `Período: ${query.desde || 'Inicio'} a ${query.hasta || 'Hoy'}`,
    `Tipo: ${query.tipo || 'Todos'}`,
    `Vendedor: ${query.vendedor || 'Todos'}`,
    `Cliente/RUT: ${query.cliente || 'Todos'}`,
    `Sucursal: ${query.sucursalId || 'Todas'}`,
  ].join(' · ')
  resumen.getCell('A2').value = filtrosAplicados
  const kpis = reporte.kpis || {}
  const margin = kpis.margen || {}
  const inventory = kpis.inventario || {}
  resumen.addRows([
    ['Ventas de órdenes', kpis.ventas || 0, `${kpis.ordenes || 0} órdenes`],
    ['Unidades vendidas', kpis.unidades || 0, 'Unidades en órdenes internas'],
    ['Ticket promedio', kpis.ticketPromedio || 0, 'Ventas / órdenes'],
    ['Clientes únicos', kpis.clientesUnicos || 0, `${kpis.clientesRecurrentesPeriodo || 0} recurrentes en el período`],
    ['Variación vs período anterior', kpis.comparativos?.periodoAnterior?.variacionVentas ?? null, `Base: ${kpis.comparativos?.periodoAnterior?.ventas || 0}`],
    ['Variación vs mismo período año anterior', kpis.comparativos?.mismoPeriodoAnoAnterior?.variacionVentas ?? null, `Base: ${kpis.comparativos?.mismoPeriodoAnoAnterior?.ventas || 0}`],
  ])
  if (margin.visible && Number(margin.coberturaVentasPct || 0) > 0) {
    resumen.addRow(['Margen estimado', margin.monto || 0, `Cobertura de ventas: ${Math.round(Number(margin.coberturaVentasPct || 0) * 100)}%`])
    resumen.addRow(['Margen estimado %', margin.pct ?? null, 'No es margen neto contable'])
  }
  if (inventory.visible && Number(inventory.coberturaValorizacionPct || 0) > 0) {
    resumen.addRow(['Valorización inventario estimada', inventory.valorizacionEstimada || 0, `Cobertura: ${Math.round(Number(inventory.coberturaValorizacionPct || 0) * 100)}%`])
  }
  resumen.getColumn(2).numFmt = '#,##0'
  ;[8, 9].forEach(row => { if (resumen.getCell(`A${row}`).value?.includes?.('Variación') || resumen.getCell(`A${row}`).value?.includes?.('%')) resumen.getCell(`B${row}`).numFmt = '0.0%;[Red]-0.0%' })

  const addRowsSheet = (name, title, rows, columns) => {
    const sheet = workbook.addWorksheet(name)
    styleGerencialWorksheet(sheet, title)
    sheet.getRow(3).values = columns.map(column => column.label)
    rows.forEach(row => sheet.addRow(columns.map(column => row[column.key] ?? null)))
    sheet.columns.forEach(column => { column.width = 22 })
    return sheet
  }
  const canales = addRowsSheet('Canales', 'Ventas por canal / tipo', reporte.rankings?.canales || [], [
    { key: 'label', label: 'Canal / tipo' }, { key: 'ventas', label: 'Ventas' }, { key: 'ordenes', label: 'Órdenes' }, { key: 'unidades', label: 'Unidades' },
  ])
  canales.getColumn(2).numFmt = '#,##0'
  const vendedores = addRowsSheet('Vendedores', 'Desempeño por vendedor', reporte.rankings?.vendedores || [], [
    { key: 'label', label: 'Vendedor' }, { key: 'ventas', label: 'Ventas' }, { key: 'ordenes', label: 'Órdenes' }, { key: 'unidades', label: 'Unidades' },
  ])
  vendedores.getColumn(2).numFmt = '#,##0'
  const productos = addRowsSheet('Productos', 'Productos con mayor salida', reporte.rankings?.productos || [], [
    { key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Producto' }, { key: 'categoria', label: 'Categoría' }, { key: 'ventas', label: 'Ventas' }, { key: 'unidades', label: 'Unidades' }, { key: 'margen', label: 'Margen estimado' }, { key: 'margenPct', label: 'Margen %' },
  ])
  productos.getColumn(4).numFmt = '#,##0'
  productos.getColumn(6).numFmt = '#,##0'
  productos.getColumn(7).numFmt = '0.0%;[Red]-0.0%'
  if (reporte.inventario?.sinVentaPeriodo?.length) {
    const stock = addRowsSheet('Stock sin venta', 'Inventario sin venta en el período', reporte.inventario.sinVentaPeriodo, [
      { key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Producto' }, { key: 'stock', label: 'Stock' }, { key: 'valor', label: 'Valor estimado' },
    ])
    stock.getColumn(4).numFmt = '#,##0'
  }
  return workbook.xlsx.writeBuffer()
}

async function buildGerencialV1Xlsx({ name, title, reporte, summaryRows = [], sheets = [] }) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Plastimar Sisgestion'
  workbook.created = new Date()
  const resumen = workbook.addWorksheet('Resumen')
  styleGerencialWorksheet(resumen, title)
  resumen.getCell('A2').value = `Período: ${reporte.filtros?.desde || 'Inicio'} a ${reporte.filtros?.hasta || 'Hoy'}`
  resumen.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } }
  resumen.getRow(3).values = ['Indicador', 'Valor', 'Detalle']
  summaryRows.forEach(row => resumen.addRow(row))
  resumen.addRow([])
  resumen.addRow(['Corte y fuente', reporte.meta?.mensajeEstado || '', ''])
  resumen.getColumn(2).numFmt = '#,##0'
  resumen.getColumn(1).width = 30
  resumen.getColumn(2).width = 24
  resumen.getColumn(3).width = 54

  sheets.forEach(({ sheetName, sheetTitle, columns, rows, moneyColumns = [], percentColumns = [] }) => {
    const sheet = workbook.addWorksheet(sheetName)
    styleGerencialWorksheet(sheet, sheetTitle)
    sheet.getRow(3).values = columns.map(column => column.label)
    rows.forEach(row => sheet.addRow(columns.map(column => row[column.key] ?? null)))
    sheet.columns.forEach((column, index) => { column.width = columns[index]?.width || 22 })
    moneyColumns.forEach(index => { sheet.getColumn(index).numFmt = '#,##0' })
    percentColumns.forEach(index => { sheet.getColumn(index).numFmt = '0.0%;[Red]-0.0%' })
    sheet.autoFilter = { from: 'A3', to: `${String.fromCharCode(64 + columns.length)}${Math.max(3, rows.length + 3)}` }
  })
  return workbook.xlsx.writeBuffer()
}

function buildOperacionGerencialXlsx(reporte) {
  const kpis = reporte.kpis || {}
  return buildGerencialV1Xlsx({
    name: 'operacion', title: 'Control operacional', reporte,
    summaryRows: [
      ['Backlog actual', kpis.backlog || 0, 'OT no cerradas al momento de consultar'],
      ['OT vencidas', kpis.vencidas || 0, 'Contra compromiso actual'],
      ['OT en riesgo', kpis.enRiesgo || 0, 'Vencen dentro de 7 días'],
      ['Ingresos del período', kpis.ingresos || 0, 'OT creadas en el rango'],
      ['Terminadas del período', kpis.terminadas || 0, 'Por fecha de término'],
      ['Tasa de cierre', kpis.tasaCierre == null ? 'Sin base' : `${(kpis.tasaCierre * 100).toFixed(1)}%`, 'Terminadas / OT ingresadas; no es OTIF'],
      ['Ciclo promedio OT (horas)', kpis.cicloPromedioHoras ?? null, 'Inicio o creación hasta término'],
      ['Despachos pendientes', kpis.despachosPendientes || 0, 'Estado actual'],
      ['Despachos ingresados', kpis.despachosIngresados || 0, 'Creados en el período'],
      ['Entregas del período', kpis.entregas || 0, 'Por fecha de entrega'],
      ['Incidencias de despacho', kpis.despachosConIncidencia || 0, `${kpis.despachosConMulta || 0} con multa · ${kpis.despachosParciales || 0} parciales`],
    ],
    sheets: [
      { sheetName: 'Backlog OT', sheetTitle: 'Órdenes de taller abiertas', columns: [
        { key: 'id', label: 'OT', width: 12 }, { key: 'clienteNombre', label: 'Cliente', width: 34 }, { key: 'estado', label: 'Estado' }, { key: 'prioridad', label: 'Prioridad' }, { key: 'compromiso', label: 'Compromiso' }, { key: 'diasAtraso', label: 'Días atraso' },
      ], rows: reporte.backlog || [] },
      { sheetName: 'Despachos', sheetTitle: 'Despachos pendientes actuales', columns: [
        { key: 'interno', label: 'N° interno' }, { key: 'contacto', label: 'Contacto', width: 28 }, { key: 'comuna', label: 'Comuna' }, { key: 'transporte', label: 'Transporte' }, { key: 'fechaInterno', label: 'Ingreso' },
      ], rows: reporte.despachos || [] },
      { sheetName: 'Distribución despacho', sheetTitle: 'Despachos ingresados por segmento', columns: [
        { key: 'dimension', label: 'Dimensión' }, { key: 'label', label: 'Valor' }, { key: 'value', label: 'Despachos' },
      ], rows: [
        ...(reporte.analisisDespachos?.porTipo || []).map(row => ({ ...row, dimension: 'Tipo / canal' })),
        ...(reporte.analisisDespachos?.porTransporte || []).map(row => ({ ...row, dimension: 'Transporte' })),
        ...(reporte.analisisDespachos?.porComuna || []).map(row => ({ ...row, dimension: 'Comuna' })),
      ] },
    ],
  })
}

function buildFinanzasGerencialXlsx(reporte) {
  const kpis = reporte.kpis || {}
  return buildGerencialV1Xlsx({
    name: 'finanzas', title: 'Flujo y cobranza operacional', reporte,
    summaryRows: [
      ['Ingresos de caja', kpis.ingresos || 0, 'Movimientos registrados en el período'],
      ['Egresos de caja', kpis.egresos || 0, 'Movimientos registrados en el período'],
      ['Flujo neto', kpis.flujoNeto || 0, 'Ingresos menos egresos; no es saldo bancario'],
      ['CxC pendiente registrada', kpis.carteraPendienteRegistrada || 0, `${kpis.documentosPendientes || 0} documentos con estado pendiente`],
      ['Documentos emitidos', kpis.documentosEmitidos || 0, 'Fecha factura dentro del período'],
      ['Flujo período anterior', kpis.comparativoFlujo?.flujoNeto || 0, kpis.comparativoFlujo?.rango?.criterio || 'Período comparable'],
    ],
    sheets: [
      { sheetName: 'Antigüedad CxC', sheetTitle: 'Cartera pendiente por antigüedad', columns: [
        { key: 'label', label: 'Tramo' }, { key: 'monto', label: 'Monto' }, { key: 'documentos', label: 'Documentos' },
      ], rows: reporte.antiguedad || [], moneyColumns: [2] },
      { sheetName: 'Cartera pendiente', sheetTitle: 'Documentos pendientes más antiguos', columns: [
        { key: 'interno', label: 'Interno' }, { key: 'ndoc', label: 'Documento' }, { key: 'cliente', label: 'Cliente', width: 34 }, { key: 'rut', label: 'RUT' }, { key: 'fechaFactura', label: 'Factura' }, { key: 'valorFactura', label: 'Valor' }, { key: 'ejecutiva', label: 'Ejecutiva' },
      ], rows: reporte.cartera || [], moneyColumns: [6] },
      { sheetName: 'Medios de pago', sheetTitle: 'Ingresos por medio de pago', columns: [
        { key: 'label', label: 'Medio de pago' }, { key: 'value', label: 'Ingresos' },
      ], rows: reporte.mediosPago || [], moneyColumns: [2] },
    ],
  })
}

function buildRiesgosGerencialXlsx(reporte) {
  const kpis = reporte.kpis || {}
  return buildGerencialV1Xlsx({
    name: 'riesgos', title: 'Riesgos operacionales', reporte,
    summaryRows: [
      ['Productos críticos', kpis.productosCriticos || 0, 'Stock actual bajo umbral'],
      ['Materiales críticos', kpis.materialesCriticos || 0, 'Bodega de taller actual'],
      ['Lotes no aprobados', kpis.lotesBloqueados || 0, 'Con disponibilidad'],
      ['Excepciones abiertas', kpis.excepcionesAbiertas || 0, `${kpis.excepcionesVencidas || 0} vencidas`],
      ['Licitaciones pendientes', kpis.licitacionesPendientes || 0, 'Pendientes de resolución'],
      ['Umbrales sin configurar', kpis.umbralesSinConfigurar || 0, 'SKUs sin stock crítico'],
    ],
    sheets: [
      { sheetName: 'Productos críticos', sheetTitle: 'Productos con stock crítico', columns: [
        { key: 'codigoInterno', label: 'Código' }, { key: 'nombre', label: 'Producto', width: 36 }, { key: 'stock', label: 'Stock' }, { key: 'stockCritico', label: 'Umbral' },
      ], rows: reporte.stock?.productos || [] },
      { sheetName: 'Materiales críticos', sheetTitle: 'Materiales de taller críticos', columns: [
        { key: 'codigoInterno', label: 'Código' }, { key: 'nombre', label: 'Material', width: 36 }, { key: 'stock', label: 'Stock' }, { key: 'stockCritico', label: 'Umbral' },
      ], rows: reporte.stock?.materiales || [] },
      { sheetName: 'Lotes calidad', sheetTitle: 'Lotes de calidad no aprobada', columns: [
        { key: 'codigo', label: 'Lote' }, { key: 'estadoCalidad', label: 'Estado calidad' }, { key: 'cantidadDisponible', label: 'Disponible' }, { key: 'observacion', label: 'Observación', width: 40 }, { key: 'recibidoAt', label: 'Recepción' },
      ], rows: (reporte.lotes || []).map(item => ({ ...item, material: item.item?.nombre || '' })) },
      { sheetName: 'Excepciones', sheetTitle: 'Excepciones abiertas', columns: [
        { key: 'id', label: 'ID' }, { key: 'severidad', label: 'Severidad' }, { key: 'estado', label: 'Estado' }, { key: 'venceAt', label: 'Vence' }, { key: 'ordenId', label: 'Orden' },
      ], rows: reporte.excepciones || [] },
    ],
  })
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

  fastify.get('/gerencial/v1/resumen', {
    preHandler: [fastify.authenticate, fastify.rbac('reportes', 'read')],
  }, async (request, reply) => {
    const reporte = await buildGerencialResumen(fastify, request.query, request.user)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    if (!Object.keys(reporte.secciones).length) return reply.code(403).send({ error: 'Sin permisos para ver indicadores gerenciales' })
    return reporte
  })

  // Reporte stock crítico (productos + materiales bodega taller) — G6
  // Solo se entrega el mínimo necesario para filtrar: catálogo canónico y
  // responsables comerciales activos. No expone el módulo de usuarios ni
  // correos, credenciales o permisos individuales.
  fastify.get('/gerencial/v1/filtros', {
    preHandler: [fastify.authenticate, fastify.rbac('reportes', 'read')],
  }, async request => {
    const canReadSales = canReadModule(request.user, 'ventas')
    const [vendedores, sucursales] = canReadSales ? await Promise.all([
      fastify.prisma.user.findMany({
        where: { activo: true, role: 'vendedor' },
        select: { id: true, nombre: true, codigoVendedor: true },
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      }),
      fastify.prisma.sucursal.findMany({
        where: { activo: true },
        select: { id: true, nombre: true, comuna: true },
        orderBy: { nombre: 'asc' },
      }),
    ]) : [[], []]

    return { tiposVenta: TIPO_VENTA_VALUES, vendedores, sucursales }
  })

  // Centro de control comercial: se carga bajo demanda desde la pestaña
  // Comercial para no imponer consultas de detalle al abrir la portada.
  fastify.get('/gerencial/v1/comercial', {
    preHandler: [fastify.authenticate, fastify.rbac('reportes', 'read')],
  }, async (request, reply) => {
    if (!canReadModule(request.user, 'ventas')) return reply.code(403).send({ error: 'Sin permiso para indicadores comerciales' })
    const reporte = await buildComercialGerencial(fastify, request.query, request.user)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return reporte
  })

  fastify.get('/gerencial/v1/operacion', {
    preHandler: [fastify.authenticate, fastify.rbac('reportes', 'read')],
  }, async (request, reply) => {
    if (!canReadAll(request.user, ['taller', 'despacho'])) return reply.code(403).send({ error: 'Sin permiso para indicadores operacionales' })
    const reporte = await buildOperacionesGerencialV1(fastify, request.query, request.user)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return reporte
  })

  fastify.get('/gerencial/v1/finanzas', {
    preHandler: [fastify.authenticate, fastify.rbac('reportes', 'read')],
  }, async (request, reply) => {
    if (!canReadAll(request.user, ['caja', 'cobranza'])) return reply.code(403).send({ error: 'Sin permiso para indicadores financieros' })
    const reporte = await buildFinanzasGerencialV1(fastify, request.query, request.user)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return reporte
  })

  fastify.get('/gerencial/v1/riesgos', {
    preHandler: [fastify.authenticate, fastify.rbac('reportes', 'read')],
  }, async (request, reply) => {
    if (![canReadModule(request.user, 'bodega'), canReadModule(request.user, 'licitaciones'), canReadModule(request.user, 'ventas')].some(Boolean)) return reply.code(403).send({ error: 'Sin permiso para indicadores de riesgo' })
    const reporte = await buildRiesgosGerencialV1(fastify, request.query, request.user)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return reporte
  })

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
    const resumen = await buildGerencialResumen(fastify, request.query, request.user, { includeComparison: false })
    if (resumen.error) return reply.code(400).send({ error: resumen.error })
    const reportes = resumen.secciones

    const rows = buildGerencialExportRows(reportes, request.query)
    if (rows.length <= 3) return reply.code(403).send({ error: 'Sin permisos para exportar reportes gerenciales' })
    return sendExport(reply, {
      archivo: request.query?.archivo,
      nombre: `reporte_gerencial_${new Date().toISOString().slice(0, 10)}`,
      rows: rows,
      columns: [
      { key: 'seccion', label: 'Seccion' },
      { key: 'indicador', label: 'Indicador' },
      { key: 'valor', label: 'Valor' },
      { key: 'detalle', label: 'Detalle' },
    ],
    })
  })

  fastify.get('/export/gerencial.xlsx', {
    preHandler: [fastify.authenticate, fastify.rbac('reportes', 'read')],
  }, async (request, reply) => {
    const resumen = await buildGerencialResumen(fastify, request.query, request.user, { includeComparison: false })
    if (resumen.error) return reply.code(400).send({ error: resumen.error })
    const reportes = resumen.secciones
    if (!Object.keys(reportes).length) return reply.code(403).send({ error: 'Sin permisos para exportar reportes gerenciales' })
    const buffer = await buildGerencialXlsx(reportes, request.query)
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="reporte_gerencial_${new Date().toISOString().slice(0, 10)}.xlsx"`)
      .send(Buffer.from(buffer))
  })

  fastify.get('/export/comercial.xlsx', {
    preHandler: [fastify.authenticate, fastify.rbac('reportes', 'read')],
  }, async (request, reply) => {
    if (!canReadModule(request.user, 'ventas')) return reply.code(403).send({ error: 'Sin permiso para exportar análisis comercial' })
    const reporte = await buildComercialGerencial(fastify, request.query, request.user)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    const buffer = await buildComercialXlsx(reporte, request.query)
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="control_comercial_${new Date().toISOString().slice(0, 10)}.xlsx"`)
      .send(Buffer.from(buffer))
  })

  fastify.get('/export/operacion.xlsx', {
    preHandler: [fastify.authenticate, fastify.rbac('reportes', 'read')],
  }, async (request, reply) => {
    if (!canReadAll(request.user, ['taller', 'despacho'])) return reply.code(403).send({ error: 'Sin permiso para exportar análisis operacional' })
    const reporte = await buildOperacionesGerencialV1(fastify, request.query, request.user)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    const buffer = await buildOperacionGerencialXlsx(reporte)
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="control_operacional_${new Date().toISOString().slice(0, 10)}.xlsx"`)
      .send(Buffer.from(buffer))
  })

  fastify.get('/export/finanzas.xlsx', {
    preHandler: [fastify.authenticate, fastify.rbac('reportes', 'read')],
  }, async (request, reply) => {
    if (!canReadAll(request.user, ['caja', 'cobranza'])) return reply.code(403).send({ error: 'Sin permiso para exportar análisis financiero' })
    const reporte = await buildFinanzasGerencialV1(fastify, request.query, request.user)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    const buffer = await buildFinanzasGerencialXlsx(reporte)
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="flujo_cobranza_${new Date().toISOString().slice(0, 10)}.xlsx"`)
      .send(Buffer.from(buffer))
  })

  fastify.get('/export/riesgos.xlsx', {
    preHandler: [fastify.authenticate, fastify.rbac('reportes', 'read')],
  }, async (request, reply) => {
    if (![canReadModule(request.user, 'bodega'), canReadModule(request.user, 'licitaciones'), canReadModule(request.user, 'ventas')].some(Boolean)) return reply.code(403).send({ error: 'Sin permiso para exportar riesgos' })
    const reporte = await buildRiesgosGerencialV1(fastify, request.query, request.user)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    const buffer = await buildRiesgosGerencialXlsx(reporte)
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="riesgos_operacionales_${new Date().toISOString().slice(0, 10)}.xlsx"`)
      .send(Buffer.from(buffer))
  })

  fastify.get('/export/productos', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request, reply) => {
    const productos = await buildPreciosExport(fastify, request.query)
    if (productos.error) return reply.code(400).send({ error: productos.error })
    return sendExport(reply, {
      archivo: request.query?.archivo,
      nombre: `productos_${new Date().toISOString().slice(0, 10)}`,
      rows: productos,
      columns: [
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
    ],
    })
  })

  fastify.get('/export/clientes', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'read')],
  }, async (request, reply) => {
    const clientes = await buildClientesExport(fastify, request.query)
    return sendExport(reply, {
      archivo: request.query?.archivo,
      nombre: `clientes_${new Date().toISOString().slice(0, 10)}`,
      rows: clientes,
      columns: [
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
    ],
    })
  })

  fastify.get('/export/proveedores', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'read')],
  }, async (request, reply) => {
    const proveedores = await fastify.prisma.proveedor.findMany({
      where: buildProveedorWhere(request.query),
      orderBy: proveedorOrderBy(),
    })
    return sendExport(reply, {
      archivo: request.query?.archivo,
      nombre: `proveedores_${new Date().toISOString().slice(0, 10)}`,
      rows: proveedores,
      columns: [
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
    ],
    })
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
    return sendExport(reply, {
      archivo: request.query?.archivo,
      nombre: `ventas_${new Date().toISOString().slice(0, 10)}`,
      rows: rows,
      columns: [
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
    ],
    })
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
    return sendExport(reply, {
      archivo: request.query?.archivo,
      nombre: `cobranza_historico_${new Date().toISOString().slice(0, 10)}`,
      rows: items,
      columns: [
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
    ],
    })
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
    return sendExport(reply, {
      archivo: request.query?.archivo,
      nombre: `cobranza_activa_${new Date().toISOString().slice(0, 10)}`,
      rows: rows,
      columns: [
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
    ],
    })
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
    return sendExport(reply, {
      archivo: request.query?.archivo,
      nombre: `caja_${new Date().toISOString().slice(0, 10)}`,
      rows: movs,
      columns: [
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
    ],
    })
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
    return sendExport(reply, {
      archivo: request.query?.archivo,
      nombre: `odts_${new Date().toISOString().slice(0, 10)}`,
      rows: rows,
      columns: [
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
    ],
    })
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
    return sendExport(reply, {
      archivo: request.query?.archivo,
      nombre: `bodega_taller_${new Date().toISOString().slice(0, 10)}`,
      rows: items,
      columns: [
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
    ],
    })
  })
}
