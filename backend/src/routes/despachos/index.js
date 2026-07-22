// Gestion de despachos y guias.
import { z } from 'zod'
import { can } from '../../middleware/rbac.js'
import { rowsToCsv, sendCsv } from '../../utils/csv.js'
import { applyDateRange, parseDate, parseOptionalInt, parsePage, parsePositiveInt } from '../operational-utils.js'
import { resolveOdtForWrite, resolveOrdenForWrite } from '../relation-guards.js'
import { registerDespachoMatrizRoutes } from './matriz.js'

const LIST_LIMIT = 100

const optionalId = z.union([z.number().int(), z.string()]).optional().nullable()

const DespachoCreate = z.object({
  ordenId: optionalId,
  odtId: optionalId,
  interno: z.string().optional().nullable(),
  plazoEntrega: z.string().optional().nullable(),
  fechaInterno: z.string().optional().nullable(),
  fechaEntrega: z.string().optional().nullable(),
  tipoDespacho: z.string().optional().nullable(),
  transporte: z.string().optional().nullable(),
  numeroSeguimiento: z.string().optional().nullable(),
  montoEnvio: z.union([z.number(), z.string()]).optional().nullable(),
  direccion: z.string().optional().nullable(),
  contacto: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  comuna: z.string().optional().nullable(),
  parcial: z.boolean().optional(),
  tieneMulta: z.boolean().optional(),
  origenTipo: z.string().optional().nullable(),
  origenId: optionalId,
})

const GuiaCreate = z.object({
  ordenId: optionalId,
  odtId: optionalId,
  nInterno: optionalId,
  nGuia: z.string().min(1),
  fechaGuia: z.string().optional().nullable(),
  origen: z.string().optional().nullable(),
  origenTipo: z.string().optional().nullable(),
  origenId: optionalId,
})

const GuiaUpdate = GuiaCreate.partial()

const PackingUpdate = z.object({
  despachoId: optionalId,
  bultoId: optionalId,
  bultoNumero: z.string().optional().nullable(),
  bultoEstado: z.string().optional().nullable(),
  bultoObservacion: z.string().optional().nullable(),
  observacion: z.string().optional().nullable(),
  items: z.array(z.object({
    id: optionalId,
    itemId: optionalId,
    nEntregados: z.union([z.number().int(), z.string()]),
  })).min(1),
})

const TrackingEventoCreate = z.object({
  estado: z.string().min(1),
  transporte: z.string().optional().nullable(),
  ubicacion: z.string().optional().nullable(),
  observacion: z.string().optional().nullable(),
  tipoIncidente: z.string().optional().nullable(),
  accionTomada: z.string().optional().nullable(),
  responsable: z.string().optional().nullable(),
  fechaCompromiso: z.string().optional().nullable(),
  fechaEvento: z.string().optional().nullable(),
})

export const TRACKING_ESTADOS = ['Preparado', 'En ruta', 'Entregado', 'Incidencia', 'Reprogramado', 'Retenido', 'Devuelto']

function hasValue(value) {
  return value !== undefined && value !== null && value !== ''
}

function cleanText(value) {
  if (!hasValue(value)) return null
  const text = String(value).trim()
  return text || null
}

function userLabel(user) {
  return user?.nombre || user?.username || user?.email || null
}

function canViewEliminados(user) {
  return can(user?.role, 'despacho', 'delete', user?.permisosExtra)
}

function wantsEliminados(value) {
  return value === true || value === 'true'
}

function wantsTrue(value) {
  return value === true || value === 'true' || value === '1' || value === 1
}

function withOrdenSucursalScope(user, where = {}) {
  const sucursalId = parsePositiveInt(user?.sucursalId)
  if (!sucursalId) return where
  return {
    AND: [
      where,
      { orden: { is: { sucursalId } } },
    ],
  }
}

function userCanAccessOrden(user, orden) {
  const sucursalId = parsePositiveInt(user?.sucursalId)
  return !sucursalId || !orden?.sucursalId || orden.sucursalId === sucursalId
}

function parseOptionalPositiveId(value, field) {
  if (!hasValue(value)) return { value: null }
  const parsed = parsePositiveInt(value)
  if (!parsed) return { error: `${field} invalido` }
  return { value: parsed }
}

function rejectInvalidOrigenTipo(origenTipo) {
  if (origenTipo && !['orden', 'odt'].includes(origenTipo)) {
    return { status: 400, error: 'origenTipo debe ser orden u odt' }
  }
  return null
}

export function buildOrdenEntregaSyncFromDespacho({ ordenId, parcial, fechaEntrega } = {}) {
  const parsedOrdenId = parsePositiveInt(ordenId)
  if (!parsedOrdenId) return null
  if (parcial === true) return { ordenId: parsedOrdenId, estadoEntrega: 'Parcial' }
  if (hasValue(fechaEntrega)) return { ordenId: parsedOrdenId, estadoEntrega: 'Entregada' }
  return null
}

export function buildOrdenEntregaSyncFromGuia({
  ordenId,
  currentEstadoEntrega,
  hasExplicitNonPartialDespachoSignal = false,
} = {}) {
  const parsedOrdenId = parsePositiveInt(ordenId)
  if (!parsedOrdenId) return null
  if (currentEstadoEntrega === 'Parcial' && !hasExplicitNonPartialDespachoSignal) return null
  return { ordenId: parsedOrdenId, estadoEntrega: 'Entregada' }
}

async function applyOrdenEntregaSync(prisma, sync) {
  if (!sync) return null
  return prisma.orden.update({
    where: { id: sync.ordenId },
    data: { estadoEntrega: sync.estadoEntrega, fechaEstadoEntrega: new Date() },
  })
}

async function hasNonPartialDespachoEntregaSignal(prisma, ordenId) {
  const despacho = await prisma.despacho.findFirst({
    where: {
      ordenId,
      eliminado: false,
      parcial: false,
      fechaEntrega: { not: null },
    },
    select: { id: true },
  })
  return !!despacho
}

async function ensureUniqueGuia(prisma, nGuia, excludeId = null) {
  const clean = cleanText(nGuia)
  if (!clean) return { status: 400, error: 'nGuia requerida' }
  const where = {
    nGuia: { equals: clean, mode: 'insensitive' },
  }
  if (excludeId) where.NOT = { id: excludeId }
  const existing = await prisma.guiaDespacho.findFirst({ where, select: { id: true } })
  if (existing) return { status: 409, error: 'N guia ya existe' }
  return null
}

