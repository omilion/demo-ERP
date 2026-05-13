import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

describe('GET /api/clientes', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('returns list with saldo computed', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/clientes',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body)).toBe(true)
    if (body.length > 0) expect(body[0]).toHaveProperty('saldo')
  })

  it('cajero can read clientes', async () => {
    const t = await loginAs(app, 'cajero')
    const res = await app.inject({
      method: 'GET', url: '/api/clientes',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('rrhh cannot read clientes', async () => {
    const t = await loginAs(app, 'rrhh')
    const res = await app.inject({
      method: 'GET', url: '/api/clientes',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/clientes', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'vendedor') })
  afterAll(() => app.close())

  it('creates cliente', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: { rut: 'TEST-RUT-99', nombre: 'Cliente Test', tipo: 'Empresa', ciudad: 'Testlandia' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.rut).toBe('TEST-RUT-99')
    // cleanup
    await app.prisma.cliente.delete({ where: { rut: 'TEST-RUT-99' } }).catch(() => {})
  })
})
