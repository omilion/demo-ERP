import { describe, expect, it } from 'vitest'
import { createAiRequestLimiter, getAiLimitConfig } from '../src/routes/ai/limits.js'

describe('controles de admisión del asistente IA', () => {
  it('limita concurrencia y ráfagas por usuario, pero libera al terminar', () => {
    const limiter = createAiRequestLimiter({
      windowMs: 60_000,
      maxRequestsPerWindow: 2,
      maxConcurrentRequests: 1,
      maxQueriesPerDay: 10,
    })
    const first = limiter.acquire(44, 1_000)
    expect(first.ok).toBe(true)
    expect(limiter.acquire(44, 1_001)).toMatchObject({ ok: false, reason: 'concurrent' })

    first.release()
    const second = limiter.acquire(44, 1_002)
    expect(second.ok).toBe(true)
    second.release()
    expect(limiter.acquire(44, 1_003)).toMatchObject({ ok: false, reason: 'rate' })
  })

  it('acota valores de entorno riesgosos a rangos operativos', () => {
    const limits = getAiLimitConfig({
      AI_RATE_WINDOW_MS: '999999999',
      AI_RATE_MAX_REQUESTS: '999999',
      AI_MAX_CONCURRENT_PER_USER: '999',
      AI_DAILY_QUERY_LIMIT: '9999999',
    })
    expect(limits.windowMs).toBe(3_600_000)
    expect(limits.maxRequestsPerWindow).toBe(100)
    expect(limits.maxConcurrentRequests).toBe(5)
    expect(limits.maxQueriesPerDay).toBe(10_000)
  })
})
