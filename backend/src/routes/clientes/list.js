import { computeSaldo } from './helpers.js'

export default async function listClientes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'read')],
  }, async (request, reply) => {
    const { search, tipo } = request.query
    const where = { activo: true }
    if (tipo) where.tipo = tipo
    if (search) where.OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { rut: { contains: search } },
      { ciudad: { contains: search, mode: 'insensitive' } },
    ]
    const clientes = await fastify.prisma.cliente.findMany({ where, orderBy: { nombre: 'asc' } })
    const withSaldo = await Promise.all(
      clientes.map(async c => ({ ...c, saldo: await computeSaldo(fastify.prisma, c.id) }))
    )
    return withSaldo
  })
}
