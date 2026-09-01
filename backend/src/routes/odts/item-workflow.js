import { parsePositiveInt } from '../operational-utils.js'
import { can } from '../../middleware/rbac.js'
import { getUserSucursalId } from '../caja/scope.js'

export const ODT_ITEM_TALLER_ESTADOS = Object.freeze([
  'pendiente',
  'en_proceso',
  'pausado',
  'listo',
  'rechazado',
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

export function buildTallerItemEstadoBitacoraEntry({ current = {}, estado, user, obs }) {
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
    texto: `Estado taller ${tallerLabel} / ${itemLabel}: ${current.estado || 'sin estado'} -> ${estado}${estado === 'rechazado' && String(obs || '').trim() ? ` · Motivo: ${String(obs).trim()}` : ''}`,
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
  taller: { select: { nombre: true, jefeId: true } },
}

// La calidad de lo que sale de un taller la aprueba SU jefe.
//
// Mientras el taller no tenga jefe asignado alcanza con el permiso de taller: un
// control que nadie puede ejercer detiene el trabajo en vez de ordenarlo, y la regla
// va entrando en vigor a medida que Plastimar nombre a cada jefe.
//
// Cuando si lo tiene, no basta con el permiso de gestion: todos los jefes de taller
// lo tienen, asi que el de Corte podria aprobar lo que sale de Espumas y la regla
// quedaria en nada. El desbloqueo queda en `taller:delete`, que es la llave de
// administracion que este archivo ya usa para los estados destructivos.
export function puedeRecibirEtapa(user, taller) {
  if (!taller?.jefeId) return can(user?.role, 'taller.avance', 'write', user?.permisosExtra)
  if (user?.id === taller.jefeId) return true
  return can(user?.role, 'taller', 'delete', user?.permisosExtra)
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
    // Declarar el propio avance y decidir quien hace el trabajo son cosas distintas.
    // Este endpoint pide taller.avance:write -el permiso del operario- y aceptaba
    // ademas el responsable, asi que una cortadora podia reasignarle la tarea a otra.
    // Asignar es de coordinacion.
    if (operarioResponsableId !== undefined
      && !can(request.user?.role, 'taller.gestion', 'write', request.user?.permisosExtra)) {
      return reply.code(403).send({ error: 'Asignar responsable es de coordinación de taller' })
    }
    if (operarioResponsableId !== undefined && operarioResponsableId !== null && isNaN(operarioResponsableId)) {
      return reply.code(400).send({ error: 'operarioResponsableId invalido' })
    }

    const obs = request.body?.obs !== undefined ? String(request.body.obs) : undefined

    if (!estado && operarioResponsableId === undefined && obs === undefined) {
      return reply.code(400).send({ error: 'Cuerpo vacio o invalido' })
    }
    if (estado === 'rechazado' && !String(obs || '').trim()) {
      return reply.code(400).send({ error: 'Motivo de rechazo requerido en obs' })
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
          const bitacoraEntry = buildTallerItemEstadoBitacoraEntry({ current: txCurrent, estado, user: request.user, obs: data.obs ?? txCurrent.obs })
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
    if (estado === 'rechazado') return reply.code(400).send({ error: 'El rechazo debe registrarse por ítem e incluir su motivo' })

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

  // Recibir el trabajo de la etapa anterior: la inspeccion de calidad la hace quien
  // recibe, que es el primer interesado en que venga bien y ya esta ahi. Se declara
  // por cantidad y no por si/no, porque el defecto real es parcial -de 100 cortes, 8
  // con el color cambiado- y el resto sigue su camino.
  //
  // No se agrega un estado "pendiente de calidad": un estado que nadie vacia bloquea
  // la operacion entera. Lo que si tiene efecto es el rechazo, que saca la etapa de
  // "listo" y con eso la puerta de cierre de la OT la detiene.
  async function recibirEtapa(request, reply) {
    const parsedParams = parseWorkflowParams(request.params)
    if (parsedParams.error) return reply.code(400).send({ error: parsedParams.error })

    const body = request.body || {}
    const aceptada = Number(body.cantidadAceptada)
    const rechazada = Number(body.cantidadRechazada ?? 0)
    if (!Number.isFinite(aceptada) || aceptada < 0) return reply.code(400).send({ error: 'cantidadAceptada invalida' })
    if (!Number.isFinite(rechazada) || rechazada < 0) return reply.code(400).send({ error: 'cantidadRechazada invalida' })
    if (aceptada + rechazada <= 0) return reply.code(400).send({ error: 'Indica que cantidad se revisa' })

    const defecto = String(body.defecto || '').trim() || null
    const causa = String(body.causa || '').trim() || null
    // Un rechazo sin motivo no sirve para corregir nada: quien lo reciba de vuelta
    // necesita saber que estuvo mal.
    if (rechazada > 0 && !defecto) {
      return reply.code(400).send({ error: 'Indica el defecto por el que se rechaza' })
    }

    const decisionPedida = String(body.decision || '').trim().toLowerCase()
    const decision = rechazada === 0
      ? 'aceptada'
      : (['reproceso', 'descarte'].includes(decisionPedida) ? decisionPedida : 'reproceso')

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
    // Se recibe trabajo terminado: una etapa que el taller todavia no declara lista no
    // se puede aceptar ni rechazar.
    if (normalizeText(current.estado) !== 'listo') {
      return reply.code(409).send({ error: 'La etapa todavia no esta lista para recibir' })
    }
    if (!puedeRecibirEtapa(request.user, current.taller)) {
      return reply.code(403).send({
        error: `La calidad de ${current.taller?.nombre || 'este taller'} la aprueba su jefe`,
      })
    }

    const usuario = getRequestUsuario(request.user) || 'Sistema'
    try {
      const creada = await fastify.prisma.$transaction(async (tx) => {
        const recepcion = await tx.odtEtapaRecepcion.create({
          data: {
            odtItemTallerId: current.id,
            cantidadRevisada: aceptada + rechazada,
            cantidadAceptada: aceptada,
            cantidadRechazada: rechazada,
            defecto,
            causa,
            decision,
            usuario,
            usuarioId: Number.isInteger(request.user?.id) ? request.user.id : null,
            ipEquipo: request.ip,
          },
        })

        // Si algo se rechaza, la etapa deja de estar lista: hay trabajo que rehacer y
        // la OT no puede cerrarse hasta resolverlo. Si se acepta todo, no se toca el
        // estado, que ya es el correcto.
        if (rechazada > 0 && decision === 'reproceso') {
          await tx.odtItemTaller.update({
            where: { id: current.id },
            data: { estado: 'en_proceso', fechaListo: null, usuarioListo: null },
          })
        }

        const itemLabel = [current.odtItem?.codigoInterno, current.odtItem?.nombre].filter(Boolean).join(' - ')
        await tx.bitacoraTaller.create({
          data: {
            odtId: current.odtItem.odtId,
            usuario,
            usuarioReporta: usuario,
            ipEquipo: request.ip,
            sucursalId: current.odtItem?.odt?.sucursalId ?? sucursalId,
            fecha: new Date(),
            texto: rechazada > 0
              ? `Recepción ${current.taller?.nombre || 'taller'} / ${itemLabel}: acepta ${aceptada}, rechaza ${rechazada} (${decision}) · Defecto: ${defecto}${causa ? ` · Causa: ${causa}` : ''}`
              : `Recepción ${current.taller?.nombre || 'taller'} / ${itemLabel}: acepta ${aceptada} conforme`,
          },
        })

        return recepcion
      })
      // La respuesta se envia DESPUES de que la transaccion confirma. Hacerlo desde
      // dentro devuelve 201 sobre una escritura que todavia no es durable: quien lee
      // enseguida ve el estado anterior.
      return reply.code(201).send(creada)
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
  fastify.post(`${ROUTE.replace('/estado', '')}/recepcion`, opts, recibirEtapa)
}
