import { parsePositiveInt } from '../operational-utils.js'
import { can } from '../../middleware/rbac.js'
import { getUserSucursalId } from '../caja/scope.js'

export const ODT_ITEM_TALLER_ESTADOS = Object.freeze([
  'pendiente',
  'en_proceso',
  'pausado',
  'listo',
  'cancelado',
])

export const ODT_ITEM_TALLER_ESTADOS_ERROR = `estado debe ser uno de: ${ODT_ITEM_TALLER_ESTADOS.join(', ')}`

const REOPEN_STATES = new Set(['en_proceso', 'pendiente'])
const ESTADOS_SET = new Set(ODT_ITEM_TALLER_ESTADOS)
const DESTRUCTIVE_WORKFLOW_STATES = new Set(['cancelado'])

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function normalizeTallerItemEstado(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return ESTADOS_SET.has(normalized) ? normalized : null
}

export function getRequestUsuario(user) {
  const nombre = user?.nombre ? String(user.nombre).trim() : ''
  if (nombre) return nombre
  const email = user?.email ? String(user.email).trim() : ''
  return email || null
}

export function parseWorkflowParams(params = {}) {
  const odtId = parsePositiveInt(params.odtId)
  if (!odtId) return { error: 'odtId invalido' }

  const itemId = parsePositiveInt(params.itemId)
  if (!itemId) return { error: 'itemId invalido' }

  const tallerItemId = parsePositiveInt(params.tallerItemId)
  if (!tallerItemId) return { error: 'tallerItemId invalido' }

  return { odtId, itemId, tallerItemId }
}

export function parseBulkWorkflowParams(params = {}) {
  const odtId = parsePositiveInt(params.odtId)
  if (!odtId) return { error: 'odtId invalido' }

  const tallerId = parsePositiveInt(params.tallerId)
  if (!tallerId) return { error: 'tallerId invalido' }

  return { odtId, tallerId }
}

export function buildTallerItemRelationWhere({ odtId, itemId, tallerItemId }, options = {}) {
  const odtWhere = {
    id: odtId,
    ...(options.sucursalId ? { OR: [{ sucursalId: options.sucursalId }, { sucursalId: null }] } : {}),
  }
  return {
    id: tallerItemId,
    odtItemId: itemId,
    odtItem: { is: { odtId, eliminado: false, odt: { is: odtWhere } } },
  }
}

export function buildTallerBulkRelationWhere({ odtId, tallerId }, options = {}) {
  const odtWhere = {
    id: odtId,
    ...(options.sucursalId ? { OR: [{ sucursalId: options.sucursalId }, { sucursalId: null }] } : {}),
  }
  return {
    tallerId,
    odtItem: { is: { odtId, eliminado: false, odt: { is: odtWhere } } },
  }
}

export function isOdtWorkflowWritable(odt) {
  const estado = normalizeText(odt?.estado || 'Pendiente')
  return Boolean(odt) && !odt.eliminado && !['anulada', 'terminada', 'entregada'].includes(estado)
}

export function buildTallerItemEstadoUpdate({ estado, current = {}, user, now = new Date() }) {
  const normalizedEstado = normalizeTallerItemEstado(estado)
  if (!normalizedEstado) return { error: ODT_ITEM_TALLER_ESTADOS_ERROR }

  const usuario = getRequestUsuario(user)
  const data = { estado: normalizedEstado }
  if (usuario) data.usuario = usuario

  if (normalizedEstado === 'en_proceso' && !current.fechaInicio) {
    data.fechaInicio = now
  }

  if (REOPEN_STATES.has(normalizedEstado) && (current.fechaListo || current.usuarioListo || current.estado === 'listo')) {
    data.fechaListo = null
    data.usuarioListo = null
  }

  if (normalizedEstado === 'listo') {
    const enteringListo = current.estado !== 'listo'
    if (enteringListo || !current.fechaListo) data.fechaListo = now
    if (usuario && (enteringListo || !current.usuarioListo)) data.usuarioListo = usuario
  }

  return data
}

