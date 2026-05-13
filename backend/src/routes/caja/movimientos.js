import { z } from 'zod'

const Schema = z.object({
  tipo: z.enum(['Ingreso', 'Egreso']),
  monto: z.number(),
  medioPago: z.enum(['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Cheque']),
})

export default async function movimientosRoutes(fastify) {
  fastify.post('/turno/:id/movimientos', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'write')],
  }, async (request, reply) => {
    const turnoId = parseInt(request.params.id, 10)
    if (isNaN(turnoId)) return reply.code(400).send({ error: 'ID inválido' })
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const turno = await fastify.prisma.turno.findUnique({ where: { id: turnoId } })
    if (!turno) return reply.code(404).send({ error: 'Turno no encontrado' })
    if (turno.estado !== 'abierto') return reply.code(400).send({ error: 'Turno cerrado' })
    const mov = await fastify.prisma.movimientoCaja.create({
      data: {
        turnoId,
        tipo: parsed.data.tipo,
        monto: parsed.data.tipo === 'Egreso' ? -Math.abs(parsed.data.monto) : Math.abs(parsed.data.monto),
        medioPago: parsed.data.medioPago,
      },
    })
    return reply.code(201).send(mov)
  })
}
