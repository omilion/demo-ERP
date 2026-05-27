import { rowsToCsv, sendCsv } from '../../utils/csv.js'
import { getUserSucursalId } from '../caja/scope.js'
import { buildOrdenScopeWhere, getPrimerRegistroInterno, mergeWhere, parseOrdenScope } from '../historico/corte.js'
import { parseDate, parsePage, parsePositiveInt } from '../operational-utils.js'
import { computeVentaFinancialState } from '../ventas/financial.js'

const LIMIT = 100
const ACTIVE_FILTERS = [
  'tipo', 'desde', 'hasta', 'rut', 'nombre', 'nInterno', 'oc', 'idLicitacion',
  'guia', 'odt', 'nc', 'nd', 'estadoPago', 'estadoEntrega', 'search',
  'ventasHoy', 'noPagada', 'pendienteEntrega', 'entregada',
]
const NC_DOCS = ['NC Plast', 'NC Laura', 'NC', 'Nota Credito', 'Nota de Credito']
const ND_DOCS = ['ND Plast', 'ND Laura', 'ND', 'Nota Debito', 'Nota de Debito']

function hasValue(value) {
  return value !== undefined && value !== null && value !== ''
}

function hasActiveFilters(query) {
  return ACTIVE_FILTERS.some(key => hasValue(query[key]))
}

function todayIso() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function userSucursalWhere(user) {
  const sucursalId = getUserSucursalId(user)
  return sucursalId ? { sucursalId } : {}
}

function scopedWhere(user, where = {}) {
  const sucursalId = getUserSucursalId(user)
  return sucursalId ? { ...where, sucursalId } : where
}

function scopedMovimientoCajaWhere(user, where = {}) {
  const sucursalId = getUserSucursalId(user)
  if (!sucursalId) return where
  return mergeWhere(where, {
    OR: [
      { sucursalId },
      { orden: { is: { sucursalId } } },
    ],
  })
}

function tipoOrdenWhere(tipo) {
  if (tipo === 'venta-sala' || tipo === 'venta-directa') return { tipo: { in: ['Venta sala', 'Venta directa', 'Venta Sala', 'Normal'] } }
  if (tipo === 'convenio-marco') return { tipo: 'Convenio Marco' }
  if (tipo === 'licitacion') return { tipo: { contains: 'Licit', mode: 'insensitive' } }
  return {}
}

function isNcDoc(doc) {
  const text = String(doc || '').toLowerCase()
  return text.includes('nc') || text.includes('credito')
}

function isNdDoc(doc) {
  const text = String(doc || '').toLowerCase()
  return text.includes('nd') || text.includes('debito')
}

function isNcMovimiento(mov) {
  return isNcDoc(mov.documento) || isNcDoc(mov.tipoDocumento)
}

function isNdMovimiento(mov) {
  return isNdDoc(mov.documento) || isNdDoc(mov.tipoDocumento)
}

