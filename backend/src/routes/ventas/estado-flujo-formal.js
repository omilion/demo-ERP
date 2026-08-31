import {
  ESTADO_FLUJO_FORMAL,
  estadoFlujoFormalDesdeTracking,
  normalizeEstadoEntrega,
  normalizeEstadoPago,
  validateEstadoFlujoFormalTransition,
} from './estados-normalize.js'

function usuarioAuditado(user = {}) {
  return {
    usuarioId: Number.isInteger(user?.id) ? user.id : null,
    usuarioNombre: user?.nombre || user?.username || user?.email || null,
    usuarioRol: user?.role || null,
  }
}

export async function crearAlertasExcepcionPorTransicion(tx, ordenId, estadoDestino, now = new Date()) {
  // Mantiene compatibilidad con los tests/instalaciones anteriores a la
  // migración; en producción Prisma expone ambos delegados tras generate.
  if (!tx.excepcionRegla || !tx.excepcionAlerta) return []
  const reglas = await tx.excepcionRegla.findMany({ where: { activo: true, estadoDestino } })
  const creadas = []
  for (const regla of reglas) {
    const abierta = await tx.excepcionAlerta.findFirst({ where: { reglaId: regla.id, ordenId, estado: { in: ['ABIERTA', 'ESCALADA'] } }, select: { id: true } })
    if (abierta) continue
    creadas.push(await tx.excepcionAlerta.create({
      data: {
        reglaId: regla.id,
        ordenId,
        severidad: regla.severidad,
        rolResponsable: regla.rolResponsable,
        rolEscalamiento: regla.rolEscalamiento,
        venceAt: new Date(now.getTime() + regla.horasEscalamiento * 60 * 60 * 1000),
      },
    }))
  }
  return creadas
}

// Una transición siempre actualiza la fila principal y agrega su evidencia en
// la misma transacción. No se expone update/delete para el historial.
export async function transitionEstadoFlujoFormal(tx, orden, nextEstado, user, { motivo = null } = {}) {
  const transition = validateEstadoFlujoFormalTransition(orden.estadoFlujoFormal, nextEstado)
  if (transition.error) return transition

  const pago = normalizeEstadoPago(orden.estadoPago) || orden.estadoPago
  const entrega = normalizeEstadoEntrega(orden.estadoEntrega) || orden.estadoEntrega
  if (transition.to === 'CERRADA' && !(pago === 'Pagada' && entrega === 'Entregada')) {
    return { error: 'Solo se puede cerrar una orden pagada y entregada' }
  }

  const now = new Date()
  const updated = await tx.orden.update({
    where: { id: orden.id },
    data: { estadoFlujoFormal: transition.to, fechaEstadoFlujo: now },
  })
  const historial = await tx.ordenEstadoFlujoHistorial.create({
    data: {
      ordenId: orden.id,
      estadoAnterior: transition.from,
      estadoNuevo: transition.to,
      motivo,
      ...usuarioAuditado(user),
    },
  })
  const alertas = await crearAlertasExcepcionPorTransicion(tx, orden.id, transition.to, now)
  return { orden: updated, historial, alertas }
}

export async function transitionEstadoFlujoDesdeTracking(tx, ordenId, trackingEstado, user, options = {}) {
  const next = estadoFlujoFormalDesdeTracking(trackingEstado)
  if (!next) return null
  const orden = await tx.orden.findUnique({ where: { id: ordenId } })
  if (!orden) return { error: 'Orden no encontrada' }
  if (orden.estadoFlujoFormal === next) return { orden, historial: null }
  // La migración no reescribe las órdenes históricas. Al registrar su primer
  // evento nuevo, una orden legacy puede adoptar la etapa que ya evidencia su
  // tracking sin aplicar un backfill masivo ni permitir saltos a órdenes nuevas.
  if (orden.estadoFlujoFormal === 'CREADA' && next !== 'PREPARACION') {
    const hasHistory = await tx.ordenEstadoFlujoHistorial.findFirst({
      where: { ordenId }, select: { id: true },
    })
    if (!hasHistory) {
      const now = new Date()
      const updated = await tx.orden.update({
        where: { id: ordenId }, data: { estadoFlujoFormal: next, fechaEstadoFlujo: now },
      })
      const historial = await tx.ordenEstadoFlujoHistorial.create({
        data: {
          ordenId,
          estadoAnterior: 'CREADA',
          estadoNuevo: next,
          motivo: `${options.motivo || 'Tracking'} (adopción de orden histórica)`,
          ...usuarioAuditado(user),
        },
      })
      const alertas = await crearAlertasExcepcionPorTransicion(tx, ordenId, next, now)
      return { orden: updated, historial, alertas }
    }
  }
  return transitionEstadoFlujoFormal(tx, orden, next, user, options)
}

export function formalEstadoInfo(value) {
  return ESTADO_FLUJO_FORMAL[value] || null
}
