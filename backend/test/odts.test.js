import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

describe('GET /api/odts', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'taller') })
  afterAll(() => app.close())

  it('returns list of odts', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/odts', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('items')
    expect(Array.isArray(body.items)).toBe(true)
  })

  it('cajero cannot read odts', async () => {
    const t = await loginAs(app, 'cajero')
    const res = await app.inject({ method: 'GET', url: '/api/odts', headers: { authorization: `Bearer ${t}` } })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/odts', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'taller') })
  afterAll(() => app.close())

  it('creates odt', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/odts',
      headers: { authorization: `Bearer ${token}` },
      payload: { tipo: 'Espumas', clienteNombre: 'Test Cliente', descripcion: 'Prueba', estado: 'Pendiente' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.tipo).toBe('Espumas')
    if (body.id) await app.prisma.odt.delete({ where: { id: body.id } }).catch(() => {})
  })
})
