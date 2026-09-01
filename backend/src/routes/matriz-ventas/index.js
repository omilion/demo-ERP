import { sendExport } from '../../utils/export.js'
import { getUserSucursalId } from '../caja/scope.js'
import { buildOrdenScopeWhere, getPrimerRegistroInterno, mergeWhere, parseOrdenScope } from '../historico/corte.js'
import { parseDate, parsePage, parsePositiveInt } from '../operational-utils.js'
import { computeVentaFinancialState } from '../ventas/financial.js'
import { deriveEstadoFlujo, GRAFIAS_CONVENIO_MARCO, TIPOS_VENTA_MOSTRADOR, grafiasDeTipoVenta } from '../ventas/estados-normalize.js'
import { transitionEstadoFlujoFormal } from '../ventas/estado-flujo-formal.js'

const LIMIT = 100
const MAX_PAGE_SIZE = 500
const NC_DOCS = ['NC Plast', 'NC Laura', 'NC', 'Nota Credito', 'Nota de Credito']
const ND_DOCS = ['ND Plast', 'ND Laura', 'ND', 'Nota Debito', 'Nota de Debito']

function hasValue(value) {
  return value !== undefined && value !== null && value !== ''
}

function parsePageSize(value, fallback) {
  const n = parsePositiveInt(value)
  return n ? Math.min(n, MAX_PAGE_SIZE) : fallback
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
  if (tipo === 'venta-sala' || tipo === 'venta-directa') return { tipo: { in: [...TIPOS_VENTA_MOSTRADOR] } }
  if (tipo === 'venta-web' || tipo === 'web') return { tipo: { in: ['Venta Web', 'Venta web', 'OC Online', 'Web'] } }
  if (tipo === 'convenio-marco') return { tipo: { in: [...GRAFIAS_CONVENIO_MARCO] } }
  if (tipo === 'licitacion') return { tipo: { contains: 'Licit', mode: 'insensitive' } }
  // Cualquier otro tipo del catalogo -Compra Agil, Trato Directo, Marketplace-
  // se resuelve con sus grafias. Devolver {} dejaba la consulta sin filtro, de
  // modo que una pestana nueva mostraba todas las ventas en vez de ninguna.
  const grafias = grafiasDeTipoVenta(tipo)
  if (grafias.length) return { tipo: { in: grafias } }
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

async function resolveOrdenIdsBySearchDocs(prisma, search, user) {
  if (!search) return null
  const where = scopedMovimientoCajaWhere(user, {
    eliminado: false,
    OR: [
      { nDoc: { contains: search, mode: 'insensitive' } },
      { numeroNCInterna: { contains: search, mode: 'insensitive' } },
      { documento: { contains: search, mode: 'insensitive' } },
      { tipoDocumento: { contains: search, mode: 'insensitive' } },
    ],
  })
  const docWhere = mergeWhere(where, ACTIVE_DOCUMENT_WHERE)
  const docs = await prisma.movimientoCaja.findMany({ where: docWhere, select: { ordenId: true } })
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
  // Solo el filtro rapido "ventas hoy" acota a la fecha actual. Sin filtros la matriz
  // muestra todo el set (operacional por defecto) paginado, no solo las ventas de hoy.
  if (hasValue(effective.ventasHoy)) {
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

  const isSearchNum = effective.search ? /^\d+$/.test(effective.search.trim()) : false

  const [
    rutsByNombre,
    ordenIdsByOdt,
    guiaCondition,
    ordenIdsByDocs,
    ordenIdsByLic,
    rutsByNombreSearch,
    ordenIdsByOdtSearch,
    guiaConditionSearch,
    ordenIdsByDocsSearch,
    ordenIdsByLicSearch,
  ] = await Promise.all([
    resolveRutsByNombre(fastify.prisma, effective.nombre),
    resolveOrdenIdsByOdt(fastify.prisma, effective.odt, user),
    resolveOrdenConditionByGuia(fastify.prisma, effective.guia, user),
    resolveOrdenIdsByDocumento(fastify.prisma, effective, user),
    resolveOrdenIdsByIdLicitacion(fastify.prisma, effective.idLicitacion, user),
    effective.search ? resolveRutsByNombre(fastify.prisma, effective.search) : null,
    effective.search && isSearchNum ? resolveOrdenIdsByOdt(fastify.prisma, effective.search, user) : null,
    effective.search && isSearchNum ? resolveOrdenConditionByGuia(fastify.prisma, effective.search, user) : null,
    effective.search ? resolveOrdenIdsBySearchDocs(fastify.prisma, effective.search, user) : null,
    effective.search ? resolveOrdenIdsByIdLicitacion(fastify.prisma, effective.search, user) : null,
  ])
  for (const value of [ordenIdsByOdt, guiaCondition, ordenIdsByOdtSearch, guiaConditionSearch]) {
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
    rutsByNombreSearch,
    ordenIdsByOdtSearch,
    guiaConditionSearch,
    ordenIdsByDocsSearch,
    ordenIdsByLicSearch,
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
    const searchOr = [
      { creadorNombre: { contains: q.search, mode: 'insensitive' } },
      { rutCliente: { contains: q.search, mode: 'insensitive' } },
      { observaciones: { contains: q.search, mode: 'insensitive' } },
      { licitacion: { contains: q.search, mode: 'insensitive' } },
      ...(isNum ? [{ nInterno: parseInt(q.search, 10) }, { id: parseInt(q.search, 10) }] : []),
    ]

    if (ctx.rutsByNombreSearch?.length) {
      searchOr.push({ rutCliente: { in: ctx.rutsByNombreSearch } })
    }
    if (ctx.ordenIdsByOdtSearch?.length) {
      searchOr.push({ id: { in: ctx.ordenIdsByOdtSearch } })
    }
    if (ctx.guiaConditionSearch?.OR?.length) {
      searchOr.push(...ctx.guiaConditionSearch.OR)
    }
    if (ctx.ordenIdsByDocsSearch?.length) {
      searchOr.push({ id: { in: ctx.ordenIdsByDocsSearch } })
    }
    if (ctx.ordenIdsByLicSearch?.length) {
      searchOr.push({ id: { in: ctx.ordenIdsByLicSearch } })
    }

    where = mergeWhere(where, { OR: searchOr })
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
  // El filtro por fecha es autonomo: cuando hay rango de fechas, la busqueda abarca todo
  // el historial. Sin un scope explicito, la matriz tambien parte mostrando todo el
  // historial; el corte solo aplica cuando el usuario pide scope=operacional.
  const hasDateFilter = Boolean(ctx.dateDesde || ctx.dateHasta)
  const hasExplicitScope = hasValue(ctx.query.scope)
  const effectiveScope = (!hasExplicitScope || (hasDateFilter && ctx.scope === 'operacional')) ? 'todos' : ctx.scope
  where = mergeWhere(where, buildOrdenScopeWhere(effectiveScope, corte))
  return where
}

async function getOrdenRowsByWhere(fastify, where) {
  const ordenes = await fastify.prisma.orden.findMany({
    where,
    include: { items: { where: { eliminado: false } }, cargos: true },
    orderBy: { createdAt: 'desc' },
  })
  const ruts = [...new Set(ordenes.map(o => o.rutCliente).filter(Boolean))]
  const ordenIds = ordenes.map(o => o.id)
  // El orden importa: cada nombre corresponde a la consulta en la misma posicion.
  const [clientesArr, odtsArr, cotizArr, despachosArr, guiasArr, movsArr, multasArr] = await Promise.all([
    ruts.length ? fastify.prisma.cliente.findMany({
      where: { rut: { in: ruts } },
      select: { rut: true, razonSocial: true, nombre: true, email: true, conflictivo: true, conflictivoDetalle: true },
    }) : [],
    ordenIds.length ? fastify.prisma.odt.findMany({
      where: { ordenId: { in: ordenIds }, eliminado: false },
      select: { id: true, ordenId: true, estado: true },
    }) : [],
    ordenIds.length ? fastify.prisma.cotizacionLicitacion.findMany({
      where: { ordenId: { in: ordenIds } },
      select: { id: true, idLicitacion: true, ordenId: true },
    }) : [],
    // El despacho y la guia son tablas distintas: bodega crea el despacho y la guia
    // puede venir despues o no venir. Mirando solo las guias, la Matriz mostraba la
    // venta sin movimiento aunque bodega ya la hubiera tomado.
    ordenIds.length ? fastify.prisma.despacho.findMany({
      where: { ordenId: { in: ordenIds }, eliminado: false },
      select: { id: true, ordenId: true, tipoDespacho: true, parcial: true, fechaInterno: true, fechaEntrega: true },
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
  const despachosMap = {}; for (const d of despachosArr) (despachosMap[d.ordenId] ||= []).push({ id: d.id, tipo: d.tipoDespacho, parcial: d.parcial, fechaInterno: d.fechaInterno, fechaEntrega: d.fechaEntrega })
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
    const despachos = despachosMap[o.id] || []
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
      clienteConflictivo: cliente?.conflictivo || false,
      clienteConflictivoDetalle: cliente?.conflictivoDetalle || null,
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
      estadoFlujo: deriveEstadoFlujo({ ...o, estadoPago: financialState.estadoPago }),
      creadorNombre: o.creadorNombre || null,
      guiasLegacy: o.guias || null,
      odts,
      odtCount: odts.length,
      guias,
      despachos,
      despachosCount: despachos.length,
      guiasCount: guias.length,
      documentos,
      documentosCount: documentos.length,
      documentosLegacy,
      cotizacion: cotizMap[o.id] || null,
      detalleProductos: detalleProductos(o.items || []),
      enviosParciales: o.enviosParciales,
      montoDespacho: o.montoDespacho,
      fechaPlazo: o.fechaPlazo,
      direccionDespacho: o.direccionDespacho,
      contactoDespacho: o.contactoDespacho,
      regionDespacho: o.regionDespacho,
      comunaDespacho: o.comunaDespacho,
      ciudadDespacho: o.ciudadDespacho,
    }
  })
}

function buildOcOnlineWhere(ctx, user) {
  const q = ctx.query
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
  return where
}

async function getOcOnlineRowsByWhere(fastify, where) {
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

function buildLicitacionWhere(ctx, user) {
  const q = ctx.query
  const where = scopedWhere(user, { ordenId: null })
  if (ctx.dateDesde || ctx.dateHasta) where.fecha = {}
  if (ctx.dateDesde) where.fecha.gte = ctx.dateDesde
  if (ctx.dateHasta) where.fecha.lte = ctx.dateHasta
  if (q.rut) where.rutCliente = { contains: q.rut, mode: 'insensitive' }
  if (ctx.rutsByNombre) {
    if (!ctx.rutsByNombre.length) { where.id = -1; return where }
    where.rutCliente = { in: ctx.rutsByNombre }
  }
  if (q.idLicitacion) where.idLicitacion = { contains: q.idLicitacion, mode: 'insensitive' }
  if (q.oc) where.ordenCompra = { contains: q.oc, mode: 'insensitive' }
  if (q.search) {
    const isNum = /^\d+$/.test(q.search.trim())
    const searchOr = [
      { idLicitacion: { contains: q.search, mode: 'insensitive' } },
      { rutCliente: { contains: q.search, mode: 'insensitive' } },
      { referencia: { contains: q.search, mode: 'insensitive' } },
      { ordenCompra: { contains: q.search, mode: 'insensitive' } },
      ...(isNum ? [{ id: parseInt(q.search, 10) }] : []),
    ]
    if (ctx.rutsByNombreSearch?.length) {
      searchOr.push({ rutCliente: { in: ctx.rutsByNombreSearch } })
    }
    where.OR = searchOr
  }
  return where
}

async function getLicitacionRowsByWhere(fastify, where) {
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

function matrizSourceFlags(ctx) {
  const q = ctx.query
  const restrictToOrden = Boolean(q.nInterno || q.odt || q.guia || q.nc || q.nd || q.estadoPago || q.estadoEntrega || q.noPagada || q.pendienteEntrega || q.entregada || ctx.scope === 'historico')
  const tipo = q.tipo
  const inOrden = !tipo || ['venta-sala', 'venta-directa', 'convenio-marco', 'licitacion', 'venta-web', 'web'].includes(tipo) || restrictToOrden
  const inOcOnline = !restrictToOrden && !q.rut && !q.nombre && !q.idLicitacion && (!tipo || tipo === 'venta-web' || tipo === 'web')
  const inLicitacion = !restrictToOrden && (!tipo || tipo === 'licitacion' || q.idLicitacion)
  return { inOrden, inOcOnline, inLicitacion }
}

async function matrizWheres(fastify, ctx, user) {
  const { inOrden, inOcOnline, inLicitacion } = matrizSourceFlags(ctx)
  const ordenWhere = inOrden ? await buildOrdenWhere(fastify, ctx, user) : null
  const ocWhere = inOcOnline ? buildOcOnlineWhere(ctx, user) : null
  const licWhere = inLicitacion ? buildLicitacionWhere(ctx, user) : null
  return { ordenWhere, ocWhere, licWhere }
}

// Paginacion a nivel de BD: por cada fuente se traen solo (id, fecha) de los primeros
// (skip+limit) elementos mas recientes, luego se funden en memoria y se toman exactamente [skip, skip+limit].
// Asi NO se cargan miles de registros ni sus detalles para armar una pagina.
async function getMatrizPage(fastify, query, user, { page, limit }) {
  const ctx = await buildContext(fastify, query, user)
  if (ctx.error) return ctx
  const { ordenWhere, ocWhere, licWhere } = await matrizWheres(fastify, ctx, user)
  const skip = (page - 1) * limit
  const take = skip + limit
  const [ordenKeys, ordenCount, ocKeys, ocCount, licKeys, licCount] = await Promise.all([
    ordenWhere ? fastify.prisma.orden.findMany({ where: ordenWhere, select: { id: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take }) : [],
    ordenWhere ? fastify.prisma.orden.count({ where: ordenWhere }) : 0,
    ocWhere ? fastify.prisma.ordenCompraOnline.findMany({ where: ocWhere, select: { id: true, fechaHora: true }, orderBy: { fechaHora: 'desc' }, take }) : [],
    ocWhere ? fastify.prisma.ordenCompraOnline.count({ where: ocWhere }) : 0,
    licWhere ? fastify.prisma.cotizacionLicitacion.findMany({ where: licWhere, select: { id: true, fecha: true }, orderBy: { fecha: 'desc' }, take }) : [],
    licWhere ? fastify.prisma.cotizacionLicitacion.count({ where: licWhere }) : 0,
  ])
  const keys = [
    ...ordenKeys.map(k => ({ fuente: 'orden', id: k.id, fecha: k.createdAt })),
    ...ocKeys.map(k => ({ fuente: 'oc-online', id: k.id, fecha: k.fechaHora })),
    ...licKeys.map(k => ({ fuente: 'licitacion', id: k.id, fecha: k.fecha })),
  ].sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0))
  const pageKeys = keys.slice(skip, skip + limit)
  const ordenIds = pageKeys.filter(k => k.fuente === 'orden').map(k => k.id)
  const ocIds = pageKeys.filter(k => k.fuente === 'oc-online').map(k => k.id)
  const licIds = pageKeys.filter(k => k.fuente === 'licitacion').map(k => k.id)
  const [ordenRows, ocRows, licRows] = await Promise.all([
    ordenIds.length ? getOrdenRowsByWhere(fastify, { id: { in: ordenIds } }) : [],
    ocIds.length ? getOcOnlineRowsByWhere(fastify, { id: { in: ocIds } }) : [],
    licIds.length ? getLicitacionRowsByWhere(fastify, { id: { in: licIds } }) : [],
  ])
  const byKey = new Map()
  for (const r of [...ordenRows, ...ocRows, ...licRows]) byKey.set(`${r.fuente}:${r.id}`, r)
  const items = pageKeys.map(k => byKey.get(`${k.fuente}:${k.id}`)).filter(Boolean)
  return { items, total: ordenCount + ocCount + licCount, limit, page, ctx }
}

async function aggOrdenMonto(fastify, where) {
  const ordenes = await fastify.prisma.orden.findMany({
    where,
    select: {
      abono: true,
      descuentoPct: true,
      descuentoMonto: true,
      items: { where: { eliminado: false }, select: { cantidad: true, precioUnitario: true, cargoTransporte: true } },
      cargos: { select: { valor: true } },
    },
  })
  let total = 0
  for (const o of ordenes) total += computeVentaFinancialState(o, {}).total
  return { count: ordenes.length, total }
}

async function aggOcMonto(fastify, where) {
  const [agg, count] = await Promise.all([
    fastify.prisma.ordenCompraOnline.aggregate({ where, _sum: { total: true } }),
    fastify.prisma.ordenCompraOnline.count({ where }),
  ])
  return { count, total: agg._sum.total || 0 }
}

async function aggLicMonto(fastify, where) {
  const lics = await fastify.prisma.cotizacionLicitacion.findMany({
    where,
    select: { items: { select: { cantAdjudicados: true, cantidad: true, precio: true } } },
  })
  let total = 0
  for (const l of lics) total += (l.items || []).reduce((s, i) => s + Number(i.cantAdjudicados || i.cantidad || 0) * Number(i.precio || 0), 0)
  return { count: lics.length, total }
}

async function getTotalsForPeriod(fastify, start, end, user) {
  // El KPI reparte las ventas en tres cubos: este, web y licitaciones. 'Normal'
  // va aca aunque NO sea venta de mostrador -es la venta simple, un tipo propio-
  // porque si no queda fuera de los tres y desaparece del total vendido. Son 60
  // ordenes: el filtro de pantalla las separa, el total de la empresa las suma.
  const ordenesWhere = {
    eliminada: false,
    createdAt: { gte: start, lte: end },
    tipo: { in: [...TIPOS_VENTA_MOSTRADOR, ...GRAFIAS_CONVENIO_MARCO, 'Normal'] },
    ...userSucursalWhere(user)
  }
  const ordenes = await aggOrdenMonto(fastify, ordenesWhere)

  const ocTableWhere = {
    fechaHora: { gte: start, lte: end },
    ...scopedWhere(user)
  }
  const ordenWebWhere = {
    eliminada: false,
    createdAt: { gte: start, lte: end },
    tipo: { in: ['Venta Web', 'Venta web', 'OC Online', 'Web'] },
    ...userSucursalWhere(user)
  }
  const [ocTable, ordenWeb] = await Promise.all([
    aggOcMonto(fastify, ocTableWhere),
    aggOrdenMonto(fastify, ordenWebWhere)
  ])
  const ocOnline = {
    count: ocTable.count + ordenWeb.count,
    total: ocTable.total + ordenWeb.total
  }

  const licWhere = {
    fecha: { gte: start, lte: end },
    ordenId: null,
    ...scopedWhere(user)
  }
  const licDirect = await aggLicMonto(fastify, licWhere)

  const ordenLicWhere = {
    eliminada: false,
    createdAt: { gte: start, lte: end },
    tipo: { contains: 'Licit', mode: 'insensitive' },
    ...userSucursalWhere(user)
  }
  const ordenLic = await aggOrdenMonto(fastify, ordenLicWhere)

  const licitaciones = {
    count: licDirect.count + ordenLic.count,
    total: licDirect.total + ordenLic.total
  }

  return { ordenes, ocOnline, licitaciones, gran: ordenes.total + ocOnline.total + licitaciones.total }
}

export async function getMatrizTotales(fastify, query, user) {
  const ctx = await buildContext(fastify, query, user)
  if (ctx.error) return ctx
  const { ordenWhere, ocWhere, licWhere } = await matrizWheres(fastify, ctx, user)
  const [ordenes, ocOnline, licitaciones] = await Promise.all([
    ordenWhere ? aggOrdenMonto(fastify, ordenWhere) : { count: 0, total: 0 },
    ocWhere ? aggOcMonto(fastify, ocWhere) : { count: 0, total: 0 },
    licWhere ? aggLicMonto(fastify, licWhere) : { count: 0, total: 0 },
  ])

  // Get fixed dashboard KPIs (Today, Monthly, YTD)
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const day = now.getDate()

  const todayStart = new Date(year, month, day, 0, 0, 0, 0)
  const todayEnd = new Date(year, month, day, 23, 59, 59, 999)
  const monthStart = new Date(year, month, 1, 0, 0, 0, 0)
  const yearStart = new Date(year, 0, 1, 0, 0, 0, 0)
  const lastYearStart = new Date(year - 1, 0, 1, 0, 0, 0, 0)
  const lastYearEnd = new Date(year - 1, month, day, 23, 59, 59, 999)

  // Contadores operacionales (equivalentes a los del legacy): cuentan TODO lo
  // pendiente sin filtrar por fecha, porque una entrega atrasada de la semana
  // pasada sigue pendiente hoy. Mismo scope de sucursal que el resto.
  const operacionalBase = {
    estado: 'Activa',
    eliminada: false,
    nInterno: { not: null, gt: 0 },
    ...userSucursalWhere(user),
  }
  const [pendienteEntrega, entregadaNoPagada, noPagada] = await Promise.all([
    fastify.prisma.orden.count({ where: { ...operacionalBase, estadoEntrega: 'Pendiente entrega' } }),
    fastify.prisma.orden.count({
      where: { ...operacionalBase, estadoEntrega: { in: ['Entregado', 'Entregada'] }, estadoPago: 'No pagada' }
    }),
    fastify.prisma.orden.count({ where: { ...operacionalBase, estadoPago: 'No pagada' } }),
  ])

  const [hoy, mes, ytd, prevYtd] = await Promise.all([
    getTotalsForPeriod(fastify, todayStart, todayEnd, user),
    getTotalsForPeriod(fastify, monthStart, todayEnd, user),
    getTotalsForPeriod(fastify, yearStart, todayEnd, user),
    getTotalsForPeriod(fastify, lastYearStart, lastYearEnd, user)
  ])

  const ytdTotal = ytd.gran
  const prevYtdTotal = prevYtd.gran
  let variacionYtd = 0
  if (prevYtdTotal > 0) {
    variacionYtd = Number(((ytdTotal - prevYtdTotal) / prevYtdTotal * 100).toFixed(2))
  } else if (ytdTotal > 0) {
    variacionYtd = 100
  }

  return {
    ordenes,
    ocOnline,
    licitaciones,
    gran: ordenes.total + ocOnline.total + licitaciones.total,
    kpis: {
      hoy,
      mes,
      ytd: { total: ytdTotal },
      prevYtd: { total: prevYtdTotal },
      variacionYtd,
      operacional: { pendienteEntrega, entregadaNoPagada, noPagada }
    }
  }
}

// Materializa todas las filas filtradas (solo para export CSV, donde la descarga es completa
// por definicion). El listado paginado usa getMatrizPage.
async function getMatrizRows(fastify, query, user) {
  const ctx = await buildContext(fastify, query, user)
  if (ctx.error) return ctx
  const { ordenWhere, ocWhere, licWhere } = await matrizWheres(fastify, ctx, user)
  const parts = await Promise.all([
    ordenWhere ? getOrdenRowsByWhere(fastify, ordenWhere) : [],
    ocWhere ? getOcOnlineRowsByWhere(fastify, ocWhere) : [],
    licWhere ? getLicitacionRowsByWhere(fastify, licWhere) : [],
  ])
  const rows = parts.flat().sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0))
  return { rows, ctx }
}

async function exportDetalleProductos(fastify, query, user, reply, archivo) {
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
  return sendExport(reply, {
    archivo,
    nombre: `matriz_ventas_detalle_productos_${todayIso()}`,
    rows: rows,
    columns: [
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
  ],
  })
}

async function exportGuias(fastify, user, reply, archivo) {
  const where = { eliminado: false }
  const sucursalId = getUserSucursalId(user)
  if (sucursalId) where.orden = { is: { sucursalId } }
  const guias = await fastify.prisma.guiaDespacho.findMany({
    where,
    orderBy: { fechaGuia: 'desc' },
    take: 10000,
  })
  return sendExport(reply, {
    archivo,
    nombre: `matriz_ventas_guias_${todayIso()}`,
    rows: guias,
    columns: [
    { key: 'nInterno', label: 'N Interno' },
    { key: 'nGuia', label: 'N Guia' },
    { key: 'createdAt', label: 'Fecha Creacion' },
    { key: 'origen', label: 'Origen' },
    { key: 'fechaGuia', label: 'Fecha Guia' },
  ],
  })
}

async function exportNdNc(fastify, user, reply, archivo) {
  const where = scopedMovimientoCajaWhere(user, {
    eliminado: false,
  })
  const docWhere = mergeWhere({ OR: [docFilter(null, 'nc'), docFilter(null, 'nd')] }, ACTIVE_DOCUMENT_WHERE)
  const docs = await fastify.prisma.movimientoCaja.findMany({
    where: mergeWhere(where, docWhere),
    orderBy: { fecha: 'desc' },
    take: 10000,
  })
  return sendExport(reply, {
    archivo,
    nombre: `matriz_ventas_nc_nd_${todayIso()}`,
    rows: docs,
    columns: [
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
  ],
  })
}

export default async function matrizVentasRoutes(fastify) {
  // El cierre es explícito: pago y entrega son precondiciones, pero no cambian
  // por sí solos el estado formal ni dejan quién autorizó el cierre.
  fastify.get('/:id/estado-flujo', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'id invalido' })
    const orden = await fastify.prisma.orden.findFirst({
      where: scopedWhere(request.user, { id, eliminada: false }),
      select: { id: true, estadoFlujoFormal: true, fechaEstadoFlujo: true },
    })
    if (!orden) return reply.code(404).send({ error: 'Orden no encontrada' })
    const historial = await fastify.prisma.ordenEstadoFlujoHistorial.findMany({
      where: { ordenId: id }, orderBy: { createdAt: 'desc' }, take: 100,
    })
    return { orden, historial }
  })

  fastify.post('/:id/estado-flujo', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    const estado = String(request.body?.estado || '').trim()
    const motivo = String(request.body?.motivo || '').trim() || null
    if (!id || !estado) return reply.code(400).send({ error: 'id y estado requeridos' })
    const visible = await fastify.prisma.orden.findFirst({
      where: scopedWhere(request.user, { id, eliminada: false }), select: { id: true },
    })
    if (!visible) return reply.code(404).send({ error: 'Orden no encontrada' })
    const result = await fastify.prisma.$transaction(async (tx) => {
      const orden = await tx.orden.findUnique({ where: { id } })
      return transitionEstadoFlujoFormal(tx, orden, estado, request.user, { motivo })
    })
    if (result.error) return reply.code(409).send({ error: result.error })
    return result
  })

  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const page = parsePage(request.query.page || '1')
    const limit = parsePageSize(request.query.pageSize, LIMIT)
    const result = await getMatrizPage(fastify, request.query, request.user, { page, limit })
    if (result.error) return reply.code(400).send({ error: result.error })
    return {
      items: result.items,
      total: result.total,
      limit,
      defaultVentasHoy: Boolean(result.ctx?.query?.defaultVentasHoy),
    }
  })

  fastify.get('/export', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const formato = String(request.query.formato || 'resumen')
    if (formato === 'detalle-productos') return exportDetalleProductos(fastify, request.query, request.user, reply, request.query?.archivo)
    if (formato === 'guias') return exportGuias(fastify, request.user, reply, request.query?.archivo)
    if (formato === 'ndnc') return exportNdNc(fastify, request.user, reply, request.query?.archivo)
    const result = await getMatrizRows(fastify, request.query, request.user)
    if (result.error) return reply.code(400).send({ error: result.error })
    return sendExport(reply, {
      archivo: request.query?.archivo,
      nombre: `matriz_ventas_resumen_${todayIso()}`,
      rows: result.rows,
      columns: [
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
      ],
    })
  })

  fastify.get('/totales', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const result = await getMatrizTotales(fastify, request.query, request.user)
    if (result.error) return reply.code(400).send({ error: result.error })
    return result
  })
}
