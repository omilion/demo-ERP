import { rowsToCsv, sendCsv } from '../../utils/csv.js'
import { can } from '../../middleware/rbac.js'
import { normalizeTipoMovimiento, parseDate, parsePositiveInt } from '../operational-utils.js'
import { buildOrdenScopeWhere, getPrimerRegistroInterno, mergeWhere, parseOrdenScope } from '../historico/corte.js'
import { attachOperarios } from '../odts/operations.js'
import { computeEstado } from '../productos/helpers.js'
import { getUserSucursalId, withMovimientoSucursalScope } from '../caja/scope.js'
import { attachClientes, computeDiscountAmount, computeTotal } from '../ventas/helpers.js'
import { buildCobranzaHistoricoScopeWhere, mergeCobranzaWhere } from '../cobranza/scope.js'
import { attachConsultaPreciosData } from '../productos/pricing.js'
import { buildProveedorWhere, proveedorOrderBy } from '../proveedores/helpers.js'

const VENTA_DIRECTA_TIPOS = ['Venta sala', 'Venta directa', 'Venta Sala', 'Venta Directa', 'Normal']

function buildDateRange(desde, hasta) {
  const gte = desde ? parseDate(desde) : null
  const lte = hasta ? parseDate(hasta, true) : null
  if ((desde && !gte) || (hasta && !lte)) return { error: 'Rango de fechas invalido' }
  return { gte, lte }
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
  return computeTotal(orden.items || [], orden.descuentoPct, orden.cargos || [])
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
  const { bodega, search, codigoBarra, codigoInterno, nombre, visibleWeb, destacadoWeb, categoria, categoriaId, subcategoriaId, subcategoria, proveedor, proveedorId, idMarco, ubicacion, estadoInventario, estado } = query
  const where = { activo: true }
  const andFilters = []
  if (bodega && !['Inventario', 'Taller'].includes(bodega)) return { error: 'bodega debe ser Inventario o Taller' }
  if (bodega) where.bodega = bodega
  if (visibleWeb === 'true') where.visibleWeb = true
  else if (visibleWeb === 'false') where.visibleWeb = false
  if (destacadoWeb === 'true') where.destacadoWeb = true
  if (categoriaId) {
    const parsedCategoriaId = Number.parseInt(categoriaId, 10)
    if (Number.isNaN(parsedCategoriaId)) return { error: 'categoriaId invalido' }
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
    if (Number.isNaN(parsedSubcategoriaId)) return { error: 'subcategoriaId invalido' }
    where.subcategoriaId = parsedSubcategoriaId
  }
  else if (subcategoria) where.subcategoria = { is: { nombre: { contains: subcategoria, mode: 'insensitive' } } }
  if (proveedorId) {
    const parsedProveedorId = Number.parseInt(proveedorId, 10)
    if (Number.isNaN(parsedProveedorId)) return { error: 'proveedorId invalido' }
    where.proveedorId = parsedProveedorId
  } else if (proveedor) where.proveedor = { contains: proveedor, mode: 'insensitive' }
  if (idMarco) where.idMarco = { contains: idMarco, mode: 'insensitive' }
  if (ubicacion) where.ubicacion = { contains: ubicacion, mode: 'insensitive' }
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
  if (query.proveedorId && Number.isNaN(providerFilterId)) return { error: 'proveedorId invalido' }
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
    .filter(p => query.estado === 'critico' ? p.estado === 'CrÃ­tico' : true)
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

export function buildOdtExportWhere(query = {}) {
  const { tipo, estado, operarioId, search, fechaDesde, fechaHasta, includeEliminados } = query
  const where = {}
  if (includeEliminados !== 'true') where.eliminado = false
  if (tipo) where.tipo = tipo
  if (estado) where.estado = estado
  if (operarioId) {
    const parsedOperarioId = parsePositiveInt(operarioId)
    if (!parsedOperarioId) return { error: 'Operario invalido' }
    where.operarioId = parsedOperarioId
  }
  const range = buildDateRange(fechaDesde, fechaHasta)
  if (range.error) return { error: range.error }
  applyRange(where, 'createdAt', range)
  if (search) {
    const isNum = /^\d+$/.test(search.trim())
    where.OR = [
      { clienteNombre: { contains: search, mode: 'insensitive' } },
      { descripcion: { contains: search, mode: 'insensitive' } },
      ...(isNum ? [{ id: parseInt(search, 10) }] : []),
    ]
  }
  return { where }
}

export async function buildVentasExportWhere(fastify, query = {}) {
  const { desde, hasta, tipo, rut, nInterno, oc, guia, odt, estadoPago, estadoEntrega, search, scope: scopeParam } = query
  const scope = parseOrdenScope(scopeParam, 'operacional')
  if (!scope) return { error: 'scope invalido' }
  let where = { eliminada: false }
  if (desde || hasta) {
    const range = buildDateRange(desde, hasta)
    if (range.error) return { error: range.error }
    applyRange(where, 'createdAt', range)
  }
  if (tipo === 'venta-sala' || tipo === 'venta-directa') where.tipo = { in: ['Venta sala', 'Venta directa'] }
  else if (tipo === 'convenio-marco') where.tipo = 'Convenio Marco'
  else if (tipo === 'licitacion-convenio') where.tipo = { in: ['Licitación', 'Convenio Marco'] }
  else if (tipo === 'venta-web') where.tipo = 'Venta Web'
  else if (tipo && tipo !== 'licitacion') where.tipo = tipo
  else if (tipo === 'licitacion') where.tipo = 'Licitación'
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

async function buildVentasGerenciales(fastify, query, user) {
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
  else if (tipoText === 'convenio-marco' || tipoText === 'convenio') ordenWhere.tipo = 'Convenio Marco'
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

  return {
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
}

export default async function reportesRoutes(fastify) {
  fastify.get('/gerencial/ventas', {
    preHandler: [fastify.authenticate, fastify.rbac('cobranza', 'read')],
  }, async (request, reply) => {
    const reporte = await buildVentasGerenciales(fastify, request.query, request.user)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return reporte
  })

  fastify.get('/gerencial/cobranza-caja', {
    preHandler: [fastify.authenticate, requireRead('caja', 'cobranza')],
  }, async (request, reply) => {
    const range = buildDateRange(request.query.desde, request.query.hasta)
    if (range.error) return reply.code(400).send({ error: range.error })
    const cobranzaWhere = mergeCobranzaWhere(
      applyRange({}, 'fechaFactura', range),
      await buildCobranzaHistoricoScopeWhere(fastify.prisma, request.user),
    )
    const cajaWhere = withMovimientoSucursalScope(
      request.user,
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
    }
    const cajaStats = caja.reduce((acc, m) => {
      const monto = Number(m.monto || 0)
      if (String(m.tipo).toLowerCase() === 'ingreso') acc.ingresos += monto
      if (String(m.tipo).toLowerCase() === 'egreso') acc.egresos += Math.abs(monto)
      addMetric(acc.byMedioPago, m.medioPago, monto)
      return acc
    }, { ingresos: 0, egresos: 0, byMedioPago: {} })
    return { cuentasPorCobrar: { porCobrar, cobrado, count: cobranza.length, byEstado }, caja: { ...cajaStats, count: caja.length } }
  })

  fastify.get('/gerencial/stock', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request, reply) => {
    const range = buildDateRange(request.query.desde, request.query.hasta)
    if (range.error) return reply.code(400).send({ error: range.error })
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
  })

  fastify.get('/gerencial/licitaciones', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'read')],
  }, async (request, reply) => {
    const range = buildDateRange(request.query.desde, request.query.hasta)
    if (range.error) return reply.code(400).send({ error: range.error })
    const where = applyRange({}, 'fecha', range)
    const sucursalId = request.user?.role === 'admin' ? null : getUserSucursalId(request.user)
    if (sucursalId) where.sucursalId = sucursalId
    const licitaciones = await fastify.prisma.cotizacionLicitacion.findMany({ where, include: { items: true } })
    const byResultado = { ganada: { count: 0, total: 0 }, perdida: { count: 0, total: 0 }, pendiente: { count: 0, total: 0 } }
    for (const l of licitaciones) addMetric(byResultado, classifyLicitacion(l), totalLicitacion(l))
    return { count: licitaciones.length, byResultado }
  })

  fastify.get('/gerencial/operaciones', {
    preHandler: [fastify.authenticate, requireRead('taller', 'despacho')],
  }, async (request, reply) => {
    const range = buildDateRange(request.query.desde, request.query.hasta)
    if (range.error) return reply.code(400).send({ error: range.error })
    const [odts, despachos, guias] = await Promise.all([
      fastify.prisma.odt.findMany({ where: { ...applyRange({}, 'createdAt', range), eliminado: false } }),
      fastify.prisma.despacho.findMany({ where: applyRange({ eliminado: false }, 'fechaEntrega', range) }),
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
    const now = new Date()
    return {
      taller: { pendientes: odtsPendientes.length, byEstado: byEstadoOdt },
      despachos: {
        pendientes: despachosPendientes.length,
        vencidos: despachosPendientes.filter(d => d.fechaEntrega && new Date(d.fechaEntrega) < now).length,
      },
    }
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
      { key: 'categoriaExport', label: 'Categoria' },
      { key: 'subcategoriaNombre', label: 'Subcategoria' },
      { key: 'porcDesc', label: 'Descuento' },
      { key: 'precioLista', label: 'Precio Costo' },
      { key: 'precioVentaSalaIva', label: 'Precio venta + IVA' },
      { key: 'precioConDescuento', label: 'Precio con descuento' },
      { key: 'precioConvenioMarco', label: 'Precio Conv. Marco' },
      { key: 'precioLicitacion', label: 'PrecioLicitacion' },
      { key: 'stockCritico', label: 'Stock Critico' },
      { key: 'stock', label: 'Stock' },
      { key: 'estadoInventario', label: 'Estado Inventario' },
      { key: 'proveedorExport', label: 'Proveedor' },
      { key: 'unidadMedida', label: 'Unidad' },
      { key: 'ubicacion', label: 'Ubicacion' },
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
      { key: 'porcLicitacion', label: 'Porcentaje Licitacion' },
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
    else if (tipo === 'convenio-marco') where.tipo = 'Convenio Marco'
    else if (tipo === 'licitacion-convenio') where.tipo = { in: ['Licitación', 'Convenio Marco'] }
    else if (tipo === 'venta-web') where.tipo = 'Venta Web'
    else if (tipo && tipo !== 'licitacion') where.tipo = tipo
    else if (tipo === 'licitacion') where.tipo = 'Licitación'
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
      const total = computeTotal(o.items || [], o.descuentoPct, o.cargos || [])
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
    const { ejecutiva, estado, mes, search } = request.query
    const filters = {}
    if (ejecutiva) filters.ejecutiva = { contains: ejecutiva, mode: 'insensitive' }
    if (estado) filters.estado = { equals: estado, mode: 'insensitive' }
    if (mes) filters.mesAnio = { contains: mes, mode: 'insensitive' }
    if (search) {
      const isNum = /^\d+$/.test(String(search).trim())
      filters.OR = [
        { cliente: { contains: search, mode: 'insensitive' } },
        { rut: { contains: search, mode: 'insensitive' } },
        ...(isNum ? [{ ndoc: Number.parseInt(search, 10) }, { interno: Number.parseInt(search, 10) }] : []),
      ]
    }
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
      const total = computeTotal(o.items || [], o.descuentoPct, o.cargos || [])
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
    const built = buildOdtExportWhere(request.query)
    if (built.error) return reply.code(400).send({ error: built.error })
    const odts = await fastify.prisma.odt.findMany({
      where: built.where,
      orderBy: { createdAt: 'desc' },
    })
    const enriched = await attachOperarios(fastify.prisma, odts)
    const rows = enriched.map(o => ({
      ...o,
      responsable: o.operario
        ? [o.operario.nombres, o.operario.apellidoPaterno, o.operario.apellidoMaterno].filter(Boolean).join(' ')
        : '',
    }))
    const csv = rowsToCsv(rows, [
      { key: 'id', label: 'ID' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'clienteNombre', label: 'Cliente' },
      { key: 'descripcion', label: 'Descripcion' },
      { key: 'estado', label: 'Estado' },
      { key: 'prioridad', label: 'Prioridad' },
      { key: 'responsable', label: 'Responsable' },
      { key: 'createdAt', label: 'Creada' },
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
    const items = await fastify.prisma.bodegaTaller.findMany({
      where: { activo: true }, orderBy: { nombre: 'asc' },
    })
    const csv = rowsToCsv(items, [
      { key: 'codigoInterno', label: 'Código' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'unidadMedida', label: 'Unidad' },
      { key: 'stock', label: 'Stock' },
      { key: 'stockCritico', label: 'Crítico' },
      { key: 'precio', label: 'Precio' },
    ])
    return sendCsv(reply, `bodega_taller_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })
}
