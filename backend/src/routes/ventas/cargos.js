// Cargos de transporte por venta
import { computeTotal } from './helpers.js'
import { applyVentaStockDeltas, buildStockDeltasFromItems, isVentaDirectaStockTipo } from './stock.js'
import { getUserSucursalId, isReferencialMedioPago } from '../caja/scope.js'
import { puedeGestionarTipoVenta } from './tipos-permitidos.js'
import { avanzarEstadoFlujo, cerrarSiCorresponde } from './estado-flujo-formal.js'

function scopedOrdenWhere(user, id) {
  const sucursalId = getUserSucursalId(user)
  return sucursalId ? { id, sucursalId } : { id }
}

function isOrdenInUserSucursal(user, orden) {
  const sucursalId = getUserSucursalId(user)
  return !sucursalId || orden?.sucursalId === sucursalId
}

function userLabel(user) {
  return user?.nombre || user?.username || null
}

async function getActiveNonReferentialPayments(tx, ordenId) {
  const movimientos = await tx.movimientoCaja.findMany({
    where: { ordenId, eliminado: false, tipo: 'Ingreso', monto: { gt: 0 } },
    select: { monto: true, medioPago: true },
  })
  return movimientos
    .filter(mov => !isReferencialMedioPago(mov.medioPago))
    .reduce((sum, mov) => sum + Number(mov.monto || 0), 0)
}

async function hasClosedCajaMovements(tx, ordenId, eliminado) {
  const movimiento = await tx.movimientoCaja.findFirst({
    where: { ordenId, eliminado, turno: { is: { estado: 'cerrado' } } },
    select: { id: true },
  })
  return Boolean(movimiento)
}

function ventaAnuladaMovementWhere(orden) {
  return {
    ordenId: orden.id,
    eliminado: true,
    estadoDoc: 'Nula',
    ...(orden.fecham ? { fecham: orden.fecham } : { id: { in: [-1] } }),
  }
}

async function hasFinancialTrace(tx, ordenId) {
  const [orden, activeMovements] = await Promise.all([
    tx.orden.findUnique({ where: { id: ordenId }, select: { abono: true, estadoPago: true } }),
    tx.movimientoCaja.count({ where: { ordenId, eliminado: false } }),
  ])
  return Number(orden?.abono || 0) > 0 || orden?.estadoPago !== 'No pagada' || activeMovements > 0
}

async function validateRestoredReferentialDocuments(tx, orden, user) {
  const movimientos = await tx.movimientoCaja.findMany({
    where: ventaAnuladaMovementWhere(orden),
    select: { id: true, sucursalId: true, documento: true, nDoc: true, medioPago: true },
  })

  for (const mov of movimientos) {
    if (!isReferencialMedioPago(mov.medioPago) || !mov.documento || !mov.nDoc) continue
    const sucursalId = mov.sucursalId ?? orden.sucursalId ?? getUserSucursalId(user)
    const conflict = await tx.movimientoCaja.findFirst({
      where: {
        eliminado: false,
        documento: mov.documento,
        nDoc: mov.nDoc,
        medioPago: { equals: 'Referencial', mode: 'insensitive' },
        ...(sucursalId ? { sucursalId } : {}),
        id: { not: mov.id },
      },
      select: { id: true },
    })
    if (conflict) {
      return { statusCode: 409, error: 'No se puede reactivar la venta: documento referencial duplicado activo' }
    }
  }

  return null
}

