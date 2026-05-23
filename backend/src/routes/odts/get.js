import { attachOperarios } from './operations.js'

export default async function getOdt(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const o = await fastify.prisma.odt.findUnique({
      where: { id },
      include: {
        items: { include: { talleres: { include: { taller: true } } } },
        bitacora: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!o) return reply.code(404).send({ error: 'ODT no encontrada' })

    // Attach linked venta if exists
    let orden = null
    if (o.ordenId) {
      orden = await fastify.prisma.orden.findUnique({
        where: { id: o.ordenId },
        select: {
          id: true, nInterno: true, tipo: true, estado: true, estadoPago: true, estadoEntrega: true,
          clienteId: true, createdAt: true, descuentoPct: true,
          items: { select: { cantidad: true, precioUnitario: true } },
        },
      })
      if (orden) {
        const subtotal = (orden.items || []).reduce((s, i) => s + (i.cantidad || 0) * (i.precioUnitario || 0), 0)
        orden = { ...orden, total: subtotal * (1 - (orden.descuentoPct || 0) / 100) }
      }
      if (orden?.clienteId) {
        const cliente = await fastify.prisma.cliente.findUnique({
          where: { id: orden.clienteId },
          select: { id: true, nombre: true, rut: true },
        })
        orden = { ...orden, cliente }
      }
    }
    const withOperario = await attachOperarios(fastify.prisma, o)
    return { ...withOperario, orden }
  })
}
