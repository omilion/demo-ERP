import { describe, expect, it } from 'vitest'
import {
  applyDateNulls,
  applyEnabled,
  classifyDateRow,
  classifyDateValue,
  classifyStockRow,
  formatTextReport,
  parseArgs,
  summarize,
} from '../scripts/stock-negative-dates-audit.mjs'

const now = new Date('2026-05-18T12:00:00.000Z')

describe('stock-negative-dates CLI options', () => {
  it('defaults to dry-run stock and date scan', () => {
    expect(parseArgs([])).toMatchObject({
      json: false,
      apply: false,
      includeStock: true,
      includeDates: true,
      limit: 100,
      futureYears: 10,
    })
  })

  it('caps limits and requires explicit confirmation for apply mode', () => {
    const options = parseArgs(['--json', '--apply', '--confirm=APPLY_DATE_NULLS', '--limit=5000', '--future-years=50'])

    expect(options).toMatchObject({
      json: true,
      apply: true,
      confirm: 'APPLY_DATE_NULLS',
      limit: 1000,
      futureYears: 50,
    })
    expect(applyEnabled(options)).toBe(true)
    expect(applyEnabled(parseArgs(['--apply']))).toBe(false)
    expect(applyEnabled(parseArgs(['--apply', '--confirm=wrong']))).toBe(false)
  })

  it('supports focused scans without changing safety behavior', () => {
    expect(parseArgs(['--only-stock'])).toMatchObject({ includeStock: true, includeDates: false })
    expect(parseArgs(['--only-dates', '--schemas=catalogo,taller'])).toMatchObject({
      includeStock: false,
      includeDates: true,
      schemas: ['catalogo', 'taller'],
    })
  })
})

describe('stock negative classification', () => {
  it('builds a manual review plan with last inferred evidence', () => {
    const row = classifyStockRow({
      id: 12n,
      codigo: 'P-001',
      nombre: 'Marco aluminio',
      stock: '-3',
      ultima_evidencia: {
        origen: 'bodega.movimientos',
        id: 5,
        tipo: 'egreso',
        fecha: new Date('2026-05-10T09:00:00.000Z'),
      },
    }, 'catalogo.productos')

    expect(row).toMatchObject({
      target: 'catalogo.productos',
      id: 12,
      codigo: 'P-001',
      nombre: 'Marco aluminio',
      stock: -3,
      ultimaEvidencia: {
        origen: 'bodega.movimientos',
        id: 5,
        tipo: 'egreso',
        fecha: '2026-05-10T09:00:00.000Z',
      },
    })
    expect(row.recomendacionManual).toContain('Revisar ultimo movimiento')
  })

  it('keeps stock fixes manual when no evidence can be inferred', () => {
    const row = classifyStockRow({
      id: 3,
      codigo: null,
      nombre: 'Tela sin codigo',
      stock: -1,
      ultima_evidencia: null,
    }, 'taller.telas')

    expect(row.recomendacionManual).toContain('Sin evidencia')
  })
})