function signedAmount(mov) {
  return Math.abs(Number(mov.monto || 0))
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const ACTIVE_DOCUMENT_WHERE = {
  OR: [
    { estadoDoc: null },
    { estadoDoc: { not: 'Nula' } },
  ],
}

function isActiveDocumento(mov) {
  return normalizeText(mov.estadoDoc || 'Activa') !== 'nula'
}

function isReferencialMovimiento(mov) {
  return normalizeText(mov.medioPago) === 'referencial'
}

function isFacturaMovimiento(mov) {
  return isReferencialMovimiento(mov) && !isNcMovimiento(mov) && !isNdMovimiento(mov)
}

function docFilter(value, kind) {
  const docs = kind === 'nc' ? NC_DOCS : ND_DOCS
  const family = kind.toUpperCase()
  const or = [
    { documento: { in: docs } },
    { documento: { contains: family, mode: 'insensitive' } },
    { tipoDocumento: { contains: family, mode: 'insensitive' } },
  ]
  if (value) {
    return {
      AND: [
        { OR: or },
        {
          OR: [
            { nDoc: { contains: String(value), mode: 'insensitive' } },
            { numeroNCInterna: { contains: String(value), mode: 'insensitive' } },
          ],
        },
      ],
    }
  }
  return { OR: or }
}

function mergeIdCondition(where, ids) {
  return mergeWhere(where, ids.length ? { id: { in: ids } } : { id: { in: [-1] } })
}

function totalItem(item) {
  return Number(item.cantidad || 0) * Number(item.precioUnitario || 0) + Number(item.cargoTransporte || 0)
}

function documentoResumen(doc) {
  const tipo = doc.documento || doc.tipoDocumento || 'Doc'
  const numero = doc.nDoc || doc.numeroNCInterna || ''
  return numero ? `${tipo}-${numero}` : tipo
}

function detalleProductos(items = []) {
  return items
    .filter(i => !i.eliminado)
    .map(i => ({
      id: i.id,
      codigoInterno: i.codigoInterno,
      nombre: i.nombre || i.descripcion,
      cantidad: i.cantidad,
      total: totalItem(i),
      nEntregados: i.nEntregados,
    }))
}

async function resolveRutsByNombre(prisma, nombre) {
  if (!nombre) return null
  const clientes = await prisma.cliente.findMany({
    where: {
      OR: [
        { nombre: { contains: nombre, mode: 'insensitive' } },
        { razonSocial: { contains: nombre, mode: 'insensitive' } },
      ],
    },
    select: { rut: true },
    take: 500,
  })
  return clientes.map(c => c.rut).filter(Boolean)
}

async function resolveOrdenIdsByOdt(prisma, odt, user) {
  if (!odt) return null
  const parsedOdt = parsePositiveInt(odt)
  if (!parsedOdt) return { error: 'odt invalida' }
  const odts = await prisma.odt.findMany({
    where: scopedWhere(user, { id: parsedOdt, eliminado: false }),
    select: { ordenId: true },
  })
  return odts.map(o => o.ordenId).filter(Boolean)
}

async function resolveOrdenConditionByGuia(prisma, guia, user) {
  if (!guia) return null
  const parsedGuia = parsePositiveInt(guia)
  if (!parsedGuia) return { error: 'guia invalida' }
  const sucursalId = getUserSucursalId(user)
  const where = { eliminado: false, nGuia: { contains: guia, mode: 'insensitive' } }
  if (sucursalId) where.orden = { is: { sucursalId } }
  const guias = await prisma.guiaDespacho.findMany({
    where,
    select: { ordenId: true, nInterno: true },
  })
  const ordenIds = [...new Set(guias.map(g => g.ordenId).filter(Boolean))]
  const internos = [...new Set(guias.map(g => g.nInterno).filter(Boolean))]
  const conditions = []
  if (ordenIds.length) conditions.push({ id: { in: ordenIds } })
  if (internos.length) conditions.push({ nInterno: { in: internos } })
  conditions.push({ guias: parsedGuia })
  return { OR: conditions }
}

async function resolveOrdenIdsByDocumento(prisma, query, user) {
  const clauses = []
  if (query.nc) clauses.push(docFilter(query.nc, 'nc'))
  if (query.nd) clauses.push(docFilter(query.nd, 'nd'))
  if (!clauses.length) return null
  const where = scopedMovimientoCajaWhere(user, {
    eliminado: false,
  })
  const docWhere = mergeWhere(clauses.length === 1 ? clauses[0] : { AND: clauses }, ACTIVE_DOCUMENT_WHERE)
  const docs = await prisma.movimientoCaja.findMany({ where: mergeWhere(where, docWhere), select: { ordenId: true } })
  return [...new Set(docs.map(d => d.ordenId).filter(Boolean))]
}

async function resolveOrdenIdsByIdLicitacion(prisma, idLicitacion, user) {
  if (!idLicitacion) return null
  const [cotizaciones, ordenes] = await Promise.all([
    prisma.cotizacionLicitacion.findMany({
      where: scopedWhere(user, { idLicitacion: { contains: idLicitacion, mode: 'insensitive' } }),
      select: { ordenId: true },
    }),
    prisma.orden.findMany({
      where: scopedWhere(user, { eliminada: false, licitacion: { contains: idLicitacion, mode: 'insensitive' } }),
      select: { id: true },
    }),
  ])
  return [...new Set([
    ...cotizaciones.map(c => c.ordenId).filter(Boolean),
    ...ordenes.map(o => o.id),
  ])]
}

async function buildContext(fastify, query, user) {
  const effective = { ...query }
  if (hasValue(effective.ventasHoy)) {
    effective.desde = todayIso()
    effective.hasta = todayIso()
    effective.defaultVentasHoy = true
  } else if (!hasActiveFilters(query)) {
    effective.desde = todayIso()
    effective.hasta = todayIso()
    effective.defaultVentasHoy = true
  }
  const scope = parseOrdenScope(effective.scope, 'operacional')
  if (!scope) return { error: 'scope invalido' }
  const dateDesde = effective.desde ? parseDate(effective.desde) : null
  const dateHasta = effective.hasta ? parseDate(effective.hasta, true) : null
  if (effective.desde && !dateDesde) return { error: 'desde invalido' }
  if (effective.hasta && !dateHasta) return { error: 'hasta invalido' }
  const parsedNInterno = effective.nInterno ? parsePositiveInt(effective.nInterno) : null
  if (effective.nInterno && !parsedNInterno) return { error: 'nInterno invalido' }

  const [rutsByNombre, ordenIdsByOdt, guiaCondition, ordenIdsByDocs, ordenIdsByLic] = await Promise.all([
    resolveRutsByNombre(fastify.prisma, effective.nombre),
    resolveOrdenIdsByOdt(fastify.prisma, effective.odt, user),
    resolveOrdenConditionByGuia(fastify.prisma, effective.guia, user),
    resolveOrdenIdsByDocumento(fastify.prisma, effective, user),
    resolveOrdenIdsByIdLicitacion(fastify.prisma, effective.idLicitacion, user),
  ])
  for (const value of [ordenIdsByOdt, guiaCondition]) {
    if (value?.error) return { error: value.error }
  }
  return {
    query: effective,
    scope,
    dateDesde,
    dateHasta,
    parsedNInterno,
    rutsByNombre,
    ordenIdsByOdt,
    guiaCondition,
    ordenIdsByDocs,
    ordenIdsByLic,
  }
}

function applyCommonOrdenFilters(where, ctx, user) {
  const q = ctx.query
  Object.assign(where, userSucursalWhere(user))
  Object.assign(where, tipoOrdenWhere(q.tipo))
  if (ctx.dateDesde || ctx.dateHasta) where.createdAt = {}
  if (ctx.dateDesde) where.createdAt.gte = ctx.dateDesde
  if (ctx.dateHasta) where.createdAt.lte = ctx.dateHasta
  if (q.rut) where.rutCliente = { contains: q.rut, mode: 'insensitive' }
  if (ctx.rutsByNombre) where = mergeWhere(where, ctx.rutsByNombre.length ? { rutCliente: { in: ctx.rutsByNombre } } : { id: { in: [-1] } })
  if (q.nInterno) where.nInterno = ctx.parsedNInterno
  if (q.oc) where.licitacion = { contains: q.oc, mode: 'insensitive' }
  if (q.noPagada) {
    where.estado = 'Activa'
    where.estadoPago = 'No pagada'
  }
  if (q.pendienteEntrega) {
    where.estado = 'Activa'
    where.estadoEntrega = 'Pendiente entrega'
  }
  if (q.entregada) {
    where.estado = 'Activa'
    where.estadoPago = 'No pagada'
    where.estadoEntrega = { in: ['Entregado', 'Entregada'] }
  }
  if (q.estadoPago) where.estadoPago = q.estadoPago
  if (q.estadoEntrega) where.estadoEntrega = q.estadoEntrega
  if (q.search) {
    const isNum = /^\d+$/.test(q.search.trim())
    where = mergeWhere(where, {
      OR: [
        { creadorNombre: { contains: q.search, mode: 'insensitive' } },
        { rutCliente: { contains: q.search, mode: 'insensitive' } },
        { observaciones: { contains: q.search, mode: 'insensitive' } },
        ...(isNum ? [{ nInterno: parseInt(q.search, 10) }, { id: parseInt(q.search, 10) }] : []),
      ],
    })
  }
  if (ctx.guiaCondition) where = mergeWhere(where, ctx.guiaCondition)
  if (ctx.ordenIdsByOdt) where = mergeIdCondition(where, ctx.ordenIdsByOdt)
  if (ctx.ordenIdsByDocs) where = mergeIdCondition(where, ctx.ordenIdsByDocs)
  if (ctx.ordenIdsByLic) where = mergeIdCondition(where, ctx.ordenIdsByLic)
  return where
}

async function buildOrdenWhere(fastify, ctx, user) {
  let where = applyCommonOrdenFilters({ eliminada: false }, ctx, user)
  const corte = await getPrimerRegistroInterno(fastify.prisma)
  where = mergeWhere(where, buildOrdenScopeWhere(ctx.scope, corte))
  return where
}

async function getOrdenRows(fastify, ctx, user) {
  const where = await buildOrdenWhere(fastify, ctx, user)
  const ordenes = await fastify.prisma.orden.findMany({
    where,
    include: { items: { where: { eliminado: false } }, cargos: true },
    orderBy: { createdAt: 'desc' },
  })
  const ruts = [...new Set(ordenes.map(o => o.rutCliente).filter(Boolean))]
  const ordenIds = ordenes.map(o => o.id)
  const [clientesArr, odtsArr, cotizArr, guiasArr, movsArr, multasArr] = await Promise.all([
    ruts.length ? fastify.prisma.cliente.findMany({
      where: { rut: { in: ruts } },
      select: { rut: true, razonSocial: true, nombre: true, email: true },
    }) : [],
    ordenIds.length ? fastify.prisma.odt.findMany({
      where: { ordenId: { in: ordenIds }, eliminado: false },
      select: { id: true, ordenId: true, estado: true },
    }) : [],
    ordenIds.length ? fastify.prisma.cotizacionLicitacion.findMany({
      where: { ordenId: { in: ordenIds } },
      select: { id: true, idLicitacion: true, ordenId: true },
    }) : [],
    ordenIds.length ? fastify.prisma.guiaDespacho.findMany({
      where: { ordenId: { in: ordenIds }, eliminado: false },
      select: { id: true, ordenId: true, nGuia: true, fechaGuia: true, origen: true },
      orderBy: { fechaGuia: 'desc' },
    }) : [],
    ordenIds.length ? fastify.prisma.movimientoCaja.findMany({
      where: {
        ordenId: { in: ordenIds },
        eliminado: false,
        AND: [
          ACTIVE_DOCUMENT_WHERE,
          {
            OR: [
              { documento: { not: null } },
              { tipoDocumento: { not: null } },
              { nDoc: { not: null } },
              { numeroNCInterna: { not: null } },
            ],
          },
        ],
      },
      select: { id: true, ordenId: true, documento: true, tipoDocumento: true, nDoc: true, numeroNCInterna: true, monto: true, estadoPagoDoc: true, estadoDoc: true, fecha: true, medioPago: true, tipo: true },
    }) : [],
    ordenIds.length ? fastify.prisma.multa.findMany({
      where: { ordenId: { in: ordenIds } },
      select: { id: true, ordenId: true, monto: true },
    }) : [],
  ])
  const clienteMap = Object.fromEntries(clientesArr.map(c => [c.rut, c]))
  const odtMap = {}; for (const o of odtsArr) (odtMap[o.ordenId] ||= []).push({ id: o.id, estado: o.estado })
  const guiasMap = {}; for (const g of guiasArr) (guiasMap[g.ordenId] ||= []).push({ id: g.id, nGuia: g.nGuia, fechaGuia: g.fechaGuia, origen: g.origen })
  const docsMap = {}; for (const m of movsArr) (docsMap[m.ordenId] ||= []).push(m)
  const multasMap = {}; for (const multa of multasArr) (multasMap[multa.ordenId] ||= []).push(multa)
  const cotizMap = Object.fromEntries(cotizArr.map(c => [c.ordenId, { id: c.id, idLicitacion: c.idLicitacion }]))

  return ordenes.map(o => {
    const documentos = (docsMap[o.id] || []).filter(isActiveDocumento)
    const multas = multasMap[o.id] || []
    const financialState = computeVentaFinancialState(o, { movimientos: documentos, multas })
    const total = financialState.total
    const facturadoTotal = documentos.filter(isFacturaMovimiento).reduce((s, d) => s + signedAmount(d), 0)
    const ncTotal = documentos.filter(isNcMovimiento).reduce((s, d) => s + signedAmount(d), 0)
    const ndTotal = documentos.filter(isNdMovimiento).reduce((s, d) => s + signedAmount(d), 0)
    const cliente = clienteMap[o.rutCliente] || null
    const abono = financialState.abono
    const saldo = financialState.saldo
    const odts = odtMap[o.id] || []
    const guias = guiasMap[o.id] || []
    const documentosLegacy = documentos.map(documentoResumen).join(' | ')
    return {
      fuente: 'orden',
      id: o.id,
      nInterno: o.nInterno,
      fecha: o.createdAt,
      tipo: o.tipo,
      cliente: o.rutCliente,
      nombreCliente: cliente?.razonSocial || cliente?.nombre || null,
      emailCliente: cliente?.email || null,
      ref: o.licitacion || '',
      total,
      abono,
      facturado: facturadoTotal || o.facturado || 0,
      ncTotal,
      ndTotal,
      saldo,
      multas,
      multasTotal: multas.reduce((s, m) => s + signedAmount(m), 0),
      estado: o.estado,
      estadoEntrega: o.estadoEntrega,
      fechaEstadoEntrega: o.fechaEstadoEntrega,
      pago: financialState.estadoPago,
      creadorNombre: o.creadorNombre || null,
      guiasLegacy: o.guias || null,
      odts,
      odtCount: odts.length,
      guias,
      guiasCount: guias.length,
      documentos,
      documentosCount: documentos.length,
      documentosLegacy,
      cotizacion: cotizMap[o.id] || null,
      detalleProductos: detalleProductos(o.items || []),
    }
  })
}

async function getOcOnlineRows(fastify, ctx, user) {
  const q = ctx.query
  if (q.rut || q.nInterno || q.idLicitacion || q.odt || q.guia || q.nc || q.nd) return []
  const where = scopedWhere(user)
  if (ctx.dateDesde || ctx.dateHasta) where.fechaHora = {}
  if (ctx.dateDesde) where.fechaHora.gte = ctx.dateDesde
  if (ctx.dateHasta) where.fechaHora.lte = ctx.dateHasta
  if (q.oc) where.nCompra = { contains: q.oc, mode: 'insensitive' }
  if (q.search) {
    const isNum = /^\d+$/.test(q.search.trim())
    where.OR = [
      { nCompra: { contains: q.search, mode: 'insensitive' } },
      { emailComprador: { contains: q.search, mode: 'insensitive' } },
      ...(isNum ? [{ id: parseInt(q.search, 10) }] : []),
    ]
  }
  const ocs = await fastify.prisma.ordenCompraOnline.findMany({ where, orderBy: { fechaHora: 'desc' } })
  return ocs.map(o => ({
    fuente: 'oc-online',
    id: o.id,
    nInterno: null,
    fecha: o.fechaHora,
    tipo: 'Venta Web',
    cliente: o.emailComprador,
    nombreCliente: o.nombreComprador || null,
    ref: o.nCompra || '',
    total: o.total || 0,
    abono: 0,
    facturado: 0,
    saldo: o.total || 0,
    estado: o.estadoCompra,
    pago: null,
    detalleProductos: [],
  }))
}

async function getLicitacionRows(fastify, ctx, user) {
  const q = ctx.query
  const where = scopedWhere(user, { ordenId: null })
  if (ctx.dateDesde || ctx.dateHasta) where.fecha = {}
  if (ctx.dateDesde) where.fecha.gte = ctx.dateDesde
  if (ctx.dateHasta) where.fecha.lte = ctx.dateHasta
  if (q.rut) where.rutCliente = { contains: q.rut, mode: 'insensitive' }
  if (ctx.rutsByNombre) {
    if (!ctx.rutsByNombre.length) return []
    where.rutCliente = { in: ctx.rutsByNombre }
  }
  if (q.idLicitacion) where.idLicitacion = { contains: q.idLicitacion, mode: 'insensitive' }
  if (q.oc) where.ordenCompra = { contains: q.oc, mode: 'insensitive' }
  if (q.search) {
    const isNum = /^\d+$/.test(q.search.trim())
    where.OR = [
      { idLicitacion: { contains: q.search, mode: 'insensitive' } },
      { rutCliente: { contains: q.search, mode: 'insensitive' } },
      { referencia: { contains: q.search, mode: 'insensitive' } },
      ...(isNum ? [{ id: parseInt(q.search, 10) }] : []),
    ]
  }
  const lics = await fastify.prisma.cotizacionLicitacion.findMany({
    where,
    include: { items: true },
    orderBy: { fecha: 'desc' },
  })
  const ruts = [...new Set(lics.map(l => l.rutCliente).filter(Boolean))]
  const clientes = ruts.length ? await fastify.prisma.cliente.findMany({
    where: { rut: { in: ruts } },
    select: { rut: true, razonSocial: true, nombre: true, email: true },
  }) : []
  const clienteMap = Object.fromEntries(clientes.map(c => [c.rut, c]))
  return lics.map(l => {
    const total = (l.items || []).reduce((s, i) => s + Number(i.cantAdjudicados || i.cantidad || 0) * Number(i.precio || 0), 0)
    const cliente = clienteMap[l.rutCliente] || null
    return {
      fuente: 'licitacion',
      id: l.id,
      nInterno: null,
      fecha: l.fecha,
      tipo: 'Licitacion',
      cliente: l.rutCliente,
      nombreCliente: cliente?.razonSocial || cliente?.nombre || null,
      emailCliente: cliente?.email || null,
      ref: l.idLicitacion || '',
      total,
      abono: 0,
      facturado: 0,
      saldo: total,
      estado: l.estado,
      pago: null,
      creadorNombre: l.usuario || null,
      ordenVinculadaId: l.ordenId || null,
      detalleProductos: [],
    }
  })
}

async function getMatrizRows(fastify, query, user) {
  const ctx = await buildContext(fastify, query, user)
  if (ctx.error) return ctx
  const restrictToOrden = Boolean(ctx.query.nInterno || ctx.query.odt || ctx.query.guia || ctx.query.nc || ctx.query.nd || ctx.query.estadoPago || ctx.query.estadoEntrega || ctx.query.noPagada || ctx.query.pendienteEntrega || ctx.query.entregada || ctx.scope === 'historico')
  const tipo = ctx.query.tipo
  const inOrden = !tipo || ['venta-sala', 'venta-directa', 'convenio-marco', 'licitacion'].includes(tipo) || restrictToOrden
  const inOcOnline = !restrictToOrden && !ctx.query.rut && !ctx.query.nombre && !ctx.query.idLicitacion && (!tipo || tipo === 'venta-web')
  const inLicitacion = !restrictToOrden && (!tipo || tipo === 'licitacion' || ctx.query.idLicitacion)
  const parts = await Promise.all([
    inOrden ? getOrdenRows(fastify, ctx, user) : [],
    inOcOnline ? getOcOnlineRows(fastify, ctx, user) : [],
    inLicitacion ? getLicitacionRows(fastify, ctx, user) : [],
  ])
  const rows = parts.flat().sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0))
  return { rows, ctx }
}