export function buildTallerItemEstadoBitacoraEntry({ current = {}, estado, user }) {
  const usuario = getRequestUsuario(user) || 'Sistema'
  const itemLabel = [current.odtItem?.codigoInterno, current.odtItem?.nombre].filter(Boolean).join(' - ')
    || `Item #${current.odtItemId}`
  const tallerLabel = current.taller?.nombre || `Taller #${current.tallerId}`
  return {
    odtId: current.odtItem?.odtId,
    usuario,
    usuarioReporta: usuario,
    sucursalId: current.odtItem?.odt?.sucursalId ?? null,
    fecha: new Date(),
    texto: `Estado taller ${tallerLabel} / ${itemLabel}: ${current.estado || 'sin estado'} -> ${estado}`,
  }
}

export function canChangeTallerItemEstado(user, estado, current = {}) {
  const normalizedEstado = normalizeTallerItemEstado(estado)
  if (!normalizedEstado) return false
  const fromDestructiveState = DESTRUCTIVE_WORKFLOW_STATES.has(current.estado)
  const toDestructiveState = DESTRUCTIVE_WORKFLOW_STATES.has(normalizedEstado)
  if (!fromDestructiveState && !toDestructiveState) return true
  return can(user?.role, 'taller', 'delete', user?.permisosExtra)
}

const ROUTE = '/:odtId/items/:itemId/talleres/:tallerItemId/estado'
const BULK_ROUTE = '/:odtId/talleres/:tallerId/estado'

const relationSelect = {
  id: true,
  odtItemId: true,
  tallerId: true,
  estado: true,
  fechaInicio: true,
  fechaListo: true,
  usuario: true,
  usuarioListo: true,
  odtItem: {
    select: {
      odtId: true,
      codigoInterno: true,
      nombre: true,
      odt: { select: { id: true, sucursalId: true, estado: true, eliminado: true } },
    },
  },
  taller: { select: { nombre: true } },
}

