import { describe, expect, it } from 'vitest'
import { computeDteTotales, mapVentaItems } from '../../frontend/src/utils/facturacion.js'

describe('facturacion/frontend totals', () => {
  it('mantiene el total del formulario manual igual a la vista previa con ítems afectos y exentos', () => {
    const items = mapVentaItems({ items: [
      { id: 1, nombre: 'Ítem afecto', cantidad: 2, precioUnitario: 11900, exento: false },
      { id: 2, nombre: 'Ítem exento', cantidad: 3, precioUnitario: 5000, exento: true },
    ] })

    expect(items).toEqual([
      expect.objectContaining({ nombre: 'Ítem afecto', precio: 10000, exento: false }),
      expect.objectContaining({ nombre: 'Ítem exento', precio: 5000, exento: true }),
    ])
    expect(computeDteTotales(items)).toEqual({ neto: 20000, exento: 15000, iva: 3800, total: 38800 })
  })
})
