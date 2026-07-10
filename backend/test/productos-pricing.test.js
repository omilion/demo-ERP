import { describe, it, expect } from 'vitest'
import { computeConsultaPrecios, computePrecioWeb } from '../src/routes/productos/pricing.js'

const proveedor = { porcVentaSala: 0, porcLicitacion: 20 }

describe('computeConsultaPrecios - precio licitacion', () => {
  it('usa el calculado (costo + % licitacion) si no hay manual', () => {
    const r = computeConsultaPrecios({ precioLista: 1000, precioLicitacion: null }, null, proveedor)
    expect(r.precioLicitacion).toBe(1200)
    expect(r.precioLicitacionManual).toBe(false)
  })

  it('el manual sobrescribe al calculado pero expone el calculado de referencia', () => {
    const r = computeConsultaPrecios({ precioLista: 1000, precioLicitacion: 1500 }, null, proveedor)
    expect(r.precioLicitacion).toBe(1500)
    expect(r.precioLicitacionManual).toBe(true)
    expect(r.precioLicitacionCalculado).toBe(1200)
  })

  it('manual en 0 es valido y se respeta', () => {
    const r = computeConsultaPrecios({ precioLista: 1000, precioLicitacion: 0 }, null, proveedor)
    expect(r.precioLicitacion).toBe(0)
    expect(r.precioLicitacionManual).toBe(true)
  })
})

describe('computePrecioWeb - precio web derivado del precio sala', () => {
  it('costo + % sala del proveedor, con IVA', () => {
    // 33613 + 50% = 50420 neto; + IVA 19% = 60000
    expect(computePrecioWeb(33613, 50)).toBe(60000)
  })

  it('sin % sala usa solo costo + IVA', () => {
    expect(computePrecioWeb(1000, 0)).toBe(1190)
  })

  it('costo 0 o invalido devuelve null (la web oculta el precio)', () => {
    expect(computePrecioWeb(0, 50)).toBe(null)
    expect(computePrecioWeb(null, 50)).toBe(null)
  })
})
