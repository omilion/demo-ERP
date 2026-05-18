import { z } from 'zod'
import { computeEstado, isProductoFotoUrl, normalizeProductoFotoFields, normalizeProductoFotos } from './helpers.js'

const FotoUrlSchema = z.string().refine(isProductoFotoUrl, {
  message: 'fotoUrl debe ser URL o ruta /uploads valida',
})

const Schema = z.object({
  codigoInterno: z.string().min(1),
  codigoBarra: z.string().optional(),
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  categoria: z.string().optional(),
  proveedor: z.string().optional(),
  bodega: z.enum(['Inventario', 'Taller']).default('Inventario'),
  stock: z.number().int().min(0).default(0),
  stockCritico: z.number().int().min(0).default(0),
  precioLista: z.number().min(0).default(0),
  precioMarco: z.number().min(0).default(0),
  ubicacion: z.string().optional(),
  unidadMedida: z.string().optional(),
  idMarco: z.string().optional(),
  estadoInventario: z.string().optional(),
  visibleWeb: z.boolean().optional(),
  fotoUrl: FotoUrlSchema.optional(),
  fotoUrlGrande: FotoUrlSchema.optional(),
  descripcionWeb: z.string().optional(),
  precioWeb: z.number().min(0).optional(),
  ordenWeb: z.number().int().optional(),
  destacadoWeb: z.boolean().optional(),
})

export default async function createProducto(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const data = normalizeProductoFotoFields(parsed.data)
    const p = await fastify.prisma.producto.create({ data })
    return reply.code(201).send(normalizeProductoFotos({ ...p, estado: computeEstado(p) }))
  })
}