describe('date anomaly classification', () => {
  it('classifies obvious sentinels as nullable-only candidates', () => {
    expect(classifyDateValue('0001-01-01T00:00:00.000Z', now)).toMatchObject({
      kind: 'sentinel_0001',
      isSentinel: true,
      recommendedAction: 'null_if_nullable_and_confirmed',
    })
    expect(classifyDateValue('1970-08-20T00:00:00.000Z', now)).toMatchObject({
      kind: 'sentinel_1970',
      isSentinel: true,
    })
  })

  it('keeps pre-2000 and far future dates as manual review', () => {
    expect(classifyDateValue('1999-12-31T00:00:00.000Z', now)).toMatchObject({
      kind: 'pre_2000',
      isSentinel: false,
      recommendedAction: 'manual_review',
    })
    expect(classifyDateValue('2040-01-01T00:00:00.000Z', now, 10)).toMatchObject({
      kind: 'future_extreme',
      isSentinel: false,
      recommendedAction: 'manual_review',
    })
  })

  it('only proposes NULL for sentinel values in nullable columns', () => {
    const nullable = classifyDateRow({
      table_schema: 'ventas',
      table_name: 'ordenes',
      column_name: 'fecha',
      is_nullable: 'YES',
      id: 1,
      value: '1970-01-01T00:00:00.000Z',
    }, { now })
    const notNull = classifyDateRow({
      table_schema: 'ventas',
      table_name: 'ordenes',
      column_name: 'created_at',
      is_nullable: 'NO',
      id: 2,
      value: '1970-01-01T00:00:00.000Z',
    }, { now })
    const pre2000 = classifyDateRow({
      table_schema: 'ventas',
      table_name: 'ordenes',
      column_name: 'fecha',
      is_nullable: 'YES',
      id: 3,
      value: '1998-01-01T00:00:00.000Z',
    }, { now })

    expect(nullable).toMatchObject({ kind: 'sentinel_1970', nullable: true, canNull: true })
    expect(nullable.recommendation).toContain('--apply --confirm=APPLY_DATE_NULLS')
    expect(notNull).toMatchObject({ kind: 'sentinel_1970', nullable: false, canNull: false })
    expect(pre2000).toMatchObject({ kind: 'pre_2000', nullable: true, canNull: false })
  })
})

describe('date apply guard', () => {
  it('does not execute updates without apply confirmation', async () => {
    const prisma = {
      $executeRawUnsafe: async () => {
        throw new Error('should not execute')
      },
    }
    const result = await applyDateNulls(prisma, [
      { table: 'ventas.ordenes', column: 'fecha', id: 1, canNull: true },
    ], parseArgs(['--apply']))

    expect(result).toEqual({ applied: 0, skipped: 1 })
  })

  it('updates only nullable sentinel candidates when explicitly confirmed', async () => {
    const queries = []
    const prisma = {
      $executeRawUnsafe: async (...args) => {
        queries.push(args)
      },
    }
    const result = await applyDateNulls(prisma, [
      { table: 'ventas.ordenes', column: 'fecha', id: 1, canNull: true },
      { table: 'ventas.ordenes', column: 'created_at', id: 2, canNull: false },
    ], parseArgs(['--apply', '--confirm=APPLY_DATE_NULLS']))

    expect(result.applied).toBe(1)
    expect(queries).toHaveLength(1)
    expect(queries[0][0]).toContain('UPDATE "ventas"."ordenes"')
    expect(queries[0][0]).toContain('SET "fecha" = NULL')
    expect(queries[0][1]).toBe(1)
  })
})

describe('report formatting', () => {
  it('summarizes safety-sensitive findings', () => {
    const result = {
      stock: {
        findings: [classifyStockRow({ id: 1, codigo: 'A', nombre: 'Producto A', stock: -1 }, 'catalogo.productos')],
        errors: [],
      },
      dates: {
        findings: [
          classifyDateRow({
            table_schema: 'catalogo',
            table_name: 'pagos_proveedores',
            column_name: 'fecha_doc',
            is_nullable: 'YES',
            id: 9,
            value: '1970-01-01T00:00:00.000Z',
          }, { now }),
        ],
        errors: [],
        columnsScanned: 4,
      },
      applyResult: null,
    }

    expect(summarize(result)).toMatchObject({
      stockNegativo: 1,
      fechasAnomalas: 1,
      fechasPorTipo: { sentinel_1970: 1 },
      dateColumnsScanned: 4,
    })

    const report = formatTextReport(result, parseArgs([]))
    expect(report).toContain('dry-run sin cambios')
    expect(report).toContain('Plan de revision - stock negativo')
    expect(report).toContain('Plan de revision - fechas anomalas')
    expect(report).toContain('Para NULL en centinelas nullable')
  })
})
