import { parsePositiveInt } from '../operational-utils.js'

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

export function buildTallerItemRelationWhere({ odtId, itemId, tallerItemId }) {
  return {
    id: tallerItemId,
    odtItemId: itemId,
    odtItem: { is: { odtId } },
  }
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
    texto: `Estado taller ${tallerLabel} / ${itemLabel}: ${current.estado || 'sin estado'} -> ${estado}`,
  }
}

const ROUTE = '/:odtId/items/:itemId/talleres/:tallerItemId/estado'

export default async function itemWorkflowRoutes(fastify) {
  async function updateEstado(request, reply) {
    const parsedParams = parseWorkflowParams(request.params)
    if (parsedParams.error) return reply.code(400).send({ error: parsedParams.error })

    const estado = normalizeTallerItemEstado(request.body?.estado)
    if (!estado) return reply.code(400).send({ error: ODT_ITEM_TALLER_ESTADOS_ERROR })

    const { tallerItemId } = parsedParams
    const current = await fastify.prisma.odtItemTaller.findFirst({
      where: buildTallerItemRelationWhere(parsedParams),
      select: {
        id: true,
        odtItemId: true,
        tallerId: true,
        estado: true,
        fechaInicio: true,
        fechaListo: true,
        usuario: true,
        usuarioListo: true,
        odtItem: { select: { odtId: true, codigoInterno: true, nombre: true } },
        taller: { select: { nombre: true } },
      },
    })
    if (!current) return reply.code(404).send({ error: 'Relacion ODT/item/taller no encontrada' })

    try {
      return await fastify.prisma.$transaction(async (tx) => {
        const updated = await tx.odtItemTaller.update({
          where: { id: tallerItemId },
          data: buildTallerItemEstadoUpdate({ estado, current, user: request.user }),
        })
        const bitacoraEntry = buildTallerItemEstadoBitacoraEntry({ current, estado, user: request.user })
        if (bitacoraEntry.odtId && estado !== current.estado) await tx.bitacoraTaller.create({ data: bitacoraEntry })
        return updated
      })
    } catch (error) {
      if (error.code === 'P2025') return reply.code(404).send({ error: 'Relacion ODT/item/taller no encontrada' })
      throw error
    }
  }

  const opts = { preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')] }
  fastify.put(ROUTE, opts, updateEstado)
  fastify.patch(ROUTE, opts, updateEstado)
}
