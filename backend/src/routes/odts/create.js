import { z } from 'zod'
import { resolveOrdenForWrite } from '../relation-guards.js'
import { ODT_ESTADOS, applyOdtStateSideEffects, validateOperario } from './operations.js'

const Schema = z.object({
  tipo: z.enum(['Corte', 'Espumas', 'Confecciones', 'Madera', 'Externo']).optional(),
  clienteNombre: z.string().optional(),
  descripcion: z.string().optional(),
  obsGeneral: z.string().optional().nullable(),
  plazo: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
  fechaIngreso: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()).nullable().optional(),
  fechaInicio: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()).nullable().optional(),
  fechaTermino: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()).nullable().optional(),
  estado: z.enum(ODT_ESTADOS).default('Pendiente'),
  prioridad: z.string().default('normal'),
  vendedorId: z.number().int().optional(),
  operarioId: z.number().int().nullable().optional(),
  ordenId: z.union([z.number().int(), z.string()]).nullable().optional(),
  centroCostoId: z.union([z.number().int(), z.string()]).nullable().optional(),
})

export default async function createOdt(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller.gestion', 'write')],
  }, async (request, reply) => {
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const data = { ...parsed.data }
    const tieneOrden = data.ordenId !== undefined && data.ordenId !== null && data.ordenId !== ''
    const centroCostoId = data.centroCostoId === undefined || data.centroCostoId === null || data.centroCostoId === '' ? null : Number(data.centroCostoId)
    if (!tieneOrden && !centroCostoId) return reply.code(400).send({ error: 'centroCostoId requerido para una OT interna' })
    if (centroCostoId && (!Number.isInteger(centroCostoId) || centroCostoId < 1)) return reply.code(400).send({ error: 'centroCostoId invalido' })
    const centroCosto = centroCostoId
      ? await fastify.prisma.centroCosto.findFirst({ where: { id: centroCostoId, activo: true }, select: { id: true } })
      : null
    if (centroCostoId && !centroCosto) return reply.code(400).send({ error: 'Centro de costo no disponible' })
    const resolved = tieneOrden
      ? await resolveOrdenForWrite(fastify.prisma, { ordenId: data.ordenId }, { user: request.user })
      : null
    if (resolved?.error) return reply.code(resolved.status).send({ error: resolved.error })
    const cliente = resolved?.orden?.clienteId
      ? await fastify.prisma.cliente.findUnique({ where: { id: resolved.orden.clienteId }, select: { nombre: true } })
      : null
    const operario = await validateOperario(fastify.prisma, data.operarioId)
    if (operario?.error) return reply.code(400).send({ error: operario.error })

    data.ordenId = resolved?.orden?.id ?? null
    data.centroCostoId = centroCostoId
    if (!data.clienteNombre && cliente?.nombre) data.clienteNombre = cliente.nombre
    if (!data.clienteNombre && !data.ordenId) data.clienteNombre = 'Trabajo interno'
    if (data.plazo) data.plazo = new Date(data.plazo)
    if (data.fechaIngreso) data.fechaIngreso = new Date(data.fechaIngreso)
    if (data.fechaInicio) data.fechaInicio = new Date(data.fechaInicio)
    if (data.fechaTermino) data.fechaTermino = new Date(data.fechaTermino)
    data.sucursalId = resolved?.orden?.sucursalId ?? request.user?.sucursalId ?? null
    const o = await fastify.prisma.odt.create({ data: applyOdtStateSideEffects(data) })
    return reply.code(201).send(o)
  })
}
