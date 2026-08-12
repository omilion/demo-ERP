import { describe, expect, it } from 'vitest'
import { sanitizeOrdenCompra } from './licitacionFields'

describe('sanitizeOrdenCompra', () => {
  it('keeps a mid-string hyphen typed by the user (final/default mode)', () => {
    expect(sanitizeOrdenCompra('12345-67-SE16')).toBe('12345-67-SE16')
  })

  it('strips leading/trailing hyphens in final mode', () => {
    expect(sanitizeOrdenCompra('-12345-')).toBe('12345')
  })

  it('live mode keeps a trailing hyphen so typing "-" is not erased mid-keystroke', () => {
    expect(sanitizeOrdenCompra('12345-', { live: true })).toBe('12345-')
    expect(sanitizeOrdenCompra('12345-67-', { live: true })).toBe('12345-67-')
  })

  it('live mode still strips a leading hyphen', () => {
    expect(sanitizeOrdenCompra('-12345', { live: true })).toBe('12345')
  })

  it('collapses repeated hyphens in both modes', () => {
    expect(sanitizeOrdenCompra('12--34')).toBe('12-34')
    expect(sanitizeOrdenCompra('12--34', { live: true })).toBe('12-34')
  })

  it('strips accents, uppercases and drops non alnum/hyphen chars', () => {
    expect(sanitizeOrdenCompra('oc-ñandú #99')).toBe('OC-NANDU99')
  })
})