async function recalculateOrdenEntrega(prisma, ordenId) {
  const parsedOrdenId = parsePositiveInt(ordenId)
  if (!parsedOrdenId) return null
  const [items, despachos, guias] = await Promise.all([
    prisma.ordenItem.findMany({
      where: { ordenId: parsedOrdenId, eliminado: false },
      select: { cantidad: true, nEntregados: true },
    }),
    prisma.despacho.findMany({
      where: { ordenId: parsedOrdenId, eliminado: false },
      select: { parcial: true, fechaEntrega: true },
    }),
    prisma.guiaDespacho.findMany({
      where: { ordenId: parsedOrdenId, eliminado: false },
      select: { id: true },
    }),
  ])
  const totalItems = items.reduce((sum, item) => sum + Number(item.cantidad || 0), 0)
  const totalEntregados = items.reduce((sum, item) => sum + Number(item.nEntregados || 0), 0)
  let estadoEntrega = 'Pendiente entrega'
  if (totalItems > 0 && totalEntregados >= totalItems) estadoEntrega = 'Entregada'
  else if (totalEntregados > 0) estadoEntrega = 'Parcial'
  else if (guias.length || despachos.some(d => !d.parcial && d.fechaEntrega)) estadoEntrega = 'Entregada'
  else if (despachos.some(d => d.parcial)) estadoEntrega = 'Parcial'

  return prisma.orden.update({
    where: { id: parsedOrdenId },
    data: { estadoEntrega, fechaEstadoEntrega: new Date() },
  })
}

export async function resolveDispatchTraceability(prisma, input = {}) {
  const odtInput = parseOptionalPositiveId(input.odtId, 'odtId')
  if (odtInput.error) return { status: 400, error: odtInput.error }
  const origenInput = parseOptionalPositiveId(input.origenId, 'origenId')
  if (origenInput.error) return { status: 400, error: origenInput.error }
  const explicitOrigenTipo = cleanText(input.origenTipo)
  const origenTipoError = rejectInvalidOrigenTipo(explicitOrigenTipo)
  if (origenTipoError) return origenTipoError

  let odt = null
  if (odtInput.value) {
    const resolvedOdt = await resolveOdtForWrite(prisma, odtInput.value, { requireActive: true })
    if (resolvedOdt.error) return resolvedOdt
    odt = resolvedOdt.odt
  }

  const orderLookup = odt && !hasValue(input.ordenId) && !hasValue(input.nInterno)
    ? { ordenId: odt.ordenId }
    : { ordenId: input.ordenId, nInterno: input.nInterno }
  const resolvedOrden = await resolveOrdenForWrite(prisma, orderLookup, { requireActive: true })
  if (resolvedOrden.error) return resolvedOrden

  if (odt && odt.ordenId !== resolvedOrden.orden.id) {
    return { status: 409, error: 'ODT no pertenece a la orden indicada' }
  }

  const parsedNInterno = hasValue(input.nInterno) ? parsePositiveInt(input.nInterno) : null
  if (hasValue(input.nInterno) && !parsedNInterno) {
    return { status: 400, error: 'nInterno invalido' }
  }
  if (parsedNInterno && resolvedOrden.orden.nInterno && parsedNInterno !== resolvedOrden.orden.nInterno) {
    return { status: 409, error: 'nInterno no coincide con la orden indicada' }
  }

  const expectedOrigenTipo = odt ? 'odt' : 'orden'
  const expectedOrigenId = odt ? odt.id : resolvedOrden.orden.id
  if (explicitOrigenTipo && explicitOrigenTipo !== expectedOrigenTipo) {
    return {
      status: 409,
      error: odt ? 'origenTipo debe ser odt cuando se informa odtId' : 'origenTipo debe ser orden sin odtId',
    }
  }
  const origenId = origenInput.value ?? expectedOrigenId
  if (expectedOrigenTipo === 'odt' && origenId !== odt.id) {
    return { status: 409, error: 'origenId no coincide con odtId' }
  }
  if (expectedOrigenTipo === 'orden' && origenId !== resolvedOrden.orden.id) {
    return { status: 409, error: 'origenId no coincide con ordenId' }
  }

  return {
    orden: resolvedOrden.orden,
    odt,
    nInterno: parsedNInterno ?? resolvedOrden.orden.nInterno ?? null,
    origenTipo: expectedOrigenTipo,
    origenId,
  }
}

export async function validateDispatchFilterCoherence(prisma, input = {}) {
  const ordenInput = parseOptionalPositiveId(input.ordenId, 'ordenId')
  if (ordenInput.error) return { status: 400, error: ordenInput.error }
  const odtInput = parseOptionalPositiveId(input.odtId, 'odtId')
  if (odtInput.error) return { status: 400, error: odtInput.error }
  const nInternoInput = parseOptionalPositiveId(input.nInterno, 'nInterno')
  if (nInternoInput.error) return { status: 400, error: nInternoInput.error }
  const origenInput = parseOptionalPositiveId(input.origenId, 'origenId')
  if (origenInput.error) return { status: 400, error: origenInput.error }
  const origenTipo = cleanText(input.origenTipo)
  const origenTipoError = rejectInvalidOrigenTipo(origenTipo)
  if (origenTipoError) return origenTipoError

  const filters = {
    ordenId: ordenInput.value,
    odtId: odtInput.value,
    nInterno: nInternoInput.value,
    origenTipo,
    origenId: origenInput.value,
  }

  if (origenTipo === 'orden' && filters.origenId && filters.ordenId && filters.origenId !== filters.ordenId) {
    return { status: 409, error: 'origenId no coincide con ordenId' }
  }
  if (origenTipo === 'odt' && filters.origenId && filters.odtId && filters.origenId !== filters.odtId) {
    return { status: 409, error: 'origenId no coincide con odtId' }
  }

  let orden = null
  if (filters.ordenId || filters.nInterno) {
    orden = await prisma.orden.findUnique({
      where: filters.ordenId ? { id: filters.ordenId } : { nInterno: filters.nInterno },
      select: { id: true, nInterno: true },
    })
  }
  if (orden && filters.ordenId && filters.nInterno && orden.nInterno && orden.nInterno !== filters.nInterno) {
    return { status: 409, error: 'nInterno no coincide con la orden indicada' }
  }

  const effectiveOdtId = filters.odtId ?? (origenTipo === 'odt' ? filters.origenId : null)
  const effectiveOrdenId = filters.ordenId ?? (origenTipo === 'orden' ? filters.origenId : null)

  if (effectiveOdtId && (effectiveOrdenId || filters.nInterno)) {
    const odt = await prisma.odt.findUnique({
      where: { id: effectiveOdtId },
      select: { id: true, ordenId: true },
    })
    const expectedOrdenId = effectiveOrdenId ?? orden?.id ?? null
    if (odt?.ordenId && expectedOrdenId && odt.ordenId !== expectedOrdenId) {
      return { status: 409, error: 'ODT no pertenece a la orden indicada' }
    }
  }

  return { filters }
}

