// Gestion de despachos y guias.
import { z } from 'zod'
import { can } from '../../middleware/rbac.js'
import { buildExport, sendExport } from '../../utils/export.js'
import { applyDateRange, parseDate, parseOptionalInt, parsePage, parsePositiveInt } from '../operational-utils.js'
import { resolveOdtForWrite, resolveOrdenForWrite } from '../relation-guards.js'
import { registerDespachoMatrizRoutes } from './matriz.js'
import { attachCliente } from '../ventas/helpers.js'
import { isValidContactEmail } from '../ventas/operational-rules.js'
import { transitionEstadoFlujoDesdeTracking } from '../ventas/estado-flujo-formal.js'
import { codigoBarrasObligatorio, validateBarcodeScans } from '../ordenes-compra-proveedores/barcode-policy.js'
import { deriveEstadoLogistico, resumenPacking, resumenPreparacion } from './estado-logistico.js'
import { IND_TRASLADO, TIPO_DESPACHO, computeTotales } from '../../facturacion/documento.js'
import { isValidRut, normalizeRut } from '../../facturacion/xmlUtil.js'
import { createFacturacionEngine } from '../../facturacion/engine.js'
import { createFacturacionDb } from '../../facturacion/db.js'

const LIST_LIMIT = 100

const optionalId = z.union([z.number().int(), z.string()]).optional().nullable()

const ItemDespachoSchema = z.object({
  nombre: z.string().min(1, 'Nombre de item requerido'),
  descripcion: z.string().optional().nullable(),
  cantidad: z.union([z.number(), z.string()]).transform(v => Math.max(0, Number(v) || 0)),
  unidad: z.string().optional().nullable(),
  precio: z.union([z.number(), z.string()]).optional().nullable().transform(v => v != null ? Number(v) || 0 : 0),
  descuentoMonto: z.union([z.number(), z.string()]).optional().nullable().transform(v => v != null ? Number(v) || 0 : 0),
  exento: z.boolean().optional().nullable(),
})

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
  emailContacto: z.string().trim().email('Correo de contacto invalido').optional().nullable(),
  region: z.string().optional().nullable(),
  comuna: z.string().optional().nullable(),
  ciudad: z.string().optional().nullable(),
  receptorRut: z.string().optional().nullable(),
  receptorRazonSocial: z.string().optional().nullable(),
  receptorGiro: z.string().optional().nullable(),
  items: z.array(ItemDespachoSchema).optional().nullable(),
  parcial: z.boolean().optional(),
  tieneMulta: z.boolean().optional(),
  origenTipo: z.string().optional().nullable(),
  origenId: optionalId,
  motivoOperacion: z.string().trim().max(500).optional().nullable(),
})

const GuiaCreate = z.object({
  ordenId: optionalId,
  odtId: optionalId,
  nInterno: optionalId,
  nGuia: z.string().optional().nullable(),
  fechaGuia: z.string().optional().nullable(),
  origen: z.string().optional().nullable(),
  origenTipo: z.string().optional().nullable(),
  origenId: optionalId,
  despachoId: optionalId,
  indTraslado: z.union([z.number(), z.string()]).optional().nullable(),
  tipoDespacho: z.union([z.number(), z.string()]).optional().nullable(),
  receptor: z.record(z.any()).optional().nullable(),
  items: z.array(ItemDespachoSchema).optional().nullable(),
  borrador: z.boolean().optional(),
  emitirSii: z.boolean().optional(),
})

export async function deriveTieneMulta(prisma, orden) {
  if (!orden) return false
  const tipo = String(orden.tipo || '').toLowerCase()
  const esLicitacion = tipo.includes('licit')
  if (!esLicitacion) return false
  const [multas, cotizaciones] = await Promise.all([
    prisma.multa.findMany({ where: { ordenId: orden.id }, select: { id: true } }),
    prisma.cotizacionLicitacion.findMany({ where: { ordenId: orden.id }, select: { id: true, fechaPlazo: true } }),
  ])
  if (multas.length > 0) return true
  const fechaPlazo = orden.fechaPlazo || cotizaciones.find(c => c.fechaPlazo)?.fechaPlazo
  if (fechaPlazo && new Date(fechaPlazo) < new Date()) return true
  return false
}

export function validarCamposDte52({ receptor = {}, extra = {}, items = [] } = {}) {
  const faltantes = []
  const indTrasladoNum = Number(extra.indTraslado || 1)
  const rutRecep = normalizeRut(receptor.rut)
  if (indTrasladoNum !== 5) {
    if (!rutRecep || !isValidRut(rutRecep)) faltantes.push('RUT del receptor válido')
    if (!cleanText(receptor.razonSocial)) faltantes.push('Razón social del receptor')
    if (!cleanText(receptor.giro)) faltantes.push('Giro del receptor')
    if (!cleanText(receptor.direccion)) faltantes.push('Dirección del receptor')
    if (!cleanText(receptor.comuna)) faltantes.push('Comuna del receptor')
    if (!cleanText(receptor.ciudad)) faltantes.push('Ciudad del receptor')
  }
  if (!IND_TRASLADO[indTrasladoNum]) faltantes.push('Motivo de traslado válido (IndTraslado)')
  const tipoDespachoNum = Number(extra.tipoDespacho || 2)
  if (!TIPO_DESPACHO[tipoDespachoNum]) faltantes.push('Tipo de despacho válido (TipoDespacho)')
  if (!Array.isArray(items) || items.length === 0) {
    faltantes.push('Al menos un producto o ítem a trasladar')
  } else {
    items.forEach((it, idx) => {
      if (!cleanText(it.nombre)) faltantes.push(`Nombre en línea ${idx + 1}`)
      if (Number(it.cantidad || 0) <= 0) faltantes.push(`Cantidad mayor a 0 en línea ${idx + 1}`)
    })
  }
  return {
    valido: faltantes.length === 0,
    faltantes,
  }
}

const GuiaUpdate = GuiaCreate.partial()

