import { z } from 'zod'
import { computeSaldo } from './helpers.js'

const Schema = z.object({
  nombre: z.string().min(1).optional(),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  ciudad: z.string().optional(),
  tipo: z.enum(['Empresa', 'Institucional', 'Municipal', 'Gobierno', 'Distribuidor']).optional(),
  razonSocial: z.string().optional(),
  giro: z.string().optional(),
  direccion: z.string().optional(),
  region: z.string().optional(),
  comuna: z.string().optional(),
  segmento: z.string().optional(),
  diasInactivoAlerta: z.number().int().min(0).optional(),
  limiteCredito: z.number().min(0).optional(),
  activo: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'El cuerpo no puede estar vacío' })

export default async function updateCliente(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const result = await fastify.prisma.cliente.updateMany({ where: { id, activo: true }, data: parsed.data })
    if (result.count === 0) return reply.code(404).send({ error: 'Cliente no encontrado' })
    const c = await fastify.prisma.cliente.findFirst({ where: { id } })
    const saldo = await computeSaldo(fastify.prisma, id)
    return { ...c, saldo }
  })
}
