import { z } from 'zod'

const AddSchema = z.object({
  precioAnterior: z.number().min(0),
  precioNuevo: z.number().min(0),
  usuarioNombre: z.string().min(1),
})

export default async function historialProducto(fastify) {
  fastify.get('/:id/historial-precios', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'read')],
  }, async (request, reply) => {
    const productoId = parseInt(request.params.id, 10)
    if (isNaN(productoId)) return reply.code(400).send({ error: 'ID inválido' })
    return fastify.prisma.precioHistorial.findMany({
      where: { productoId },
      orderBy: { createdAt: 'desc' },
    })
  })

  fastify.post('/:id/historial-precios', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const productoId = parseInt(request.params.id, 10)
    if (isNaN(productoId)) return reply.code(400).send({ error: 'ID inválido' })
    const producto = await fastify.prisma.producto.findFirst({ where: { id: productoId, activo: true } })
    if (!producto) return reply.code(404).send({ error: 'Producto no encontrado' })
    const parsed = AddSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const { precioAnterior, precioNuevo, usuarioNombre } = parsed.data
    const pct = precioAnterior === 0 && precioNuevo === 0
      ? 0
      : Number((precioAnterior === 0 ? 100 : ((precioNuevo - precioAnterior) / precioAnterior) * 100).toFixed(1))
    const entry = await fastify.prisma.precioHistorial.create({
      data: { productoId, precioAnterior, precioNuevo, pct, usuarioNombre },
    })
    return reply.code(201).send(entry)
  })
}
