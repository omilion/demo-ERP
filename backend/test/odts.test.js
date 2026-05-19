import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

async function createTestOrden(app) {
  const user = await app.prisma.user.findFirst({ select: { id: true } })
  const cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
  return app.prisma.orden.create({
    data: {
      tipo: 'Test',
      estado: 'Activa',
      estadoPago: 'No pagada',
      estadoEntrega: 'Pendiente entrega',
      clienteId: cliente.id,
      userId: user.id,
    },
  })
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
    const orden = await createTestOrden(app)
    const res = await app.inject({
      method: 'POST', url: '/api/odts',
      headers: { authorization: `Bearer ${token}` },
      payload: { ordenId: orden.id, tipo: 'Espumas', clienteNombre: 'Test Cliente', descripcion: 'Prueba', estado: 'Pendiente' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.tipo).toBe('Espumas')
    if (body.id) await app.prisma.odt.delete({ where: { id: body.id } }).catch(() => {})
    await app.prisma.orden.delete({ where: { id: orden.id } }).catch(() => {})
  })

  it('rejects standalone odts without linked orden', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/odts',
      headers: { authorization: `Bearer ${token}` },
      payload: { tipo: 'Espumas', clienteNombre: 'Test Cliente', descripcion: 'Prueba', estado: 'Pendiente' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/ordenId/)
  })
})
