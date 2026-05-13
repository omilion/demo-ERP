import { computeEstado } from './helpers.js'

export default async function getProducto(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'read')],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const p = await fastify.prisma.producto.findUnique({ where: { id } })
    if (!p) return reply.code(404).send({ error: 'Producto no encontrado' })
    return { ...p, estado: computeEstado(p) }
  })
}
