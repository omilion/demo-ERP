import { z } from 'zod'
import { computeTotal, attachCliente, attachProductos } from './helpers.js'
import { getUserSucursalId } from '../caja/scope.js'
import { applyVentaStockDeltas, buildReplacementStockDeltas } from './stock.js'
import { validateConvenioMarcoOcForWrite } from './convenio-marco.js'
import { canApplyDescuento } from './descuentos-permissions.js'
import { getVentaDescuentoCatalogKind, validateVentaDescuentoCatalogForWrite } from './descuentos-catalog.js'
import { assertDiscountAuthorizationForDraft } from '../descuentos/rules-engine.js'

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
  descuentoAutorizacionId: z.number().int().positive().optional(),
  items: z.array(ItemSchema).min(1).refine(items => new Set(items.map(i => i.productoId)).size === items.length, {
    message: 'No se permiten productos duplicados en la venta',
  }).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'El cuerpo no puede estar vacío' })

const DESTRUCTIVE_ESTADOS = new Set(['nula', 'anulada', 'cancelada'])

function normalizeEstado(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function requiresVentaLifecycleDelete(current = {}, data = {}) {
  if (data.estado === undefined) return false
  const currentEstado = normalizeEstado(current.estado)
  const nextEstado = normalizeEstado(data.estado)
  return DESTRUCTIVE_ESTADOS.has(nextEstado) || (
    DESTRUCTIVE_ESTADOS.has(currentEstado) &&
    nextEstado &&
    nextEstado !== currentEstado
  )
}

export default async function updateVenta(fastify) {
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const parsed = Schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    try {
      const { items, descuentoAutorizacionId, ...ordenData } = parsed.data
      const sucursalId = getUserSucursalId(request.user)
      const current = await fastify.prisma.orden.findFirst({
        where: { id, ...(sucursalId ? { sucursalId } : {}) },
        select: {
          id: true,
          nInterno: true,
          tipo: true,
          licitacion: true,
          clienteId: true,
          sucursalId: true,
          estado: true,
          estadoPago: true,
          estadoEntrega: true,
          abono: true,
          descuentoPct: true,
          descuentoMonto: true,
          descuentoSolicitudId: true,
          eliminada: true,
          items: { where: { eliminado: false }, select: { productoId: true, codigoInterno: true, nombre: true, cantidad: true, precioUnitario: true, nEntregados: true } },
        },
      })
      if (!current) return reply.code(404).send({ error: 'Venta no encontrada' })
      if (current.eliminada) return reply.code(409).send({ error: 'No se puede editar una venta anulada' })
      if (Object.prototype.hasOwnProperty.call(ordenData, 'abono') ||
        Object.prototype.hasOwnProperty.call(ordenData, 'estadoPago') ||
        Object.prototype.hasOwnProperty.call(ordenData, 'facturado')) {
        return reply.code(400).send({ error: 'Los abonos, facturado y estado de pago se registran desde Cobranza/Caja' })
      }
      if (requiresVentaLifecycleDelete(current, ordenData)) {
        return reply.code(400).send({ error: 'Los estados de anulacion o reactivacion se gestionan desde el flujo auditado de ventas' })
      }
      if (Object.prototype.hasOwnProperty.call(ordenData, 'descuentoPct') &&
        Number(ordenData.descuentoPct || 0) !== Number(current.descuentoPct || 0)) {
        const activeCajaMovements = await fastify.prisma.movimientoCaja.count({
          where: { ordenId: id, eliminado: false },
        })
        const hasFinancialTrace = Number(current.abono || 0) > 0 || current.estadoPago !== 'No pagada' || activeCajaMovements > 0
        if (!hasFinancialTrace && !descuentoAutorizacionId && !canApplyDescuento(request.user)) {
          return reply.code(403).send({ error: 'No tiene permiso para aplicar descuentos' })
        }
      }
      if (ordenData.estadoEntrega === 'Entregada') {
        const allItemsDelivered = current.items.length > 0 && current.items.every(item => Number(item.nEntregados || 0) >= Number(item.cantidad || 0))
        if (!allItemsDelivered) {
          const [despacho, guia] = await Promise.all([
            fastify.prisma.despacho.findFirst({
              where: { ordenId: id, eliminado: false, parcial: false, fechaEntrega: { not: null } },
              select: { id: true },
            }),
            fastify.prisma.guiaDespacho.findFirst({
              where: { ordenId: id, eliminado: false },
              select: { id: true },
            }),
          ])
          if (!despacho && !guia) {
            return reply.code(409).send({ error: 'No se puede marcar Entregada sin guia, despacho entregado o items entregados' })
          }
        }
      }
      if (ordenData.estadoEntrega !== undefined && ordenData.estadoEntrega !== current.estadoEntrega) {
        ordenData.fechaEstadoEntrega = new Date()
      }

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
        const activeCajaMovements = await fastify.prisma.movimientoCaja.count({
          where: { ordenId: id, eliminado: false },
        })
        if (Number(current.abono || 0) > 0 || current.estadoPago !== 'No pagada' || activeCajaMovements > 0) {
          return reply.code(409).send({ error: 'No se pueden reemplazar items con pagos o documentos de caja registrados' })
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
        await tx.$queryRaw`
          SELECT id
          FROM ventas.ordenes
          WHERE id = ${id}
          FOR UPDATE
        `
        const lockedCurrent = await tx.orden.findUnique({
          where: { id },
          select: {
            id: true,
            nInterno: true,
            tipo: true,
            licitacion: true,
            clienteId: true,
            sucursalId: true,
            estadoPago: true,
            abono: true,
            descuentoPct: true,
            descuentoMonto: true,
            descuentoSolicitudId: true,
            eliminada: true,
            items: { where: { eliminado: false }, select: { productoId: true, codigoInterno: true, nombre: true, cantidad: true, precioUnitario: true, nEntregados: true } },
          },
        })
        if (!lockedCurrent || lockedCurrent.eliminada) {
          const err = new Error('Venta no encontrada')
          err.statusCode = 404
          throw err
        }
        if (itemsData && lockedCurrent.items.some(item => item.nEntregados > 0)) {
          const err = new Error('No se pueden reemplazar items con entregas registradas')
          err.statusCode = 400
          throw err
        }
        const nextTipo = ordenData.tipo ?? lockedCurrent.tipo
        const convenioOc = await validateConvenioMarcoOcForWrite(tx, {
          tipo: nextTipo,
          licitacion: ordenData.licitacion ?? lockedCurrent.licitacion,
          excludeId: id,
        })
        if (convenioOc.error) {
          const err = new Error(convenioOc.error)
          err.statusCode = convenioOc.statusCode || 400
          throw err
        }
        if (convenioOc.applies) ordenData.licitacion = convenioOc.licitacion
        const shouldReconcileStock = itemsData || (ordenData.tipo !== undefined && ordenData.tipo !== lockedCurrent.tipo)
        const lockedDiscountChanged = Object.prototype.hasOwnProperty.call(ordenData, 'descuentoPct') &&
          Number(ordenData.descuentoPct || 0) !== Number(lockedCurrent.descuentoPct || 0)
        const discountAuthorizationChanged = descuentoAutorizacionId !== undefined &&
          Number(descuentoAutorizacionId || 0) !== Number(lockedCurrent.descuentoSolicitudId || 0)
        const traceSensitiveChange = shouldReconcileStock || lockedDiscountChanged || discountAuthorizationChanged
        if (traceSensitiveChange) {
          const activeCajaMovements = await tx.movimientoCaja.count({
            where: { ordenId: id, eliminado: false },
          })
          if (Number(lockedCurrent.abono || 0) > 0 || lockedCurrent.estadoPago !== 'No pagada' || activeCajaMovements > 0) {
            const err = new Error(shouldReconcileStock
              ? 'No se pueden reemplazar items con pagos o documentos de caja registrados'
              : 'No se puede modificar descuento con pagos o documentos de caja registrados')
            err.statusCode = 409
            throw err
          }
        }
        const currentCatalogKind = getVentaDescuentoCatalogKind(lockedCurrent.tipo)
        const nextCatalogKind = getVentaDescuentoCatalogKind(nextTipo)
        const hasAuthorizedDiscount = Boolean(lockedCurrent.descuentoSolicitudId)
        const clearingAuthorizedDiscount = hasAuthorizedDiscount &&
          !descuentoAutorizacionId &&
          Object.prototype.hasOwnProperty.call(ordenData, 'descuentoPct') &&
          Number(ordenData.descuentoPct || 0) === 0
        if (hasAuthorizedDiscount && !descuentoAutorizacionId && !clearingAuthorizedDiscount && (shouldReconcileStock || lockedDiscountChanged)) {
          const err = new Error('La venta tiene un descuento autorizado; reevalua el descuento antes de cambiar productos, precios, cantidades o porcentaje')
          err.statusCode = 409
          throw err
        }
        if (clearingAuthorizedDiscount) {
          Object.assign(ordenData, {
            descuentoSolicitudId: null,
            descuentoMonto: null,
            descuentoSnapshot: null,
          })
        }
        let appliedDiscountSolicitudId = null
        if (descuentoAutorizacionId) {
          const draftItems = itemsData || lockedCurrent.items.map(item => ({
            productoId: item.productoId,
            codigoInterno: item.codigoInterno,
            nombre: item.nombre,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
          }))
          const auth = await assertDiscountAuthorizationForDraft(tx, {
            autorizacionId: descuentoAutorizacionId,
            payload: {
              tipo: nextTipo,
              clienteId: lockedCurrent.clienteId,
              sucursalId: lockedCurrent.sucursalId,
              items: draftItems,
            },
            user: request.user,
          })
          if (auth.error) {
            const err = new Error(auth.error)
            err.statusCode = auth.statusCode || 400
            throw err
          }
          Object.assign(ordenData, auth.descuentoData)
          appliedDiscountSolicitudId = auth.descuentoData.descuentoSolicitudId
        } else if (nextCatalogKind && (lockedDiscountChanged || currentCatalogKind !== nextCatalogKind)) {
          const descuentoCatalogo = await validateVentaDescuentoCatalogForWrite(tx, {
            tipo: nextTipo,
            descuentoPct: Object.prototype.hasOwnProperty.call(ordenData, 'descuentoPct')
              ? ordenData.descuentoPct
              : lockedCurrent.descuentoPct,
          })
          if (descuentoCatalogo.error) {
            const err = new Error(descuentoCatalogo.error)
            err.statusCode = descuentoCatalogo.statusCode || 400
            throw err
          }
        }
        if (shouldReconcileStock) {
          const stock = await applyVentaStockDeltas(tx, {
            deltas: buildReplacementStockDeltas(lockedCurrent.items, itemsData || lockedCurrent.items, lockedCurrent.tipo, nextTipo),
            ordenId: lockedCurrent.id,
            nInterno: lockedCurrent.nInterno,
            tipo: nextTipo,
            userId: request.user.id,
            user: request.user,
            motivo: `Ajuste venta directa ${lockedCurrent.nInterno || lockedCurrent.id}`,
          })
          if (stock.error) {
            const err = new Error(stock.error)
            err.statusCode = stock.status || 400
            throw err
          }
        }
        if (Object.keys(ordenData).length > 0) {
          await tx.orden.update({
            where: { id },
            data: ordenData,
          })
        }
        if (appliedDiscountSolicitudId) {
          await tx.descuentoSolicitud.update({
            where: { id: appliedDiscountSolicitudId },
            data: { estado: 'APLICADA', resueltoAt: new Date(), comentarioResolucion: `Aplicada en venta ${lockedCurrent.nInterno || lockedCurrent.id}` },
          })
        }
        if (itemsData) {
          await tx.ordenItem.deleteMany({ where: { ordenId: id } })
          await tx.ordenItem.createMany({
            data: itemsData.map(item => ({ ...item, ordenId: id })),
          })
        }
        return tx.orden.findUnique({ where: { id }, include: { items: true, cargos: true } })
      })
      orden.items = await attachProductos(fastify, orden.items)
      const withCliente = await attachCliente(fastify, orden)
      return { ...withCliente, total: computeTotal(orden.items, orden.descuentoPct, orden.cargos, orden.descuentoMonto) }
    } catch (e) {
      if (e.statusCode) return reply.code(e.statusCode).send({ error: e.message })
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Venta no encontrada' })
      throw e
    }
  })
}
