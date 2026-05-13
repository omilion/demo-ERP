import { computeSaldo } from './helpers.js'

export default async function getCliente(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const c = await fastify.prisma.cliente.findFirst({ where: { id, activo: true } })
    if (!c) return reply.code(404).send({ error: 'Cliente no encontrado' })
    const saldo = await computeSaldo(fastify.prisma, id)
    return { ...c, saldo }
  })
}
