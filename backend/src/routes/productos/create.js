import { z } from 'zod'
import { computeEstado } from './helpers.js'

const Schema = z.object({
  codigoInterno: z.string().min(1),
  nombre: z.string().min(1),
  categoria: z.string().optional(),
  proveedor: z.string().optional(),
  bodega: z.enum(['Inventario', 'Taller']).default('Inventario'),
  stock: z.number().int().min(0).default(0),
  stockCritico: z.number().int().min(0).default(0),
  precioLista: z.number().min(0).default(0),
  precioMarco: z.number().min(0).default(0),
  ubicacion: z.string().optional(),
})

export default async function createProducto(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const p = await fastify.prisma.producto.create({ data: parsed.data })
    return reply.code(201).send({ ...p, estado: computeEstado(p) })
  })
}
