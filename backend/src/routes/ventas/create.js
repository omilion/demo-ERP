import { z } from 'zod'
import { computeTotal, attachCliente } from './helpers.js'
import { ESTADO_PAGO_VALUES, ESTADO_ENTREGA_VALUES } from './update.js'
import { applyVentaStockDeltas, buildStockDeltasFromItems, isVentaDirectaStockTipo } from './stock.js'
import { validateConvenioMarcoOcForWrite } from './convenio-marco.js'
import { canApplyDescuento, requiresDescuentoPermission } from './descuentos-permissions.js'
import { validateVentaDescuentoCatalogForWrite } from './descuentos-catalog.js'

const ItemSchema = z.object({
  productoId: z.number().int(),
  cantidad: z.number().int().min(1),
  precioUnitario: z.number().min(0),
})

const Schema = z.object({
  tipo: z.enum(['Normal', 'Licitación', 'Convenio Marco', 'Venta Web', 'Venta Sala']).default('Normal'),
  clienteId: z.number().int(),
  clienteSucursalId: z.number().int().optional().nullable(),
  descuentoPct: z.number().min(0).max(100).default(0),
  abono: z.number().min(0).default(0),
  facturado: z.number().min(0).optional(),
  guias: z.number().int().optional(),
  licitacion: z.string().optional(),
  observaciones: z.string().optional(),
  creadorNombre: z.string().optional(),
  estadoPago: z.enum(ESTADO_PAGO_VALUES).optional(),
  estadoEntrega: z.enum(ESTADO_ENTREGA_VALUES).optional(),
  items: z.array(ItemSchema).min(1),
})

export default async function createVenta(fastify) {
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    try {
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const { items, abono, estadoPago, facturado, ...rest } = parsed.data
    if (abono > 0 || facturado !== undefined || (estadoPago && estadoPago !== 'No pagada')) {
      return reply.code(400).send({ error: 'Los abonos, facturado y estado de pago se registran desde Cobranza/Caja' })
    }
    if (requiresDescuentoPermission(rest.descuentoPct) && !canApplyDescuento(request.user)) {
      return reply.code(403).send({ error: 'No tiene permiso para aplicar descuentos' })
    }
    const cliente = await fastify.prisma.cliente.findUnique({ where: { id: rest.clienteId }, select: { id: true, activo: true } })
    if (!cliente) return reply.code(404).send({ error: 'Cliente no encontrado' })
    if (!cliente.activo) return reply.code(409).send({ error: 'Cliente inactivo no puede generar ventas' })
    if (rest.clienteSucursalId) {
      const sucursal = await fastify.prisma.clienteSucursal.findFirst({
        where: { id: rest.clienteSucursalId, clienteId: rest.clienteId, activo: true },
        select: { id: true },
      })
      if (!sucursal) return reply.code(400).send({ error: 'Sucursal no pertenece al cliente' })
    }
    const productoIds = [...new Set(items.map(item => item.productoId))]
    const productos = await fastify.prisma.producto.findMany({
      where: { id: { in: productoIds } },
      select: { id: true, nombre: true, codigoInterno: true, activo: true },
    })
    if (productos.length !== productoIds.length) return reply.code(404).send({ error: 'Producto no encontrado' })
    if (productos.some(producto => !producto.activo)) return reply.code(400).send({ error: 'Producto no existe o esta inactivo' })
    const productosById = Object.fromEntries(productos.map(p => [p.id, p]))
    const itemsData = items.map(item => ({
      productoId: item.productoId,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      nombre: productosById[item.productoId]?.nombre,
      codigoInterno: productosById[item.productoId]?.codigoInterno,
    }))

    const orden = await fastify.prisma.$transaction(async (tx) => {
      const convenioOc = await validateConvenioMarcoOcForWrite(tx, {
        tipo: rest.tipo,
        licitacion: rest.licitacion,
      })
      if (convenioOc.error) {
        const err = new Error(convenioOc.error)
        err.statusCode = convenioOc.statusCode || 400
        throw err
      }
      const descuentoCatalogo = await validateVentaDescuentoCatalogForWrite(tx, {
        tipo: rest.tipo,
        descuentoPct: rest.descuentoPct,
      })
      if (descuentoCatalogo.error) {
        const err = new Error(descuentoCatalogo.error)
        err.statusCode = descuentoCatalogo.statusCode || 400
        throw err
      }
      const ordenData = convenioOc.applies ? { ...rest, licitacion: convenioOc.licitacion } : rest
      const created = await tx.orden.create({
        data: {
          ...ordenData,
          abono: 0,
          estadoPago: 'No pagada',
          userId: request.user.id,
          sucursalId: request.user?.sucursalId ?? null,
          creadorNombre: rest.creadorNombre || request.user.nombre,
          items: { create: itemsData },
        },
        include: { items: true },
      })
      const stock = await applyVentaStockDeltas(tx, {
        deltas: isVentaDirectaStockTipo(created.tipo) ? buildStockDeltasFromItems(itemsData, 1) : new Map(),
        ordenId: created.id,
        nInterno: created.nInterno,
        tipo: created.tipo,
        userId: request.user.id,
        user: request.user,
        motivo: `Venta directa ${created.nInterno || created.id}`,
      })
      if (stock.error) {
        const err = new Error(stock.error)
        err.statusCode = stock.status || 400
        throw err
      }
      return created
    })
    const withCliente = await attachCliente(fastify, orden)
    return reply.code(201).send({ ...withCliente, total: computeTotal(orden.items, orden.descuentoPct) })
    } catch (e) {
      if (e.statusCode) return reply.code(e.statusCode).send({ error: e.message })
      throw e
    }
  })
}
