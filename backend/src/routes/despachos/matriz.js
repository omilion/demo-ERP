import { rowsToCsv, sendCsv } from '../../utils/csv.js'
import { parseDate, parsePage, parsePositiveInt } from '../operational-utils.js'
import { computeTotal } from '../ventas/helpers.js'

const LIMIT = 100
const EXPORT_LIMIT = 10000

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function cleanText(value) {
  if (!hasValue(value)) return null
  const text = String(value).trim()
  return text || null
}

function contains(value) {
  return { contains: value, mode: 'insensitive' }
}

function addAnd(where, condition) {
  if (!condition) return where
  where.AND = [...(where.AND || []), condition]
  return where
}

function andWhere(base, condition) {
  return { AND: [base, condition] }
}

function withSucursalScope(where, user) {
  const sucursalId = parsePositiveInt(user?.sucursalId)
  if (!sucursalId) return where
  return addAnd(where, { sucursalId })
}

function buildDateRange(desde, hasta) {
  const gte = desde ? parseDate(desde) : null
  const lte = hasta ? parseDate(hasta, true) : null
  if ((desde && !gte) || (hasta && !lte)) return { error: 'Rango de fechas invalido' }
  return { gte, lte }
}

function applyCreatedRange(where, desde, hasta) {
  if (!desde && !hasta) return null
  const range = buildDateRange(desde, hasta)
  if (range.error) return range
  where.createdAt = {}
  if (range.gte) where.createdAt.gte = range.gte
  if (range.lte) where.createdAt.lte = range.lte
  return null
}

function falseCondition() {
  return { id: { in: [-1] } }
}

async function buildGuiaCondition(prisma, guia) {
  const text = cleanText(guia)
  if (!text) return null
  const guias = await prisma.guiaDespacho.findMany({
    where: { eliminado: false, nGuia: contains(text) },
    select: { ordenId: true, nInterno: true },
  })
  const ordenIds = [...new Set(guias.map(g => g.ordenId).filter(Boolean))]
  const internos = [...new Set(guias.map(g => g.nInterno).filter(Boolean))]
  const conditions = []
  if (ordenIds.length) conditions.push({ id: { in: ordenIds } })
  if (internos.length) conditions.push({ nInterno: { in: internos } })
  const parsedGuia = parsePositiveInt(text)
  if (parsedGuia) conditions.push({ guias: parsedGuia })
  return conditions.length ? { OR: conditions } : falseCondition()
}

async function buildOdtCondition(prisma, odt) {
  if (!hasValue(odt)) return null
  const parsedOdt = parsePositiveInt(odt)
  if (!parsedOdt) return { error: 'odt invalida' }
  const odts = await prisma.odt.findMany({
    where: { id: parsedOdt, eliminado: false },
    select: { ordenId: true },
  })
  const ids = odts.map(o => o.ordenId).filter(Boolean)
  return ids.length ? { id: { in: ids } } : falseCondition()
}

async function buildIdLicitacionCondition(prisma, idLicitacion) {
  const text = cleanText(idLicitacion)
  if (!text) return null
  const cotizaciones = await prisma.cotizacionLicitacion.findMany({
    where: { idLicitacion: contains(text), ordenId: { not: null } },
    select: { ordenId: true },
  })
  const ids = [...new Set(cotizaciones.map(c => c.ordenId).filter(Boolean))]
  return {
    OR: [
      { licitacion: contains(text) },
      ...(ids.length ? [{ id: { in: ids } }] : []),
    ],
  }
}

async function buildDocumentoCondition(prisma, value, kind) {
  const text = cleanText(value)
  if (!text) return null
  const docTokens = kind === 'nc'
    ? ['NC', 'Nota credito', 'Nota de credito']
    : ['ND', 'Nota debito', 'Nota de debito']
  const typeConditions = docTokens.flatMap(token => ([
    { tipoDocumento: contains(token) },
    { documento: contains(token) },
  ]))
  if (kind === 'nc') typeConditions.push({ numeroNCInterna: { not: null } })

  const valueConditions = [
    { nDoc: contains(text) },
    { referencia: contains(text) },
    { documento: contains(text) },
  ]
  if (kind === 'nc') valueConditions.push({ numeroNCInterna: contains(text) })

  const docs = await prisma.movimientoCaja.findMany({
    where: {
      eliminado: false,
      ordenId: { not: null },
      AND: [
        { OR: typeConditions },
        { OR: valueConditions },
      ],
    },
    select: { ordenId: true },
  })
  const ids = [...new Set(docs.map(d => d.ordenId).filter(Boolean))]
  return ids.length ? { id: { in: ids } } : falseCondition()
}