async function exportDetalleProductos(fastify, query, user, reply) {
  const ctx = await buildContext(fastify, query, user)
  if (ctx.error) return reply.code(400).send({ error: ctx.error })
  const where = await buildOrdenWhere(fastify, ctx, user)
  const ordenes = await fastify.prisma.orden.findMany({
    where,
    include: { items: { where: { eliminado: false } } },
    orderBy: { createdAt: 'desc' },
  })
  const productoIds = [...new Set(ordenes.flatMap(o => o.items.map(i => i.productoId).filter(Boolean)))]
  const productos = productoIds.length ? await fastify.prisma.producto.findMany({
    where: { id: { in: productoIds } },
    select: {
      id: true,
      categoria: true,
      proveedor: true,
      codigoInterno: true,
      subcategoria: { select: { nombre: true, categoria: { select: { nombre: true } } } },
    },
  }) : []
  const productoMap = Object.fromEntries(productos.map(p => [p.id, p]))
  const rows = ordenes.flatMap(o => o.items.map(i => {
    const p = productoMap[i.productoId] || {}
    return {
      nInterno: o.nInterno,
      codigoInterno: i.codigoInterno || p.codigoInterno,
      producto: i.nombre || i.descripcion,
      categoria: p.subcategoria?.categoria?.nombre || p.categoria,
      subcategoria: p.subcategoria?.nombre,
      proveedor: p.proveedor,
      cantidad: i.cantidad,
      total: totalItem(i),
      entregados: i.nEntregados,
      fecha: o.createdAt,
    }
  }))
  const csv = rowsToCsv(rows, [
    { key: 'nInterno', label: 'N Interno' },
    { key: 'codigoInterno', label: 'Codigo Interno' },
    { key: 'producto', label: 'Producto' },
    { key: 'categoria', label: 'Categoria' },
    { key: 'subcategoria', label: 'Subcategoria' },
    { key: 'proveedor', label: 'Proveedor' },
    { key: 'cantidad', label: 'Cant' },
    { key: 'total', label: 'Total' },
    { key: 'entregados', label: 'Entregados' },
    { key: 'fecha', label: 'Fecha' },
  ])
  return sendCsv(reply, `matriz_ventas_detalle_productos_${todayIso()}.csv`, csv)
}

