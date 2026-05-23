import { z } from 'zod'
import { computeTotal, attachCliente, attachProductos } from './helpers.js'

export const ESTADO_PAGO_VALUES = ['No pagada', 'Pagada', 'Parcial']
export const ESTADO_ENTREGA_VALUES = ['Pendiente entrega', 'En despacho', 'Entregada', 'Parcial']

const ItemSchema = z.object({
  productoId: z.number().int(),
  cantidad: z.number().int().min(1),
  precioUnitario: z.number().min(0),
})

const Schema = z.object({
  tipo: z.enum(['Normal', 'Licitación', 'Convenio Marco', 'Venta Web', 'Venta Sala']).optional(),
  estado: z.string().optional(),
  estadoPago: z.enum(ESTADO_PAGO_VALUES).optional(),
  estadoEntrega: z.enum(ESTADO_ENTREGA_VALUES).optional(),
  clienteSucursalId: z.number().int().nullable().optional(),
  abono: z.number().min(0).optional(),
  facturado: z.number().min(0).optional(),
  guias: z.number().int().optional(),
  licitacion: z.string().optional(),
  observaciones: z.string().optional(),
  descuentoPct: z.number().min(0).max(100).optional(),
  items: z.array(ItemSchema).min(1).refine(items => new Set(items.map(i => i.productoId)).size === items.length, {
    message: 'No se permiten productos duplicados en la venta',
  }).optional(),
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
      const { items, ...ordenData } = parsed.data
      const current = await fastify.prisma.orden.findUnique({
        where: { id },
        select: {
          clienteId: true,
          items: { select: { nEntregados: true } },
        },
      })
      if (!current) return reply.code(404).send({ error: 'Venta no encontrada' })

      if (ordenData.clienteSucursalId) {
        const sucursal = await fastify.prisma.clienteSucursal.findFirst({
          where: { id: ordenData.clienteSucursalId, clienteId: current.clienteId, activo: true },
          select: { id: true },
        })
        if (!sucursal) return reply.code(400).send({ error: 'Sucursal no pertenece al cliente' })
      }
      let itemsData
      if (items) {
        if (current.items.some(item => item.nEntregados > 0)) {
          return reply.code(400).send({ error: 'No se pueden reemplazar items con entregas registradas' })
        }
        const productoIds = [...new Set(items.map(item => item.productoId))]
        const productos = await fastify.prisma.producto.findMany({
          where: { id: { in: productoIds } },
          select: { id: true, nombre: true, codigoInterno: true, activo: true },
        })
        if (productos.length !== productoIds.length) {
          return reply.code(404).send({ error: 'Producto no encontrado' })
        }
        if (productos.some(producto => !producto.activo)) {
          return reply.code(400).send({ error: 'Producto no existe o esta inactivo' })
        }
        const productosById = Object.fromEntries(productos.map(p => [p.id, p]))
        itemsData = items.map(item => ({
          productoId: item.productoId,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          nombre: productosById[item.productoId]?.nombre,
          codigoInterno: productosById[item.productoId]?.codigoInterno,
        }))
      }
      const orden = await fastify.prisma.$transaction(async (tx) => {
        if (Object.keys(ordenData).length > 0) {
          await tx.orden.update({
            where: { id },
            data: ordenData,
          })
        }
        if (itemsData) {
          await tx.ordenItem.deleteMany({ where: { ordenId: id } })
          await tx.ordenItem.createMany({
            data: itemsData.map(item => ({ ...item, ordenId: id })),
          })
        }
        return tx.orden.findUnique({ where: { id }, include: { items: true } })
      })
      orden.items = await attachProductos(fastify, orden.items)
      const withCliente = await attachCliente(fastify, orden)
      return { ...withCliente, total: computeTotal(orden.items, orden.descuentoPct) }
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Venta no encontrada' })
      throw e
    }
  })
}