function roundOne(value) {
  return Math.round(value * 10) / 10
}

function buildPackingResumen(items = []) {
  const total = items.reduce((sum, item) => sum + Number(item.cantidad || 0), 0)
  const entregados = items.reduce((sum, item) => sum + Number(item.nEntregados || 0), 0)
  const pendientes = Math.max(0, total - entregados)
  const pct = total > 0 ? Math.round((entregados / total) * 100) : 0
  const estado = total === 0 || entregados === 0
    ? 'Pendiente'
    : entregados >= total ? 'Completo' : 'Parcial'

  return { total, entregados, pendientes, pct, estado }
}

function buildDespachoDias(despacho = {}) {
  const start = despacho.fechaInterno || despacho.createdAt
  const end = despacho.fechaEntrega
  if (!start || !end) return null
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return null
  return roundOne((endDate.getTime() - startDate.getTime()) / 864e5)
}

function applyTipoVenta(where, tipoVenta) {
  const tipo = cleanText(tipoVenta)
  if (!tipo) return
  if (['venta-sala', 'venta sala', 'venta-directa', 'venta directa'].includes(tipo.toLowerCase())) {
    where.tipo = { in: ['Venta sala', 'Venta Sala', 'Venta directa', 'Venta Directa'] }
  } else if (['convenio-marco', 'convenio marco'].includes(tipo.toLowerCase())) {
    where.tipo = 'Convenio Marco'
  } else if (['venta-web', 'venta web'].includes(tipo.toLowerCase())) {
    where.tipo = 'Venta Web'
  } else if (['licitacion', 'licitación'].includes(tipo.toLowerCase())) {
    where.tipo = { in: ['Licitacion', 'Licitación'] }
  } else {
    where.tipo = contains(tipo.replace(/-/g, ' '))
  }
}

function applyClienteFilter(where, value) {
  const text = cleanText(value)
  if (!text) return
  addAnd(where, {
    OR: [
      { rutCliente: contains(text) },
      { emailCliente: contains(text) },
      {
        clienteSucursal: {
          is: {
            OR: [
              { nombre: contains(text) },
              { contacto: contains(text) },
              { email: contains(text) },
              { telefono: contains(text) },
              { cliente: { is: { rut: contains(text) } } },
              { cliente: { is: { nombre: contains(text) } } },
              { cliente: { is: { razonSocial: contains(text) } } },
            ],
          },
        },
      },
    ],
  })
}

function applyLocationFilter(where, field, value) {
  const text = cleanText(value)
  if (!text) return
  const conditions = [
    { clienteSucursal: { is: { [field]: contains(text) } } },
  ]
  if (field !== 'ciudad') {
    conditions.push({ despachos: { some: { eliminado: false, [field]: contains(text) } } })
  }
  addAnd(where, {
    OR: conditions,
  })
}

function applySearch(where, value) {
  const text = cleanText(value)
  if (!text) return
  const isNum = /^\d+$/.test(text)
  addAnd(where, {
    OR: [
      { rutCliente: contains(text) },
      { emailCliente: contains(text) },
      { licitacion: contains(text) },
      { creadorNombre: contains(text) },
      { observaciones: contains(text) },
      { clienteSucursal: { is: { nombre: contains(text) } } },
      { clienteSucursal: { is: { cliente: { is: { nombre: contains(text) } } } } },
      { clienteSucursal: { is: { cliente: { is: { razonSocial: contains(text) } } } } },
      { guiasDespacho: { some: { eliminado: false, nGuia: contains(text) } } },
      { movimientosCaja: { some: { eliminado: false, nDoc: contains(text) } } },
      { movimientosCaja: { some: { eliminado: false, documento: contains(text) } } },
      ...(isNum ? [{ id: parseInt(text, 10) }, { nInterno: parseInt(text, 10) }] : []),
    ],
  })
}

