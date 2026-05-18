import { describe, expect, it } from 'vitest'
import {
  buildProductCodeIndex,
  classifyProductOrphan,
  classifyProductOrphans,
  isProductionLike,
  normalizeCodigoInterno,
  parseArgs,
  validateOptions,
} from '../scripts/cleanup-producto-orphans.mjs'

describe('producto orphan cleanup classification', () => {
  const products = [
    { id: 10, codigo_interno: 'ABC-1', nombre: 'Producto ABC' },
    { id: 11, codigo_interno: '  def-2 ', nombre: 'Producto DEF' },
  ]

  it('normalizes codigo_interno with surrounding whitespace trim and case only', () => {
    expect(normalizeCodigoInterno('  abc-1  ')).toBe('ABC-1')
    expect(normalizeCodigoInterno('\t abc-1\n')).toBe('ABC-1')
    expect(normalizeCodigoInterno('ab c')).toBe('AB C')
    expect(normalizeCodigoInterno(null)).toBe('')
  })

  it('classifies ventas.orden_items with a unique normalized catalog match as reversible update', () => {
    const index = buildProductCodeIndex(products)
    const result = classifyProductOrphan({
      table_name: 'ventas.orden_items',
      id: 7,
      orden_id: 100,
      producto_id: 0,
      codigo_interno: ' abc-1 ',
      nombre: 'Nombre legacy',
      cantidad: 2,
    }, index)

    expect(result).toMatchObject({
      table: 'ventas.orden_items',
      id: 7,
      parentColumn: 'orden_id',
      parentId: 100,
      codigoNormalizado: 'ABC-1',
      action: 'update_producto_id',
      reason: 'safe_codigo_interno_match',
      before: { productoId: 0 },
      after: { productoId: 10, codigoInterno: 'ABC-1' },
      reversible: true,
    })
    expect(result.reverseSql).toContain('UPDATE ventas.orden_items SET producto_id = 0 WHERE id = 7 AND producto_id = 10')
  })

  it('classifies taller.odt_items with the same exact normalized matching rule', () => {
    const index = buildProductCodeIndex(products)
    const result = classifyProductOrphan({
      table_name: 'taller.odt_items',
      id: 9,
      odt_id: 3,
      producto_id: 9999,
      codigo_interno: 'DEF-2',
      nombre: 'Item ODT',
    }, index)

    expect(result).toMatchObject({
      table: 'taller.odt_items',
      parentColumn: 'odt_id',
      parentId: 3,
      action: 'update_producto_id',
      after: { productoId: 11 },
    })
  })

  it('skips rows without a safe exact codigo_interno match', () => {
    const index = buildProductCodeIndex([
      ...products,
      { id: 20, codigo_interno: 'DUP-1', nombre: 'Duplicado A' },
      { id: 21, codigo_interno: ' dup-1 ', nombre: 'Duplicado B' },
    ])

    expect(classifyProductOrphan({
      table_name: 'ventas.orden_items',
      id: 1,
      orden_id: 2,
      producto_id: 0,
      codigo_interno: '',
    }, index).reason).toBe('missing_codigo_interno')

    expect(classifyProductOrphan({
      table_name: 'ventas.orden_items',
      id: 2,
      orden_id: 2,
      producto_id: 0,
      codigo_interno: 'NOPE',
    }, index).reason).toBe('no_catalog_match')

    const duplicate = classifyProductOrphan({
      table_name: 'ventas.orden_items',
      id: 3,
      orden_id: 2,
      producto_id: 0,
      codigo_interno: 'DUP-1',
    }, index)
    expect(duplicate.reason).toBe('ambiguous_catalog_match')
    expect(duplicate.action).toBe('skip')
    expect(duplicate.matches).toHaveLength(2)
  })

  it('summarizes changes and skipped rows by table and reason', () => {
    const result = classifyProductOrphans([
      {
        table_name: 'ventas.orden_items',
        id: 1,
        orden_id: 2,
        producto_id: 0,
        codigo_interno: 'ABC-1',
      },
      {
        table_name: 'taller.odt_items',
        id: 2,
        odt_id: 3,
        producto_id: 0,
        codigo_interno: 'missing',
      },
    ], products)

    expect(result.summary).toMatchObject({
      totalRows: 2,
      changeCount: 1,
      skippedCount: 1,
      byReason: {
        safe_codigo_interno_match: 1,
        no_catalog_match: 1,
      },
    })
    expect(result.changes).toHaveLength(1)
    expect(result.skipped).toHaveLength(1)
  })
})

describe('producto orphan cleanup CLI safety', () => {
  it('is dry-run by default and requires confirmation for apply', () => {
    expect(parseArgs([])).toMatchObject({ apply: false, confirm: false })
    expect(parseArgs(['--apply', '--confirm', '--samples=300'])).toMatchObject({
      apply: true,
      confirm: true,
      sampleLimit: 200,
    })
    expect(validateOptions(parseArgs(['--apply']), { DATABASE_URL: 'postgres://localhost/plastimar' })).toContain('--confirm')
  })

  it('blocks production-like URLs unless explicitly allowed', () => {
    expect(isProductionLike('postgres://localhost/plastimar_prod')).toBe(true)
    expect(validateOptions(parseArgs(['--apply', '--confirm']), {
      DATABASE_URL: 'postgres://localhost/plastimar_prod',
    })).toContain('production-like')
    expect(validateOptions(parseArgs(['--apply', '--confirm', '--allow-production']), {
      DATABASE_URL: 'postgres://localhost/plastimar_prod',
    })).toBe(null)
  })
})
