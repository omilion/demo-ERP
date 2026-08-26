// Guarda de descuentos para ventas y cotizaciones del CRM.
//
// Reemplaza al catalogo heredado de porcentajes autorizados
// (descuentos_porc / descuentos_porc_marco). Ese catalogo listaba 164
// porcentajes sueltos, sin condiciones ni trazabilidad: no decia a que tipo de
// venta aplicaba, con que monto minimo, ni quien lo autorizo. Ademas no
// respaldaba ninguna venta real y arrastraba valores del legacy que no eran
// descuentos comerciales (0.0004078%, 0.50053%).
//
// La regla ahora es una sola: un descuento existe solo si una regla vigente lo
// permite para ese borrador. Sin regla aplicable, no hay descuento.
import { evaluateDiscountRules } from '../descuentos/rules-engine.js'
import { discountRulesEnabled, discountRulesDisabledResponse } from '../descuentos/rules-status.js'

// El motor devuelve tres estados por regla:
//   AUTORIZADA - la regla cubre el porcentaje pedido y se puede guardar.
//   PENDIENTE  - la regla lo cubre pero exige aprobacion. No se guarda derecho:
//                tiene que pasar por una solicitud y volver con su autorizacion,
//                que es el camino que ya valida assertDiscountAuthorizationForDraft.
//   RECHAZADA  - la regla aplica al borrador pero no llega a ese porcentaje.

/**
 * Verifica que el descuento pedido este respaldado por alguna regla vigente.
 *
 * Devuelve { applies: false } cuando no hay descuento que validar, o
 * { applies: true, error, statusCode } cuando hay que rechazar la escritura.
 */
export async function validateDescuentoContraReglas(prisma, { tipo, descuentoPct, clienteId, sucursalId, items, cargosTotal } = {}, user = null) {
  const valor = Number(descuentoPct || 0)
  if (!Number.isFinite(valor) || valor <= 0) return { applies: false }

  if (!discountRulesEnabled()) {
    return {
      applies: true,
      statusCode: 503,
      ...discountRulesDisabledResponse(),
    }
  }

  const lineas = Array.isArray(items) ? items : []
  if (!lineas.length) {
    return {
      applies: true,
      statusCode: 400,
      error: 'No se puede aplicar un descuento sin productos en la venta',
    }
  }

  const evaluacion = await evaluateDiscountRules(prisma, {
    tipo,
    clienteId,
    sucursalId,
    cargosTotal,
    descuentoPct: valor,
    items: lineas,
  }, user)

  const reglas = evaluacion.reglas || []

  const autorizada = reglas.find(regla => regla.estado === 'AUTORIZADA')
  if (autorizada) return { applies: true, regla: autorizada }

  const pendiente = reglas.find(regla => regla.estado === 'PENDIENTE')
  if (pendiente) {
    return {
      applies: true,
      statusCode: 409,
      error: `El descuento de ${valor}% requiere aprobacion segun la regla "${pendiente.nombre}". Solicita la autorizacion antes de guardar.`,
    }
  }

  // Si alguna regla aplicaba pero no llegaba al porcentaje, su motivo es mucho
  // mas util que un mensaje generico.
  const rechazada = reglas[0]
  return {
    applies: true,
    statusCode: 400,
    error: rechazada?.motivo
      ? `Descuento de ${valor}% no autorizado: ${rechazada.motivo.toLowerCase()}`
      : `No hay una regla de descuento vigente que autorice un ${valor}% para esta venta`,
  }
}