export async function buildDespachoMatrizWhere(prisma, query = {}, user = {}) {
  const {
    desde,
    hasta,
    rut,
    cliente,
    ordenId,
    nInterno,
    oc,
    idLicitacion,
    guia,
    odt,
    nc,
    nd,
    tipoVenta,
    tipo,
    estadoPago,
    estadoEntrega,
    region,
    comuna,
    ciudad,
    pendientes,
    noPagadas,
    entregadasNoPagadas,
    search,
    ventasHoy,
  } = query

  const where = withSucursalScope({ eliminada: false }, user)
  const rangeError = applyCreatedRange(where, desde, hasta)
  if (rangeError) return { error: rangeError.error }
  if (ventasHoy === 'true') {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)
    where.createdAt = { gte: start, lte: end }
  }
  if (rut) addAnd(where, { rutCliente: contains(String(rut).trim()) })
  applyClienteFilter(where, cliente)
  if (ordenId) {
    const parsedOrdenId = parsePositiveInt(ordenId)
    if (!parsedOrdenId) return { error: 'ordenId invalido' }
    where.id = parsedOrdenId
  }
  if (nInterno) {
    const parsedNInterno = parsePositiveInt(nInterno)
    if (!parsedNInterno) return { error: 'nInterno invalido' }
    where.nInterno = parsedNInterno
  }
  if (oc) addAnd(where, { licitacion: contains(String(oc).trim()) })
  const licCondition = await buildIdLicitacionCondition(prisma, idLicitacion)
  if (licCondition) addAnd(where, licCondition)
  const guiaCondition = await buildGuiaCondition(prisma, guia)
  if (guiaCondition) addAnd(where, guiaCondition)
  const odtCondition = await buildOdtCondition(prisma, odt)
  if (odtCondition?.error) return odtCondition
  if (odtCondition) addAnd(where, odtCondition)
  const ncCondition = await buildDocumentoCondition(prisma, nc, 'nc')
  if (ncCondition) addAnd(where, ncCondition)
  const ndCondition = await buildDocumentoCondition(prisma, nd, 'nd')
  if (ndCondition) addAnd(where, ndCondition)
  applyTipoVenta(where, tipoVenta || tipo)
  if (estadoPago) where.estadoPago = estadoPago
  if (estadoEntrega) where.estadoEntrega = estadoEntrega
  if (pendientes === 'true') where.estadoEntrega = 'Pendiente entrega'
  if (noPagadas === 'true') where.estadoPago = 'No pagada'
  if (entregadasNoPagadas === 'true') {
    where.estadoEntrega = 'Entregada'
    where.estadoPago = 'No pagada'
  }
  applyLocationFilter(where, 'region', region)
  applyLocationFilter(where, 'comuna', comuna)
  applyLocationFilter(where, 'ciudad', ciudad)
  applySearch(where, search)
  return { where }
}

