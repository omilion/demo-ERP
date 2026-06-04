import { describe, expect, it } from 'vitest'
import { toJsonSerializable } from '../src/routes/admin/index.js'
import {
  isProductoFotoUrl,
  normalizeProductoFotoUrl,
  normalizeProductoFotos,
} from '../src/routes/productos/helpers.js'
import { computeTotal } from '../src/routes/ventas/helpers.js'

describe('admin JSON serialization helpers', () => {
  it('converts BigInt values recursively', () => {
    const value = toJsonSerializable({
      id: 123n,
      nested: [{ total: 9007199254740993n }],
    })

    expect(value).toEqual({
      id: 123,
      nested: [{ total: '9007199254740993' }],
    })
  })
})

describe('producto foto URL helpers', () => {
  it('normalizes legacy upload paths', () => {
    expect(normalizeProductoFotoUrl('/uploads/productos/chicas/abc.jpg')).toBe('/uploads/fotos_chicas/abc.jpg')
    expect(normalizeProductoFotoUrl('/uploads/productos/grandes/abc.jpg')).toBe('/uploads/fotos_grandes/abc.jpg')
  })

  it('leaves current paths and external URLs unchanged', () => {
    expect(normalizeProductoFotoUrl('/uploads/fotos_chicas/abc.jpg')).toBe('/uploads/fotos_chicas/abc.jpg')
    expect(normalizeProductoFotoUrl('https://cdn.example.com/foto.jpg')).toBe('https://cdn.example.com/foto.jpg')
  })

  it('normalizes producto records without mutating unrelated fields', () => {
    expect(normalizeProductoFotos({
      id: 1,
      fotoUrl: '/uploads/productos/chicas/a.jpg',
      fotoUrlGrande: '/uploads/productos/grandes/a.jpg',
    })).toEqual({
      id: 1,
      fotoUrl: '/uploads/fotos_chicas/a.jpg',
      fotoUrlGrande: '/uploads/fotos_grandes/a.jpg',
    })
  })

  it('accepts only absolute URLs or supported upload paths', () => {
    expect(isProductoFotoUrl('/uploads/productos/chicas/a.jpg')).toBe(true)
    expect(isProductoFotoUrl('/uploads/fotos_grandes/a.jpg')).toBe(true)
    expect(isProductoFotoUrl('https://example.com/a.jpg')).toBe(true)
    expect(isProductoFotoUrl('/otra/ruta/a.jpg')).toBe(false)
  })
})

describe('ventas total helpers', () => {
  it('mantiene descuentoPct legacy y prioriza descuentoMonto congelado', () => {
    const items = [
      { cantidad: 2, precioUnitario: 10000 },
      { cantidad: 1, precioUnitario: 5000 },
    ]
    const cargos = [{ valor: 2000 }]

    expect(computeTotal(items, 10, cargos)).toBe(24300)
    expect(computeTotal(items, 10, cargos, 1000)).toBe(26000)
  })
})
