import { describe, expect, it } from 'vitest'
import {
  classifyDateAnomaly,
  classifyProductOrphan,
  classifyRutGroup,
  classifyStock,
  formatTextReport,
  normalizeCode,
  normalizeRut,
  parseArgs,
  summarizePlan,
} from '../scripts/data-cleanup-plan.mjs'

describe('data-cleanup-plan classifiers', () => {
  it('normalizes product codes and RUT values deterministically', () => {
    expect(normalizeCode(' pack4  ')).toBe('PACK4')
    expect(normalizeCode('Abc   123')).toBe('ABC 123')
    expect(normalizeRut('76.111.297-k')).toBe('76111297K')
    expect(normalizeRut(' 00-000.000-0 ')).toBe('000000000')
  })

  it('classifies product orphan rows conservatively', () => {
    expect(classifyProductOrphan({ codigo_interno: 'ABC', match_count: 1, matched_producto_id: 10 })).toBe('auto_fix_exact_code_match')
    expect(classifyProductOrphan({ codigo_interno: '', match_count: 0 })).toBe('manual_missing_code')
    expect(classifyProductOrphan({ codigo_interno: 'ABC', match_count: 2 })).toBe('manual_ambiguous_code_match')
    expect(classifyProductOrphan({ codigo_interno: 'ABC', match_count: 0 })).toBe('manual_no_catalog_match')
  })

  it('separates placeholder RUT groups from real duplicate groups', () => {
    expect(classifyRutGroup({ normalized_value: '', rows: 24 })).toBe('manual_placeholder_group')
    expect(classifyRutGroup({ normalized_value: '000000000', rows: 4 })).toBe('manual_placeholder_group')
    expect(classifyRutGroup({ normalized_value: '76111297K', rows: 2 })).toBe('manual_duplicate_real_rut')
  })

  it('classifies stock and date anomalies without pretending to fix them blindly', () => {
    expect(classifyStock({ stock: -1 })).toBe('manual_inventory_adjustment_required')
    expect(classifyStock({ stock: 0 })).toBe('ok')
    expect(classifyDateAnomaly({ value: '0001-01-01T00:00:00.000Z', nullable: true })).toBe('candidate_null_sentinel_date')
    expect(classifyDateAnomaly({ value: '1970-01-01T00:00:00.000Z', nullable: false })).toBe('manual_non_nullable_sentinel_date')
    expect(classifyDateAnomaly({ value: '1999-12-31T00:00:00.000Z', nullable: true })).toBe('manual_anomalous_date_review')
  })
})

describe('data-cleanup-plan CLI helpers', () => {
  it('parses task, limit, output and apply flags', () => {
    expect(parseArgs(['--task=product-orphans', '--limit=9999', '--json', '--apply', '--confirm=X', '--out=plan.json'])).toEqual({
      task: 'product-orphans',
      limit: 5000,
      json: true,
      apply: true,
      confirm: 'X',
      out: 'plan.json',
    })
  })

  it('summarizes and formats a compact cleanup plan', () => {
    const plan = {
      task: 'all',
      limit: 10,
      productOrphans: [
        { source_table: 'ventas.orden_items', id: 1, old_producto_id: 0, codigo_interno: 'A', matched_producto_id: 2, action: 'auto_fix_exact_code_match' },
        { source_table: 'taller.odt_items', id: 2, old_producto_id: 0, codigo_interno: '', action: 'manual_missing_code' },
      ],
      rutDuplicates: [
        { source_table: 'clientes.clientes', normalized_value: '', rows: 2, action: 'manual_placeholder_group' },
        { source_table: 'catalogo.proveedores', normalized_value: '76111297K', rows: 2, action: 'manual_duplicate_real_rut' },
      ],
      stockAndDates: {
        stock: [{ stock: -1, action: 'manual_inventory_adjustment_required' }],
        dates: [
          { value: '0001-01-01T00:00:00.000Z', action: 'candidate_null_sentinel_date' },
          { value: '1999-12-31T00:00:00.000Z', action: 'manual_anomalous_date_review' },
        ],
      },
    }

    expect(summarizePlan(plan)).toMatchObject({
      productOrphans: { total: 2, autoFixExactCodeMatch: 1, manual: 1 },
      rutDuplicates: { groups: 2, placeholders: 1, realDuplicates: 1 },
      stockAndDates: { negativeStockRows: 1, nullableSentinelDates: 1, manualDateRows: 1 },
    })
    expect(formatTextReport(plan)).toContain('Product orphans: 2 rows')
    expect(formatTextReport(plan)).toContain('exact-auto=1')
  })
})
