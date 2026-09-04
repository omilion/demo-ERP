const DEFAULTS = Object.freeze({
  windowMs: 60_000,
  maxRequestsPerWindow: 8,
  maxConcurrentRequests: 1,
  maxQueriesPerDay: 50,
})

function positiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

export function getAiLimitConfig(env = process.env) {
  return {
    windowMs: positiveInteger(env.AI_RATE_WINDOW_MS, DEFAULTS.windowMs, 3_600_000),
    maxRequestsPerWindow: positiveInteger(env.AI_RATE_MAX_REQUESTS, DEFAULTS.maxRequestsPerWindow, 100),
    maxConcurrentRequests: positiveInteger(env.AI_MAX_CONCURRENT_PER_USER, DEFAULTS.maxConcurrentRequests, 5),
    maxQueriesPerDay: positiveInteger(env.AI_DAILY_QUERY_LIMIT, DEFAULTS.maxQueriesPerDay, 10_000),
  }
}

// Protege de ráfagas dentro de un proceso. El límite diario se contrasta contra
// ai.query_logs, por lo que sobrevive reinicios del proceso.
export function createAiRequestLimiter(config = getAiLimitConfig()) {
  const entries = new Map()

  function acquire(userId, now = Date.now()) {
    const key = String(userId)
    const entry = entries.get(key) || { timestamps: [], active: 0 }
    const threshold = now - config.windowMs
    entry.timestamps = entry.timestamps.filter(timestamp => timestamp > threshold)

    if (entry.active >= config.maxConcurrentRequests) return { ok: false, reason: 'concurrent', retryAfterSeconds: 1 }
    if (entry.timestamps.length >= config.maxRequestsPerWindow) {
      return { ok: false, reason: 'rate', retryAfterSeconds: Math.max(1, Math.ceil((entry.timestamps[0] + config.windowMs - now) / 1_000)) }
    }

    entry.timestamps.push(now)
    entry.active += 1
    entries.set(key, entry)
    let released = false
    return {
      ok: true,
      release: () => {
        if (released) return
        released = true
        entry.active = Math.max(0, entry.active - 1)
      },
    }
  }

  return { acquire }
}