const PackingUpdate = z.object({
  despachoId: optionalId,
  bultoId: optionalId,
  guiaDespachoId: optionalId,
  bultoNumero: z.string().optional().nullable(),
  bultoEstado: z.string().optional().nullable(),
  bultoObservacion: z.string().optional().nullable(),
  observacion: z.string().optional().nullable(),
  codigosBarrasLeidos: z.object({}).catchall(z.string()).optional(),
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

// “En ruta” queda como valor legacy legible. No es una transición nueva: el
// flujo obligatorio usa Reparto antes de Entregado.
export const TRACKING_ESTADOS = ['Preparado', 'Patio', 'Didáctico', 'Reparto', 'Entregado', 'Incidencia', 'Reprogramado', 'Retenido', 'Devuelto', 'En ruta']
const TRACKING_CHAIN = {
  Preparado: ['Patio', 'Incidencia', 'Retenido'],
  Patio: ['Didáctico', 'Incidencia', 'Reprogramado', 'Retenido'],
  Didáctico: ['Reparto', 'Incidencia', 'Reprogramado', 'Retenido'],
  Reparto: ['Entregado', 'Incidencia', 'Reprogramado', 'Retenido', 'Devuelto'],
  Incidencia: ['Incidencia', 'Patio', 'Didáctico', 'Reparto'],
  Reprogramado: ['Patio'],
  Retenido: ['Patio'],
  Devuelto: [],
  Entregado: [],
}

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
      {
        OR: [
          { orden: { is: { sucursalId } } },
          { sucursalId },
        ],
      },
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
  if (origenTipo && !['orden', 'odt', 'manual'].includes(origenTipo)) {
    return { status: 400, error: 'origenTipo debe ser orden, odt o manual' }
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

  if (explicitOrigenTipo === 'manual') {
    if (odtInput.value || hasValue(input.ordenId) || hasValue(input.nInterno) || origenInput.value) {
      return { status: 409, error: 'Un despacho manual no puede referenciar una orden u ODT' }
    }
    return { orden: null, odt: null, nInterno: null, origenTipo: 'manual', origenId: null, manual: true }
  }

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

// Vista "Pendientes": el backlog viejo se pierde entre los pendientes de hoy
// si se ordena por fechaEntrega desc (que ademas es null en todos). Con
// estado=pendiente se ordena por antiguedad (mas viejo primero) salvo que se
// pida explicitamente sort=reciente para volver al orden por defecto.
export function resolveDespachoOrderBy({ estado, sort } = {}) {
  const normalizedEstado = String(estado || '').trim().toLowerCase()
  const isPendienteView = ['pendiente', 'pendientes'].includes(normalizedEstado)
  const wantsOldestFirst = sort === 'antiguedad' || (isPendienteView && sort !== 'reciente')
  if (wantsOldestFirst) return [{ fechaInterno: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }]
  return { fechaEntrega: 'desc' }
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

export function validateTrackingTransition(previousEstado, nextEstado) {
  if (!TRACKING_CHAIN[previousEstado]) return null
  // Una incidencia puede complementarse con responsable/acción después del
  // primer aviso; se conserva cada actualización como evento separado.
  if (previousEstado === 'Incidencia' && nextEstado === 'Incidencia') return null
  if (previousEstado === nextEstado) return { error: `El despacho ya está en ${nextEstado}` }
  if (!TRACKING_CHAIN[previousEstado].includes(nextEstado)) return { error: `Transición inválida: ${previousEstado} → ${nextEstado}` }
  return null
}

function isRetiroEnSucursal(tipoDespacho) {
  return /retiro|retira|pickup/i.test(String(tipoDespacho || ''))
}

export function validateDispatchAddress({ tipoDespacho, direccion, region, comuna } = {}) {
  if (isRetiroEnSucursal(tipoDespacho)) return null
  if (!cleanText(direccion) || !cleanText(region) || !cleanText(comuna)) {
    return { error: 'Direccion, region y comuna son obligatorias para despacho a domicilio' }
  }
  return null
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

export function buildPackingEventRows({ ordenId, updates = [], despachoId = null, bultoId = null, guiaDespachoId = null, usuario = null, observacion = null } = {}) {
  return updates
    .filter(update => Number(update.delta || 0) !== 0)
    .map(update => ({
      ordenId,
      ordenItemId: update.id,
      despachoId,
      bultoId,
      guiaDespachoId,
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
  guiaDespachoId: true,
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

async function buildPackingTrace(prisma, ordenId, despachoId = null, guiaDespachoId = null) {
  const [items, bultos, eventos, packedDespacho, packedGuia] = await Promise.all([
    prisma.ordenItem.findMany({
      where: { ordenId, eliminado: false },
      select: { id: true, productoId: true, cantidad: true, nEntregados: true, codigoInterno: true, nombre: true },
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
    // Cantidad neta empacada especificamente para ESTE despacho (no el total
    // de la orden): suma de deltas de packing_eventos filtrados por despachoId,
    // agrupados por item. Usado por la Guia DTE para declarar solo lo que va
    // en este envio, no el pedido completo.
    despachoId
      ? prisma.packingEvento.groupBy({
        by: ['ordenItemId'],
        where: { ordenId, despachoId },
        _sum: { delta: true },
      })
      : Promise.resolve(null),
    // Igual que packedDespacho pero por Guia: una guia puede existir sin
    // despacho asignado todavia (queda pendiente), asi que lo que se
    // selecciono para enviar en ELLA se rastrea aparte.
    guiaDespachoId
      ? prisma.packingEvento.groupBy({
        by: ['ordenItemId'],
        where: { ordenId, guiaDespachoId },
        _sum: { delta: true },
      })
      : Promise.resolve(null),
  ])
  const productoIds = [...new Set(items.map(item => item.productoId).filter(Boolean))]
  const productos = productoIds.length
    ? await prisma.producto.findMany({ where: { id: { in: productoIds } }, select: { id: true, codigoBarra: true } })
    : []
  const barcodeByProductoId = new Map(productos.map(producto => [producto.id, producto.codigoBarra]))
  const result = { items: items.map(item => ({ ...item, codigoBarra: barcodeByProductoId.get(item.productoId) || null })), bultos, eventos }
  if (packedDespacho) {
    result.packedDespacho = packedDespacho.map(row => ({
      ordenItemId: row.ordenItemId,
      cantidad: Math.max(0, Number(row._sum.delta || 0)),
    }))
  }
  if (packedGuia) {
    result.packedGuia = packedGuia.map(row => ({
      ordenItemId: row.ordenItemId,
      cantidad: Math.max(0, Number(row._sum.delta || 0)),
    }))
  }
  return result
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
        where, orderBy: resolveDespachoOrderBy(request.query), take: LIST_LIMIT, skip,
      }),
      fastify.prisma.despacho.count({ where }),
      fastify.prisma.despacho.count({ where: { ...where, parcial: true } }),
      fastify.prisma.despacho.count({ where: { ...where, tieneMulta: true } }),
    ])
    const enriched = await attachLatestDespachoTracking(fastify.prisma, attachDespachoMetrics(items))
    return { items: enriched, total, limit: LIST_LIMIT, stats: { parciales, multas } }
  })

  // Cola consolidada para coordinar retiros por taller antes de armar la ruta.
  // No crea despachos automáticamente: la agrupación sólo propone la carga
  // disponible y conserva el vínculo ODT/orden para que logística decida.
  fastify.get('/consolidado-taller', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request) => {
    const sucursalId = parsePositiveInt(request.user?.sucursalId)
    const soloListos = request.query?.soloListos !== 'false'
    const odts = await fastify.prisma.odt.findMany({
      where: { eliminado: false, ...(sucursalId ? { sucursalId } : {}) },
      orderBy: { createdAt: 'asc' },
      include: {
        orden: { select: { id: true, nInterno: true, estadoEntrega: true } },
        items: {
          where: { eliminado: false },
          include: { talleres: { include: { taller: { select: { id: true, nombre: true } } } } },
        },
      },
    })
    const readyStates = new Set(['listo', 'terminado', 'finalizado', 'completo'])
    const groups = new Map()
    for (const odt of odts) {
      for (const item of odt.items) {
        for (const rel of item.talleres) {
          const estado = String(rel.estado || '').trim().toLocaleLowerCase('es-CL')
          const listo = readyStates.has(estado)
          if (soloListos && !listo) continue
          const taller = rel.taller
          if (!taller) continue
          if (!groups.has(taller.id)) groups.set(taller.id, { tallerId: taller.id, taller: taller.nombre, cantidad: 0, itemsListos: 0, items: [] })
          const group = groups.get(taller.id)
          group.cantidad += Number(item.cantidad || 0)
          if (listo) group.itemsListos += 1
          group.items.push({
            odtId: odt.id,
            ordenId: odt.ordenId,
            nInterno: odt.orden?.nInterno ?? null,
            productoId: item.productoId,
            codigoInterno: item.codigoInterno,
            nombre: item.nombre,
            cantidad: item.cantidad,
            estado,
            fechaListo: rel.fechaListo || item.fechaListo || null,
          })
        }
      }
    }
    const items = [...groups.values()]
      .map(group => ({ ...group, items: group.items.sort((a, b) => (a.fechaListo || '').localeCompare(b.fechaListo || '') || a.odtId - b.odtId) }))
      .sort((a, b) => a.taller.localeCompare(b.taller, 'es'))
    return { items, total: items.length, soloListos }
  })

  fastify.get('/export/registros', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const listWhere = await buildDespachoListWhere(fastify.prisma, request.user, request.query)
    if (listWhere.error) return reply.code(listWhere.status).send({ error: listWhere.error })
    const items = await fastify.prisma.despacho.findMany({
      where: listWhere.where,
      orderBy: resolveDespachoOrderBy(request.query),
    })
    const trackedItems = await attachLatestDespachoTracking(fastify.prisma, items)
    const datosExport = buildExport(trackedItems.map(row => {
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
    return sendExport(reply, { archivo: request.query?.archivo, nombre: `despachos_${new Date().toISOString().slice(0, 10)}`, ...datosExport })
  })

  // Fuente única para la operación diaria: sólo ventas activas aún no
  // entregadas. El estado se deriva de packing, guía/SII y tracking para que
  // Matriz, Bodega y Despachos vean exactamente el mismo hilo.
  fastify.get('/cola-operativa', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request) => {
    const sucursalId = parsePositiveInt(request.user?.sucursalId)
    const search = cleanText(request.query?.search)
    const etapa = cleanText(request.query?.etapa)?.toLowerCase() || ''
    const candidatasDespacho = wantsTrue(request.query?.candidatasDespacho)

    const pendientes = sucursalId
      ? await fastify.prisma.$queryRaw`
          SELECT o.id
          FROM ventas.ordenes o
          WHERE NOT o.eliminada
            AND o.estado = 'Activa'
            AND (o.estado_entrega IS NULL OR o.estado_entrega NOT IN ('Entregada', 'Entregado'))
            AND EXISTS (SELECT 1 FROM ventas.orden_items oi WHERE oi.orden_id = o.id AND NOT oi.eliminado)
            AND (o.sucursal_id = ${sucursalId} OR o.sucursal_id IS NULL)
          ORDER BY o.created_at ASC
          LIMIT 500
        `
      : await fastify.prisma.$queryRaw`
          SELECT o.id
          FROM ventas.ordenes o
          WHERE NOT o.eliminada
            AND o.estado = 'Activa'
            AND (o.estado_entrega IS NULL OR o.estado_entrega NOT IN ('Entregada', 'Entregado'))
            AND EXISTS (SELECT 1 FROM ventas.orden_items oi WHERE oi.orden_id = o.id AND NOT oi.eliminado)
          ORDER BY o.created_at ASC
          LIMIT 500
        `
    const ordenIdsPendientes = pendientes.map(row => Number(row.id)).filter(Number.isInteger)
    if (!ordenIdsPendientes.length) return { items: [], stats: {} }
    const where = {
      id: { in: ordenIdsPendientes },
      eliminada: false,
      estado: 'Activa',
      items: { some: { eliminado: false } },
      AND: [],
    }
    if (sucursalId) where.OR = [{ sucursalId }, { sucursalId: null }]
    if (search) {
      const numeric = parsePositiveInt(search)
      where.AND.push({
        OR: [
          { rutCliente: { contains: search, mode: 'insensitive' } },
          { cliente: { is: { nombre: { contains: search, mode: 'insensitive' } } } },
          { cliente: { is: { razonSocial: { contains: search, mode: 'insensitive' } } } },
          ...(numeric ? [{ id: numeric }, { nInterno: numeric }] : []),
        ],
      })
    }
    const ordenes = await fastify.prisma.orden.findMany({
      where,
      take: 100,
      orderBy: { createdAt: 'asc' },
      include: {
        items: { where: { eliminado: false }, select: { id: true, productoId: true, cantidad: true, nEntregados: true, codigoInterno: true, nombre: true }, orderBy: { id: 'asc' } },
        cliente: { select: { id: true, nombre: true, razonSocial: true, rut: true, email: true, telefono: true } },
        clienteSucursal: { select: { nombre: true, direccion: true, region: true, comuna: true, ciudad: true, contacto: true, email: true, telefono: true } },
        despachos: { where: { eliminado: false }, select: { id: true, eliminado: true, tipoDespacho: true, transporte: true, numeroSeguimiento: true, fechaEntrega: true, parcial: true, tieneMulta: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
        guiasDespacho: { where: { eliminado: false }, select: { id: true, nGuia: true, fechaGuia: true, despachoId: true }, orderBy: { createdAt: 'desc' } },
      },
    })
    const guiaIds = ordenes.flatMap(orden => orden.guiasDespacho.map(guia => guia.id))
    const despachoIds = ordenes.flatMap(orden => orden.despachos.map(despacho => despacho.id))
    const productoIds = [...new Set(ordenes.flatMap(orden => orden.items.map(item => item.productoId).filter(Boolean)))]
    const ordenIds = ordenes.map(orden => orden.id)
    const [documentos, eventos, productos, odts, multas, cotizaciones] = await Promise.all([
      guiaIds.length ? fastify.prisma.factDocumento.findMany({
        where: { guiaDespachoId: { in: guiaIds }, tipoDte: 52 },
        select: { guiaDespachoId: true, estado: true, folio: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }) : [],
      despachoIds.length ? fastify.prisma.despachoTrackingEvento.findMany({
        where: { despachoId: { in: despachoIds } },
        select: { despachoId: true, estado: true, fechaEvento: true, id: true },
        orderBy: [{ fechaEvento: 'desc' }, { id: 'desc' }],
      }) : [],
      productoIds.length ? fastify.prisma.producto.findMany({
        where: { id: { in: productoIds } },
        select: { id: true, estadoInventario: true },
      }) : [],
      ordenIds.length ? fastify.prisma.odt.findMany({
        where: { ordenId: { in: ordenIds }, eliminado: false },
        select: {
          id: true,
          ordenId: true,
          eliminado: true,
          items: {
            where: { eliminado: false },
            select: { productoId: true, cantidad: true, talleres: { select: { estado: true } } },
          },
        },
      }) : [],
      ordenIds.length ? fastify.prisma.multa.findMany({
        where: { ordenId: { in: ordenIds } },
        select: { id: true, ordenId: true, monto: true },
      }) : [],
      ordenIds.length ? fastify.prisma.cotizacionLicitacion.findMany({
        where: { ordenId: { in: ordenIds } },
        select: { id: true, ordenId: true, fechaPlazo: true },
      }) : [],
    ])
    const dteByGuia = new Map()
    for (const documento of documentos) if (!dteByGuia.has(documento.guiaDespachoId)) dteByGuia.set(documento.guiaDespachoId, documento)
    const estadoInventarioByProducto = new Map(productos.map(producto => [producto.id, producto.estadoInventario]))
    const multasByOrden = new Map()
    for (const m of multas) {
      if (!multasByOrden.has(m.ordenId)) multasByOrden.set(m.ordenId, [])
      multasByOrden.get(m.ordenId).push(m)
    }
    const cotizByOrden = new Map(cotizaciones.map(c => [c.ordenId, c]))
    const odtsByOrden = new Map()
    for (const odt of odts) {
      if (!odtsByOrden.has(odt.ordenId)) odtsByOrden.set(odt.ordenId, [])
      odtsByOrden.get(odt.ordenId).push(odt)
    }
    const despachoToOrden = new Map(ordenes.flatMap(orden => orden.despachos.map(despacho => [despacho.id, orden.id])))
    const trackingByOrden = new Map()
    for (const evento of eventos) {
      const ordenId = despachoToOrden.get(evento.despachoId)
      if (ordenId && !trackingByOrden.has(ordenId)) trackingByOrden.set(ordenId, evento)
    }

    const now = new Date()
    const allMapped = ordenes.map(orden => {
      const sucursal = orden.clienteSucursal || {}
      const cliente = orden.cliente || {}
      const guias = orden.guiasDespacho.map(guia => ({ ...guia, dteEstado: dteByGuia.get(guia.id)?.estado || null, dteFolio: dteByGuia.get(guia.id)?.folio || null }))
      const items = orden.items.map(item => ({ ...item, estadoInventario: estadoInventarioByProducto.get(item.productoId) || 'inventariado' }))
      const packing = resumenPacking(items)
      const preparacion = resumenPreparacion(items, odtsByOrden.get(orden.id) || [])
      const estadoLogistico = deriveEstadoLogistico({ items, despachos: orden.despachos, guias, tracking: trackingByOrden.get(orden.id), preparacion })
      
      const tipo = String(orden.tipo || '').toLowerCase()
      const esLicitacion = tipo.includes('licit')
      const ordenMultas = multasByOrden.get(orden.id) || []
      const fechaPlazo = cotizByOrden.get(orden.id)?.fechaPlazo || orden.fechaPlazo || null
      const tieneMulta = esLicitacion && (ordenMultas.length > 0 || (fechaPlazo && new Date(fechaPlazo) < now))
      const plazoDate = fechaPlazo ? new Date(fechaPlazo) : null
      const atrasada = Boolean(plazoDate && plazoDate < now && (!orden.estadoEntrega || !['Entregada', 'Entregado'].includes(orden.estadoEntrega)))

      return {
        ordenId: orden.id,
        nInterno: orden.nInterno,
        tipoVenta: orden.tipo,
        clienteNombre: cliente.razonSocial || cliente.nombre || sucursal.nombre || null,
        rutCliente: orden.rutCliente || cliente.rut || null,
        estadoEntrega: orden.estadoEntrega,
        estadoLogistico,
        packing,
        preparacion,
        direccion: orden.direccionDespacho || sucursal.direccion || null,
        region: orden.regionDespacho || sucursal.region || null,
        comuna: orden.comunaDespacho || sucursal.comuna || null,
        ciudad: orden.ciudadDespacho || sucursal.ciudad || null,
        contacto: orden.contactoDespacho || sucursal.contacto || null,
        emailContacto: orden.emailContactoDespacho || sucursal.email || cliente.email || null,
        telefonoContacto: orden.telefonoContactoDespacho || sucursal.telefono || cliente.telefono || null,
        plazoEntrega: orden.fechaPlazo || null,
        montoEnvio: orden.montoDespacho || 0,
        enviosParciales: orden.enviosParciales,
        tieneMulta,
        atrasada,
        despachos: orden.despachos,
        guias,
        tracking: trackingByOrden.get(orden.id) || null,
        items,
      }
    })

    const stats = {
      total: allMapped.length,
      enTaller: allMapped.filter(i => i.estadoLogistico.codigo === 'EN_TALLER').length,
      pickingParcial: allMapped.filter(i => i.estadoLogistico.codigo === 'PICKING_PARCIAL').length,
      listaPicking: allMapped.filter(i => i.estadoLogistico.codigo === 'LISTA_PICKING').length,
      enPicking: allMapped.filter(i => ['PICKING', 'LISTA_PICKING', 'PICKING_PARCIAL'].includes(i.estadoLogistico.codigo)).length,
      enPacking: allMapped.filter(i => i.estadoLogistico.codigo === 'PACKING').length,
      listaDespacho: allMapped.filter(i => i.estadoLogistico.codigo === 'LISTA_DESPACHO').length,
      guiaPreparada: allMapped.filter(i => i.estadoLogistico.codigo === 'GUIA_PREPARADA').length,
      guiaSiiEmitida: allMapped.filter(i => i.estadoLogistico.codigo === 'GUIA_SII_EMITIDA').length,
      enPatio: allMapped.filter(i => i.estadoLogistico.codigo === 'PATIO').length,
      enReparto: allMapped.filter(i => i.estadoLogistico.codigo === 'REPARTO').length,
      entregado: allMapped.filter(i => i.estadoLogistico.codigo === 'ENTREGADO').length,
      atrasadas: allMapped.filter(i => i.atrasada).length,
      conMulta: allMapped.filter(i => i.tieneMulta).length,
    }

    let filtered = allMapped
    if (candidatasDespacho || etapa === 'despacho') {
      filtered = allMapped.filter(i => i.estadoLogistico.codigo === 'LISTA_DESPACHO' || (i.packing.preparados > 0 && (i.enviosParciales || i.despachos.some(d => d.parcial))))
    } else if (etapa === 'picking') {
      filtered = allMapped.filter(i => i.preparacion.disponiblePicking > 0 && !i.packing.completo)
    } else if (etapa === 'packing') {
      filtered = allMapped.filter(i => !i.packing.completo && (i.preparacion.disponiblePicking > 0 || i.packing.preparados > 0))
    }

    return {
      items: filtered,
      stats,
    }
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
    const despachoId = parsePositiveInt(request.query.despachoId) || null
    const guiaDespachoId = parsePositiveInt(request.query.guiaDespachoId) || null
    return { orden, ...(await buildPackingTrace(fastify.prisma, ordenId, despachoId, guiaDespachoId)) }
  })

  // Armar el packing es el trabajo de bodega; emitir la guia, de despacho.
  fastify.put('/ordenes/:ordenId/packing', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho.packing', 'write')],
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
          select: { id: true, productoId: true, cantidad: true, nEntregados: true, codigoInterno: true, nombre: true },
          orderBy: { id: 'asc' },
        },
      },
    })
    if (!orden) return reply.code(404).send({ error: 'Orden no encontrada' })
    if (!userCanAccessOrden(request.user, orden)) return reply.code(403).send({ error: 'Forbidden' })

    const plan = buildPackingUpdatePlan(orden.items, parsed.data.items)
    if (plan.error) return reply.code(400).send({ error: plan.error })
    if (await codigoBarrasObligatorio(fastify.prisma)) {
      const byItemId = new Map(orden.items.map(item => [item.id, item]))
      const productoIds = [...new Set(orden.items.map(item => item.productoId).filter(Boolean))]
      const productos = productoIds.length
        ? await fastify.prisma.producto.findMany({ where: { id: { in: productoIds } }, select: { id: true, codigoBarra: true } })
        : []
      const barcodeByProductoId = new Map(productos.map(producto => [producto.id, producto.codigoBarra]))
      const barcodeError = validateBarcodeScans(
        plan.updates
          .filter(update => update.delta > 0)
          .map(update => ({
            itemId: update.id,
            cantidad: update.delta,
            codigoBarra: barcodeByProductoId.get(byItemId.get(update.id)?.productoId),
            nombre: byItemId.get(update.id)?.nombre,
          })),
        parsed.data.codigosBarrasLeidos || {},
      )
      if (barcodeError) return reply.code(409).send(barcodeError)
    }
    const despachoRef = parsePackingReferenceId(parsed.data.despachoId, 'despachoId')
    if (despachoRef.error) return reply.code(400).send({ error: despachoRef.error })
    const bultoRef = parsePackingReferenceId(parsed.data.bultoId, 'bultoId')
    if (bultoRef.error) return reply.code(400).send({ error: bultoRef.error })
    const guiaRef = parsePackingReferenceId(parsed.data.guiaDespachoId, 'guiaDespachoId')
    if (guiaRef.error) return reply.code(400).send({ error: guiaRef.error })
    const despachoId = despachoRef.id
    const bultoId = bultoRef.id
    const guiaDespachoId = guiaRef.id
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
    if (guiaDespachoId) {
      const existingGuia = await fastify.prisma.guiaDespacho.findFirst({
        where: { id: guiaDespachoId, ordenId, eliminado: false },
        select: { id: true },
      })
      if (!existingGuia) return reply.code(400).send({ error: 'Guia no pertenece a la orden' })
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
        guiaDespachoId: guiaDespachoId || null,
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
    const orden = despacho.ordenId
      ? await fastify.prisma.orden.findUnique({ where: { id: despacho.ordenId }, select: { estadoFlujoFormal: true, fechaEstadoFlujo: true } })
      : null
    const trace = await buildDespachoTrackingTrace(fastify.prisma, id)
    return {
      despacho: { ...attachDespachoMetrics(despacho), tracking: trace.latest },
      estadoFlujoFormal: orden?.estadoFlujoFormal || null,
      fechaEstadoFlujo: orden?.fechaEstadoFlujo || null,
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
    const traceBefore = await buildDespachoTrackingTrace(fastify.prisma, id)
    const transition = validateTrackingTransition(traceBefore.latest?.estado, built.data.estado)
    if (transition?.error) return reply.code(409).send({ error: transition.error })

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
      let flujo = null
      if (updatedDespacho.ordenId) {
        flujo = await transitionEstadoFlujoDesdeTracking(
          tx,
          updatedDespacho.ordenId,
          built.data.estado,
          request.user,
          { motivo: `Tracking despacho #${id}: ${built.data.estado}` },
        )
        // Lanzar revierte también el evento recién creado; responder dentro de
        // la transacción lo habría confirmado aunque el flujo formal fallara.
        if (flujo?.error) {
          const error = new Error(flujo.error)
          error.statusCode = 409
          throw error
        }
      }
      const trace = await buildDespachoTrackingTrace(tx, id)
      return {
        evento,
        estadoFlujoFormal: flujo?.orden?.estadoFlujoFormal || null,
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
    const esManual = resolved.manual === true
    if (!esManual && !userCanAccessOrden(request.user, resolved.orden)) return reply.code(403).send({ error: 'Forbidden' })
    if (b.fechaInterno && !fechaInterno) return reply.code(400).send({ error: 'fechaInterno invalida' })
    if (b.fechaEntrega && !fechaEntrega) return reply.code(400).send({ error: 'fechaEntrega invalida' })
    if (b.montoEnvio && (montoEnvio == null || montoEnvio < 0)) return reply.code(400).send({ error: 'montoEnvio invalido' })
    const motivoOperacion = cleanText(b.motivoOperacion)
    if (esManual && !motivoOperacion) return reply.code(400).send({ error: 'motivoOperacion requerido para despacho aislado' })

    let tieneMulta = false
    let interno = null

    if (!esManual) {
      const items = await fastify.prisma.ordenItem.findMany({
        where: { ordenId: resolved.orden.id, eliminado: false },
        select: { id: true, productoId: true, cantidad: true, nEntregados: true },
      })
      const odts = await fastify.prisma.odt.findMany({
        where: { ordenId: resolved.orden.id, eliminado: false },
        include: { items: { where: { eliminado: false }, include: { talleres: true } } },
      })
      const productos = await fastify.prisma.producto.findMany({
        where: { id: { in: items.map(i => i.productoId).filter(Boolean) } },
        select: { id: true, estadoInventario: true },
      })
      const estadoInvMap = new Map(productos.map(p => [p.id, p.estadoInventario]))
      const itemsWithInv = items.map(i => ({ ...i, estadoInventario: estadoInvMap.get(i.productoId) }))
      const packing = resumenPacking(itemsWithInv)
      const preparacion = resumenPreparacion(itemsWithInv, odts)
      const estadoLogistico = deriveEstadoLogistico({ items: itemsWithInv, preparacion })

      if (preparacion.pendienteTaller > 0 && !b.parcial) {
        return reply.code(400).send({ error: 'Esta venta tiene unidades pendientes en taller. No se puede programar despacho completo mientras existan unidades en fabricación.' })
      }

      tieneMulta = await deriveTieneMulta(fastify.prisma, resolved.orden)
      interno = resolved.orden.nInterno ? String(resolved.orden.nInterno) : String(resolved.orden.id)
    }

    const ordenContacto = esManual ? null : await fastify.prisma.orden.findUnique({
      where: { id: resolved.orden.id },
      select: {
        emailContactoDespacho: true,
        clienteId: true,
        clienteSucursal: { select: { direccion: true, region: true, comuna: true, ciudad: true } },
      },
    })
    const clienteContacto = !esManual && !b.emailContacto && !ordenContacto?.emailContactoDespacho && ordenContacto?.clienteId
      ? await fastify.prisma.cliente.findUnique({ where: { id: ordenContacto.clienteId }, select: { email: true } })
      : null
    const emailContacto = String(b.emailContacto || ordenContacto?.emailContactoDespacho || clienteContacto?.email || '').trim().toLowerCase()
    if (!esManual && !isValidContactEmail(emailContacto)) {
      return reply.code(400).send({ error: 'Correo de contacto de despacho requerido y valido' })
    }
    const direccion = cleanText(b.direccion) || ordenContacto?.clienteSucursal?.direccion || null
    const region = cleanText(b.region) || ordenContacto?.clienteSucursal?.region || null
    const comuna = cleanText(b.comuna) || ordenContacto?.clienteSucursal?.comuna || null
    const ciudad = cleanText(b.ciudad) || ordenContacto?.clienteSucursal?.ciudad || null
    const addressError = esManual ? null : validateDispatchAddress({ ...b, direccion, region, comuna })
    if (addressError) return reply.code(400).send(addressError)
    const items = Array.isArray(b.items) && b.items.length ? b.items : undefined
    const data = {
      ordenId: resolved.orden?.id ?? null,
      odtId: resolved.odt?.id ?? null,
      interno,
      sucursalId: resolved.orden?.sucursalId ?? parsePositiveInt(request.user?.sucursalId) ?? null,
      plazoEntrega: b.plazoEntrega || null,
      fechaInterno,
      fechaEntrega,
      tipoDespacho: b.tipoDespacho || null,
      transporte: b.transporte || null,
      numeroSeguimiento: b.numeroSeguimiento || null,
      montoEnvio,
      direccion,
      contacto: b.contacto || null,
      emailContacto: emailContacto || null,
      region,
      comuna,
      ciudad,
      receptorRut: cleanText(b.receptorRut) || null,
      receptorRazonSocial: cleanText(b.receptorRazonSocial) || null,
      receptorGiro: cleanText(b.receptorGiro) || null,
      items,
      parcial: !!b.parcial,
      tieneMulta,
      origenTipo: resolved.origenTipo,
      origenId: resolved.origenId,
      motivoOperacion,
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
      if (!resolved.manual && !userCanAccessOrden(request.user, resolved.orden)) return reply.code(403).send({ error: 'Forbidden' })
      data.ordenId = resolved.orden?.id ?? null
      data.odtId = resolved.odt?.id ?? null
      data.interno = resolved.nInterno ? String(resolved.nInterno) : null
      data.origenTipo = resolved.origenTipo
      data.origenId = resolved.origenId
      data.sucursalId = resolved.orden?.sucursalId ?? parsePositiveInt(request.user?.sucursalId) ?? existing.sucursalId ?? null
    }

    for (const f of ['plazoEntrega', 'tipoDespacho', 'transporte', 'numeroSeguimiento', 'direccion', 'contacto', 'emailContacto', 'region', 'comuna', 'ciudad', 'receptorRut', 'receptorRazonSocial', 'receptorGiro', 'usuario', 'motivoOperacion']) {
      if (b[f] !== undefined) data[f] = b[f]
    }
    if (b.items !== undefined) data.items = b.items
    const esManual = (data.origenTipo ?? existing.origenTipo) === 'manual'
    if (!esManual && b.emailContacto !== undefined && !isValidContactEmail(b.emailContacto)) {
      return reply.code(400).send({ error: 'Correo de contacto de despacho requerido y valido' })
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
    const updateAddressError = esManual ? null : validateDispatchAddress({
      tipoDespacho: data.tipoDespacho ?? existing.tipoDespacho,
      direccion: data.direccion ?? existing.direccion,
      region: data.region ?? existing.region,
      comuna: data.comuna ?? existing.comuna,
    })
    if (updateAddressError) return reply.code(400).send(updateAddressError)
    if (esManual && !cleanText(data.motivoOperacion ?? existing.motivoOperacion)) {
      return reply.code(400).send({ error: 'motivoOperacion requerido para despacho aislado' })
    }

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
          motivoEliminacion,
          userMod: usuario,
          fecham: new Date(),
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
        where,
        orderBy: { fechaGuia: 'desc' },
        take: LIST_LIMIT,
        skip,
        include: {
          despacho: { select: { id: true, transporte: true, direccion: true, comuna: true, ciudad: true, receptorRazonSocial: true, motivoOperacion: true } },
          documentos: { where: { tipoDte: 52 }, select: { id: true, folio: true, estado: true, trackId: true, xml: true, receptor: true, extra: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      fastify.prisma.guiaDespacho.count({ where }),
    ])
    const mapped = items.map(g => {
      const doc = g.documentos?.[0] || null
      return {
        ...g,
        documentoDte: doc ? {
          id: doc.id,
          folio: doc.folio,
          estado: doc.estado,
          trackId: doc.trackId,
          xmlDisponible: !!doc.xml,
        } : null,
      }
    })
    return { items: mapped, total, limit: LIST_LIMIT }
  })

  fastify.get('/guias/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const guia = await fastify.prisma.guiaDespacho.findFirst({
      where: withOrdenSucursalScope(request.user, { id, eliminado: false }),
      include: {
        documentos: { where: { tipoDte: 52 }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })
    if (!guia) return reply.code(404).send({ error: 'no encontrada' })
    const [despacho, ordenBase, packed] = await Promise.all([
      guia.despachoId ? fastify.prisma.despacho.findUnique({ where: { id: guia.despachoId } }) : Promise.resolve(null),
      guia.ordenId ? fastify.prisma.orden.findUnique({
        where: { id: guia.ordenId },
        select: {
          id: true,
          nInterno: true,
          tipo: true,
          rutCliente: true,
          clienteId: true,
          items: { where: { eliminado: false }, select: { id: true, nombre: true, codigoInterno: true, cantidad: true }, orderBy: { id: 'asc' } },
        },
      }) : Promise.resolve(null),
      fastify.prisma.packingEvento.groupBy({
        by: ['ordenItemId'],
        where: { guiaDespachoId: id },
        _sum: { delta: true },
      }),
    ])
    const orden = ordenBase ? await attachCliente(fastify, ordenBase) : null
    const packedMap = new Map(packed.map(row => [row.ordenItemId, Math.max(0, Number(row._sum.delta || 0))]))
    let items = []
    if (orden?.items?.length) {
      items = orden.items
        .map(item => ({ ...item, enviado: packedMap.get(item.id) || 0 }))
        .filter(item => item.enviado > 0)
    }
    if (!items.length && guia.items && Array.isArray(guia.items) && guia.items.length) {
      items = guia.items.map(it => ({ ...it, enviado: it.cantidad }))
    } else if (!items.length && despacho?.items && Array.isArray(despacho.items) && despacho.items.length) {
      items = despacho.items.map(it => ({ ...it, enviado: it.cantidad }))
    }
    const doc = guia.documentos?.[0] || null
    const validacionDte52 = validarCamposDte52({
      receptor: doc?.receptor || {},
      extra: doc?.extra || {},
      items,
    })
    return {
      guia,
      despacho,
      orden: orden ? { id: orden.id, nInterno: orden.nInterno, tipo: orden.tipo, rutCliente: orden.rutCliente, cliente: orden.cliente } : null,
      items,
      documentoDte: doc ? {
        id: doc.id,
        folio: doc.folio,
        estado: doc.estado,
        trackId: doc.trackId,
        xmlDisponible: !!doc.xml,
        receptor: doc.receptor,
        extra: doc.extra,
      } : null,
      validacionDte52,
    }
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
    const datosExport = buildExport(items.map(row => ({ ...row, fechaGuia: formatDate(row.fechaGuia), fecham: formatDate(row.fecham) })), [
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
    return sendExport(reply, { archivo: request.query?.archivo, nombre: `guias_${new Date().toISOString().slice(0, 10)}`, ...datosExport })
  })

  fastify.post('/guias', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho.guias', 'write')],
  }, async (request, reply) => {
    const parsed = GuiaCreate.safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const { ordenId, odtId, nInterno, nGuia, fechaGuia, origen, origenTipo, origenId, despachoId, indTraslado, tipoDespacho, receptor: inputReceptor, items: inputItems, emitirSii } = parsed.data
    const cleanNGuia = cleanText(nGuia)

    const despachoRef = parsePackingReferenceId(despachoId, 'despachoId')
    if (despachoRef.error) return reply.code(400).send({ error: despachoRef.error })

    let despacho = null
    if (despachoRef.id) {
      despacho = await fastify.prisma.despacho.findFirst({
        where: withOrdenSucursalScope(request.user, { id: despachoRef.id, eliminado: false }),
      })
      if (!despacho) return reply.code(404).send({ error: 'Despacho no encontrado' })
      if (ordenId && despacho.ordenId && despacho.ordenId !== parseInt(ordenId, 10)) {
        return reply.code(400).send({ error: 'Despacho no pertenece a la orden' })
      }
    }

    const esManual = origenTipo === 'manual' || despacho?.origenTipo === 'manual'
    let resolved = { orden: null, odt: null, nInterno: null, origenTipo: 'manual', origenId: null, manual: true }

    if (!esManual) {
      resolved = await resolveDispatchTraceability(fastify.prisma, {
        ordenId: ordenId || despacho?.ordenId,
        odtId: odtId || despacho?.odtId,
        nInterno: nInterno || despacho?.interno,
        origenTipo,
        origenId,
      })
      if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
      if (!userCanAccessOrden(request.user, resolved.orden)) return reply.code(403).send({ error: 'Forbidden' })
      if (despacho && despacho.ordenId && resolved.orden && despacho.ordenId !== resolved.orden.id) {
        return reply.code(400).send({ error: 'Despacho no pertenece a la orden' })
      }
    }

    const parsedFechaGuia = fechaGuia ? parseDate(fechaGuia) : new Date()
    if (fechaGuia && !parsedFechaGuia) return reply.code(400).send({ error: 'fechaGuia invalida' })
    if (cleanNGuia) {
      const duplicate = await ensureUniqueGuia(fastify.prisma, cleanNGuia)
      if (duplicate) return reply.code(duplicate.status).send({ error: duplicate.error })
    }

    const items = (Array.isArray(inputItems) && inputItems.length) ? inputItems : ((despacho?.items && Array.isArray(despacho.items)) ? despacho.items : [])
    const autoNGuia = !cleanNGuia
    const data = {
      ordenId: resolved.orden?.id ?? null,
      odtId: resolved.odt?.id ?? null,
      nInterno: resolved.nInterno ?? null,
      nGuia: autoNGuia ? `__auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : cleanNGuia,
      fechaGuia: parsedFechaGuia,
      origen: origen || null,
      origenTipo: esManual ? 'manual' : resolved.origenTipo,
      origenId: esManual ? null : resolved.origenId,
      despachoId: despacho?.id ?? null,
      items: items.length ? items : undefined,
    }

    const receptorData = inputReceptor || {
      rut: despacho?.receptorRut || resolved.orden?.rutCliente || '',
      razonSocial: despacho?.receptorRazonSocial || '',
      giro: despacho?.receptorGiro || '',
      direccion: despacho?.direccion || '',
      comuna: despacho?.comuna || '',
      ciudad: despacho?.ciudad || '',
      contacto: despacho?.contacto || '',
      email: despacho?.emailContacto || '',
    }
    const extraData = {
      indTraslado: Number(indTraslado || 1),
      tipoDespacho: Number(tipoDespacho || 2),
      transporte: despacho?.transporte || null,
    }

    const validation = validarCamposDte52({
      receptor: receptorData,
      extra: extraData,
      items,
    })

    if (emitirSii && !validation.valido) {
      return reply.code(400).send({
        error: 'Faltan campos obligatorios para emitir la guía DTE 52 al SII',
        faltantes: validation.faltantes,
      })
    }

    return fastify.prisma.$transaction(async (tx) => {
      let guia = await tx.guiaDespacho.create({ data })
      if (autoNGuia) {
        guia = await tx.guiaDespacho.update({ where: { id: guia.id }, data: { nGuia: String(guia.id) } })
      }

      const totales = computeTotales(items, 52)
      const docData = {
        usuarioNombre: userLabel(request.user),
        clienteId: resolved.orden?.clienteId ?? null,
        ordenId: resolved.orden?.id ?? null,
        guiaDespachoId: guia.id,
        tipoDte: 52,
        fechaEmision: new Date().toISOString().slice(0, 10),
        receptor: receptorData,
        items,
        extra: extraData,
        totales,
        estado: 'borrador',
      }
      const factDoc = await tx.factDocumento.create({ data: docData })

      if (data.ordenId) {
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
      }

      let emitidoResult = null
      if (emitirSii && validation.valido) {
        const db = createFacturacionDb(tx)
        const engine = createFacturacionEngine({ db })
        emitidoResult = await engine.emitir(factDoc.id)
        try {
          await engine.enviar([factDoc.id])
        } catch {
          // background sync error does not revert emission
        }
      }

      return {
        ...guia,
        guia,
        documento: emitidoResult || factDoc,
        valido: validation.valido,
        faltantes: validation.faltantes,
      }
    })
  })

  fastify.post('/guias/:id/emitir-sii', {
    preHandler: [fastify.authenticate, fastify.rbac('facturacion.emitir', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const guia = await fastify.prisma.guiaDespacho.findFirst({
      where: withOrdenSucursalScope(request.user, { id, eliminado: false }),
      include: { documentos: { where: { tipoDte: 52 } } },
    })
    if (!guia) return reply.code(404).send({ error: 'Guía no encontrada' })

    const factDoc = guia.documentos?.[0]
    if (!factDoc) {
      return reply.code(400).send({ error: 'La guía no tiene un documento DTE 52 borrador asociado' })
    }
    if (['emitido', 'enviado', 'aceptado'].includes(factDoc.estado)) {
      return reply.code(400).send({ error: `La guía ya fue emitida al SII (Folio ${factDoc.folio || 'N/A'})` })
    }

    const validation = validarCamposDte52({
      receptor: factDoc.receptor,
      extra: factDoc.extra,
      items: factDoc.items,
    })
    if (!validation.valido) {
      return reply.code(400).send({
        error: 'No se puede emitir la guía al SII porque faltan campos obligatorios',
        faltantes: validation.faltantes,
      })
    }

    const db = createFacturacionDb(fastify.prisma)
    const engine = createFacturacionEngine({ db })
    const emitido = await engine.emitir(factDoc.id)
    try {
      await engine.enviar([factDoc.id])
    } catch {
      // background sync error does not revert emission
    }
    return { ok: true, documento: emitido, folio: emitido.folio, estado: emitido.estado }
  })

  fastify.put('/guias/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho.guias', 'write')],
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
      data.ordenId = resolved.orden?.id ?? null
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
    if (b.items !== undefined) data.items = b.items
    if (b.despachoId !== undefined) {
      const despachoRef = parsePackingReferenceId(b.despachoId, 'despachoId')
      if (despachoRef.error) return reply.code(400).send({ error: despachoRef.error })
      const targetOrdenId = data.ordenId !== undefined ? data.ordenId : existing.ordenId
      if (despachoRef.id) {
        const despacho = await fastify.prisma.despacho.findFirst({
          where: { id: despachoRef.id, ...(targetOrdenId ? { ordenId: targetOrdenId } : {}), eliminado: false },
          select: { id: true },
        })
        if (!despacho) return reply.code(400).send({ error: 'Despacho no válido para esta guía' })
      }
      data.despachoId = despachoRef.id
    }

    return fastify.prisma.$transaction(async (tx) => {
      const guia = await tx.guiaDespacho.update({ where: { id }, data })
      if (data.despachoId) {
        await tx.packingEvento.updateMany({
          where: { guiaDespachoId: id, despachoId: null },
          data: { despachoId: data.despachoId },
        })
      }
      const affectedOrdenIds = new Set([existing.ordenId, data.ordenId !== undefined ? data.ordenId : existing.ordenId].filter(Boolean))
      for (const affectedOrdenId of affectedOrdenIds) {
        await recalculateOrdenEntrega(tx, affectedOrdenId)
      }
      return guia
    })
  })

  fastify.delete('/guias/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho.guias', 'delete')],
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
      if (existing.ordenId) await recalculateOrdenEntrega(tx, existing.ordenId)
      return guia
    })
  })
}
