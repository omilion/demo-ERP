import { describe, expect, it } from 'vitest'
import { validateBarcodeScans } from '../src/routes/ordenes-compra-proveedores/barcode-policy.js'

describe('escaneo obligatorio de código de barras', () => {
  const lineas = [
    { itemId: 10, cantidad: 2, codigoBarra: '7801234567890', nombre: 'Producto A' },
    { itemId: 11, cantidad: 0, codigoBarra: null, nombre: 'Producto sin movimiento' },
  ]

  it('acepta sólo una lectura que coincide con el producto que se mueve', () => {
    expect(validateBarcodeScans(lineas, { 10: '7801234567890' })).toBeNull()
  })

  it('bloquea ausencia, códigos distintos y productos sin código', () => {
    expect(validateBarcodeScans(lineas, {}).error).toContain('Debe escanear')
    expect(validateBarcodeScans(lineas, { 10: '000' }).error).toContain('no corresponde')
    expect(validateBarcodeScans([{ itemId: 12, cantidad: 1, codigoBarra: null, nombre: 'Sin código' }], { 12: '1' }).error).toContain('no tiene')
  })
})
