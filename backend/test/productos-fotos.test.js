import { describe, expect, it } from 'vitest'
import { normalizeProductoFotoFields, normalizeProductoFotos } from '../src/routes/productos/helpers.js'

describe('producto web photos', () => {
  it('normalizes legacy photo paths and derives the missing pair', () => {
    const data = normalizeProductoFotoFields({
      fotoUrlGrande: '/uploads/productos/grandes/abc.jpeg',
    })
    expect(data.fotoUrlGrande).toBe('/uploads/fotos_grandes/abc.jpeg')
    expect(data.fotoUrl).toBe('/uploads/fotos_chicas/abc.jpeg')
  })

  it('keeps a clean gallery array', () => {
    const data = normalizeProductoFotos({
      fotosGaleria: [' /uploads/productos/grandes/a.jpeg ', '', 'no-url'],
    })
    expect(data.fotosGaleria).toEqual(['/uploads/fotos_grandes/a.jpeg'])
  })
})
