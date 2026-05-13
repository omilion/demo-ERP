import { z } from 'zod'
import { computeTotal, attachCliente } from './helpers.js'

const Schema = z.object({
  tipo: z.enum(['Normal', 'Licitación', 'Convenio Marco', 'Venta Web', 'Venta Sala']).optional(),
  estado: z.string().optional(),
  estadoPago: z.string().optional(),
  estadoEntrega: z.string().optional(),
  abono: z.number().min(0).optional(),
  facturado: z.number().min(0).optional(),
  guias: z.number().int().optional(),
  licitacion: z.string().optional(),
  observaciones: z.string().optional(),
  descuentoPct: z.number().min(0).max(100).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'El cuerpo no puede estar vacío' })

export default async function updateVenta(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    try {
      const orden = await fastify.prisma.orden.update({
        where: { id },
        data: parsed.data,
        include: { items: true },
      })
      const withCliente = await attachCliente(fastify, orden)
      return { ...withCliente, total: computeTotal(orden.items, orden.descuentoPct) }
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Venta no encontrada' })
      throw e
    }
  })
}
