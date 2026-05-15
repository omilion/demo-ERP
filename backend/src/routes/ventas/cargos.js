// Cargos de transporte por venta
export default async function ventaCargosRoutes(fastify) {
  fastify.get('/:id/cargos', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request) => {
    const id = parseInt(request.params.id, 10)
    return fastify.prisma.ordenCargo.findMany({ where: { ordenId: id }, orderBy: { id: 'asc' } })
  })

  fastify.post('/:id/cargos', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    const { nombre, valor } = request.body || {}
    if (!nombre || valor == null) return reply.code(400).send({ error: 'nombre y valor requeridos' })
    const c = await fastify.prisma.ordenCargo.create({
      data: { ordenId: id, nombre, valor: Number(valor) },
    })
    return reply.code(201).send(c)
  })

  fastify.delete('/cargos/:cargoId', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const cargoId = parseInt(request.params.cargoId, 10)
    try {
      await fastify.prisma.ordenCargo.delete({ where: { id: cargoId } })
      return reply.code(204).send()
    } catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })

  // Anular venta (soft)
  fastify.post('/:id/anular', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    try {
      return await fastify.prisma.orden.update({
        where: { id }, data: { estado: 'Nula', eliminada: true, userMod: request.user?.nombre || null, fecham: new Date() },
      })
    } catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrada' }); throw e }
  })

  // Reactivar venta
  fastify.post('/:id/activar', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    try {
      return await fastify.prisma.orden.update({
        where: { id }, data: { estado: 'Activa', eliminada: false, userMod: request.user?.nombre || null, fecham: new Date() },
      })
    } catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrada' }); throw e }
  })

  // Actualizar nEntregados de un item
  fastify.put('/items/:itemId/entregados', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const itemId = parseInt(request.params.itemId, 10)
    const { nEntregados } = request.body || {}
    if (nEntregados == null || nEntregados < 0) return reply.code(400).send({ error: 'nEntregados inválido' })
    try {
      const item = await fastify.prisma.ordenItem.findUnique({ where: { id: itemId } })
      if (!item) return reply.code(404).send({ error: 'item no encontrado' })
      const n = Math.min(parseInt(nEntregados, 10), item.cantidad)
      const updated = await fastify.prisma.ordenItem.update({
        where: { id: itemId }, data: { nEntregados: n },
      })
      // Recalcular estadoEntrega de la orden
      const items = await fastify.prisma.ordenItem.findMany({ where: { ordenId: item.ordenId, eliminado: false } })
      const totalCant = items.reduce((s, i) => s + i.cantidad, 0)
      const totalEnt = items.reduce((s, i) => s + i.nEntregados, 0)
      const estadoEntrega = totalEnt === 0 ? 'Pendiente entrega'
        : totalEnt >= totalCant ? 'Entregada' : 'Parcial'
      await fastify.prisma.orden.update({ where: { id: item.ordenId }, data: { estadoEntrega } })
      return updated
    } catch (e) { throw e }
  })
}
