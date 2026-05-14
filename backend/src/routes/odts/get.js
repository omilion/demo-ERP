export default async function getOdt(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const o = await fastify.prisma.odt.findUnique({ where: { id }, include: { items: true } })
    if (!o) return reply.code(404).send({ error: 'ODT no encontrada' })

    // Attach linked venta if exists
    let orden = null
    if (o.ordenId) {
      orden = await fastify.prisma.orden.findUnique({
        where: { id: o.ordenId },
        select: { id: true, tipo: true, estado: true, estadoPago: true, estadoEntrega: true, clienteId: true, createdAt: true, total: true },
      })
      if (orden?.clienteId) {
        const cliente = await fastify.prisma.cliente.findUnique({
          where: { id: orden.clienteId },
          select: { id: true, nombre: true, rut: true },
        })
        orden = { ...orden, cliente }
      }
    }
    return { ...o, orden }
  })
}
