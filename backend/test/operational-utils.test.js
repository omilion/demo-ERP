import { describe, expect, it } from 'vitest'
import { normalizeTipoMovimiento, parseDate, parseOptionalInt, parsePage, parsePositiveInt } from '../src/routes/operational-utils.js'

describe('operational route utilities', () => {
  it('normalizes unsafe page and integer inputs', () => {
    expect(parsePage('abc')).toBe(1)
    expect(parsePage('-2')).toBe(1)
    expect(parsePage('3')).toBe(3)
    expect(parseOptionalInt('12abc')).toBeNull()
    expect(parseOptionalInt('1e3')).toBeNull()
    expect(parsePositiveInt('0')).toBeNull()
    expect(parsePositiveInt('42')).toBe(42)
  })

  it('parses date-only filters without timezone rollover and rejects impossible dates', () => {
    const start = parseDate('2026-05-18')
    const end = parseDate('2026-05-18', true)

    expect(start).toBeInstanceOf(Date)
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(4)
    expect(start.getDate()).toBe(18)
    expect(end.getHours()).toBe(23)
    expect(parseDate('2026-02-31')).toBeNull()
    expect(parseDate('not-a-date')).toBeNull()
  })

  it('normalizes caja movimiento types used by filters', () => {
    expect(normalizeTipoMovimiento('ingreso')).toBe('Ingreso')
    expect(normalizeTipoMovimiento('Egreso')).toBe('Egreso')
    expect(normalizeTipoMovimiento('otro')).toBeNull()
  })
})
