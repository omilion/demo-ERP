import { z } from 'zod'

const Schema = z.object({
  tipo: z.enum(['Ingreso', 'Egreso']),
  monto: z.number(),
  medioPago: z.enum(['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Cheque', 'Referencial', 'Webpay', 'Transbank']),
  referencia: z.string().optional(),
  ordenId: z.number().int().optional(),
  documento: z.string().optional(),
  nDoc: z.string().optional(),
  tipoDocumento: z.string().optional(),
  cuotas: z.number().int().min(1).optional(),
  pagaCon: z.number().min(0).optional(),
  nMedioPago: z.string().optional(),
  origenMedioPago: z.string().optional(),
  gastoTipoId: z.number().int().optional(),
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
    const d = parsed.data
    const mov = await fastify.prisma.movimientoCaja.create({
      data: {
        turnoId,
        tipo: d.tipo,
        monto: d.tipo === 'Egreso' ? -Math.abs(d.monto) : Math.abs(d.monto),
        medioPago: d.medioPago,
        referencia: d.referencia,
        ordenId: d.ordenId,
        documento: d.documento,
        nDoc: d.nDoc,
        tipoDocumento: d.tipoDocumento,
        cuotas: d.cuotas,
        pagaCon: d.pagaCon,
        nMedioPago: d.nMedioPago,
        origenMedioPago: d.origenMedioPago,
        gastoTipoId: d.gastoTipoId,
        usuario: request.user?.nombre || request.user?.username || null,
        fecha: new Date(),
      },
    })
    return reply.code(201).send(mov)
  })

  fastify.delete('/movimientos/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      await fastify.prisma.movimientoCaja.update({
        where: { id }, data: { eliminado: true, userMod: request.user?.nombre || null, fecham: new Date() },
      })
      return reply.code(204).send()
    } catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })
}
