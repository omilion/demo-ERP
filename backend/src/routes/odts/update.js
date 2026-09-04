import { z } from 'zod'
import { resolveOrdenForWrite } from '../relation-guards.js'
import { getUserSucursalId } from '../caja/scope.js'
import { can } from '../../middleware/rbac.js'
import { ODT_ESTADOS, applyOdtStateSideEffects, buildOdtUpdateBitacoraEntries, getAuditUsuario, isTerminalOdtEstado, validateOdtEstadoTransition, validateOperario } from './operations.js'

const Schema = z.object({
  tipo: z.enum(['Corte', 'Espumas', 'Confecciones', 'Madera', 'Externo']).optional(),
  clienteNombre: z.string().optional(),
  descripcion: z.string().optional(),
  obsGeneral: z.string().optional().nullable(),
  plazo: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
  fechaIngreso: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()).nullable().optional(),
  fechaInicio: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()).nullable().optional(),
  fechaTermino: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()).nullable().optional(),
  estado: z.enum(ODT_ESTADOS).optional(),
  prioridad: z.string().optional(),
  operarioId: z.number().int().nullable().optional(),
  ordenId: z.union([z.number().int(), z.string()]).nullable().optional(),
  centroCostoId: z.union([z.number().int(), z.string()]).nullable().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'El cuerpo no puede estar vacio' })

const LifecycleSchema = z.object({
  razon: z.string().trim().min(1).optional(),
  usuario: z.string().trim().min(1).optional(),
}).optional()

const CerrarSchema = z.object({
  estado: z.enum(['Terminada', 'Entregada']).default('Terminada'),
  razon: z.string().trim().min(1).optional(),
  usuario: z.string().trim().min(1).optional(),
  controlCalidad: z.object({
    aprobada: z.literal(true),
    observacion: z.string().trim().min(3, 'Describe la validacion de calidad antes de cerrar la OT.'),
  }).optional(),
}).optional()

function lifecycleUsuario(request, body = {}) {
  return body?.usuario?.trim?.() || getAuditUsuario(request.user)
}

function lifecycleTexto(action, body = {}) {
  const razon = body?.razon?.trim?.()
  return razon ? `${action}. Razon: ${razon}` : action
}

function lifecycleBitacoraData({ id, current, request, body, texto }) {
  const usuario = lifecycleUsuario(request, body)
  return {
    odtId: id,
    usuario,
    usuarioReporta: getAuditUsuario(request.user),
    sucursalId: current.sucursalId ?? getUserSucursalId(request.user),
    fecha: new Date(),
    texto,
  }
}

function scopedOdtWhere(id, user) {
  const sucursalId = getUserSucursalId(user)
  return { id, eliminado: false, ...(sucursalId ? { OR: [{ sucursalId }, { sucursalId: null }] } : {}) }
}

