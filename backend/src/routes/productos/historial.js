export default async function historialProducto(fastify) {
  fastify.get('/:id/historial-precios', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request, reply) => {
    const productoId = parseInt(request.params.id, 10)
    if (isNaN(productoId)) return reply.code(400).send({ error: 'ID invalido' })
    return fastify.prisma.precioHistorial.findMany({
      where: { productoId },
      orderBy: { createdAt: 'desc' },
    })
  })
}
