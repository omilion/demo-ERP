import { describe, it, expect } from 'vitest'
import {
  normalizeRut,
  formatRut,
  isValidRut,
  isValidPhone,
  isValidEmail,
  validateClienteData,
  cleanLetters,
  isValidName,
  getRegionFromComuna,
  parseDireccion,
} from './rut'

describe('rut utils', () => {
  it('normalizes RUT string', () => {
    expect(normalizeRut('16.888.432-k')).toBe('16888432K')
    expect(normalizeRut(' 12.345.678-9 ')).toBe('123456789')
  })

  it('formats Chilean RUT with dots and hyphen', () => {
    expect(formatRut('16888432k')).toBe('16.888.432-K')
    expect(formatRut('123456789')).toBe('12.345.678-9')
  })

  it('validates Chilean RUT with Modulo 11', () => {
    expect(isValidRut('16.888.432-K')).toBe(true)
    expect(isValidRut('16888432K')).toBe(true)
    expect(isValidRut('16888432-k')).toBe(true)
    expect(isValidRut('19')).toBe(false)
    expect(isValidRut('00000000-0')).toBe(false)
    // Mario Demartini cases:
    expect(isValidRut('16.888.432-K2')).toBe(false)
    expect(isValidRut('HOLACMO ESTAS{Ñ')).toBe(false)
    expect(isValidRut('16.888.432-1')).toBe(false)
  })

  it('validates telephone numbers', () => {
    expect(isValidPhone('+56 9 1234 5678')).toBe(true)
    expect(isValidPhone('912345678')).toBe(true)
    expect(isValidPhone('22 123 4567')).toBe(true)
    expect(isValidPhone('')).toBe(true) // optional
    expect(isValidPhone(null)).toBe(true)
    // Mario Demartini cases:
    expect(isValidPhone('sdasdasda')).toBe(false)
    expect(isValidPhone('seiscuatrodosnueve')).toBe(false)
    expect(isValidPhone('123')).toBe(false)
  })

  it('validates full client data', () => {
    const invalid = validateClienteData({
      nombre: 'dasdasd',
      rut: '16.888.432-K2',
      telefono: 'sdasdasda',
      email: '3@gmail.com',
    })
    expect(invalid.isValid).toBe(false)
    expect(invalid.errors).toHaveProperty('rut')
    expect(invalid.errors).toHaveProperty('telefono')

    const valid = validateClienteData({
      nombre: 'Cliente Valido',
      rut: '16.888.432-K',
      telefono: '+56 9 1234 5678',
      email: 'contacto@plastimar.cl',
    })
    expect(valid.isValid).toBe(true)
    expect(valid.errors).toEqual({})
  })

  it('cleanLetters allows only letters, accents, ñ, spaces, hyphens, and apostrophes', () => {
    expect(cleanLetters('Juan123')).toBe('Juan')
    expect(cleanLetters('María José')).toBe('María José')
    expect(cleanLetters('Ñoño O\'Higgins-Pérez 99!!')).toBe("Ñoño O'Higgins-Pérez ")
    expect(cleanLetters(null)).toBe('')
  })

  it('isValidName verifies that name has only valid letter chars', () => {
    expect(isValidName('Juan Pérez')).toBe(true)
    expect(isValidName('María-José O\'Higgins')).toBe(true)
    expect(isValidName('Ángel Nuñez')).toBe(true)
    expect(isValidName('Juan123')).toBe(false)
    expect(isValidName('')).toBe(false)
    expect(isValidName('   ')).toBe(false)
    expect(isValidName('---')).toBe(false)
    expect(isValidName('Juan @ Perez')).toBe(false)
  })

  it('getRegionFromComuna resolves correct region', () => {
    expect(getRegionFromComuna('Santiago')).toBe('Metropolitana de Santiago')
    expect(getRegionFromComuna('Providencia')).toBe('Metropolitana de Santiago')
    expect(getRegionFromComuna('Viña del Mar')).toBe('Valparaíso')
    expect(getRegionFromComuna('Concepción')).toBe('Biobío')
    expect(getRegionFromComuna('NonExistentComuna')).toBe('')
    expect(getRegionFromComuna('')).toBe('')
  })

  it('parseDireccion splits street and depto', () => {
    expect(parseDireccion('Av. Providencia 1234, Depto 402')).toEqual({
      calle: 'Av. Providencia 1234',
      depto: '402',
    })
    expect(parseDireccion('Calle Los Alerces 550, Casa 12')).toEqual({
      calle: 'Calle Los Alerces 550',
      depto: '12',
    })
    expect(parseDireccion('San Martín 888 Oficina 301')).toEqual({
      calle: 'San Martín 888',
      depto: '301',
    })
    expect(parseDireccion('Av. Matta 999')).toEqual({
      calle: 'Av. Matta 999',
      depto: '',
    })
    expect(parseDireccion('')).toEqual({
      calle: '',
      depto: '',
    })
  })
})

