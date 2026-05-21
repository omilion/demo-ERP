import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import {
  INTEGRITY_SUMMARY_KEYS,
  errorReport,
  isDirectRun,
  parseArgs,
  validateIntegritySummary,
} from '../scripts/staging-smoke.mjs'

function integritySummary(overrides = {}) {
  return Object.fromEntries(INTEGRITY_SUMMARY_KEYS.map((key) => [key, overrides[key] ?? 0]))
}

const smokeEnvKeys = [
  'SMOKE_BASE_URL',
  'SMOKE_EMAIL',
  'SMOKE_PASSWORD',
  'SMOKE_EXPECT_ORDEN_ITEMS_HUERFANOS',
  'SMOKE_EXPECT_ODT_ITEMS_HUERFANOS',
  'SMOKE_EXPECT_PRODUCTOS_STOCK_NEGATIVO',
]

describe('staging-smoke CLI args', () => {
  const originalEnv = {}

  beforeEach(() => {
    for (const key of smokeEnvKeys) {
      originalEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of smokeEnvKeys) {
      if (originalEnv[key] === undefined) delete process.env[key]
      else process.env[key] = originalEnv[key]
    }
  })

  it('observes integrity counts by default instead of pinning production totals', () => {
    const options = parseArgs([])

    expect(options.baseUrl).toBe('http://127.0.0.1:3101')
    expect(options.expectedIntegrity).toBeNull()
  })

  it('accepts explicit integrity count expectations when requested', () => {
    const options = parseArgs([
      '--json',
      '--base-url=http://localhost:9999/',
      '--expect-orden-items-huerfanos=1',
      '--expect-odt-items-huerfanos=2',
      '--expect-productos-stock-negativo=3',
    ])

    expect(options).toMatchObject({
      json: true,
      baseUrl: 'http://localhost:9999',
      expectedIntegrity: {
        orden_items_huerfanos: 1,
        odt_items_huerfanos: 2,
        productos_stock_negativo: 3,
      },
    })
  })
})

describe('staging-smoke integrity summary checks', () => {
  it('requires every admin integrity summary key as a non-negative integer', () => {
    expect(() => validateIntegritySummary(integritySummary())).not.toThrow()

    expect(() => validateIntegritySummary(integritySummary({ productos_sin_precio: -1 })))
      .toThrow('productos_sin_precio must be a non-negative integer')

    const missing = integritySummary()
    delete missing.bitacora_sin_fecha
    expect(() => validateIntegritySummary(missing)).toThrow('missing key bitacora_sin_fecha')
  })

  it('compares exact counts only for explicit expectations', () => {
    const summary = integritySummary({ orden_items_huerfanos: 7, productos_stock_negativo: 4 })

    expect(() => validateIntegritySummary(summary, { orden_items_huerfanos: 7 })).not.toThrow()
    expect(() => validateIntegritySummary(summary, { productos_stock_negativo: 5 }))
      .toThrow('expected productos_stock_negativo 5, got 4')
  })
})

describe('staging-smoke process helpers', () => {
  it('detects direct execution with resolved paths', () => {
    const scriptPath = path.resolve('scripts/staging-smoke.mjs')
    const moduleUrl = pathToFileURL(scriptPath).href

    expect(isDirectRun(scriptPath, moduleUrl)).toBe(true)
    expect(isDirectRun(path.resolve('scripts/other.mjs'), moduleUrl)).toBe(false)
    expect(isDirectRun(undefined, moduleUrl)).toBe(false)
  })

  it('formats machine-readable error reports without stacks', () => {
    const report = errorReport(new Error('boom'), { baseUrl: 'http://api.local' })

    expect(report).toMatchObject({
      baseUrl: 'http://api.local',
      ok: false,
      error: { name: 'Error', message: 'boom' },
      summary: { total: 0, passed: 0 },
    })
    expect(report.error.stack).toBeUndefined()
  })
})
