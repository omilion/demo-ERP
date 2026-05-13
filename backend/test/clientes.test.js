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

  it('returns paginated list with saldo computed', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/clientes',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('items')
    expect(body).toHaveProperty('total')
    expect(Array.isArray(body.items)).toBe(true)
    if (body.items.length > 0) expect(body.items[0]).toHaveProperty('saldo')
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

describe('GET /api/clientes/:id', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('returns cliente with saldo', async () => {
    const listRes = await app.inject({ method: 'GET', url: '/api/clientes', headers: { authorization: `Bearer ${token}` } })
    const { items: clientes } = JSON.parse(listRes.body)
    if (clientes.length === 0) return
    const id = clientes[0].id
    const res = await app.inject({ method: 'GET', url: `/api/clientes/${id}`, headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveProperty('saldo')
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/clientes/999999', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 for non-integer id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/clientes/abc', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(400)
  })
})

describe('PUT /api/clientes/:id', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/clientes/999999',
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre: 'Test' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 for empty body', async () => {
    const listRes = await app.inject({ method: 'GET', url: '/api/clientes', headers: { authorization: `Bearer ${token}` } })
    const { items: clientes } = JSON.parse(listRes.body)
    if (clientes.length === 0) return
    const id = clientes[0].id
    const res = await app.inject({
      method: 'PUT', url: `/api/clientes/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})