function mapOrderRows(ordenes, { odtsByOrden, cotizByOrden, clientesById }) {
  return ordenes.map(orden => {
    const clienteDirecto = clientesById[orden.clienteId] || null
    const cliente = orden.clienteSucursal?.cliente || clienteDirecto
    const sucursal = orden.clienteSucursal || null
    const despachoPrincipal = (orden.despachos || [])[0] || null
    const total = computeTotal(orden.items || [], orden.descuentoPct || 0, orden.cargos || [], orden.descuentoMonto)
    const abono = Number(orden.abono || 0)
    const facturado = Number(orden.facturado || 0)
    const odts = odtsByOrden[orden.id] || []
    const cotizaciones = cotizByOrden[orden.id] || []
    const packing = buildPackingResumen(orden.items || [])
    return {
      id: orden.id,
      ordenId: orden.id,
      nInterno: orden.nInterno,
      fechaCreacion: orden.createdAt,
      tipoVenta: orden.tipo,
      oc: orden.licitacion || '',
      idLicitacion: cotizaciones[0]?.idLicitacion || '',
      clienteNombre: cliente?.razonSocial || cliente?.nombre || sucursal?.nombre || null,
      rutCliente: orden.rutCliente || cliente?.rut || null,
      creadorNombre: orden.creadorNombre || null,
      total,
      abono,
      facturado,
      saldo: Math.max(0, total - abono),
      estado: orden.estado,
      estadoPago: orden.estadoPago,
      estadoEntrega: orden.estadoEntrega,
      fechaEstadoEntrega: orden.fechaEstadoEntrega,
      itemsDetalle: (orden.items || []).map(item => ({
        id: item.id,
        codigo: item.codigoInterno,
        nombre: item.nombre || item.descripcion,
        cantidad: item.cantidad,
        entregados: item.nEntregados,
      })),
      packing,
      odts,
      odtCount: odts.length,
      guias: (orden.guiasDespacho || []).map(guia => ({
        id: guia.id,
        nGuia: guia.nGuia,
        fechaGuia: guia.fechaGuia,
        odtId: guia.odtId,
      })),
      guiasLegacy: orden.guias || null,
      guiasCount: (orden.guiasDespacho || []).length,
      documentos: (orden.movimientosCaja || []).map(doc => ({
        id: doc.id,
        documento: doc.documento || doc.tipoDocumento,
        tipoDocumento: doc.tipoDocumento,
        nDoc: doc.nDoc,
        monto: doc.monto,
        estadoDoc: doc.estadoDoc,
        estadoPagoDoc: doc.estadoPagoDoc,
        numeroNCInterna: doc.numeroNCInterna,
      })),
      documentosCount: (orden.movimientosCaja || []).length,
      despachos: (orden.despachos || []).map(d => ({
        id: d.id,
        fechaEntrega: d.fechaEntrega,
        tipoDespacho: d.tipoDespacho,
        transporte: d.transporte,
        direccion: d.direccion,
        region: d.region,
        comuna: d.comuna,
        parcial: d.parcial,
        tieneMulta: d.tieneMulta,
        tiempoDespachoDias: buildDespachoDias(d),
      })),
      despachoCount: (orden.despachos || []).length,
      direccion: despachoPrincipal?.direccion || sucursal?.direccion || null,
      region: despachoPrincipal?.region || sucursal?.region || null,
      comuna: despachoPrincipal?.comuna || sucursal?.comuna || null,
      ciudad: sucursal?.ciudad || null,
    }
  })
}

export async function fetchDespachoMatriz(fastify, query = {}, user = {}, options = {}) {
  const built = await buildDespachoMatrizWhere(fastify.prisma, query, user)
  if (built.error) return built
  const page = parsePage(query.page)
  const take = options.exportAll ? EXPORT_LIMIT : LIMIT
  const skip = options.exportAll ? 0 : (page - 1) * LIMIT
  const where = built.where

  const include = {
    items: { where: { eliminado: false }, orderBy: { id: 'asc' } },
    cargos: true,
    clienteSucursal: {
      include: {
        cliente: { select: { id: true, rut: true, nombre: true, razonSocial: true, email: true, telefono: true } },
      },
    },
    despachos: { where: { eliminado: false }, orderBy: [{ fechaEntrega: 'desc' }, { createdAt: 'desc' }] },
    guiasDespacho: { where: { eliminado: false }, orderBy: [{ fechaGuia: 'desc' }, { createdAt: 'desc' }] },
    movimientosCaja: {
      where: {
        eliminado: false,
        OR: [
          { tipoDocumento: { not: null } },
          { documento: { not: null } },
          { nDoc: { not: null } },
        ],
      },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
    },
  }

  const [ordenes, total, pendientes, noPagadas, entregadasNoPagadas] = await Promise.all([
    fastify.prisma.orden.findMany({ where, include, orderBy: { createdAt: 'desc' }, take, skip }),
    fastify.prisma.orden.count({ where }),
    fastify.prisma.orden.count({ where: andWhere(where, { estadoEntrega: 'Pendiente entrega' }) }),
    fastify.prisma.orden.count({ where: andWhere(where, { estadoPago: 'No pagada' }) }),
    fastify.prisma.orden.count({ where: andWhere(where, { estadoEntrega: 'Entregada', estadoPago: 'No pagada' }) }),
  ])

  const ordenIds = ordenes.map(o => o.id)
  const clienteIds = [...new Set(ordenes.filter(o => !o.clienteSucursal?.cliente && o.clienteId).map(o => o.clienteId))]
  const [odts, cotizaciones, clientes] = await Promise.all([
    ordenIds.length ? fastify.prisma.odt.findMany({
      where: { ordenId: { in: ordenIds }, eliminado: false },
      select: { id: true, ordenId: true, estado: true, tipo: true, plazo: true },
      orderBy: { id: 'asc' },
    }) : [],
    ordenIds.length ? fastify.prisma.cotizacionLicitacion.findMany({
      where: { ordenId: { in: ordenIds } },
      select: { id: true, ordenId: true, idLicitacion: true, estado: true },
    }) : [],
    clienteIds.length ? fastify.prisma.cliente.findMany({
      where: { id: { in: clienteIds } },
      select: { id: true, rut: true, nombre: true, razonSocial: true, email: true, telefono: true },
    }) : [],
  ])

  const odtsByOrden = {}
  for (const odt of odts) (odtsByOrden[odt.ordenId] ||= []).push(odt)
  const cotizByOrden = {}
  for (const cotizacion of cotizaciones) (cotizByOrden[cotizacion.ordenId] ||= []).push(cotizacion)
  const clientesById = Object.fromEntries(clientes.map(cliente => [cliente.id, cliente]))
  const items = mapOrderRows(ordenes, { odtsByOrden, cotizByOrden, clientesById })

  return {
    items,
    total,
    limit: LIMIT,
    stats: {
      pendientes,
      noPagadas,
      entregadasNoPagadas,
      totalMontoPagina: items.reduce((sum, row) => sum + Number(row.total || 0), 0),
    },
  }
}

