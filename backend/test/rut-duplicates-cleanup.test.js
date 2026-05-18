import { describe, expect, it } from 'vitest'
import {
  buildRutCleanupPlan,
  classifyRutValue,
  formatNormalizedRut,
  isPlaceholderNormalizedRut,
  isValidNormalizedRut,
  normalizeRut,
  parseArgs,
  planToCsv,
  rutCheckDigit,
} from '../scripts/rut-duplicates-cleanup.mjs'

describe('RUT normalization helpers', () => {
  it('normalizes punctuation, whitespace and lowercase verifier K', () => {
    expect(normalizeRut(' 12.345.678-5 ')).toBe('123456785')
    expect(normalizeRut('9 876 543-k')).toBe('9876543K')
    expect(normalizeRut(null)).toBe('')
  })

  it('detects placeholder RUT values separately from real RUTs', () => {
    expect(isPlaceholderNormalizedRut('')).toBe(true)
    expect(isPlaceholderNormalizedRut('000000000')).toBe(true)
    expect(isPlaceholderNormalizedRut('123456785')).toBe(false)

    expect(classifyRutValue('')).toMatchObject({
      classification: 'placeholder_empty',
      action: 'manual_placeholder',
      applyEligible: false,
    })
    expect(classifyRutValue('00.000.000-0')).toMatchObject({
      normalizedRut: '000000000',
      classification: 'placeholder_zero',
      action: 'manual_placeholder',
      applyEligible: false,
    })
  })

  it('validates and formats Chilean RUTs with check digit', () => {
    expect(rutCheckDigit('12345678')).toBe('5')
    expect(isValidNormalizedRut('123456785')).toBe(true)
    expect(isValidNormalizedRut('98765433')).toBe(true)
    expect(isValidNormalizedRut('123456784')).toBe(false)
    expect(formatNormalizedRut('123456785')).toBe('12.345.678-5')
    expect(formatNormalizedRut('98765433')).toBe('9.876.543-3')
  })
})

describe('RUT cleanup plan classification', () => {
  const clienteConfig = {
    entity: 'clientes',
    nameFields: ['razonSocial', 'nombre'],
  }

  it('separates real duplicates, placeholders, invalid values and safe format-only fixes', () => {
    const plan = buildRutCleanupPlan('clientes', [
      { id: 1, rut: '12.345.678-5', nombre: 'Cliente A', ventasByIdCount: 2 },
      { id: 2, rut: '123456785', nombre: 'Cliente A duplicado', ventasByIdCount: 0 },
      { id: 3, rut: '', nombre: 'Sin rut' },
      { id: 4, rut: '000000000', nombre: 'Placeholder cero' },
      { id: 5, rut: '98765433', nombre: 'Formato seguro' },
      { id: 6, rut: '11.111.111-2', nombre: 'Rut invalido' },
    ], clienteConfig)

    expect(plan.summary.byClassification).toEqual({
      placeholder_empty: 1,
      placeholder_zero: 1,
      invalid: 1,
      real_duplicate: 2,
      safe_format_only: 1,
    })

    const duplicate = plan.groups.find((group) => group.classification === 'real_duplicate')
    expect(duplicate).toMatchObject({
      action: 'manual_review_duplicate',
      normalizedRut: '123456785',
      canonicalRut: '12.345.678-5',
      ids: [1, 2],
      applyEligible: false,
    })

    const safeFormat = plan.groups.find((group) => group.classification === 'safe_format_only')
    expect(safeFormat).toMatchObject({
      action: 'safe_format_update',
      normalizedRut: '98765433',
      canonicalRut: '9.876.543-3',
      ids: [5],
      applyEligible: true,
    })
  })

  it('renders CSV rows with group ids, counts and usage fields', () => {
    const plan = buildRutCleanupPlan('clientes', [
      {
        id: 10,
        rut: '98765433',
        razonSocial: 'Cliente CSV',
        ventasByIdCount: 1,
        ventasByRutCount: 2,
        cobranzaByRutCount: 3,
        odtByClienteIdCount: 4,
        odtByRutCount: 5,
      },
    ], clienteConfig)

    const csv = planToCsv([plan])
    expect(csv).toContain('entity,group_id,classification,action')
    expect(csv).toContain('clientes,clientes-0001,safe_format_only,safe_format_update,98765433,9.876.543-3,1,10,98765433,Cliente CSV,1,2,3,4,5')
  })
})

describe('RUT cleanup CLI options', () => {
  it('parses entity, output and apply flags', () => {
    expect(parseArgs(['--entity=clientes', '--json', '--out=plan.json', '--apply'])).toEqual({
      entity: 'clientes',
      json: true,
      csv: false,
      out: 'plan.json',
      apply: true,
      help: false,
    })

    expect(parseArgs(['--entity=nope']).entity).toBe('all')
  })
})
