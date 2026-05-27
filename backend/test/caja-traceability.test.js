import { describe, expect, it } from 'vitest'
import {
  resolveCajaMovementTraceability,
  resolveOrdenPaymentReversal,
  resolveOrdenPaymentUpdate,
  validateCajaMovementReversal,
} from '../src/routes/caja/movimientos.js'

function prismaMock({ orden = { id: 10 }, gasto = { id: 3, activo: true } } = {}) {
  return {
    orden: {
      findUnique: async ({ where }) => {
        if (!orden || where.id !== orden.id) return null
        return { id: orden.id, nInterno: orden.nInterno ?? null, clienteId: orden.clienteId ?? null }
      },
    },
    gasto: {
      findUnique: async ({ where }) => {
        if (!gasto || where.id !== gasto.id) return null
        return gasto
      },
    },
  }
}

describe('resolveCajaMovementTraceability', () => {
  it('rejects egresos without gasto or orden', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock(), {
      tipo: 'Egreso',
    })

    expect(result).toMatchObject({
      status: 400,
      error: 'gastoTipoId u ordenId requerido para egreso',
    })
  })

  it('rejects gasto type on ingresos', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock(), {
      tipo: 'Ingreso',
      gastoTipoId: 3,
    })

    expect(result).toMatchObject({
      status: 400,
      error: 'gastoTipoId solo aplica a egresos',
    })
  })

  it('rejects inactive gasto types', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock({
      gasto: { id: 3, activo: false },
    }), {
      tipo: 'Egreso',
      gastoTipoId: 3,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'Tipo de gasto inactivo',
    })
  })

  it('rejects sale payments through manual movements', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock(), {
      tipo: 'Ingreso',
      ordenId: 10,
    })

    expect(result).toMatchObject({
      status: 400,
      error: 'Los pagos de venta deben registrarse por cobranza',
    })
  })

  it('classifies order linked egresos', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock(), {
      tipo: 'Egreso',
      ordenId: 10,
    })

    expect(result).toMatchObject({
      ordenId: 10,
      gastoTipoId: null,
      origenTipo: 'orden',
      origenId: 10,
    })
  })

  it('classifies expense linked movements', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock(), {
      tipo: 'Egreso',
      gastoTipoId: 3,
    })

    expect(result).toMatchObject({
      ordenId: null,
      gastoTipoId: 3,
      origenTipo: 'gasto',
      origenId: 3,
    })
  })

  it('classifies manual ingresos without an associated origin', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock(), {
      tipo: 'Ingreso',
    })

    expect(result).toMatchObject({
      ordenId: null,
      gastoTipoId: null,
      origenTipo: 'manual',
      origenId: null,
    })
  })

  it('rejects invalid origin types', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock(), {
      tipo: 'Ingreso',
      origenTipo: 'externo',
    })

    expect(result).toMatchObject({
      status: 400,
      error: 'origenTipo invalido',
    })
  })

  it('rejects manual origins with explicit origin ids', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock(), {
      tipo: 'Ingreso',
      origenTipo: 'manual',
      origenId: 99,
    })

    expect(result).toMatchObject({
      status: 400,
      error: 'Movimiento manual no debe tener origen asociado',
    })
  })

  it('rejects mismatched expense origin ids', async () => {
    const result = await resolveCajaMovementTraceability(prismaMock(), {
      tipo: 'Egreso',
      gastoTipoId: 3,
      origenId: 4,
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'origenId no coincide con gastoTipoId',
    })
  })
})

describe('caja payment/reversal guards', () => {
  const orden = {
    abono: 6000,
    descuentoPct: 0,
    items: [{ cantidad: 1, precioUnitario: 10000 }],
  }

  it('calculates partial payment saldo and state', () => {
    const result = resolveOrdenPaymentUpdate({ ...orden, abono: 0 }, 4000)

    expect(result).toMatchObject({
      total: 10000,
      abono: 4000,
      estadoPago: 'Parcial',
      saldoPosterior: 6000,
    })
  })

  it('rejects overpayments before writing caja or venta', () => {
    const result = resolveOrdenPaymentUpdate(orden, 5000)

    expect(result).toMatchObject({
      status: 409,
      error: 'El monto excede el saldo pendiente',
    })
  })

  it('calculates payment reversal state from the remaining abono', () => {
    const result = resolveOrdenPaymentReversal({ ...orden, abono: 10000 }, 4000)

    expect(result).toMatchObject({
      total: 10000,
      abono: 6000,
      estadoPago: 'Parcial',
    })
  })

  it('rejects incoherent payment reversals', () => {
    const result = resolveOrdenPaymentReversal({ ...orden, abono: 1000 }, 4000)

    expect(result).toMatchObject({
      status: 409,
      error: 'El abono de la venta es menor al pago a reversar',
    })
  })

  it('rejects double reversal of an already eliminated movimiento', () => {
    const result = validateCajaMovementReversal({
      eliminado: true,
      turno: { estado: 'abierto' },
    })

    expect(result).toMatchObject({
      status: 409,
      error: 'Movimiento ya eliminado',
    })
  })
})
