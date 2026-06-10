import { describe, it, expect } from 'vitest'
import { computeCosteoPonderado } from '../src/routes/productos/costeo.js'

describe('computeCosteoPonderado', () => {
  it('pondera el costo por cantidad (ejemplo cliente)', () => {
    const { stockTotal, costoPonderado } = computeCosteoPonderado([
      { costo: 100, cantidad: 10 },
      { costo: 120, cantidad: 30 },
    ])
    expect(stockTotal).toBe(40)
    expect(costoPonderado).toBe(115)
  })

  it('devuelve 0 sin stock, sin division por cero', () => {
    expect(computeCosteoPonderado([])).toEqual({ stockTotal: 0, costoPonderado: 0 })
    expect(computeCosteoPonderado([{ costo: 100, cantidad: 0 }])).toEqual({ stockTotal: 0, costoPonderado: 0 })
  })

  it('ignora filas con cantidad o costo invalidos', () => {
    const { stockTotal, costoPonderado } = computeCosteoPonderado([
      { costo: 100, cantidad: 10 },
      { costo: -5, cantidad: 5 },
      { costo: 200, cantidad: null },
      { costo: 'x', cantidad: 'y' },
    ])
    // 100*10 + 0*5 = 1000 sobre 15 unidades => 67 (redondeado)
    expect(stockTotal).toBe(15)
    expect(costoPonderado).toBe(67)
  })

  it('un solo proveedor devuelve su costo', () => {
    expect(computeCosteoPonderado([{ costo: 100, cantidad: 10 }]))
      .toEqual({ stockTotal: 10, costoPonderado: 100 })
  })
})
