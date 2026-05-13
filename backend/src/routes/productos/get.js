import { computeEstado } from './helpers.js'

export default async function getProducto(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const p = await fastify.prisma.producto.findFirst({ where: { id, activo: true } })
    if (!p) return reply.code(404).send({ error: 'Producto no encontrado' })
    return { ...p, estado: computeEstado(p) }
  })
}
