import { z } from 'zod'
import { can } from '../../middleware/rbac.js'
import { computeEstado, isProductoFotoUrl, normalizeProductoFotoFields, normalizeProductoFotos, sanitizeProductoCosto, syncProductoCategoriaText, validateProductoClasificacion } from './helpers.js'

const FotoUrlSchema = z.string().refine(isProductoFotoUrl, {
  message: 'fotoUrl debe ser URL o ruta /uploads valida',
})

const Schema = z.object({
  nombre: z.string().min(1).optional(),
  codigoBarra: z.string().optional(),
  descripcion: z.string().optional(),
  categoria: z.string().optional(),
  categoriaId: z.number().int().positive().nullable().optional(),
  subcategoriaId: z.number().int().positive().nullable().optional(),
  proveedor: z.string().optional(),
  bodega: z.enum(['Inventario', 'Taller']).optional(),
  stock: z.number().int().min(0).optional(),
  stockCritico: z.number().int().min(0).optional(),
  precioLista: z.number().min(0).optional(),
  precioMarco: z.number().min(0).optional(),
  porcDesc: z.number().min(0).max(100).optional(),
  ubicacion: z.string().optional(),
  unidadMedida: z.string().optional(),
  idMarco: z.string().optional(),
  estadoInventario: z.string().optional(),
  visibleWeb: z.boolean().optional(),
  fotoUrl: FotoUrlSchema.optional(),
  fotoUrlGrande: FotoUrlSchema.optional(),
  fotosGaleria: z.array(FotoUrlSchema).optional(),
  descripcionWeb: z.string().optional(),
  precioWeb: z.number().min(0).optional(),
  ordenWeb: z.number().int().optional(),
  destacadoWeb: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'El cuerpo no puede estar vacío' })

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
  return Object.prototype.hasOwnProperty.call(data, key)
}

function precioHistorialData(productoId, precioAnterior, precioNuevo, usuarioNombre) {
  const pct = precioAnterior === 0 && precioNuevo === 0
    ? 0
    : Number((precioAnterior === 0 ? 100 : ((precioNuevo - precioAnterior) / precioAnterior) * 100).toFixed(1))
  return { productoId, precioAnterior, precioNuevo, pct, usuarioNombre }
}

export default async function updateProducto(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const existing = await fastify.prisma.producto.findFirst({ where: { id, activo: true } })
    if (!existing) return reply.code(404).send({ error: 'Producto no encontrado' })
    const data = normalizeProductoFotoFields(parsed.data)

    const touchesBodega = SENSITIVE_BODEGA_FIELDS.some(field => hasOwn(data, field))
    if (touchesBodega && !can(request.user?.role, 'bodega', 'write', request.user?.permisosExtra)) {
      return reply.code(403).send({ error: 'Permiso bodega:write requerido para modificar stock, precios, proveedor o visibilidad web' })
    }

    if (hasOwn(data, 'stock')) {
      if (Number(data.stock) !== Number(existing.stock)) {
        return reply.code(400).send({ error: 'El stock debe modificarse mediante movimientos de bodega para conservar trazabilidad' })
      }
      delete data.stock
    }

    const categoriaTextError = await syncProductoCategoriaText(fastify.prisma, data)
    if (categoriaTextError) return reply.code(categoriaTextError.status).send({ error: categoriaTextError.error })

    const clasificacionError = await validateProductoClasificacion(fastify.prisma, {
      categoriaId: hasOwn(data, 'categoriaId') ? data.categoriaId : existing.categoriaId,
      subcategoriaId: hasOwn(data, 'subcategoriaId') ? data.subcategoriaId : existing.subcategoriaId,
    })
    if (clasificacionError) return reply.code(clasificacionError.status).send({ error: clasificacionError.error })

    const priceChanged = hasOwn(data, 'precioLista') && Number(data.precioLista) !== Number(existing.precioLista)
    const usuarioNombre = request.user?.email || request.user?.name || request.user?.role || 'sistema'
    const [p] = await fastify.prisma.$transaction([
      fastify.prisma.producto.update({
        where: { id },
        data,
        include: { subcategoria: true },
      }),
      ...(priceChanged ? [
        fastify.prisma.precioHistorial.create({
          data: precioHistorialData(id, Number(existing.precioLista), Number(data.precioLista), usuarioNombre),
        }),
      ] : []),
    ])
    const canReadCosto = can(request.user?.role, 'bodega', 'read', request.user?.permisosExtra)
    return sanitizeProductoCosto(normalizeProductoFotos({ ...p, estado: computeEstado(p) }), canReadCosto)
  })
}
