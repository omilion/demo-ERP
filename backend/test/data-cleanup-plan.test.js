import { describe, expect, it } from 'vitest'
import {
  classifyDateAnomaly,
  classifyNegativePrice,
  classifyOrderClientIssue,
  classifyProductCodeGroup,
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

  it('classifies duplicated or missing product codes as manual review findings', () => {
    expect(classifyProductCodeGroup({ normalized_code: 'ABC', rows: 2, active_rows: 2 })).toBe('manual_duplicate_active_product_code')
    expect(classifyProductCodeGroup({ normalized_code: 'ABC', rows: 2, active_rows: 1 })).toBe('manual_duplicate_legacy_product_code')
    expect(classifyProductCodeGroup({ codigo_interno: '', rows: 1, active_rows: 1 })).toBe('manual_missing_product_code')
    expect(classifyProductCodeGroup({ normalized_code: 'ABC', rows: 1, active_rows: 1 })).toBe('ok')
  })

  it('separates placeholder RUT groups from real duplicate groups', () => {
    expect(classifyRutGroup({ normalized_value: '', rows: 24 })).toBe('manual_placeholder_group')
    expect(classifyRutGroup({ normalized_value: '000000000', rows: 4 })).toBe('manual_placeholder_group')
    expect(classifyRutGroup({ normalized_value: '76111297K', rows: 2 })).toBe('manual_duplicate_real_rut')
  })

  it('classifies order/client mismatch and negative price findings without auto-apply', () => {
    expect(classifyOrderClientIssue({
      rut_cliente: '12.345.678-5',
      cliente_rut: '9.876.543-3',
      cliente_id: 10,
      target_matches: 1,
      target_cliente_id: 20,
    })).toBe('candidate_reassign_order_cliente_by_unique_rut')

    expect(classifyOrderClientIssue({
      rut_cliente: '12.345.678-5',
      cliente_rut: '9.876.543-3',
      target_matches: 2,
    })).toBe('manual_ambiguous_order_cliente_rut')

    expect(classifyOrderClientIssue({ rut_cliente: '', cliente_rut: '9.876.543-3' })).toBe('manual_missing_order_rut')
    expect(classifyNegativePrice({ precio_unitario: -100 })).toBe('manual_negative_price_review')
    expect(classifyNegativePrice({ precio_unitario: 0 })).toBe('ok')
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
    expect(parseArgs(['--task=product-codes']).task).toBe('product-codes')
    expect(parseArgs(['--task=orders-prices']).task).toBe('orders-prices')
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
      productCodes: {
        duplicates: [
          { normalized_code: 'ABC', rows: 2, active_rows: 2, action: 'manual_duplicate_active_product_code' },
          { normalized_code: 'OLD', rows: 2, active_rows: 1, action: 'manual_duplicate_legacy_product_code' },
        ],
        missing: [
          { id: 9, codigo_interno: null, action: 'manual_missing_product_code' },
        ],
      },
      stockAndDates: {
        stock: [{ stock: -1, action: 'manual_inventory_adjustment_required' }],
        dates: [
          { value: '0001-01-01T00:00:00.000Z', action: 'candidate_null_sentinel_date' },
          { value: '1999-12-31T00:00:00.000Z', action: 'manual_anomalous_date_review' },
        ],
      },
      orderIssues: {
        clientMismatches: [
          { id: 100, n_interno: 44, cliente_id: 1, rut_cliente: '12.345.678-5', target_cliente_id: 2, action: 'candidate_reassign_order_cliente_by_unique_rut' },
          { id: 101, n_interno: 45, cliente_id: 3, rut_cliente: '9.876.543-3', action: 'manual_ambiguous_order_cliente_rut' },
        ],
        negativePrices: [
          { id: 7, precio_unitario: -1, action: 'manual_negative_price_review' },
        ],
      },
    }

    expect(summarizePlan(plan)).toMatchObject({
      productOrphans: { total: 2, autoFixExactCodeMatch: 1, manual: 1 },
      rutDuplicates: { groups: 2, placeholders: 1, realDuplicates: 1 },
      productCodes: { duplicateGroups: 2, activeDuplicateGroups: 1, activeMissingCodeRows: 1 },
      stockAndDates: { negativeStockRows: 1, nullableSentinelDates: 1, manualDateRows: 1 },
      orderIssues: { clientMismatchRows: 2, uniqueRutCandidates: 1, manualClientRows: 1, negativePriceRows: 1 },
    })
    expect(formatTextReport(plan)).toContain('Product orphans: 2 rows')
    expect(formatTextReport(plan)).toContain('exact-auto=1')
    expect(formatTextReport(plan)).toContain('Product code issues: duplicate-groups=2')
    expect(formatTextReport(plan)).toContain('Order/client issues: mismatches=2')
    expect(formatTextReport(plan)).toContain('Negative price rows: 1')
  })
})
