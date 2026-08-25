import { z } from 'zod'
import {
  computeSaldo,
  ensureClienteIdentifiersAvailable,
  handleClienteUniqueError,
  normalizeClientePayload,
} from './helpers.js'
import { can } from '../../middleware/rbac.js'

const Schema = z.object({
  rut: z.string().trim().min(1).optional(),
  nombre: z.string().trim().min(1).optional(),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  ciudad: z.string().optional(),
  tipo: z.enum(['Empresa', 'Institucional', 'Municipal', 'Gobierno', 'Distribuidor']).optional(),
  razonSocial: z.string().optional(),
  giro: z.string().optional(),
  direccion: z.string().optional(),
  region: z.string().optional(),
  comuna: z.string().optional(),
  pais: z.string().optional(),
  segmento: z.string().optional(),
  diasInactivoAlerta: z.number().int().min(0).optional(),
  limiteCredito: z.number().min(0).optional(),
  activo: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'El cuerpo no puede estar vacío' })

const LifecycleSchema = z.object({
  razon: z.string().trim().min(1).optional(),
  usuario: z.string().trim().min(1).optional(),
}).optional()

function auditMeta(request, body = {}) {
  return {
    razon: body?.razon?.trim?.() || null,
    usuario: body?.usuario?.trim?.() || request.user?.nombre || request.user?.email || null,
  }
}

export default async function updateCliente(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const parsed = Schema.safeParse(normalizeClientePayload(request.body || {}))
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    if (parsed.data.activo !== undefined && !can(request.user?.role, 'clientes', 'delete', request.user?.permisosExtra)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    if (!await ensureClienteIdentifiersAvailable(fastify.prisma, parsed.data, reply, id)) return
    try {
      const c = await fastify.prisma.cliente.update({ where: { id }, data: parsed.data })
      const saldo = await computeSaldo(fastify.prisma, id)
      return { ...c, saldo }
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Cliente no encontrado' })
      if (handleClienteUniqueError(e, reply)) return
      throw e
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = LifecycleSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })

    const result = await fastify.prisma.cliente.updateMany({
      where: { id, activo: true },
      data: { activo: false },
    })
    if (result.count === 0) return reply.code(404).send({ error: 'Cliente no encontrado o ya inactivo' })
    return reply.code(200).send({ id, activo: false, audit: auditMeta(request, parsed.data) })
  })

  fastify.post('/:id/reactivar', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = LifecycleSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })

    const result = await fastify.prisma.cliente.updateMany({
      where: { id, activo: false },
      data: { activo: true },
    })
    if (result.count === 0) return reply.code(404).send({ error: 'Cliente no encontrado o ya activo' })
    const c = await fastify.prisma.cliente.findUnique({ where: { id } })
    const saldo = await computeSaldo(fastify.prisma, id)
    return { ...c, saldo, audit: auditMeta(request, parsed.data) }
  })
}
