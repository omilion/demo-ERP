import { z } from 'zod'

const Schema = z.object({
  rut: z.string().min(1),
  nombre: z.string().min(1),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  ciudad: z.string().optional(),
  tipo: z.enum(['Empresa', 'Institucional', 'Municipal', 'Gobierno', 'Distribuidor']).optional(),
  razonSocial: z.string().optional(),
  limiteCredito: z.number().min(0).optional(),
})

export default async function createCliente(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'write')],
  }, async (request, reply) => {
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const c = await fastify.prisma.cliente.create({ data: parsed.data })
    return reply.code(201).send({ ...c, saldo: 0 })
  })
}
