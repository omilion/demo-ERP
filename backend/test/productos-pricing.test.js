import { describe, it, expect } from 'vitest'
import { computeConsultaPrecios } from '../src/routes/productos/pricing.js'

const proveedor = { porcVentaSala: 0, porcLicitacion: 20 }

describe('computeConsultaPrecios - precio licitacion', () => {
  it('usa el calculado (costo + % licitacion) si no hay manual', () => {
    const r = computeConsultaPrecios({ precioLista: 1000, precioLicitacion: null }, null, proveedor)
    expect(r.precioLicitacion).toBe(1200)
    expect(r.precioLicitacionManual).toBe(false)
  })

  it('el manual sobrescribe al calculado', () => {
    const r = computeConsultaPrecios({ precioLista: 1000, precioLicitacion: 1500 }, null, proveedor)
    expect(r.precioLicitacion).toBe(1500)
    expect(r.precioLicitacionManual).toBe(true)
  })

  it('manual en 0 es valido y se respeta', () => {
    const r = computeConsultaPrecios({ precioLista: 1000, precioLicitacion: 0 }, null, proveedor)
    expect(r.precioLicitacion).toBe(0)
    expect(r.precioLicitacionManual).toBe(true)
  })
})
