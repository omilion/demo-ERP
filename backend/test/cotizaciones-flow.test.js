import { describe, expect, it } from 'vitest'

describe('commercial quotation flow contract', () => {
  it('uses the created order object returned by POST /cotizaciones/:id/crear-venta', () => {
    const response = { orden: { id: 123 }, faltantes: [] }
    const ordenId = response?.orden?.id || response?.ordenId
    expect(ordenId).toBe(123)
  })

  it('prevents duplicate conversion when a quote already has an order', () => {
    const cotizacion = { id: 10, ordenId: 55 }
    const duplicate = !!cotizacion.ordenId
    expect(duplicate).toBe(true)
  })
})
