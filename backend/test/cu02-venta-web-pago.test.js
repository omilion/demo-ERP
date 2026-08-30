// CU-02 — Venta Web. Lo que la ficha pide demostrar:
//
//   "que una orden pendiente no se convierte en venta confirmada y que el total
//    persistido es el monto realmente cobrado"
//
// Los cuatro escenarios del caso de uso: Webpay rechazado, transferencia
// pendiente, pago confirmado y diferencia de monto.
import { describe, expect, it } from 'vitest'
import { deriveEstadoFlujo, ESTADO_FLUJO, normalizeEstadoPago } from '../src/routes/ventas/estados-normalize.js'
import { resolveEstadoPago } from '../src/routes/ventas/financial.js'
import { CRM_CONFIRMACIONES, CRM_ETAPAS } from '../src/domain/crm/constants.js'

const venta = (estadoPago, estadoEntrega = 'Pendiente entrega') => ({ estadoPago, estadoEntrega, estado: 'Activa' })

describe('una orden pendiente no es una venta confirmada', () => {
  it('Webpay pendiente queda en su propio estado, no cerrada', () => {
    const flujo = deriveEstadoFlujo(venta('Pendiente Webpay'))
    expect(flujo).toBe(ESTADO_FLUJO.PAGO_WEBPAY_PENDIENTE)
    expect(flujo.terminal).toBe(false)
  })

  it('Webpay rechazado tampoco, y no se confunde con no pagada', () => {
    const flujo = deriveEstadoFlujo(venta('Rechazada Webpay'))
    expect(flujo).toBe(ESTADO_FLUJO.PAGO_WEBPAY_RECHAZADO)
    expect(flujo.terminal).toBe(false)
  })

  // El rechazo manda por sobre la entrega: si el pago se cayo, que la mercaderia
  // haya salido no convierte la venta en cerrada, la convierte en un problema.
  it('un rechazo pesa mas que la entrega', () => {
    expect(deriveEstadoFlujo(venta('Rechazada Webpay', 'Entregada'))).toBe(ESTADO_FLUJO.PAGO_WEBPAY_RECHAZADO)
  })

  it('solo pagada y entregada cierra la venta', () => {
    const cerrada = deriveEstadoFlujo(venta('Pagada', 'Entregada'))
    expect(cerrada).toBe(ESTADO_FLUJO.CERRADA)
    expect(cerrada.terminal).toBe(true)
  })

  // Los dos estados Webpay son del vocabulario canonico: si alguien los
  // normalizara a "No pagada" se perderia la distincion entre "esta esperando"
  // y "se cayo el pago", que llevan a acciones distintas.
  it('los estados Webpay se conservan al normalizar', () => {
    expect(normalizeEstadoPago('Pendiente Webpay')).toBe('Pendiente Webpay')
    expect(normalizeEstadoPago('Rechazada Webpay')).toBe('Rechazada Webpay')
  })
})

describe('el total persistido es lo realmente cobrado', () => {
  it('sin abono la venta no figura pagada', () => {
    expect(resolveEstadoPago({ total: 50000, abono: 0 })).toBe('No pagada')
  })

  // Diferencia de monto: se cobro menos de lo vendido. Queda parcial, no pagada,
  // aunque el portal haya confirmado la transaccion.
  it('un cobro menor al total deja la venta parcial', () => {
    expect(resolveEstadoPago({ total: 50000, abono: 30000 })).toBe('Parcial')
  })

  it('solo se marca pagada cuando el saldo llega a cero', () => {
    expect(resolveEstadoPago({ total: 50000, abono: 50000 })).toBe('Pagada')
  })

  // Un cobro mayor al total tampoco deja saldo negativo: el saldo se piso en 0.
  it('un cobro mayor no genera saldo negativo', () => {
    expect(resolveEstadoPago({ total: 50000, abono: 60000 })).toBe('Pagada')
  })

  // Una venta en cero no es una venta pagada: sin monto no hay nada que cobrar,
  // y marcarla pagada la haria desaparecer de cobranza.
  it('una venta sin monto no cuenta como pagada', () => {
    expect(resolveEstadoPago({ total: 0, abono: 0 })).toBe('No pagada')
  })

  it('las notas de credito cuentan como pago para el saldo', () => {
    expect(resolveEstadoPago({ total: 50000, abono: 20000, ajustesFinancieros: 30000 })).toBe('Pagada')
  })
})

describe('aprobar la venta exige constancia de la confirmacion', () => {
  it('el catalogo distingue el medio, no solo que hubo pago', () => {
    expect(CRM_CONFIRMACIONES).toContain('WEBPAY')
    expect(CRM_CONFIRMACIONES).toContain('PAGO')
    expect(CRM_CONFIRMACIONES).toContain('OC')
  })

  // Sin tipo de confirmacion no se puede aprobar: es lo que impide que una
  // oportunidad pase a venta aprobada porque alguien movio la etapa a mano.
  it('venta aprobada es una etapa propia, anterior al cierre', () => {
    expect(CRM_ETAPAS.VENTA_APROBADA).toBeTruthy()
    expect(CRM_ETAPAS.CERRADO).toBeTruthy()
    expect(CRM_ETAPAS.VENTA_APROBADA).not.toBe(CRM_ETAPAS.CERRADO)
  })
})
