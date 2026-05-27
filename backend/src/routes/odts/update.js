import { z } from 'zod'
import { resolveOrdenForWrite } from '../relation-guards.js'
import { getUserSucursalId } from '../caja/scope.js'
import { can } from '../../middleware/rbac.js'
import { ODT_ESTADOS, applyOdtStateSideEffects, buildOdtUpdateBitacoraEntries, getAuditUsuario, validateOperario } from './operations.js'

const Schema = z.object({
  tipo: z.enum(['Espumas', 'Confecciones', 'Madera', 'Externo']).optional(),
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
  ordenId: z.union([z.number().int(), z.string()]).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'El cuerpo no puede estar vacio' })

const LifecycleSchema = z.object({
  razon: z.string().trim().min(1).optional(),
  usuario: z.string().trim().min(1).optional(),
}).optional()

const CerrarSchema = z.object({
  estado: z.enum(['Terminada', 'Entregada']).default('Terminada'),
  razon: z.string().trim().min(1).optional(),
  usuario: z.string().trim().min(1).optional(),
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

export default async function updateOdt(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
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
        select: { id: true, estado: true, operarioId: true, fechaInicio: true, fechaTermino: true, sucursalId: true },
      })
      if (!current) return reply.code(404).send({ error: 'ODT no encontrada' })
      if (data.ordenId !== undefined) {
        const resolved = await resolveOrdenForWrite(fastify.prisma, { ordenId: data.ordenId }, { user: request.user })
        if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
        data.ordenId = resolved.orden.id
        data.sucursalId = resolved.orden.sucursalId ?? current.sucursalId ?? request.user?.sucursalId ?? null
      }
      const operario = await validateOperario(fastify.prisma, data.operarioId)
      if (operario?.error) return reply.code(400).send({ error: operario.error })
      if (data.plazo) data.plazo = new Date(data.plazo)
      if (data.fechaIngreso) data.fechaIngreso = new Date(data.fechaIngreso)
      if (data.fechaInicio) data.fechaInicio = new Date(data.fechaInicio)
      if (data.fechaTermino) data.fechaTermino = new Date(data.fechaTermino)
      const updateData = applyOdtStateSideEffects(data, current)
      const bitacoraEntries = buildOdtUpdateBitacoraEntries({
        current,
        data: updateData,
        operario,
        user: request.user,
      })
      return await fastify.prisma.$transaction(async (tx) => {
        const o = await tx.odt.update({ where: { id }, data: updateData })
        if (bitacoraEntries.length) await tx.bitacoraTaller.createMany({ data: bitacoraEntries })
        return o
      })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'ODT no encontrada' })
      throw e
    }
  })

  fastify.post('/:id/cerrar', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = CerrarSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const body = parsed.data || {}
    try {
      const current = await fastify.prisma.odt.findFirst({ where: scopedOdtWhere(id, request.user) })
      if (!current) return reply.code(404).send({ error: 'ODT no encontrada' })
      const updateData = applyOdtStateSideEffects({ estado: body.estado }, current)
      return await fastify.prisma.$transaction(async (tx) => {
        const o = await tx.odt.update({ where: { id }, data: updateData })
        await tx.bitacoraTaller.create({
          data: lifecycleBitacoraData({
            id,
            current,
            request,
            body,
            texto: lifecycleTexto(`ODT cerrada: ${current.estado} -> ${body.estado}`, body),
          }),
        })
        return o
      })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'ODT no encontrada' })
      throw e
    }
  })

  fastify.post('/:id/anular', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'delete')],
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
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'delete')],
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