export default async function itemWorkflowRoutes(fastify) {
  async function updateEstado(request, reply) {
    const parsedParams = parseWorkflowParams(request.params)
    if (parsedParams.error) return reply.code(400).send({ error: parsedParams.error })

    const bodyEstado = request.body?.estado
    const estado = bodyEstado ? normalizeTallerItemEstado(bodyEstado) : null
    if (bodyEstado && !estado) return reply.code(400).send({ error: ODT_ITEM_TALLER_ESTADOS_ERROR })

    const operarioResponsableId = request.body?.operarioResponsableId !== undefined
      ? (request.body.operarioResponsableId === null ? null : parseInt(request.body.operarioResponsableId, 10))
      : undefined
    if (operarioResponsableId !== undefined && operarioResponsableId !== null && isNaN(operarioResponsableId)) {
      return reply.code(400).send({ error: 'operarioResponsableId invalido' })
    }

    const obs = request.body?.obs !== undefined ? String(request.body.obs) : undefined

    if (!estado && operarioResponsableId === undefined && obs === undefined) {
      return reply.code(400).send({ error: 'Cuerpo vacio o invalido' })
    }

    const { tallerItemId } = parsedParams
    const sucursalId = getUserSucursalId(request.user)
    const relationWhere = buildTallerItemRelationWhere(parsedParams, { sucursalId })
    const current = await fastify.prisma.odtItemTaller.findFirst({
      where: relationWhere,
      select: relationSelect,
    })
    if (!current) return reply.code(404).send({ error: 'Relacion ODT/item/taller no encontrada' })
    if (!isOdtWorkflowWritable(current.odtItem?.odt)) {
      return reply.code(409).send({ error: 'ODT cerrada o anulada' })
    }
    if (estado && !canChangeTallerItemEstado(request.user, estado, current)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    try {
      return await fastify.prisma.$transaction(async (tx) => {
        const txCurrent = await tx.odtItemTaller.findFirst({
          where: relationWhere,
          select: relationSelect,
        })
        if (!txCurrent) {
          const error = new Error('Relacion ODT/item/taller no encontrada')
          error.statusCode = 404
          throw error
        }
        if (!isOdtWorkflowWritable(txCurrent.odtItem?.odt)) {
          const error = new Error('ODT cerrada o anulada')
          error.statusCode = 409
          throw error
        }
        if (estado && !canChangeTallerItemEstado(request.user, estado, txCurrent)) {
          const error = new Error('Forbidden')
          error.statusCode = 403
          throw error
        }

        const data = {}
        if (estado) {
          Object.assign(data, buildTallerItemEstadoUpdate({ estado, current: txCurrent, user: request.user }))
        }
        if (operarioResponsableId !== undefined) {
          data.operarioResponsableId = operarioResponsableId
        }
        if (obs !== undefined) {
          data.obs = obs
        }

        const updated = await tx.odtItemTaller.update({
          where: { id: tallerItemId },
          data,
        })

        if (estado && estado !== txCurrent.estado) {
          const bitacoraEntry = buildTallerItemEstadoBitacoraEntry({ current: txCurrent, estado, user: request.user })
          if (bitacoraEntry.odtId) await tx.bitacoraTaller.create({ data: bitacoraEntry })
        }
        return updated
      })
    } catch (error) {
      if (error.statusCode) return reply.code(error.statusCode).send({ error: error.message })
      if (error.code === 'P2025') return reply.code(404).send({ error: 'Relacion ODT/item/taller no encontrada' })
      throw error
    }
  }

  async function updateTallerEstadoMasivo(request, reply) {
    const parsedParams = parseBulkWorkflowParams(request.params)
    if (parsedParams.error) return reply.code(400).send({ error: parsedParams.error })

    const estado = normalizeTallerItemEstado(request.body?.estado)
    if (!estado) return reply.code(400).send({ error: ODT_ITEM_TALLER_ESTADOS_ERROR })

    const sucursalId = getUserSucursalId(request.user)
    const relationWhere = buildTallerBulkRelationWhere(parsedParams, { sucursalId })
    const currentItems = await fastify.prisma.odtItemTaller.findMany({
      where: relationWhere,
      select: relationSelect,
      orderBy: { id: 'asc' },
    })
    if (!currentItems.length) return reply.code(404).send({ error: 'No hay items para ese taller en la ODT' })
    const odt = currentItems[0]?.odtItem?.odt
    if (!isOdtWorkflowWritable(odt)) {
      return reply.code(409).send({ error: 'ODT cerrada o anulada' })
    }
    if (currentItems.some(item => !canChangeTallerItemEstado(request.user, estado, item))) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    try {
      return await fastify.prisma.$transaction(async (tx) => {
        const txItems = await tx.odtItemTaller.findMany({
          where: relationWhere,
          select: relationSelect,
          orderBy: { id: 'asc' },
        })
        if (!txItems.length) {
          const error = new Error('No hay items para ese taller en la ODT')
          error.statusCode = 404
          throw error
        }
        if (!isOdtWorkflowWritable(txItems[0]?.odtItem?.odt)) {
          const error = new Error('ODT cerrada o anulada')
          error.statusCode = 409
          throw error
        }
        if (txItems.some(item => !canChangeTallerItemEstado(request.user, estado, item))) {
          const error = new Error('Forbidden')
          error.statusCode = 403
          throw error
        }
        const updated = []
        const bitacora = []
        for (const item of txItems) {
          const data = buildTallerItemEstadoUpdate({ estado, current: item, user: request.user })
          const row = await tx.odtItemTaller.update({ where: { id: item.id }, data })
          updated.push(row)
          const entry = buildTallerItemEstadoBitacoraEntry({ current: item, estado, user: request.user })
          if (entry.odtId && estado !== item.estado) bitacora.push(entry)
        }
        if (bitacora.length) await tx.bitacoraTaller.createMany({ data: bitacora })
        return {
          odtId: parsedParams.odtId,
          tallerId: parsedParams.tallerId,
          estado,
          updated: updated.length,
        }
      })
    } catch (error) {
      if (error.statusCode) return reply.code(error.statusCode).send({ error: error.message })
      throw error
    }
  }

  // Mover el estado del item es como el operario declara su avance.
  const opts = { preHandler: [fastify.authenticate, fastify.rbac('taller.avance', 'write')] }
  fastify.put(ROUTE, opts, updateEstado)
  fastify.patch(ROUTE, opts, updateEstado)
  fastify.post(BULK_ROUTE, opts, updateTallerEstadoMasivo)
}