function rowsForCsv(items) {
  return items.map(row => ({
    ...row,
    fechaCreacion: row.fechaCreacion ? new Date(row.fechaCreacion).toISOString().slice(0, 10) : '',
    detalleProductos: row.itemsDetalle.map(item => `${item.codigo || ''} ${item.nombre || ''} (${item.entregados || 0}/${item.cantidad || 0})`.trim()).join(' | '),
    packingTexto: row.packing ? `${row.packing.entregados}/${row.packing.total} (${row.packing.estado})` : '',
    odtsTexto: row.odts.map(odt => `#${odt.id} ${odt.estado || ''}`.trim()).join(' | '),
    guiasTexto: row.guias.map(guia => `${guia.nGuia}${guia.fechaGuia ? ` ${new Date(guia.fechaGuia).toISOString().slice(0, 10)}` : ''}`).join(' | '),
    documentosTexto: row.documentos.map(doc => `${doc.tipoDocumento || doc.documento || ''} ${doc.nDoc || doc.numeroNCInterna || ''}`.trim()).join(' | '),
  }))
}

export function registerDespachoMatrizRoutes(fastify) {
  fastify.get('/matriz', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const result = await fetchDespachoMatriz(fastify, request.query, request.user)
    if (result.error) return reply.code(400).send({ error: result.error })
    return result
  })

  fastify.get('/matriz/export', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const result = await fetchDespachoMatriz(fastify, request.query, request.user, { exportAll: true })
    if (result.error) return reply.code(400).send({ error: result.error })
    const csv = rowsToCsv(rowsForCsv(result.items), [
      { key: 'nInterno', label: 'N Interno' },
      { key: 'fechaCreacion', label: 'Fecha Creacion' },
      { key: 'tipoVenta', label: 'Tipo Venta' },
      { key: 'clienteNombre', label: 'Cliente' },
      { key: 'rutCliente', label: 'RUT' },
      { key: 'oc', label: 'OC / Ref' },
      { key: 'idLicitacion', label: 'ID Licitacion' },
      { key: 'total', label: 'Total Venta' },
      { key: 'facturado', label: 'Total Facturado' },
      { key: 'abono', label: 'Abono' },
      { key: 'saldo', label: 'Saldo' },
      { key: 'estado', label: 'Estado' },
      { key: 'estadoPago', label: 'Estado Pago' },
      { key: 'estadoEntrega', label: 'Estado Entrega' },
      { key: 'detalleProductos', label: 'Detalle Productos' },
      { key: 'packingTexto', label: 'Packing' },
      { key: 'odtsTexto', label: 'ODTs' },
      { key: 'guiasTexto', label: 'Guias Despacho' },
      { key: 'documentosTexto', label: 'Documentos' },
      { key: 'direccion', label: 'Direccion' },
      { key: 'region', label: 'Region' },
      { key: 'comuna', label: 'Comuna' },
      { key: 'ciudad', label: 'Ciudad' },
      { key: 'creadorNombre', label: 'Creada Por' },
    ])
    return sendCsv(reply, `despacho_matriz_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })
}
