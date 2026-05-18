import { describe, it, expect } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

describe('App', () => {
  it('GET /api/health returns ok', async () => {
    const app = buildApp({ logger: false })
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' })
    await app.close()
  })
})
