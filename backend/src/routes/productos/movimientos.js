// Movimientos manuales de stock por producto (ingreso / egreso / ajuste)
const TIPOS = ['ingreso', 'egreso', 'ajuste']

export default async function movimientosProductoRoutes(fastify) {
  fastify.get('/:id/movimientos', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    return fastify.prisma.movimientoBodega.findMany({
      where: { productoId: id }, orderBy: { createdAt: 'desc' }, take: 100,
    })
  })

  fastify.post('/:id/movimientos', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const { tipo, cantidad, motivo } = request.body || {}
    if (!TIPOS.includes(tipo)) return reply.code(400).send({ error: 'tipo debe ser ingreso, egreso o ajuste' })
    const qty = parseInt(cantidad, 10)
    if (isNaN(qty) || qty === 0) return reply.code(400).send({ error: 'cantidad inválida' })
    if (!motivo || !String(motivo).trim()) return reply.code(400).send({ error: 'motivo requerido' })
    const prod = await fastify.prisma.producto.findUnique({ where: { id } })
    if (!prod) return reply.code(404).send({ error: 'Producto no encontrado' })

    const delta = tipo === 'ingreso' ? Math.abs(qty)
      : tipo === 'egreso' ? -Math.abs(qty)
      : qty - prod.stock // ajuste = setear stock al valor `cantidad`
    const newStock = Math.max(0, prod.stock + delta)
    const userId = request.user?.id || 1

    const [, mov] = await fastify.prisma.$transaction([
      fastify.prisma.producto.update({ where: { id }, data: { stock: newStock } }),
      fastify.prisma.movimientoBodega.create({
        data: { productoId: id, tipo, cantidad: delta, motivo: String(motivo).trim(), userId },
      }),
    ])
    return reply.code(201).send({ movimiento: mov, stockFinal: newStock })
  })
}
