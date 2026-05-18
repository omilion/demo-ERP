import { computeTotal, attachClientes, attachProductos } from './helpers.js'
import { parsePositiveInt } from '../operational-utils.js'

export default async function listVentas(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const { estadoPago, estadoEntrega, tipo, search, orderBy: orderParam, clienteId } = request.query
    const LIMIT = 100

    const where = { eliminada: false }
    if (estadoPago) where.estadoPago = estadoPago
    if (estadoEntrega) where.estadoEntrega = estadoEntrega
    if (tipo) where.tipo = tipo
    if (clienteId) {
      const parsedClienteId = parsePositiveInt(clienteId)
      if (!parsedClienteId) return reply.code(400).send({ error: 'clienteId invalido' })
      where.clienteId = parsedClienteId
    }
    if (search) {
      const isNum = /^\d+$/.test(search.trim())
      where.OR = [
        { creadorNombre: { contains: search, mode: 'insensitive' } },
        { licitacion: { contains: search, mode: 'insensitive' } },
        { observaciones: { contains: search, mode: 'insensitive' } },
        ...(isNum ? [{ id: parseInt(search, 10) }] : []),
      ]
    }

    // Cobranza: más antiguas primero (más urgentes). Default: más recientes primero.
    const orderBy = orderParam === 'asc' ? { createdAt: 'asc' } : { createdAt: 'desc' }

    const [ordenes, total] = await Promise.all([
      fastify.prisma.orden.findMany({
        where,
        include: { items: true },
        orderBy,
        take: LIMIT,
      }),
      fastify.prisma.orden.count({ where }),
    ])

    const withClientes = await attachClientes(fastify, ordenes)
    const enriched = await Promise.all(
      withClientes.map(async o => ({
        ...o,
        total: computeTotal(o.items, o.descuentoPct),
        items: await attachProductos(fastify, o.items),
      }))
    )
    return {
      items: enriched,
      total,
      limit: LIMIT,
    }
  })
}
