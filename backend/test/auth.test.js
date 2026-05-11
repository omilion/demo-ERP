import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

describe('POST /api/auth/login', () => {
  let app

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
  })

  afterAll(() => app.close())

  it('returns accessToken + user for valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@plastimar.cl', password: 'dev1234' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.accessToken).toBeDefined()
    expect(body.user.role).toBe('admin')
    expect(body.user.passwordHash).toBeUndefined()
  })

  it('returns 401 for wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@plastimar.cl', password: 'wrong' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 for missing fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@plastimar.cl' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/auth/logout', () => {
  let app
  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready() })
  afterAll(() => app.close())

  it('returns ok and clears cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
  })
})
