import { describe, expect, it } from 'vitest'
import { CLIENTE_RULES } from './clienteFields'

// Casos reportados en feedback de pilotaje (Mario Demartini, /ventas/19905,
// 2026-09-11): RUT mal formado o con mas de un caracter tras el guion, y
// telefono compuesto por texto, se guardaban sin bloqueo.
describe('CLIENTE_RULES.rut.validator', () => {
  const validate = (rut, data = { pais: 'Chile' }) => CLIENTE_RULES.rut.validator(rut, data)

  it('acepta un RUT chileno valido', () => {
    expect(validate('76192083-9')).toBeNull()
  })

  it('rechaza un RUT con formato completamente invalido', () => {
    expect(validate('no-es-un-rut')).not.toBeNull()
  })

  it('rechaza un RUT con mas de un caracter despues del guion (16.888.432-K2)', () => {
    expect(validate('16.888.432-K2')).not.toBeNull()
  })

  it('rechaza un digito verificador incorrecto', () => {
    expect(validate('76192083-0')).not.toBeNull()
  })

  it('no exige checksum chileno si el cliente es de otro pais', () => {
    expect(validate('CUIT-30-12345678-9', { pais: 'Argentina' })).toBeNull()
  })
})

describe('CLIENTE_RULES.telefono.validator', () => {
  const validate = telefono => CLIENTE_RULES.telefono.validator(telefono)

  it('acepta un telefono con formato chileno', () => {
    expect(validate('+56 9 1234 5678')).toBeNull()
  })

  it('rechaza telefono compuesto por texto en vez de numeros', () => {
    expect(validate('no tiene telefono')).not.toBeNull()
  })

  it('rechaza texto mezclado con muy pocos digitos', () => {
    expect(validate('llamar 123')).not.toBeNull()
  })
})
