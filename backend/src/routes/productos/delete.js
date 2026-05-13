export default async function deleteProducto(fastify) {
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const id = Number(request.params.id)
    const existing = await fastify.prisma.producto.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Producto no encontrado' })
    await fastify.prisma.producto.update({ where: { id }, data: { activo: false } })
    return reply.code(204).send()
  })
}
