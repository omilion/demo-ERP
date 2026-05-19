import { z } from 'zod'
import { computeTotal, attachCliente } from './helpers.js'
import { ESTADO_PAGO_VALUES, ESTADO_ENTREGA_VALUES } from './update.js'

const ItemSchema = z.object({
  productoId: z.number().int(),
  cantidad: z.number().int().min(1),
  precioUnitario: z.number().min(0),
})

const Schema = z.object({
  tipo: z.enum(['Normal', 'Licitación', 'Convenio Marco', 'Venta Web', 'Venta Sala']).default('Normal'),
  clienteId: z.number().int(),
  descuentoPct: z.number().min(0).max(100).default(0),
  abono: z.number().min(0).default(0),
  facturado: z.number().min(0).optional(),
  guias: z.number().int().optional(),
  licitacion: z.string().optional(),
  observaciones: z.string().optional(),
  creadorNombre: z.string().optional(),
  estadoPago: z.enum(ESTADO_PAGO_VALUES).optional(),
  estadoEntrega: z.enum(ESTADO_ENTREGA_VALUES).optional(),
  items: z.array(ItemSchema).min(1),
})

export default async function createVenta(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const { items, ...rest } = parsed.data
    const cliente = await fastify.prisma.cliente.findUnique({ where: { id: rest.clienteId }, select: { id: true } })
    if (!cliente) return reply.code(404).send({ error: 'Cliente no encontrado' })
    const orden = await fastify.prisma.orden.create({
      data: {
        ...rest,
        userId: request.user.id,
        creadorNombre: rest.creadorNombre || request.user.nombre,
        items: { create: items },
      },
      include: { items: true },
    })
    const withCliente = await attachCliente(fastify, orden)
    return reply.code(201).send({ ...withCliente, total: computeTotal(orden.items, orden.descuentoPct) })
  })
}
