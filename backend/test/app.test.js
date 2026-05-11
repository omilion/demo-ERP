import { describe, it, expect } from 'vitest'
import { buildApp } from '../src/app.js'

describe('App', () => {
  it('GET /api/health returns ok', async () => {
    const app = buildApp({ logger: false })
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' })
  })
})
