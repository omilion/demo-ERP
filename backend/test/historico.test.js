import { describe, it, expect } from 'vitest'
import { buildOrdenScopeWhere, mergeWhere, parseOrdenScope } from '../src/routes/historico/corte.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

describe('historico corte helpers', () => {
  it('parses accepted order scopes', () => {
    expect(parseOrdenScope(undefined)).toBe('operacional')
    expect(parseOrdenScope('historico')).toBe('historico')
    expect(parseOrdenScope('todos')).toBe('todos')
    expect(parseOrdenScope('all')).toBeNull()
  })

  it('builds the operational and historical order filters from the first valid nInterno', () => {
    const createdAt = new Date('2026-01-10T12:00:00.000Z')
    expect(buildOrdenScopeWhere('operacional', { createdAt })).toEqual({
      nInterno: { not: null, gt: 0 },
      createdAt: { gte: createdAt },
    })
    expect(buildOrdenScopeWhere('historico', { createdAt })).toEqual({
      OR: [
        { nInterno: null },
        { nInterno: { lte: 0 } },
        { createdAt: { lt: createdAt } },
      ],
    })
  })

  it('merges base and scope filters with AND without losing OR clauses', () => {
    const merged = mergeWhere({ eliminada: false, OR: [{ id: 1 }] }, { OR: [{ nInterno: null }] })
    expect(merged).toEqual({
      AND: [
        { eliminada: false, OR: [{ id: 1 }] },
        { OR: [{ nInterno: null }] },
      ],
    })
  })
})
