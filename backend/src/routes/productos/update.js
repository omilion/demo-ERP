import { z } from 'zod'
import { computeEstado } from './helpers.js'

const Schema = z.object({
  nombre: z.string().min(1).optional(),
  categoria: z.string().optional(),
  proveedor: z.string().optional(),
  bodega: z.enum(['Inventario', 'Taller']).optional(),
  stock: z.number().int().min(0).optional(),
  stockCritico: z.number().int().min(0).optional(),
  precioLista: z.number().min(0).optional(),
  precioMarco: z.number().min(0).optional(),
  ubicacion: z.string().optional(),
  activo: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'El cuerpo no puede estar vacío' })

export default async function updateProducto(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const existing = await fastify.prisma.producto.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Producto no encontrado' })
    const p = await fastify.prisma.producto.update({ where: { id }, data: parsed.data })
    return { ...p, estado: computeEstado(p) }
  })
}
