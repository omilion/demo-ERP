import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

describe('GET /api/caja/turno', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'cajero') })
  afterAll(() => app.close())

  it('returns null or active turno', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/caja/turno', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body === null || body.estado === 'abierto').toBe(true)
  })

  it('rrhh cannot access caja', async () => {
    const t = await loginAs(app, 'rrhh')
    const res = await app.inject({ method: 'GET', url: '/api/caja/turno', headers: { authorization: `Bearer ${t}` } })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/caja/turno (abrir)', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'cajero') })
  afterAll(() => app.close())

  it('opens a turno', async () => {
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (existing) await app.prisma.turno.update({ where: { id: existing.id }, data: { estado: 'cerrado' } })

    const res = await app.inject({
      method: 'POST', url: '/api/caja/turno',
      headers: { authorization: `Bearer ${token}` },
      payload: { cajaId: 1 },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.estado).toBe('abierto')
    await app.prisma.turno.update({ where: { id: body.id }, data: { estado: 'cerrado' } }).catch(() => {})
  })
})
