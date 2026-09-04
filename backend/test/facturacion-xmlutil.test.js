import { describe, it, expect } from 'vitest'
import { tag, tags, formatMonto, formatQty, formatDate, formatTimestamp, normalizeRut, isValidRut, rutDv } from '../src/facturacion/xmlUtil.js'

describe('facturacion/xmlUtil', () => {
  it('tag() escapes text content and supports raw content', () => {
    expect(tag('Nombre', 'Juan & Ana')).toBe('<Nombre>Juan &amp; Ana</Nombre>')
    expect(tag('X', '<a/>', null, { raw: true })).toBe('<X><a/></X>')
    expect(tag('Vacio', null)).toBe('<Vacio></Vacio>')
  })

  it('tags() joins pairs and omits null/undefined values', () => {
    const xml = tags([['A', 1], ['B', null], ['C', 'x']])
    expect(xml).toBe('<A>1</A><C>x</C>')
  })

  it('formatMonto rounds to integer string, formatQty keeps decimals', () => {
    expect(formatMonto(1999.6)).toBe('2000')
    expect(formatQty(3)).toBe('3')
    expect(formatQty(2.5)).toBe('2.5')
  })

  it('formatDate produces YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-07-14T10:00:00'))).toBe('2026-07-14')
  })

  it('formatea fecha y hora tributaria en America/Santiago aunque el servidor opere en UTC', () => {
    const instant = new Date('2026-07-24T18:21:44.000Z')
    expect(formatDate(instant)).toBe('2026-07-24')
    expect(formatTimestamp(instant)).toBe('2026-07-24T14:21:44')
    expect(formatDate('2026-07-24')).toBe('2026-07-24')
  })

  it('normalizeRut and isValidRut validate Plastimar RUT', () => {
    expect(normalizeRut('76.354.051-0')).toBe('76354051-0')
    expect(rutDv('76354051')).toBe('0')
    expect(isValidRut('76.354.051-0')).toBe(true)
    expect(isValidRut('76.354.051-1')).toBe(false)
    expect(isValidRut('881788374-6')).toBe(false)
  })
})