async function exportGuias(fastify, user, reply) {
  const where = { eliminado: false }
  const sucursalId = getUserSucursalId(user)
  if (sucursalId) where.orden = { is: { sucursalId } }
  const guias = await fastify.prisma.guiaDespacho.findMany({
    where,
    orderBy: { fechaGuia: 'desc' },
    take: 10000,
  })
  const csv = rowsToCsv(guias, [
    { key: 'nInterno', label: 'N Interno' },
    { key: 'nGuia', label: 'N Guia' },
    { key: 'createdAt', label: 'Fecha Creacion' },
    { key: 'origen', label: 'Origen' },
    { key: 'fechaGuia', label: 'Fecha Guia' },
  ])
  return sendCsv(reply, `matriz_ventas_guias_${todayIso()}.csv`, csv)
}

async function exportNdNc(fastify, user, reply) {
  const where = scopedMovimientoCajaWhere(user, {
    eliminado: false,
  })
  const docWhere = mergeWhere({ OR: [docFilter(null, 'nc'), docFilter(null, 'nd')] }, ACTIVE_DOCUMENT_WHERE)
  const docs = await fastify.prisma.movimientoCaja.findMany({
    where: mergeWhere(where, docWhere),
    orderBy: { fecha: 'desc' },
    take: 10000,
  })
  const csv = rowsToCsv(docs, [
    { key: 'ordenId', label: 'Orden ID' },
    { key: 'documento', label: 'Documento' },
    { key: 'nDoc', label: 'N Documento' },
    { key: 'tipoDocumento', label: 'Tipo' },
    { key: 'usuario', label: 'Usuario' },
    { key: 'monto', label: 'Monto' },
    { key: 'cuotas', label: 'Cuotas' },
    { key: 'pagaCon', label: 'Paga con' },
    { key: 'fecha', label: 'Fecha Creacion' },
    { key: 'medioPago', label: 'Medio de Pago' },
    { key: 'estadoDoc', label: 'Estado' },
  ])
  return sendCsv(reply, `matriz_ventas_nc_nd_${todayIso()}.csv`, csv)
}

