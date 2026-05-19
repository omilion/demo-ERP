import { describe, expect, it } from 'vitest'
import {
  CHECKS,
  formatTextReport,
  getExitCode,
  parseArgs,
  runCheck,
  summarizeResults,
} from '../scripts/data-integrity-audit.mjs'

describe('data-integrity-audit checks', () => {
  it('defines stable audit checks with required metadata and SQL', () => {
    expect(CHECKS.length).toBeGreaterThan(20)

    const ids = new Set()
    for (const check of CHECKS) {
      expect(check.id).toMatch(/^[a-z0-9_.]+$/)
      expect(ids.has(check.id)).toBe(false)
      ids.add(check.id)
      expect(check.area).toBeTruthy()
      expect(['critical', 'warn', 'info']).toContain(check.severity)
      expect(check.description).toBeTruthy()
      expect(check.countSql.toLowerCase()).toContain('select')
      expect(typeof check.sampleSql).toBe('function')
    }
  })

  it('includes the operational areas requested for Sprint 2', () => {
    const areas = new Set(CHECKS.map((check) => check.area))
    for (const area of ['ventas', 'taller', 'despachos', 'caja', 'proveedores', 'productos', 'clientes']) {
      expect(areas.has(area)).toBe(true)
    }
  })

  it('audits stock movement traceability introduced in Sprint 1', () => {
    const ids = new Set(CHECKS.map((check) => check.id))
    for (const id of [
      'bodega.movimientos_origen_tipo_nulo',
      'bodega.movimientos_orden_id_huerfano',
      'bodega.movimientos_odt_id_huerfano',
      'bodega.movimientos_pago_proveedor_id_huerfano',
      'bodega.movimientos_egreso_manual_sin_trabajo',
      'proveedores.pagos_stock_aplicado_sin_movimiento_bodega',
    ]) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('audits cash movement traceability introduced in Sprint 2', () => {
    const ids = new Set(CHECKS.map((check) => check.id))
    for (const id of [
      'caja.movimientos_origen_tipo_nulo',
      'caja.ingresos_sin_orden_ni_documento',
      'caja.egresos_sin_gasto_ni_orden',
      'caja.movimientos_origen_orden_mismatch',
      'caja.movimientos_origen_gasto_mismatch',
    ]) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('audits dispatch and guide traceability introduced in Sprint 3', () => {
    const ids = new Set(CHECKS.map((check) => check.id))
    for (const id of [
      'despachos.despacho_odt_id_huerfano',
      'despachos.despacho_origen_tipo_nulo',
      'despachos.despacho_interno_mismatch',
      'despachos.despacho_odt_orden_mismatch',
      'despachos.guia_odt_id_huerfano',
      'despachos.guia_origen_tipo_nulo',
      'despachos.guia_odt_orden_mismatch',
    ]) {
      expect(ids.has(id)).toBe(true)
    }
  })
})

describe('data-integrity-audit CLI behavior', () => {
  it('parses json, samples and fail policy flags', () => {
    expect(parseArgs(['--json', '--samples=12', '--fail-on=warn'])).toEqual({
      json: true,
      sampleLimit: 12,
      failOn: 'warn',
    })
    expect(parseArgs(['--samples=999', '--no-fail']).sampleLimit).toBe(50)
    expect(parseArgs(['--samples=-1']).sampleLimit).toBe(5)
  })

  it('summarizes findings by severity and area', () => {
    const summary = summarizeResults([
      { status: 'ok', area: 'ventas', severity: 'critical', count: 2 },
      { status: 'ok', area: 'ventas', severity: 'warn', count: 3 },
      { status: 'ok', area: 'caja', severity: 'warn', count: 0 },
      { status: 'error', area: 'taller', severity: 'critical', count: null },
    ])

    expect(summary).toMatchObject({
      totalChecks: 4,
      okChecks: 3,
      errorChecks: 1,
      findings: 5,
      bySeverity: { critical: 2, warn: 3, info: 0 },
      byArea: { ventas: 5 },
    })
  })

  it('uses exit code 2 for execution errors and configurable failure thresholds', () => {
    const clean = [{ status: 'ok', severity: 'critical', count: 0 }]
    const warning = [{ status: 'ok', severity: 'warn', count: 1 }]
    const critical = [{ status: 'ok', severity: 'critical', count: 1 }]
    const error = [{ status: 'error', severity: 'critical', count: null }]

    expect(getExitCode(clean, 'critical')).toBe(0)
    expect(getExitCode(warning, 'critical')).toBe(0)
    expect(getExitCode(warning, 'warn')).toBe(1)
    expect(getExitCode(critical, 'critical')).toBe(1)
    expect(getExitCode(critical, 'none')).toBe(0)
    expect(getExitCode(error, 'none')).toBe(2)
  })

  it('formats a compact text report with samples', () => {
    const report = formatTextReport([
      {
        id: 'ventas.demo',
        area: 'ventas',
        severity: 'critical',
        description: 'Demo finding.',
        status: 'ok',
        count: 1,
        samples: [{ id: 10 }],
      },
    ])

    expect(report).toContain('Plastimar ERP data integrity audit')
    expect(report).toContain('[critical] ventas.demo: 1')
    expect(report).toContain('"id":10')
  })
})

describe('runCheck', () => {
  it('runs count and sample queries when findings exist', async () => {
    const queries = []
    const prisma = {
      $queryRawUnsafe: async (sql) => {
        queries.push(sql)
        if (queries.length === 1) return [{ count: 1n }]
        return [{ id: 1n, created_at: new Date('2026-01-01T00:00:00.000Z') }]
      },
    }

    const result = await runCheck(prisma, {
      id: 'demo.check',
      area: 'ventas',
      severity: 'critical',
      description: 'Demo.',
      countSql: 'select 1 as count',
      sampleSql: (limit) => `select * from demo limit ${limit}`,
    }, 3)

    expect(queries).toEqual(['select 1 as count', 'select * from demo limit 3'])
    expect(result).toMatchObject({
      id: 'demo.check',
      status: 'ok',
      count: 1,
      samples: [{ id: 1, created_at: '2026-01-01T00:00:00.000Z' }],
    })
  })

  it('returns an execution error result instead of throwing', async () => {
    const prisma = {
      $queryRawUnsafe: async () => {
        const error = new Error('relation does not exist')
        error.code = '42P01'
        throw error
      },
    }

    const result = await runCheck(prisma, {
      id: 'demo.error',
      area: 'ventas',
      severity: 'critical',
      description: 'Demo.',
      countSql: 'select 1',
      sampleSql: () => 'select 1',
    })

    expect(result.status).toBe('error')
    expect(result.error).toContain('42P01')
  })
})
