import { z } from 'zod'
import {
  ensureClienteIdentifiersAvailable,
  handleClienteUniqueError,
  normalizeClientePayload,
} from './helpers.js'

const Schema = z.object({
  rut: z.string().trim().min(1),
  nombre: z.string().trim().min(1),
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
})

export default async function createCliente(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'write')],
  }, async (request, reply) => {
    const parsed = Schema.safeParse(normalizeClientePayload(request.body || {}))
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    if (!await ensureClienteIdentifiersAvailable(fastify.prisma, parsed.data, reply)) return
    try {
      const c = await fastify.prisma.cliente.create({ data: parsed.data })
      return reply.code(201).send({ ...c, saldo: 0 })
    } catch (e) {
      if (handleClienteUniqueError(e, reply)) return
      throw e
    }
  })
}
