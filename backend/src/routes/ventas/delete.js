import { getUserSucursalId } from '../caja/scope.js'
import { applyVentaStockDeltas, buildStockDeltasFromItems, isVentaDirectaStockTipo } from './stock.js'
import { puedeGestionarTipoVenta } from './tipos-permitidos.js'

function userLabel(user) {
  return user?.nombre || user?.username || null
}

export default async function deleteVenta(fastify) {
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'delete')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    try {
      const sucursalId = getUserSucursalId(request.user)
      const result = await fastify.prisma.$transaction(async (tx) => {
        const orden = await tx.orden.findFirst({
          where: sucursalId ? { id, sucursalId } : { id },
          include: { items: { where: { eliminado: false } } },
        })
        if (!orden) return { status: 404, payload: { error: 'Venta no encontrada' } }
        if (!puedeGestionarTipoVenta(request.user, orden.tipo)) return { status: 403, payload: { error: 'No tiene permiso para gestionar este tipo de venta' } }
        if (orden.eliminada) return { status: 409, payload: { error: 'La venta ya esta anulada' } }

        const closedMovement = await tx.movimientoCaja.findFirst({
          where: { ordenId: id, eliminado: false, turno: { is: { estado: 'cerrado' } } },
          select: { id: true },
        })
        if (closedMovement) {
          return { status: 409, payload: { error: 'No se puede anular una venta con movimientos de Caja en turnos cerrados' } }
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
        if (stock.error) return { status: stock.status || 400, payload: { error: stock.error } }

        const usuario = userLabel(request.user)
        const fecha = new Date()
        await tx.movimientoCaja.updateMany({
          where: { ordenId: id, eliminado: false },
          data: { eliminado: true, estadoDoc: 'Nula', userMod: usuario, fecham: fecha },
        })
        await tx.orden.update({
          where: { id },
          data: {
            eliminada: true,
            estado: 'Nula',
            estadoPago: 'No pagada',
            abono: 0,
            userMod: usuario,
            fecham: fecha,
          },
        })
        return { status: 204 }
      })
      if (result.status !== 204) return reply.code(result.status).send(result.payload)
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Venta no encontrada' })
      throw e
    }
  })
}
