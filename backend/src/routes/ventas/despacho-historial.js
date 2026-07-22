import { getUserSucursalId } from '../caja/scope.js'

export default async function despachoHistorialVenta(fastify) {
  fastify.get('/:id/despacho-historial', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const sucursalId = getUserSucursalId(request.user)
    const orden = await fastify.prisma.orden.findFirst({
      where: { id, ...(sucursalId ? { sucursalId } : {}) },
      select: { id: true },
    })
    if (!orden) return reply.code(404).send({ error: 'Venta no encontrada' })
    return fastify.prisma.despachoAjusteHistorial.findMany({
      where: { ordenId: id },
      orderBy: { createdAt: 'desc' },
    })
  })
}