export function buildGuideWhereForDespacho(despacho) {
  if (despacho.odtId) {
    return {
      ordenId: despacho.ordenId,
      OR: [
        { odtId: despacho.odtId },
        { origenTipo: 'odt', origenId: despacho.odtId },
      ],
    }
  }
  if (despacho.ordenId) {
    return {
      ordenId: despacho.ordenId,
      OR: [
        { odtId: null },
        { origenTipo: 'orden', origenId: despacho.ordenId },
        { origenTipo: null, origenId: null },
      ],
    }
  }
  return { id: -1 }
}

export function buildClienteOrdenFilter(cliente) {
  const text = cleanText(cliente)
  if (!text) return null
  return {
    orden: {
      is: {
        OR: [
          { rutCliente: { contains: text, mode: 'insensitive' } },
          { emailCliente: { contains: text, mode: 'insensitive' } },
          { clienteSucursal: { is: { nombre: { contains: text, mode: 'insensitive' } } } },
          { clienteSucursal: { is: { cliente: { is: { nombre: { contains: text, mode: 'insensitive' } } } } } },
        ],
      },
    },
  }
}

export function applyDespachoEstadoFilter(where, estado) {
  const normalized = cleanText(estado)?.toLowerCase()
  if (!normalized) return null

  if (['parcial', 'parciales'].includes(normalized)) {
    where.parcial = true
    return null
  }
  if (['multa', 'multado', 'multados'].includes(normalized)) {
    where.tieneMulta = true
    return null
  }
  if (['entregado', 'entregada', 'entregados', 'entregadas'].includes(normalized)) {
    where.fechaEntrega = { ...(typeof where.fechaEntrega === 'object' && where.fechaEntrega !== null ? where.fechaEntrega : {}), not: null }
    where.parcial = false
    return null
  }
  if (['pendiente', 'pendientes'].includes(normalized)) {
    if (where.fechaEntrega && typeof where.fechaEntrega === 'object') {
      return { status: 400, error: 'estado pendiente no admite rango de fecha de entrega' }
    }
    where.fechaEntrega = null
    where.parcial = false
    return null
  }
  return { status: 400, error: 'estado debe ser pendiente, entregada, parcial o multa' }
}

async function buildDespachoListWhere(prisma, user, query = {}) {
  const { desde, hasta, ordenId, odtId, nInterno, interno, origenTipo, origenId, tipo, contacto, transporte, region, comuna, cliente, estado, parcial, tieneMulta, conIncidencia, search, includeEliminados } = query
  const includeDeleted = wantsEliminados(includeEliminados)
  if (includeDeleted && !canViewEliminados(user)) {
    return { status: 403, error: 'No tiene permiso para ver despachos eliminados' }
  }
  const where = withOrdenSucursalScope(user, includeDeleted ? {} : { eliminado: false })
  const traceFilters = await validateDispatchFilterCoherence(prisma, {
    ordenId,
    odtId,
    nInterno: nInterno ?? interno,
    origenTipo,
    origenId,
  })
  if (traceFilters.error) return traceFilters
  if (traceFilters.filters.ordenId) where.ordenId = traceFilters.filters.ordenId
  if (traceFilters.filters.odtId) where.odtId = traceFilters.filters.odtId
  if (traceFilters.filters.nInterno) where.interno = String(traceFilters.filters.nInterno)
  if (traceFilters.filters.origenTipo) where.origenTipo = traceFilters.filters.origenTipo
  if (traceFilters.filters.origenId) where.origenId = traceFilters.filters.origenId
  if (tipo) where.tipoDespacho = { contains: tipo, mode: 'insensitive' }
  if (contacto) where.contacto = { contains: contacto, mode: 'insensitive' }
  if (transporte) where.transporte = { contains: transporte, mode: 'insensitive' }
  if (region) where.region = { contains: region, mode: 'insensitive' }
  if (comuna) where.comuna = { contains: comuna, mode: 'insensitive' }
  if (!applyDateRange(where, 'fechaEntrega', desde, hasta)) return { status: 400, error: 'Rango de fechas invalido' }
  const estadoError = applyDespachoEstadoFilter(where, estado)
  if (estadoError) return estadoError
  if (parcial === 'true') where.parcial = true
  if (tieneMulta === 'true') where.tieneMulta = true
  if (wantsTrue(conIncidencia)) where.trackingEventos = { some: { estado: 'Incidencia' } }
  const clienteFilter = buildClienteOrdenFilter(cliente)
  if (clienteFilter) where.AND = [...(where.AND || []), clienteFilter]
  if (search) {
    const trimmed = search.trim()
    const isNum = /^\d+$/.test(trimmed)
    where.OR = [
      { contacto: { contains: trimmed, mode: 'insensitive' } },
      { direccion: { contains: trimmed, mode: 'insensitive' } },
      { transporte: { contains: trimmed, mode: 'insensitive' } },
      { interno: { contains: trimmed, mode: 'insensitive' } },
      ...(isNum ? [{ ordenId: parseInt(trimmed, 10) }, { odtId: parseInt(trimmed, 10) }] : []),
    ]
  }
  return { where }
}

async function buildGuiaListWhere(prisma, user, query = {}) {
  const { desde, hasta, nGuia, ordenId, odtId, nInterno, origenTipo, origenId, cliente, search, includeEliminados } = query
  const includeDeleted = wantsEliminados(includeEliminados)
  if (includeDeleted && !canViewEliminados(user)) {
    return { status: 403, error: 'No tiene permiso para ver guias eliminadas' }
  }
  const where = withOrdenSucursalScope(user, includeDeleted ? {} : { eliminado: false })
  if (nGuia) where.nGuia = { contains: nGuia, mode: 'insensitive' }
  const traceFilters = await validateDispatchFilterCoherence(prisma, { ordenId, odtId, nInterno, origenTipo, origenId })
  if (traceFilters.error) return traceFilters
  if (traceFilters.filters.ordenId) where.ordenId = traceFilters.filters.ordenId
  if (traceFilters.filters.odtId) where.odtId = traceFilters.filters.odtId
  if (traceFilters.filters.nInterno) where.nInterno = traceFilters.filters.nInterno
  if (traceFilters.filters.origenTipo) where.origenTipo = traceFilters.filters.origenTipo
  if (traceFilters.filters.origenId) where.origenId = traceFilters.filters.origenId
  const clienteFilter = buildClienteOrdenFilter(cliente)
  if (clienteFilter) where.AND = [...(where.AND || []), clienteFilter]
  if (search) {
    const trimmed = search.trim()
    const isNum = /^\d+$/.test(trimmed)
    where.OR = [
      { nGuia: { contains: trimmed, mode: 'insensitive' } },
      { origen: { contains: trimmed, mode: 'insensitive' } },
      ...(isNum ? [{ nInterno: parseInt(trimmed, 10) }, { ordenId: parseInt(trimmed, 10) }, { odtId: parseInt(trimmed, 10) }] : []),
    ]
  }
  if (!applyDateRange(where, 'fechaGuia', desde, hasta)) return { status: 400, error: 'Rango de fechas invalido' }
  return { where }
}

function formatDate(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : ''
}

function toValidDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function roundOne(value) {
  return Math.round(value * 10) / 10
}

function diffHours(start, end) {
  const startDate = toValidDate(start)
  const endDate = toValidDate(end)
  if (!startDate || !endDate || endDate < startDate) return null
  return roundOne((endDate.getTime() - startDate.getTime()) / 36e5)
}

export function buildDespachoTiempoMetrics(despacho = {}, now = new Date()) {
  const start = toValidDate(despacho.fechaInterno) || toValidDate(despacho.createdAt)
  const end = toValidDate(despacho.fechaEntrega) || (despacho.eliminado ? null : toValidDate(now))
  const despachoHoras = diffHours(start, end)
  return {
    despachoHoras,
    despachoDias: despachoHoras == null ? null : roundOne(despachoHoras / 24),
    pendiente: !despacho.fechaEntrega && !despacho.eliminado,
  }
}

function attachDespachoMetrics(items, now = new Date()) {
  const list = Array.isArray(items) ? items : [items]
  const enriched = list.map(item => ({ ...item, tiempos: buildDespachoTiempoMetrics(item, now) }))
  return Array.isArray(items) ? enriched : enriched[0]
}

const TRACKING_EVENT_SELECT = {
  id: true,
  despachoId: true,
  estado: true,
  transporte: true,
  ubicacion: true,
  observacion: true,
  tipoIncidente: true,
  accionTomada: true,
  responsable: true,
  fechaCompromiso: true,
  fechaEvento: true,
  usuario: true,
  createdAt: true,
}

export function normalizeTrackingEstado(value) {
  const text = cleanText(value)
  if (!text) return null
  const lower = text.toLocaleLowerCase('es-CL')
  return TRACKING_ESTADOS.find(estado => estado.toLocaleLowerCase('es-CL') === lower) || null
}

export function buildTrackingEventData(input = {}, user = null, now = new Date()) {
  const estado = normalizeTrackingEstado(input.estado)
  if (!estado) return { error: 'estado tracking invalido' }
  const fechaEvento = hasValue(input.fechaEvento) ? parseDate(input.fechaEvento) : now
  if (hasValue(input.fechaEvento) && !fechaEvento) return { error: 'fechaEvento invalida' }
  const hasIncidentDetail = ['tipoIncidente', 'accionTomada', 'responsable', 'fechaCompromiso'].some(field => hasValue(input[field]))
  if (estado !== 'Incidencia' && hasIncidentDetail) {
    return { error: 'campos de incidencia solo aplican a estado Incidencia' }
  }
  const incidentData = {}
  if (estado === 'Incidencia') {
    incidentData.tipoIncidente = cleanText(input.tipoIncidente)
    incidentData.accionTomada = cleanText(input.accionTomada)
    incidentData.responsable = cleanText(input.responsable)
    incidentData.fechaCompromiso = hasValue(input.fechaCompromiso) ? parseDate(input.fechaCompromiso) : null
    if (hasValue(input.fechaCompromiso) && !incidentData.fechaCompromiso) return { error: 'fechaCompromiso invalida' }
  }
  return {
    data: {
      estado,
      transporte: cleanText(input.transporte),
      ubicacion: cleanText(input.ubicacion),
      observacion: cleanText(input.observacion),
      ...incidentData,
      fechaEvento,
      usuario: userLabel(user),
    },
  }
}

async function buildDespachoTrackingTrace(prisma, despachoId) {
  const eventos = await prisma.despachoTrackingEvento.findMany({
    where: { despachoId },
    select: TRACKING_EVENT_SELECT,
    orderBy: [{ fechaEvento: 'desc' }, { id: 'desc' }],
    take: 80,
  })
  return { latest: eventos[0] || null, latestIncidencia: eventos.find(evento => evento.estado === 'Incidencia') || null, eventos }
}

async function attachLatestDespachoTracking(prisma, items) {
  if (!items) return items
  const list = Array.isArray(items) ? items : [items]
  const ids = list.map(item => item?.id).filter(Boolean)
  if (!ids.length) return Array.isArray(items) ? list : list[0]
  const eventos = await prisma.despachoTrackingEvento.findMany({
    where: { despachoId: { in: ids } },
    select: TRACKING_EVENT_SELECT,
    orderBy: [{ fechaEvento: 'desc' }, { id: 'desc' }],
  })
  const latestByDespacho = new Map()
  const latestIncidenciaByDespacho = new Map()
  for (const evento of eventos) {
    if (!latestByDespacho.has(evento.despachoId)) latestByDespacho.set(evento.despachoId, evento)
    if (evento.estado === 'Incidencia' && !latestIncidenciaByDespacho.has(evento.despachoId)) {
      latestIncidenciaByDespacho.set(evento.despachoId, evento)
    }
  }
  const enriched = list.map(item => ({ ...item, tracking: latestByDespacho.get(item.id) || null, incidencia: latestIncidenciaByDespacho.get(item.id) || null }))
  return Array.isArray(items) ? enriched : enriched[0]
}

function parsePackingQuantity(value) {
  const parsed = parseOptionalInt(value)
  return parsed != null && parsed >= 0 ? parsed : null
}

export function parsePackingReferenceId(value, field) {
  if (!hasValue(value)) return { id: null }
  const id = parsePositiveInt(value)
  return id ? { id } : { error: `${field} invalido` }
}

export function buildPackingUpdatePlan(orderItems = [], requestedItems = []) {
  const byId = new Map(orderItems.map(item => [item.id, item]))
  const seen = new Set()
  const updates = []

  for (const requested of requestedItems) {
    const itemId = parsePositiveInt(hasValue(requested.itemId) ? requested.itemId : requested.id)
    if (!itemId) return { error: 'itemId invalido' }
    if (seen.has(itemId)) return { error: `itemId duplicado: ${itemId}` }
    seen.add(itemId)

    const current = byId.get(itemId)
    if (!current) return { error: `Item ${itemId} no pertenece a la orden` }

    const nEntregados = parsePackingQuantity(requested.nEntregados)
    if (nEntregados == null) return { error: 'nEntregados invalido' }
    if (nEntregados > Number(current.cantidad || 0)) {
      return { error: `nEntregados supera la cantidad del item ${itemId}` }
    }

    const cantidadAnterior = Number(current.nEntregados || 0)
    updates.push({
      id: itemId,
      nEntregados,
      cantidadAnterior,
      delta: nEntregados - cantidadAnterior,
    })
  }

  return { updates }
}

export function buildPackingEventRows({ ordenId, updates = [], despachoId = null, bultoId = null, usuario = null, observacion = null } = {}) {
  return updates
    .filter(update => Number(update.delta || 0) !== 0)
    .map(update => ({
      ordenId,
      ordenItemId: update.id,
      despachoId,
      bultoId,
      cantidadAnterior: update.cantidadAnterior,
      cantidadNueva: update.nEntregados,
      delta: update.delta,
      accion: update.delta > 0 ? 'entrega' : 'correccion',
      observacion,
      usuario,
    }))
}

