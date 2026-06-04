import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import jwt from 'jsonwebtoken'
import { buildApp } from '../src/app.js'
import {
  createErpAccessTokenPayload,
  createWebAccessTokenPayload,
  TOKEN_AUDIENCES,
  TOKEN_SCOPES,
  TOKEN_TYPES,
} from '../src/plugins/jwt.js'

describe('JWT payload helpers', () => {
  it('builds distinct ERP and web access token claims', () => {
    const erpPayload = createErpAccessTokenPayload({
      id: 1,
      role: 'admin',
      nombre: 'Admin',
      permisosExtra: null,
    })
    const webPayload = createWebAccessTokenPayload({
      id: 2,
      email: 'cliente-web@plastimar.cl',
    })

    expect(erpPayload.scope).toBe(TOKEN_SCOPES.ERP)
    expect(erpPayload.aud).toBe(TOKEN_AUDIENCES.ERP)
    expect(erpPayload.tokenType).toBe(TOKEN_TYPES.ACCESS)
    expect(webPayload.scope).toBe(TOKEN_SCOPES.WEB)
    expect(webPayload.aud).toBe(TOKEN_AUDIENCES.WEB)
    expect(webPayload.tokenType).toBe(TOKEN_TYPES.ACCESS)
    expect(webPayload.scope).not.toBe(erpPayload.scope)
    expect(webPayload.aud).not.toBe(erpPayload.aud)
  })
})

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

  it('issues ERP access tokens with internal scope, audience, and type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@plastimar.cl', password: 'dev1234' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const decoded = jwt.decode(body.accessToken)
    expect(decoded.scope).toBe(TOKEN_SCOPES.ERP)
    expect(decoded.aud).toBe(TOKEN_AUDIENCES.ERP)
    expect(decoded.tokenType).toBe(TOKEN_TYPES.ACCESS)
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

describe('JWT scope separation', () => {
  let app
  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready() })
  afterAll(() => app.close())

  it('rejects web access tokens on internal routes', async () => {
    const webToken = app.jwt.sign(createWebAccessTokenPayload({
      id: 123,
      email: 'cliente-web@plastimar.cl',
    }))

    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard/stats',
      headers: { authorization: `Bearer ${webToken}` },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/usuarios-web/login', () => {
  let app, email

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    email = `web-token-test-${Date.now()}@plastimar.cl`
  })

  afterAll(async () => {
    await app?.prisma?.usuarioWeb.deleteMany({ where: { email } }).catch(() => {})
    await app?.close()
  })

  it('issues web access tokens with web scope, audience, and type', async () => {
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/usuarios-web/register',
      payload: { email, password: 'dev12345', nombre: 'Cliente Web Test' },
    })
    expect(registerRes.statusCode).toBe(201)

    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios-web/login',
      payload: { email, password: 'dev12345' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const decoded = jwt.decode(body.token)
    expect(decoded.scope).toBe(TOKEN_SCOPES.WEB)
    expect(decoded.aud).toBe(TOKEN_AUDIENCES.WEB)
    expect(decoded.tokenType).toBe(TOKEN_TYPES.ACCESS)
  })
})
