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

// Las 16.368 ordenes estaban en CREADA y el historial vacio: la maquina existia pero
// nada la movia, porque solo la invocaban el endpoint manual y los eventos de
// tracking, que casi ninguna venta genera. Esto la engancha al trabajo real -bodega
// prepara, se entrega, caja cobra- para que el estado sea consecuencia de lo que
// paso y no de que alguien se acuerde de moverlo.
//
// Nunca interrumpe la operacion: si la transicion no aplica -ya paso esa etapa, la
// orden esta anulada- devuelve null en silencio. Marcar una entrega no puede fallar
// porque el estado formal no calce.
export async function avanzarEstadoFlujo(tx, ordenId, destino, user, motivo) {
  try {
    const orden = await tx.orden.findUnique({
      where: { id: ordenId },
      select: { id: true, estadoFlujoFormal: true, estadoPago: true, estadoEntrega: true },
    })
    if (!orden) return null

    const actual = orden.estadoFlujoFormal || 'CREADA'
    if (actual === destino) return null
    if (ESTADO_FLUJO_FORMAL[actual]?.terminal) return null

    // Una venta puede llegar entregada sin que nadie haya registrado la preparacion
    // -mostrador, retiro en tienda-. Se pasa por PREPARACION para respetar la tabla,
    // que es cierto: se preparo, solo que nadie lo anoto. No se inventan las etapas
    // de patio ni reparto, que si serian historia falsa.
    const camino = actual === 'CREADA' && destino === 'ENTREGADA'
      ? ['PREPARACION', 'ENTREGADA']
      : [destino]

    let ultimo = null
    for (const paso of camino) {
      // Se relee en cada paso: la transicion anterior ya cambio la fila y el
      // validador compara contra el estado actual, no contra el de entrada.
      const vigente = await tx.orden.findUnique({ where: { id: ordenId } })
      const res = await transitionEstadoFlujoFormal(tx, vigente, paso, user, { motivo })
      if (res?.error) return ultimo
      ultimo = res
    }
    return ultimo
  } catch {
    return null
  }
}

// El cierre no es una accion de nadie: ocurre cuando se juntan las dos condiciones
// -pagada y entregada-, y el orden en que llegan varia. Por eso se consulta desde
// ambos lados, entrega y cobro, en vez de dejarlo colgando del ultimo que pase.
export async function cerrarSiCorresponde(tx, ordenId, user) {
  try {
    const orden = await tx.orden.findUnique({
      where: { id: ordenId },
      select: { estadoPago: true, estadoEntrega: true, estadoFlujoFormal: true },
    })
    if (!orden) return null
    const pago = normalizeEstadoPago(orden.estadoPago) || orden.estadoPago
    const entrega = normalizeEstadoEntrega(orden.estadoEntrega) || orden.estadoEntrega
    if (pago !== 'Pagada' || entrega !== 'Entregada') return null
    if (orden.estadoFlujoFormal !== 'ENTREGADA') {
      const previo = await avanzarEstadoFlujo(tx, ordenId, 'ENTREGADA', user, 'Pagada y entregada')
      if (!previo) return null
    }
    return avanzarEstadoFlujo(tx, ordenId, 'CERRADA', user, 'Pagada y entregada')
  } catch {
    return null
  }
}