export default async function matrizVentasRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const page = parsePage(request.query.page || '1')
    const result = await getMatrizRows(fastify, request.query, request.user)
    if (result.error) return reply.code(400).send({ error: result.error })
    const skip = (page - 1) * LIMIT
    const rows = result.rows
    const items = rows.slice(skip, skip + LIMIT)
    const totalMonto = rows.reduce((s, r) => s + Number(r.total || 0), 0)
    return {
      items,
      total: rows.length,
      limit: LIMIT,
      totalMonto,
      defaultVentasHoy: Boolean(result.ctx?.query?.defaultVentasHoy),
    }
  })

  fastify.get('/export', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const formato = String(request.query.formato || 'resumen')
    if (formato === 'detalle-productos') return exportDetalleProductos(fastify, request.query, request.user, reply)
    if (formato === 'guias') return exportGuias(fastify, request.user, reply)
    if (formato === 'ndnc') return exportNdNc(fastify, request.user, reply)
    const result = await getMatrizRows(fastify, request.query, request.user)
    if (result.error) return reply.code(400).send({ error: result.error })
    const csv = rowsToCsv(result.rows, [
      { key: 'nInterno', label: 'N Interno' },
      { key: 'ref', label: 'ID licitacion / OC' },
      { key: 'total', label: 'Total Venta' },
      { key: 'abono', label: 'Abono' },
      { key: 'facturado', label: 'Total Facturado' },
      { key: 'ncTotal', label: 'NC Totales' },
      { key: 'ndTotal', label: 'ND Totales' },
      { key: 'saldo', label: 'Saldo' },
      { key: 'estado', label: 'Estado' },
      { key: 'pago', label: 'Estado Pago' },
      { key: 'estadoEntrega', label: 'Estado Entrega' },
      { key: 'fechaEstadoEntrega', label: 'Fecha Up Entrega' },
      { key: 'fecha', label: 'Fecha Creacion' },
      { key: 'creadorNombre', label: 'Creado por' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'nombreCliente', label: 'Nombre' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'documentosLegacy', label: 'Documentos' },
      { key: 'emailCliente', label: 'Email' },
    ])
    return sendCsv(reply, `matriz_ventas_resumen_${todayIso()}.csv`, csv)
  })

  fastify.get('/totales', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const result = await getMatrizRows(fastify, request.query, request.user)
    if (result.error) return reply.code(400).send({ error: result.error })
    const sumByFuente = fuente => {
      const rows = result.rows.filter(row => row.fuente === fuente)
      return {
        count: rows.length,
        total: rows.reduce((sum, row) => sum + Number(row.total || 0), 0),
      }
    }
    const ordenes = sumByFuente('orden')
    const ocOnline = sumByFuente('oc-online')
    const licitaciones = sumByFuente('licitacion')
    return {
      ordenes,
      ocOnline,
      licitaciones,
      gran: ordenes.total + ocOnline.total + licitaciones.total,
    }
  })
}
