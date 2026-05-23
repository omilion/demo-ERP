import { z } from 'zod'
import { resolveOrdenForWrite } from '../relation-guards.js'
import { ODT_ESTADOS, applyOdtStateSideEffects, validateOperario } from './operations.js'

const Schema = z.object({
  tipo: z.enum(['Espumas', 'Confecciones', 'Madera', 'Externo']).optional(),
  clienteNombre: z.string().optional(),
  descripcion: z.string().optional(),
  plazo: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
  estado: z.enum(ODT_ESTADOS).default('Pendiente'),
  prioridad: z.string().default('normal'),
  vendedorId: z.number().int().optional(),
  operarioId: z.number().int().nullable().optional(),
  ordenId: z.union([z.number().int(), z.string()]),
})

export default async function createOdt(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const data = { ...parsed.data }
    const resolved = await resolveOrdenForWrite(fastify.prisma, { ordenId: data.ordenId })
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })

    const cliente = resolved.orden.clienteId
      ? await fastify.prisma.cliente.findUnique({ where: { id: resolved.orden.clienteId }, select: { nombre: true } })
      : null
    const operario = await validateOperario(fastify.prisma, data.operarioId)
    if (operario?.error) return reply.code(400).send({ error: operario.error })

    data.ordenId = resolved.orden.id
    if (!data.clienteNombre && cliente?.nombre) data.clienteNombre = cliente.nombre
    if (data.plazo) data.plazo = new Date(data.plazo)
    const o = await fastify.prisma.odt.create({ data: applyOdtStateSideEffects(data) })
    return reply.code(201).send(o)
  })
}
