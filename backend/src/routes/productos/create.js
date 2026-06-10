import { z } from 'zod'
import { can } from '../../middleware/rbac.js'
import { computeEstado, computeEstadoOperacional, isProductoFotoUrl, normalizeProductoFotoFields, normalizeProductoFotos, sanitizeProductoCosto, syncProductoCategoriaText, syncProductoUbicacionText, validateProductoClasificacion } from './helpers.js'
import { ensureProductoMkNotification } from './mkNotifications.js'

const FotoUrlSchema = z.string().refine(isProductoFotoUrl, {
  message: 'fotoUrl debe ser URL o ruta /uploads valida',
})

const LinkCompraSchema = z.string().nullable().optional().refine((value) => {
  if (value == null || value === '') return true
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}, { message: 'linkCompra debe ser URL http(s) valida' })

const Schema = z.object({
  codigoInterno: z.string().min(1),
  codigoBarra: z.string().optional(),
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  categoria: z.string().optional(),
  categoriaId: z.number().int().positive().optional(),
  subcategoriaId: z.number().int().positive().optional(),
  proveedor: z.string().optional(),
  bodega: z.enum(['Inventario', 'Taller']).default('Inventario'),
  stock: z.number().int().min(0).default(0),
  stockCritico: z.number().int().min(0).default(0),
  precioLista: z.number().min(0).default(0),
  precioMarco: z.number().min(0).default(0),
  porcDesc: z.number().min(0).max(100).default(0),
  ubicacion: z.string().optional(),
  ubicacionId: z.number().int().positive().nullable().optional(),
  unidadMedida: z.string().optional(),
  idMarco: z.string().optional(),
  estadoInventario: z.string().optional(),
  visibleWeb: z.boolean().optional(),
  fotoUrl: FotoUrlSchema.optional(),
  fotoUrlGrande: FotoUrlSchema.optional(),
  fotosGaleria: z.array(FotoUrlSchema).optional(),
  descripcionLicitacion: z.string().optional(),
  linkCompra: LinkCompraSchema,
  edad: z.string().optional(),
  materialidad: z.string().optional(),
  descripcionWeb: z.string().optional(),
  precioWeb: z.number().min(0).optional(),
  ordenWeb: z.number().int().optional(),
  destacadoWeb: z.boolean().optional(),
})

const SENSITIVE_BODEGA_FIELDS = [
  'bodega',
  'stock',
  'stockCritico',
  'proveedor',
  'precioLista',
  'precioMarco',
  'precioWeb',
  'porcDesc',
  'visibleWeb',
  'destacadoWeb',
  'estadoInventario',
]

function hasOwn(data, key) {
  return Object.prototype.hasOwnProperty.call(data || {}, key)
}

export default async function createProducto(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const data = normalizeProductoFotoFields(parsed.data)
    const touchesBodega = SENSITIVE_BODEGA_FIELDS.some(field => hasOwn(request.body, field))
    if (touchesBodega && !can(request.user?.role, 'bodega', 'write', request.user?.permisosExtra)) {
      return reply.code(403).send({ error: 'Permiso bodega:write requerido para crear productos con stock, precios, proveedor o visibilidad web' })
    }
    const categoriaTextError = await syncProductoCategoriaText(fastify.prisma, data)
    if (categoriaTextError) return reply.code(categoriaTextError.status).send({ error: categoriaTextError.error })
    const ubicacionTextError = await syncProductoUbicacionText(fastify.prisma, data)
    if (ubicacionTextError) return reply.code(ubicacionTextError.status).send({ error: ubicacionTextError.error })
    const clasificacionError = await validateProductoClasificacion(fastify.prisma, {
      categoriaId: data.categoriaId ?? null,
      subcategoriaId: data.subcategoriaId ?? null,
    })
    if (clasificacionError) return reply.code(clasificacionError.status).send({ error: clasificacionError.error })
    const p = await fastify.prisma.$transaction(async (tx) => {
      const created = await tx.producto.create({ data })
      await ensureProductoMkNotification(tx, created, request.user)
      return created
    })
    const canReadCosto = can(request.user?.role, 'bodega', 'read', request.user?.permisosExtra)
    return reply.code(201).send(sanitizeProductoCosto(normalizeProductoFotos({ ...p, estado: computeEstado(p), estadoOperacional: computeEstadoOperacional(p) }), canReadCosto))
  })
}
