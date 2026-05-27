import { describe, expect, it } from 'vitest'
import { parseCsv, tableRowsToObjects } from './csv'

describe('csv utilities', () => {
  it('parses semicolon CSV files with quoted values', () => {
    const parsed = parseCsv('codigo;nombre;stock\nA1;"Producto; prueba";12')

    expect(parsed.headers).toEqual(['codigo', 'nombre', 'stock'])
    expect(parsed.rows).toEqual([{ codigo: 'A1', nombre: 'Producto; prueba', stock: '12' }])
  })

  it('maps spreadsheet rows to import objects preserving numeric cells', () => {
    const parsed = tableRowsToObjects([
      ['Cod Interno', 'Nombre', 'Stock'],
      ['P-001', 'Espuma', 7],
      ['', '', ''],
    ])

    expect(parsed.headers).toEqual(['Cod Interno', 'Nombre', 'Stock'])
    expect(parsed.rows).toEqual([{ 'Cod Interno': 'P-001', Nombre: 'Espuma', Stock: 7 }])
  })

  it('deduplicates blank or repeated spreadsheet headers', () => {
    const parsed = tableRowsToObjects([
      ['codigo', 'codigo', ''],
      ['A1', 'B2', 'extra'],
    ])

    expect(parsed.headers).toEqual(['codigo', 'codigo_2', 'columna_3'])
    expect(parsed.rows[0]).toEqual({ codigo: 'A1', codigo_2: 'B2', columna_3: 'extra' })
  })
})
