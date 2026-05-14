import { computeSaldo } from './helpers.js'

export default async function getCliente(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })

    const [c, saldo, ventas] = await Promise.all([
      fastify.prisma.cliente.findFirst({ where: { id, activo: true } }),
      computeSaldo(fastify.prisma, id),
      fastify.prisma.orden.findMany({
        where: { clienteId: id },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])
    if (!c) return reply.code(404).send({ error: 'Cliente no encontrado' })

    // Enrich ventas with computed total
    const ventasEnriched = ventas.map(o => ({
      id: o.id, tipo: o.tipo, estado: o.estado,
      estadoPago: o.estadoPago, estadoEntrega: o.estadoEntrega,
      licitacion: o.licitacion, createdAt: o.createdAt,
      creadorNombre: o.creadorNombre, abono: o.abono,
      total: o.items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0) * (1 - (o.descuentoPct || 0) / 100),
    }))

    // Fetch ODTs linked to any of this client's ventas
    const ordenIds = ventas.map(o => o.id)
    const odts = ordenIds.length > 0
      ? await fastify.prisma.odt.findMany({
          where: { ordenId: { in: ordenIds } },
          orderBy: { createdAt: 'desc' },
          take: 30,
        })
      : []

    return { ...c, saldo, ventas: ventasEnriched, odts }
  })
}