const PACKING_EVENT_SELECT = {
  id: true,
  ordenId: true,
  ordenItemId: true,
  despachoId: true,
  bultoId: true,
  cantidadAnterior: true,
  cantidadNueva: true,
  delta: true,
  accion: true,
  observacion: true,
  usuario: true,
  createdAt: true,
  ordenItem: {
    select: { id: true, codigoInterno: true, nombre: true, cantidad: true },
  },
  bulto: {
    select: { id: true, numero: true, estado: true },
  },
  despacho: {
    select: { id: true, tipoDespacho: true, transporte: true, fechaEntrega: true },
  },
}

async function buildPackingTrace(prisma, ordenId) {
  const [items, bultos, eventos] = await Promise.all([
    prisma.ordenItem.findMany({
      where: { ordenId, eliminado: false },
      select: { id: true, cantidad: true, nEntregados: true, codigoInterno: true, nombre: true },
      orderBy: { id: 'asc' },
    }),
    prisma.packingBulto.findMany({
      where: { ordenId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.packingEvento.findMany({
      where: { ordenId },
      select: PACKING_EVENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 80,
    }),
  ])
  return { items, bultos, eventos }
}

export default async function despachosRoutes(fastify) {
  registerDespachoMatrizRoutes(fastify)

  // GET /api/despachos?desde=&hasta=&ordenId=&odtId=&tipo=&page=1
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const { page = '1' } = request.query
    const skip = (parsePage(page) - 1) * LIST_LIMIT
    const listWhere = await buildDespachoListWhere(fastify.prisma, request.user, request.query)
    if (listWhere.error) return reply.code(listWhere.status).send({ error: listWhere.error })
    const { where } = listWhere
    const [items, total, parciales, multas] = await Promise.all([
      fastify.prisma.despacho.findMany({
        where, orderBy: { fechaEntrega: 'desc' }, take: LIST_LIMIT, skip,
      }),
      fastify.prisma.despacho.count({ where }),
      fastify.prisma.despacho.count({ where: { ...where, parcial: true } }),
      fastify.prisma.despacho.count({ where: { ...where, tieneMulta: true } }),
    ])
    const enriched = await attachLatestDespachoTracking(fastify.prisma, attachDespachoMetrics(items))
    return { items: enriched, total, limit: LIST_LIMIT, stats: { parciales, multas } }
  })

  fastify.get('/export/registros', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const listWhere = await buildDespachoListWhere(fastify.prisma, request.user, request.query)
    if (listWhere.error) return reply.code(listWhere.status).send({ error: listWhere.error })
    const items = await fastify.prisma.despacho.findMany({
      where: listWhere.where,
      orderBy: { fechaEntrega: 'desc' },
    })
    const trackedItems = await attachLatestDespachoTracking(fastify.prisma, items)
    const csv = rowsToCsv(trackedItems.map(row => {
      const tiempos = buildDespachoTiempoMetrics(row)
      return {
        ...row,
        tiempoDespachoDias: tiempos.despachoDias ?? '',
        trackingEstado: row.tracking?.estado || '',
        trackingFecha: formatDate(row.tracking?.fechaEvento),
        trackingUbicacion: row.tracking?.ubicacion || '',
        incidenciaTipo: row.incidencia?.tipoIncidente || '',
        incidenciaAccion: row.incidencia?.accionTomada || '',
        incidenciaResponsable: row.incidencia?.responsable || '',
        incidenciaFechaCompromiso: formatDate(row.incidencia?.fechaCompromiso),
        fechaEntrega: formatDate(row.fechaEntrega),
        fechaInterno: formatDate(row.fechaInterno),
        fecham: formatDate(row.fecham),
      }
    }), [
      { key: 'fechaEntrega', label: 'Fecha Entrega' },
      { key: 'fechaInterno', label: 'Fecha Interno' },
      { key: 'tiempoDespachoDias', label: 'Dias Despacho' },
      { key: 'trackingEstado', label: 'Tracking Estado' },
      { key: 'trackingFecha', label: 'Tracking Fecha' },
      { key: 'trackingUbicacion', label: 'Tracking Ubicacion' },
      { key: 'incidenciaTipo', label: 'Incidencia Tipo' },
      { key: 'incidenciaAccion', label: 'Incidencia Accion' },
      { key: 'incidenciaResponsable', label: 'Incidencia Responsable' },
      { key: 'incidenciaFechaCompromiso', label: 'Incidencia Fecha Compromiso' },
      { key: 'ordenId', label: 'Orden' },
      { key: 'interno', label: 'N Interno' },
      { key: 'odtId', label: 'ODT' },
      { key: 'tipoDespacho', label: 'Tipo' },
      { key: 'transporte', label: 'Transporte' },
      { key: 'numeroSeguimiento', label: 'N Seguimiento' },
      { key: 'contacto', label: 'Contacto' },
      { key: 'direccion', label: 'Direccion' },
      { key: 'region', label: 'Region' },
      { key: 'comuna', label: 'Comuna' },
      { key: 'montoEnvio', label: 'Envio' },
      { key: 'parcial', label: 'Parcial' },
      { key: 'tieneMulta', label: 'Tiene Multa' },
      { key: 'eliminado', label: 'Eliminado' },
      { key: 'motivoEliminacion', label: 'Motivo Eliminacion' },
      { key: 'usuario', label: 'Usuario' },
      { key: 'userMod', label: 'Usuario Modificacion' },
      { key: 'fecham', label: 'Fecha Modificacion' },
    ])
    return sendCsv(reply, `despachos_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const d = await fastify.prisma.despacho.findFirst({
      where: withOrdenSucursalScope(request.user, { id, eliminado: false }),
    })
    if (!d) return reply.code(404).send({ error: 'no encontrado' })
    const guias = await fastify.prisma.guiaDespacho.findMany({
      where: { ...buildGuideWhereForDespacho(d), eliminado: false },
    })
    const tracked = await attachLatestDespachoTracking(fastify.prisma, attachDespachoMetrics(d))
    return { ...tracked, guias }
  })

  fastify.get('/ordenes/:ordenId/packing', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const ordenId = parsePositiveInt(request.params.ordenId)
    if (!ordenId) return reply.code(400).send({ error: 'ordenId invalido' })
    const orden = await fastify.prisma.orden.findFirst({
      where: { id: ordenId, eliminada: false },
      select: { id: true, sucursalId: true, nInterno: true },
    })
    if (!orden) return reply.code(404).send({ error: 'Orden no encontrada' })
    if (!userCanAccessOrden(request.user, orden)) return reply.code(403).send({ error: 'Forbidden' })
    return { orden, ...(await buildPackingTrace(fastify.prisma, ordenId)) }
  })

  fastify.put('/ordenes/:ordenId/packing', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const ordenId = parsePositiveInt(request.params.ordenId)
    if (!ordenId) return reply.code(400).send({ error: 'ordenId invalido' })
    const parsed = PackingUpdate.safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })

    const orden = await fastify.prisma.orden.findFirst({
      where: { id: ordenId, eliminada: false },
      select: {
        id: true,
        sucursalId: true,
        items: {
          where: { eliminado: false },
          select: { id: true, cantidad: true, nEntregados: true, codigoInterno: true, nombre: true },
          orderBy: { id: 'asc' },
        },
      },
    })
    if (!orden) return reply.code(404).send({ error: 'Orden no encontrada' })
    if (!userCanAccessOrden(request.user, orden)) return reply.code(403).send({ error: 'Forbidden' })

    const plan = buildPackingUpdatePlan(orden.items, parsed.data.items)
    if (plan.error) return reply.code(400).send({ error: plan.error })
    const despachoRef = parsePackingReferenceId(parsed.data.despachoId, 'despachoId')
    if (despachoRef.error) return reply.code(400).send({ error: despachoRef.error })
    const bultoRef = parsePackingReferenceId(parsed.data.bultoId, 'bultoId')
    if (bultoRef.error) return reply.code(400).send({ error: bultoRef.error })
    const despachoId = despachoRef.id
    const bultoId = bultoRef.id
    const bultoNumero = cleanText(parsed.data.bultoNumero)
    const bultoEstado = cleanText(parsed.data.bultoEstado) || 'Preparado'
    const bultoObservacion = cleanText(parsed.data.bultoObservacion)
    const observacion = cleanText(parsed.data.observacion)
    const usuario = userLabel(request.user)

    if (despachoId) {
      const despacho = await fastify.prisma.despacho.findFirst({
        where: { id: despachoId, ordenId, eliminado: false },
        select: { id: true },
      })
      if (!despacho) return reply.code(400).send({ error: 'Despacho no pertenece a la orden' })
    }
    if (bultoId) {
      const existingBulto = await fastify.prisma.packingBulto.findFirst({
        where: { id: bultoId, ordenId },
        select: { id: true },
      })
      if (!existingBulto) return reply.code(400).send({ error: 'Bulto no pertenece a la orden' })
    }

    return fastify.prisma.$transaction(async (tx) => {
      let bulto = null
      if (bultoId) {
        const bultoUpdate = {}
        if (despachoId !== null) bultoUpdate.despachoId = despachoId
        if (parsed.data.bultoEstado !== undefined) bultoUpdate.estado = bultoEstado
        if (parsed.data.bultoObservacion !== undefined) bultoUpdate.observacion = bultoObservacion
        if (Object.keys(bultoUpdate).length) {
          bulto = await tx.packingBulto.update({
            where: { id: bultoId },
            data: bultoUpdate,
          })
        } else {
          bulto = await tx.packingBulto.findUnique({ where: { id: bultoId } })
        }
      } else if (bultoNumero) {
        bulto = await tx.packingBulto.upsert({
          where: { ordenId_numero: { ordenId, numero: bultoNumero } },
          create: {
            ordenId,
            despachoId: despachoId || null,
            numero: bultoNumero,
            estado: bultoEstado,
            observacion: bultoObservacion,
            usuario,
          },
          update: {
            despachoId: despachoId || undefined,
            estado: bultoEstado,
            observacion: parsed.data.bultoObservacion !== undefined ? bultoObservacion : undefined,
          },
        })
      }

      for (const update of plan.updates) {
        await tx.ordenItem.update({
          where: { id: update.id },
          data: { nEntregados: update.nEntregados },
        })
      }
      const eventos = buildPackingEventRows({
        ordenId,
        updates: plan.updates,
        despachoId: despachoId || null,
        bultoId: bulto?.id || null,
        usuario,
        observacion,
      })
      if (eventos.length) await tx.packingEvento.createMany({ data: eventos })
      const updatedOrden = await recalculateOrdenEntrega(tx, ordenId)
      const trace = await buildPackingTrace(tx, ordenId)
      return {
        ordenId,
        estadoEntrega: updatedOrden.estadoEntrega,
        ...trace,
      }
    })
  })

  fastify.get('/:id/tracking', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const despacho = await fastify.prisma.despacho.findFirst({
      where: withOrdenSucursalScope(request.user, { id, eliminado: false }),
    })
    if (!despacho) return reply.code(404).send({ error: 'no encontrado' })
    const trace = await buildDespachoTrackingTrace(fastify.prisma, id)
    return {
      despacho: { ...attachDespachoMetrics(despacho), tracking: trace.latest },
      ...trace,
    }
  })

  fastify.post('/:id/tracking', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = TrackingEventoCreate.safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const despacho = await fastify.prisma.despacho.findFirst({
      where: withOrdenSucursalScope(request.user, { id, eliminado: false }),
    })
    if (!despacho) return reply.code(404).send({ error: 'no encontrado' })
    const built = buildTrackingEventData(parsed.data, request.user)
    if (built.error) return reply.code(400).send({ error: built.error })

    return fastify.prisma.$transaction(async (tx) => {
      const evento = await tx.despachoTrackingEvento.create({
        data: { despachoId: id, ...built.data },
        select: TRACKING_EVENT_SELECT,
      })
      const despachoUpdate = {}
      if (built.data.transporte) despachoUpdate.transporte = built.data.transporte
      if (built.data.estado === 'Entregado' && !despacho.fechaEntrega) despachoUpdate.fechaEntrega = built.data.fechaEvento
      const updatedDespacho = Object.keys(despachoUpdate).length
        ? await tx.despacho.update({ where: { id }, data: despachoUpdate })
        : despacho
      if (updatedDespacho.ordenId && built.data.estado === 'Entregado') {
        await recalculateOrdenEntrega(tx, updatedDespacho.ordenId)
      }
      const trace = await buildDespachoTrackingTrace(tx, id)
      return {
        evento,
        despacho: { ...attachDespachoMetrics(updatedDespacho), tracking: trace.latest },
        ...trace,
      }
    })
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const parsed = DespachoCreate.safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const b = parsed.data
    const resolved = await resolveDispatchTraceability(fastify.prisma, {
      ordenId: b.ordenId,
      odtId: b.odtId,
      nInterno: b.interno,
      origenTipo: b.origenTipo,
      origenId: b.origenId,
    })
    const fechaInterno = b.fechaInterno ? parseDate(b.fechaInterno) : null
    const fechaEntrega = b.fechaEntrega ? parseDate(b.fechaEntrega) : null
    const montoEnvio = b.montoEnvio ? parseOptionalInt(b.montoEnvio) : null
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
    if (!userCanAccessOrden(request.user, resolved.orden)) return reply.code(403).send({ error: 'Forbidden' })
    if (b.fechaInterno && !fechaInterno) return reply.code(400).send({ error: 'fechaInterno invalida' })
    if (b.fechaEntrega && !fechaEntrega) return reply.code(400).send({ error: 'fechaEntrega invalida' })
    if (b.montoEnvio && (montoEnvio == null || montoEnvio < 0)) return reply.code(400).send({ error: 'montoEnvio invalido' })
    const data = {
      ordenId: resolved.orden.id,
      odtId: resolved.odt?.id ?? null,
      interno: resolved.nInterno ? String(resolved.nInterno) : null,
      plazoEntrega: b.plazoEntrega || null,
      fechaInterno,
      fechaEntrega,
      tipoDespacho: b.tipoDespacho || null,
      transporte: b.transporte || null,
      numeroSeguimiento: b.numeroSeguimiento || null,
      montoEnvio,
      direccion: b.direccion || null,
      contacto: b.contacto || null,
      region: b.region || null,
      comuna: b.comuna || null,
      parcial: !!b.parcial,
      tieneMulta: !!b.tieneMulta,
      origenTipo: resolved.origenTipo,
      origenId: resolved.origenId,
      usuario: userLabel(request.user),
    }
    const entregaSync = buildOrdenEntregaSyncFromDespacho({
      ordenId: data.ordenId,
      parcial: data.parcial,
      fechaEntrega: data.fechaEntrega,
    })
    return fastify.prisma.$transaction(async (tx) => {
      const despacho = await tx.despacho.create({ data })
      await applyOrdenEntregaSync(tx, entregaSync)
      return despacho
    })
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = DespachoCreate.partial().safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const b = parsed.data
    const existing = await fastify.prisma.despacho.findFirst({
      where: withOrdenSucursalScope(request.user, { id, eliminado: false }),
    })
    if (!existing) return reply.code(404).send({ error: 'no encontrado' })

    const data = {}
    const traceTouched = ['ordenId', 'odtId', 'interno', 'origenTipo', 'origenId'].some(field => b[field] !== undefined)
    if (traceTouched) {
      const relationTouched = ['ordenId', 'odtId'].some(field => b[field] !== undefined)
      const origenTouched = ['origenTipo', 'origenId'].some(field => b[field] !== undefined)
      const resolved = await resolveDispatchTraceability(fastify.prisma, {
        ordenId: b.ordenId !== undefined ? b.ordenId : existing.ordenId,
        odtId: b.odtId !== undefined ? b.odtId : existing.odtId,
        nInterno: b.interno !== undefined ? b.interno : (relationTouched ? undefined : existing.interno),
        origenTipo: origenTouched || !relationTouched ? (b.origenTipo !== undefined ? b.origenTipo : existing.origenTipo) : undefined,
        origenId: origenTouched || !relationTouched ? (b.origenId !== undefined ? b.origenId : existing.origenId) : undefined,
      })
      if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
      if (!userCanAccessOrden(request.user, resolved.orden)) return reply.code(403).send({ error: 'Forbidden' })
      data.ordenId = resolved.orden.id
      data.odtId = resolved.odt?.id ?? null
      data.interno = resolved.nInterno ? String(resolved.nInterno) : null
      data.origenTipo = resolved.origenTipo
      data.origenId = resolved.origenId
    }

    for (const f of ['plazoEntrega', 'tipoDespacho', 'transporte', 'numeroSeguimiento', 'direccion', 'contacto', 'region', 'comuna', 'usuario']) {
      if (b[f] !== undefined) data[f] = b[f]
    }
    if (b.fechaInterno !== undefined) {
      const fechaInterno = b.fechaInterno ? parseDate(b.fechaInterno) : null
      if (b.fechaInterno && !fechaInterno) return reply.code(400).send({ error: 'fechaInterno invalida' })
      data.fechaInterno = fechaInterno
    }
    if (b.fechaEntrega !== undefined) {
      const fechaEntrega = b.fechaEntrega ? parseDate(b.fechaEntrega) : null
      if (b.fechaEntrega && !fechaEntrega) return reply.code(400).send({ error: 'fechaEntrega invalida' })
      data.fechaEntrega = fechaEntrega
    }
    if (b.montoEnvio !== undefined) {
      const montoEnvio = b.montoEnvio ? parseOptionalInt(b.montoEnvio) : null
      if (b.montoEnvio && (montoEnvio == null || montoEnvio < 0)) return reply.code(400).send({ error: 'montoEnvio invalido' })
      data.montoEnvio = montoEnvio
    }
    if (b.parcial !== undefined) data.parcial = !!b.parcial
    if (b.tieneMulta !== undefined) data.tieneMulta = !!b.tieneMulta
    return fastify.prisma.$transaction(async (tx) => {
      const despacho = await tx.despacho.update({ where: { id }, data })
      const affectedOrdenIds = new Set([existing.ordenId, data.ordenId !== undefined ? data.ordenId : existing.ordenId].filter(Boolean))
      for (const affectedOrdenId of affectedOrdenIds) {
        await recalculateOrdenEntrega(tx, affectedOrdenId)
      }
      return despacho
    })
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const existing = await fastify.prisma.despacho.findFirst({
      where: withOrdenSucursalScope(request.user, { id }),
      select: { id: true, ordenId: true, eliminado: true },
    })
    if (!existing) return reply.code(404).send({ error: 'no encontrado' })
    if (existing.eliminado) return reply.code(409).send({ error: 'Despacho ya eliminado' })
    const usuario = userLabel(request.user)
    const motivoEliminacion = cleanText(request.body?.motivo)
    if (!motivoEliminacion) return reply.code(400).send({ error: 'Motivo de eliminacion requerido' })
    return fastify.prisma.$transaction(async (tx) => {
      const despacho = await tx.despacho.update({
        where: { id },
        data: {
          eliminado: true,
          userMod: usuario,
          fecham: new Date(),
          motivoEliminacion,
        },
      })
      await recalculateOrdenEntrega(tx, existing.ordenId)
      return despacho
    })
  })

  // Guias
  fastify.get('/guias/list', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const { page = '1' } = request.query
    const skip = (parsePage(page) - 1) * LIST_LIMIT
    const listWhere = await buildGuiaListWhere(fastify.prisma, request.user, request.query)
    if (listWhere.error) return reply.code(listWhere.status).send({ error: listWhere.error })
    const { where } = listWhere
    const [items, total] = await Promise.all([
      fastify.prisma.guiaDespacho.findMany({
        where, orderBy: { fechaGuia: 'desc' }, take: LIST_LIMIT, skip,
      }),
      fastify.prisma.guiaDespacho.count({ where }),
    ])
    return { items, total, limit: LIST_LIMIT }
  })

  fastify.get('/guias/export', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const listWhere = await buildGuiaListWhere(fastify.prisma, request.user, request.query)
    if (listWhere.error) return reply.code(listWhere.status).send({ error: listWhere.error })
    const items = await fastify.prisma.guiaDespacho.findMany({
      where: listWhere.where,
      orderBy: { fechaGuia: 'desc' },
    })
    const csv = rowsToCsv(items.map(row => ({ ...row, fechaGuia: formatDate(row.fechaGuia), fecham: formatDate(row.fecham) })), [
      { key: 'fechaGuia', label: 'Fecha Guia' },
      { key: 'nGuia', label: 'N Guia' },
      { key: 'nInterno', label: 'N Interno' },
      { key: 'ordenId', label: 'Orden' },
      { key: 'odtId', label: 'ODT' },
      { key: 'origen', label: 'Origen' },
      { key: 'origenTipo', label: 'Origen Tipo' },
      { key: 'origenId', label: 'Origen ID' },
      { key: 'eliminado', label: 'Eliminado' },
      { key: 'motivoEliminacion', label: 'Motivo Eliminacion' },
      { key: 'userMod', label: 'Usuario Modificacion' },
      { key: 'fecham', label: 'Fecha Modificacion' },
    ])
    return sendCsv(reply, `guias_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.post('/guias', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const parsed = GuiaCreate.safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const { ordenId, odtId, nInterno, nGuia, fechaGuia, origen, origenTipo, origenId } = parsed.data
    const cleanNGuia = cleanText(nGuia)
    const resolved = await resolveDispatchTraceability(fastify.prisma, {
      ordenId,
      odtId,
      nInterno,
      origenTipo,
      origenId,
    })
    const parsedFechaGuia = fechaGuia ? parseDate(fechaGuia) : new Date()
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
    if (!userCanAccessOrden(request.user, resolved.orden)) return reply.code(403).send({ error: 'Forbidden' })
    if (fechaGuia && !parsedFechaGuia) return reply.code(400).send({ error: 'fechaGuia invalida' })
    const duplicate = await ensureUniqueGuia(fastify.prisma, cleanNGuia)
    if (duplicate) return reply.code(duplicate.status).send({ error: duplicate.error })
    const data = {
      ordenId: resolved.orden.id,
      odtId: resolved.odt?.id ?? null,
      nInterno: resolved.nInterno,
      nGuia: cleanNGuia,
      fechaGuia: parsedFechaGuia,
      origen: origen || null,
      origenTipo: resolved.origenTipo,
      origenId: resolved.origenId,
    }
    return fastify.prisma.$transaction(async (tx) => {
      const guia = await tx.guiaDespacho.create({ data })
      const orden = await tx.orden.findUnique({
        where: { id: data.ordenId },
        select: { estadoEntrega: true },
      })
      const hasExplicitNonPartialDespachoSignal = orden?.estadoEntrega === 'Parcial'
        ? await hasNonPartialDespachoEntregaSignal(tx, data.ordenId)
        : false
      const entregaSync = buildOrdenEntregaSyncFromGuia({
        ordenId: data.ordenId,
        currentEstadoEntrega: orden?.estadoEntrega,
        hasExplicitNonPartialDespachoSignal,
      })
      await applyOrdenEntregaSync(tx, entregaSync)
      return guia
    })
  })

  fastify.put('/guias/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = GuiaUpdate.safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const b = parsed.data
    const existing = await fastify.prisma.guiaDespacho.findFirst({
      where: withOrdenSucursalScope(request.user, { id, eliminado: false }),
    })
    if (!existing) return reply.code(404).send({ error: 'no encontrada' })

    const data = {}
    const traceTouched = ['ordenId', 'odtId', 'nInterno', 'origenTipo', 'origenId'].some(field => b[field] !== undefined)
    if (traceTouched) {
      const relationTouched = ['ordenId', 'odtId'].some(field => b[field] !== undefined)
      const origenTouched = ['origenTipo', 'origenId'].some(field => b[field] !== undefined)
      const resolved = await resolveDispatchTraceability(fastify.prisma, {
        ordenId: b.ordenId !== undefined ? b.ordenId : existing.ordenId,
        odtId: b.odtId !== undefined ? b.odtId : existing.odtId,
        nInterno: b.nInterno !== undefined ? b.nInterno : (relationTouched ? undefined : existing.nInterno),
        origenTipo: origenTouched || !relationTouched ? (b.origenTipo !== undefined ? b.origenTipo : existing.origenTipo) : undefined,
        origenId: origenTouched || !relationTouched ? (b.origenId !== undefined ? b.origenId : existing.origenId) : undefined,
      })
      if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
      if (!userCanAccessOrden(request.user, resolved.orden)) return reply.code(403).send({ error: 'Forbidden' })
      data.ordenId = resolved.orden.id
      data.odtId = resolved.odt?.id ?? null
      data.nInterno = resolved.nInterno
      data.origenTipo = resolved.origenTipo
      data.origenId = resolved.origenId
    }
    if (b.nGuia !== undefined) {
      const cleanNGuia = cleanText(b.nGuia)
      const duplicate = await ensureUniqueGuia(fastify.prisma, cleanNGuia, id)
      if (duplicate) return reply.code(duplicate.status).send({ error: duplicate.error })
      data.nGuia = cleanNGuia
    }
    if (b.fechaGuia !== undefined) {
      const fechaGuia = b.fechaGuia ? parseDate(b.fechaGuia) : null
      if (b.fechaGuia && !fechaGuia) return reply.code(400).send({ error: 'fechaGuia invalida' })
      data.fechaGuia = fechaGuia || new Date()
    }
    if (b.origen !== undefined) data.origen = b.origen || null

    return fastify.prisma.$transaction(async (tx) => {
      const guia = await tx.guiaDespacho.update({ where: { id }, data })
      const affectedOrdenIds = new Set([existing.ordenId, data.ordenId !== undefined ? data.ordenId : existing.ordenId].filter(Boolean))
      for (const affectedOrdenId of affectedOrdenIds) {
        await recalculateOrdenEntrega(tx, affectedOrdenId)
      }
      return guia
    })
  })

  fastify.delete('/guias/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const existing = await fastify.prisma.guiaDespacho.findFirst({
      where: withOrdenSucursalScope(request.user, { id }),
      select: { id: true, ordenId: true, eliminado: true },
    })
    if (!existing) return reply.code(404).send({ error: 'no encontrada' })
    if (existing.eliminado) return reply.code(409).send({ error: 'Guia ya eliminada' })
    const usuario = userLabel(request.user)
    const motivoEliminacion = cleanText(request.body?.motivo)
    if (!motivoEliminacion) return reply.code(400).send({ error: 'Motivo de eliminacion requerido' })
    return fastify.prisma.$transaction(async (tx) => {
      const guia = await tx.guiaDespacho.update({
        where: { id },
        data: {
          eliminado: true,
          userMod: usuario,
          fecham: new Date(),
          motivoEliminacion,
        },
      })
      await recalculateOrdenEntrega(tx, existing.ordenId)
      return guia
    })
  })
}