async function lockOdtWorkflow(tx, odtId) {
  // El mismo lock se toma en el flujo de items de taller. Así no se puede
  // marcar un ítem pendiente entre la verificación de QC y el cierre de OT.
  if (typeof tx?.$executeRaw === 'function') {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`odt-workflow:${Number(odtId)}`})::bigint)`
  }
}

export function getOdtClosureBlocker({ current, pendientes = 0, pendienteDetalle = '', controlCalidad } = {}) {
  if (current?.estado !== 'Control calidad') {
    return 'La OT debe estar en Control calidad antes de cerrarse.'
  }
  if (!controlCalidad?.aprobada || !String(controlCalidad.observacion || '').trim()) {
    return 'Registra la aprobacion y observacion de Control de calidad antes de cerrar la OT.'
  }
  if (Number(pendientes) > 0) {
    return `No se puede cerrar: quedan ${pendientes} etapa(s) de taller sin marcar lista o cancelada.${pendienteDetalle ? ` ${pendienteDetalle}` : ''}`
  }
  return null
}

export default async function updateOdt(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller.gestion', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    try {
      const data = { ...parsed.data }
      if (data.estado === 'Anulada' && !can(request.user?.role, 'taller', 'delete', request.user?.permisosExtra)) {
        return reply.code(403).send({ error: 'Forbidden' })
      }
      const current = await fastify.prisma.odt.findFirst({
        where: scopedOdtWhere(id, request.user),
        select: { id: true, estado: true, operarioId: true, fechaInicio: true, fechaTermino: true, sucursalId: true, ordenId: true, centroCostoId: true },
      })
      if (!current) return reply.code(404).send({ error: 'ODT no encontrada' })
      if (data.estado && isTerminalOdtEstado(data.estado) && data.estado !== current.estado) {
        return reply.code(400).send({ error: 'Usa el cierre supervisado de OT desde Control calidad; el cambio directo a un estado terminal no esta permitido.' })
      }
      if (data.ordenId !== undefined && data.ordenId !== null && data.ordenId !== '') {
        const resolved = await resolveOrdenForWrite(fastify.prisma, { ordenId: data.ordenId }, { user: request.user })
        if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
        data.ordenId = resolved.orden.id
        data.sucursalId = resolved.orden.sucursalId ?? current.sucursalId ?? request.user?.sucursalId ?? null
      }
      if (data.ordenId === null || data.ordenId === '') data.ordenId = null
      if (data.centroCostoId !== undefined) {
        data.centroCostoId = data.centroCostoId === null || data.centroCostoId === '' ? null : Number(data.centroCostoId)
        if (data.centroCostoId && (!Number.isInteger(data.centroCostoId) || data.centroCostoId < 1)) return reply.code(400).send({ error: 'centroCostoId invalido' })
        if (data.centroCostoId) {
          const centro = await fastify.prisma.centroCosto.findFirst({ where: { id: data.centroCostoId, activo: true }, select: { id: true } })
          if (!centro) return reply.code(400).send({ error: 'Centro de costo no disponible' })
        }
      }
      const ordenFinal = data.ordenId === undefined ? current.ordenId : data.ordenId
      const centroFinal = data.centroCostoId === undefined ? current.centroCostoId : data.centroCostoId
      if (!ordenFinal && !centroFinal) return reply.code(400).send({ error: 'centroCostoId requerido para una OT interna' })
      const operario = await validateOperario(fastify.prisma, data.operarioId)
      if (operario?.error) return reply.code(400).send({ error: operario.error })
      if (data.plazo) data.plazo = new Date(data.plazo)
      if (data.fechaIngreso) data.fechaIngreso = new Date(data.fechaIngreso)
      if (data.fechaInicio) data.fechaInicio = new Date(data.fechaInicio)
      if (data.fechaTermino) data.fechaTermino = new Date(data.fechaTermino)
      const transicionInvalida = validateOdtEstadoTransition(current.estado, data.estado)
      if (transicionInvalida) return reply.code(409).send({ error: transicionInvalida })
      const updateData = applyOdtStateSideEffects(data, current)
      const bitacoraEntries = buildOdtUpdateBitacoraEntries({
        current,
        data: updateData,
        operario,
        user: request.user,
      })
      return await fastify.prisma.$transaction(async (tx) => {
        if (updateData.estado) await lockOdtWorkflow(tx, id)
        const o = await tx.odt.update({ where: { id }, data: updateData })
        if (bitacoraEntries.length) await tx.bitacoraTaller.createMany({ data: bitacoraEntries })
        return o
      })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'ODT no encontrada' })
      throw e
    }
  })

  // Cerrar y anular son de supervision: el operario declara avance, no cierra.
  fastify.post('/:id/cerrar', {
    preHandler: [fastify.authenticate, fastify.rbac('taller.cerrar', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = CerrarSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const body = parsed.data || {}
    try {
      const current = await fastify.prisma.odt.findFirst({ where: scopedOdtWhere(id, request.user) })
      if (!current) return reply.code(404).send({ error: 'ODT no encontrada' })
      return await fastify.prisma.$transaction(async (tx) => {
        await lockOdtWorkflow(tx, id)
        const txCurrent = await tx.odt.findFirst({ where: scopedOdtWhere(id, request.user) })
        if (!txCurrent) {
          const error = new Error('ODT no encontrada')
          error.statusCode = 404
          throw error
        }
        const transicionInvalida = validateOdtEstadoTransition(txCurrent.estado, body.estado)
        if (transicionInvalida) {
          const error = new Error(transicionInvalida)
          error.statusCode = 409
          throw error
        }
        const pendientes = await tx.odtItemTaller.findMany({
          where: {
            odtItem: { is: { odtId: id, eliminado: false } },
            estado: { notIn: ['listo', 'Listo', 'cancelado'] },
          },
          select: {
            estado: true,
            odtItem: { select: { nombre: true, codigoInterno: true } },
            taller: { select: { nombre: true } },
          },
          take: 20,
        })
        const pendienteDetalle = pendientes
          .map(item => `${item.odtItem?.codigoInterno || item.odtItem?.nombre || 'item'} en ${item.taller?.nombre || 'taller'} (${item.estado})`)
          .join('; ')
        const blocker = getOdtClosureBlocker({ current: txCurrent, pendientes: pendientes.length, pendienteDetalle, controlCalidad: body.controlCalidad })
        if (blocker) {
          const error = new Error(blocker)
          error.statusCode = 409
          throw error
        }
        const updateData = applyOdtStateSideEffects({ estado: body.estado }, txCurrent)
        const o = await tx.odt.update({ where: { id }, data: updateData })
        await tx.bitacoraTaller.create({
          data: lifecycleBitacoraData({
            id,
            current: txCurrent,
            request,
            body,
            texto: lifecycleTexto(`Control de calidad aprobado: ${body.controlCalidad.observacion}. ODT cerrada: ${txCurrent.estado} -> ${body.estado}`, body),
          }),
        })
        return o
      })
    } catch (e) {
      if (e.statusCode) return reply.code(e.statusCode).send({ error: e.message })
      if (e.code === 'P2025') return reply.code(404).send({ error: 'ODT no encontrada' })
      throw e
    }
  })

  fastify.post('/:id/anular', {
    preHandler: [fastify.authenticate, fastify.rbac('taller.cerrar', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = LifecycleSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const body = parsed.data || {}
    try {
      const current = await fastify.prisma.odt.findFirst({ where: scopedOdtWhere(id, request.user) })
      if (!current) return reply.code(404).send({ error: 'ODT no encontrada' })
      const updateData = applyOdtStateSideEffects({ estado: 'Anulada', eliminado: true }, current)
      return await fastify.prisma.$transaction(async (tx) => {
        const o = await tx.odt.update({ where: { id }, data: updateData })
        await tx.bitacoraTaller.create({
          data: lifecycleBitacoraData({
            id,
            current,
            request,
            body,
            texto: lifecycleTexto(`ODT anulada: ${current.estado} -> Anulada`, body),
          }),
        })
        return o
      })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'ODT no encontrada' })
      throw e
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller.cerrar', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = LifecycleSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const body = parsed.data || {}
    try {
      const current = await fastify.prisma.odt.findFirst({ where: scopedOdtWhere(id, request.user) })
      if (!current) return reply.code(404).send({ error: 'ODT no encontrada' })
      const updateData = applyOdtStateSideEffects({ estado: 'Anulada', eliminado: true }, current)
      await fastify.prisma.$transaction(async (tx) => {
        await tx.odt.update({ where: { id }, data: updateData })
        await tx.bitacoraTaller.create({
          data: lifecycleBitacoraData({
            id,
            current,
            request,
            body,
            texto: lifecycleTexto(`ODT anulada por eliminacion: ${current.estado} -> Anulada`, body),
          }),
        })
      })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'ODT no encontrada' })
      throw e
    }
  })
}