export default async function ventaCargosRoutes(fastify) {
  fastify.get('/:id/cargos', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    const orden = await fastify.prisma.orden.findFirst({ where: scopedOrdenWhere(request.user, id), select: { id: true, tipo: true } })
    if (!orden) return reply.code(404).send({ error: 'Venta no encontrada' })
    if (!puedeGestionarTipoVenta(request.user, orden.tipo)) return reply.code(403).send({ error: 'No tiene permiso para gestionar este tipo de venta' })
    return fastify.prisma.ordenCargo.findMany({ where: { ordenId: id }, orderBy: { id: 'asc' } })
  })

  fastify.post('/:id/cargos', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    const { nombre, valor } = request.body || {}
    if (!nombre || valor == null) return reply.code(400).send({ error: 'nombre y valor requeridos' })
    const orden = await fastify.prisma.orden.findFirst({ where: scopedOrdenWhere(request.user, id), select: { id: true, tipo: true } })
    if (!orden) return reply.code(404).send({ error: 'Venta no encontrada' })
    if (!puedeGestionarTipoVenta(request.user, orden.tipo)) return reply.code(403).send({ error: 'No tiene permiso para gestionar este tipo de venta' })
    if (await hasFinancialTrace(fastify.prisma, id)) {
      return reply.code(409).send({ error: 'No se pueden modificar cargos con pagos o documentos de caja registrados' })
    }
    const c = await fastify.prisma.ordenCargo.create({
      data: { ordenId: id, nombre, valor: Number(valor) },
    })
    return reply.code(201).send(c)
  })

  fastify.delete('/cargos/:cargoId', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'delete')],
  }, async (request, reply) => {
    const cargoId = parseInt(request.params.cargoId, 10)
    try {
      const cargo = await fastify.prisma.ordenCargo.findUnique({
        where: { id: cargoId },
        include: { orden: { select: { sucursalId: true, tipo: true } } },
      })
      if (!cargo || !isOrdenInUserSucursal(request.user, cargo.orden)) return reply.code(404).send({ error: 'no encontrado' })
      if (!puedeGestionarTipoVenta(request.user, cargo.orden.tipo)) return reply.code(403).send({ error: 'No tiene permiso para gestionar este tipo de venta' })
      if (await hasFinancialTrace(fastify.prisma, cargo.ordenId)) {
        return reply.code(409).send({ error: 'No se pueden modificar cargos con pagos o documentos de caja registrados' })
      }
      await fastify.prisma.ordenCargo.delete({ where: { id: cargoId } })
      return reply.code(204).send()
    } catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })

  // Anular venta (soft)
  fastify.post('/:id/anular', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        const orden = await tx.orden.findFirst({
          where: scopedOrdenWhere(request.user, id),
          include: { items: { where: { eliminado: false } }, cargos: true },
        })
        if (!orden) return { statusCode: 404, error: 'no encontrada' }
        if (!puedeGestionarTipoVenta(request.user, orden.tipo)) return { statusCode: 403, error: 'No tiene permiso para gestionar este tipo de venta' }
        if (orden.eliminada) return { statusCode: 409, error: 'La venta ya esta anulada' }
        if (await hasClosedCajaMovements(tx, id, false)) {
          return { statusCode: 409, error: 'No se puede anular una venta con movimientos de Caja en turnos cerrados' }
        }
        const stock = await applyVentaStockDeltas(tx, {
          deltas: isVentaDirectaStockTipo(orden.tipo) ? buildStockDeltasFromItems(orden.items, -1) : new Map(),
          ordenId: orden.id,
          nInterno: orden.nInterno,
          tipo: orden.tipo,
          userId: request.user.id,
          user: request.user,
          motivo: `Anulacion venta directa ${orden.nInterno || orden.id}`,
        })
        if (stock.error) {
          return { statusCode: stock.status || 400, error: stock.error }
        }
        const usuario = userLabel(request.user)
        const fecha = new Date()
        await tx.movimientoCaja.updateMany({
          where: { ordenId: id, eliminado: false },
          data: { eliminado: true, estadoDoc: 'Nula', userMod: usuario, fecham: fecha },
        })
        const updated = await tx.orden.update({
          where: { id },
          data: {
            estado: 'Nula',
            eliminada: true,
            estadoPago: 'No pagada',
            abono: 0,
            userMod: usuario,
            fecham: fecha,
          },
        })
        return { updated }
      })
      if (result.statusCode) return reply.code(result.statusCode).send({ error: result.error })
      return result.updated
    } catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrada' }); throw e }
  })

  // Reactivar venta
  fastify.post('/:id/activar', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        const orden = await tx.orden.findFirst({
          where: scopedOrdenWhere(request.user, id),
          include: { items: { where: { eliminado: false } }, cargos: true },
        })
        if (!orden) return { statusCode: 404, error: 'no encontrada' }
        if (!puedeGestionarTipoVenta(request.user, orden.tipo)) return { statusCode: 403, error: 'No tiene permiso para gestionar este tipo de venta' }
        if (!orden.eliminada && orden.estado === 'Activa') return { statusCode: 409, error: 'La venta ya esta activa' }
        if (await hasClosedCajaMovements(tx, id, true)) {
          return { statusCode: 409, error: 'No se puede reactivar una venta con movimientos de Caja en turnos cerrados' }
        }
        const docConflict = await validateRestoredReferentialDocuments(tx, orden, request.user)
        if (docConflict) return docConflict
        const stock = await applyVentaStockDeltas(tx, {
          deltas: isVentaDirectaStockTipo(orden.tipo) ? buildStockDeltasFromItems(orden.items, 1) : new Map(),
          ordenId: orden.id,
          nInterno: orden.nInterno,
          tipo: orden.tipo,
          userId: request.user.id,
          user: request.user,
          motivo: `Reactivacion venta directa ${orden.nInterno || orden.id}`,
        })
        if (stock.error) {
          return { statusCode: stock.status || 400, error: stock.error }
        }
        const usuario = userLabel(request.user)
        const fecha = new Date()
        await tx.movimientoCaja.updateMany({
          where: ventaAnuladaMovementWhere(orden),
          data: { eliminado: false, estadoDoc: 'Activa', userMod: usuario, fecham: fecha },
        })
        const abono = await getActiveNonReferentialPayments(tx, id)
        const total = computeTotal(orden.items, orden.descuentoPct, orden.cargos, orden.descuentoMonto)
        const estadoPago = abono <= 0 ? 'No pagada' : abono >= total ? 'Pagada' : 'Parcial'
        const updated = await tx.orden.update({
          where: { id },
          data: {
            estado: 'Activa',
            eliminada: false,
            abono,
            estadoPago,
            userMod: usuario,
            fecham: fecha,
          },
        })
        return { updated }
      })
      if (result.statusCode) return reply.code(result.statusCode).send({ error: result.error })
      return result.updated
    } catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrada' }); throw e }
  })

  // Actualizar nEntregados de un item
  // Lo hace BODEGA, no ventas. Etiquetado como funcion para poder darle el
  // permiso sin habilitarla ademas a crear y editar ventas.
  fastify.put('/items/:itemId/entregados', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas.entregas', 'write')],
  }, async (request, reply) => {
    const itemId = parseInt(request.params.itemId, 10)
    const { nEntregados } = request.body || {}
    if (nEntregados == null || nEntregados < 0) return reply.code(400).send({ error: 'nEntregados inválido' })
    try {
      const item = await fastify.prisma.ordenItem.findUnique({
        where: { id: itemId },
        include: { orden: { select: { sucursalId: true } } },
      })
      if (!item || !isOrdenInUserSucursal(request.user, item.orden)) return reply.code(404).send({ error: 'item no encontrado' })
      const n = Math.min(parseInt(nEntregados, 10), item.cantidad)
      const updated = await fastify.prisma.ordenItem.update({
        where: { id: itemId }, data: { nEntregados: n },
      })
      // Recalcular estadoEntrega de la orden
      const items = await fastify.prisma.ordenItem.findMany({ where: { ordenId: item.ordenId, eliminado: false } })
      const totalCant = items.reduce((s, i) => s + i.cantidad, 0)
      const totalEnt = items.reduce((s, i) => s + i.nEntregados, 0)
      const estadoEntrega = totalEnt === 0 ? 'Pendiente entrega'
        : totalEnt >= totalCant ? 'Entregada' : 'Parcial'
      await fastify.prisma.orden.update({ where: { id: item.ordenId }, data: { estadoEntrega, fechaEstadoEntrega: new Date() } })
      // El estado formal sigue al hecho operativo. Antes convivian dos verdades: la
      // venta figuraba entregada y su flujo formal seguia en CREADA.
      if (estadoEntrega === 'Entregada') {
        await avanzarEstadoFlujo(fastify.prisma, item.ordenId, 'ENTREGADA', request.user, 'Items entregados')
        await cerrarSiCorresponde(fastify.prisma, item.ordenId, request.user)
      } else if (estadoEntrega === 'Parcial') {
        await avanzarEstadoFlujo(fastify.prisma, item.ordenId, 'PREPARACION', request.user, 'Entrega parcial')
      }
      return updated
    } catch (e) { throw e }
  })
}
