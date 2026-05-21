export default async function deleteProducto(fastify) {
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const existing = await fastify.prisma.producto.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Producto no encontrado' })
    await fastify.prisma.producto.update({ where: { id }, data: { activo: false } })
    return reply.code(204).send()
  })
}
