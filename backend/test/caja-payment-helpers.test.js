import { describe, expect, it } from 'vitest'
import {
  resolveOrdenPaymentReversal,
  resolveOrdenPaymentUpdate,
  validateCajaMovementReversal,
} from '../src/routes/caja/movimientos.js'

const baseOrden = {
  descuentoPct: 0,
  items: [
    { cantidad: 2, precioUnitario: 5000 },
    { cantidad: 1, precioUnitario: 10000 },
  ],
}

describe('resolveOrdenPaymentUpdate', () => {
  it('marks partial payment and computes remaining saldo', () => {
    const result = resolveOrdenPaymentUpdate({ ...baseOrden, abono: 0 }, 7000)

    expect(result).toMatchObject({
      total: 20000,
      saldo: 20000,
      abono: 7000,
      estadoPago: 'Parcial',
      saldoPosterior: 13000,
    })
  })

  it('marks paid when payment covers the full saldo', () => {
    const result = resolveOrdenPaymentUpdate({ ...baseOrden, abono: 12000 }, 8000)

    expect(result).toMatchObject({
      total: 20000,
      saldo: 8000,
      abono: 20000,
      estadoPago: 'Pagada',
      saldoPosterior: 0,
    })
  })

  it('rejects overpayment without producing a new state', () => {
    const result = resolveOrdenPaymentUpdate({ ...baseOrden, abono: 12000 }, 8001)

    expect(result).toEqual({
      status: 409,
      error: 'El monto excede el saldo pendiente',
    })
  })

  it('rejects payments on already paid ventas', () => {
    const result = resolveOrdenPaymentUpdate({ ...baseOrden, abono: 20000 }, 1)

    expect(result).toEqual({
      status: 409,
      error: 'La venta ya esta pagada',
    })
  })
})

describe('resolveOrdenPaymentReversal', () => {
  it('returns venta to partial after reversing a payment', () => {
    const result = resolveOrdenPaymentReversal({ ...baseOrden, abono: 20000 }, 5000)

    expect(result).toMatchObject({
      total: 20000,
      abono: 15000,
      estadoPago: 'Parcial',
    })
  })

  it('returns venta to unpaid when reversing the only payment', () => {
    const result = resolveOrdenPaymentReversal({ ...baseOrden, abono: 5000 }, 5000)

    expect(result).toMatchObject({
      total: 20000,
      abono: 0,
      estadoPago: 'No pagada',
    })
  })

  it('rejects reversal larger than recorded abono', () => {
    const result = resolveOrdenPaymentReversal({ ...baseOrden, abono: 3000 }, 5000)

    expect(result).toEqual({
      status: 409,
      error: 'El abono de la venta es menor al pago a reversar',
    })
  })
})

describe('validateCajaMovementReversal', () => {
  it('allows active, not-yet-deleted movements', () => {
    expect(validateCajaMovementReversal({
      eliminado: false,
      turno: { estado: 'abierto' },
    })).toEqual({ ok: true })
  })

  it('rejects movements from closed turnos', () => {
    expect(validateCajaMovementReversal({
      eliminado: false,
      turno: { estado: 'cerrado' },
    })).toEqual({
      status: 409,
      error: 'No se puede eliminar movimiento de turno cerrado',
    })
  })

  it('rejects already deleted movements', () => {
    expect(validateCajaMovementReversal({
      eliminado: true,
      turno: { estado: 'abierto' },
    })).toEqual({
      status: 409,
      error: 'Movimiento ya eliminado',
    })
  })
})
