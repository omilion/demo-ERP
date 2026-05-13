import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

describe('GET /api/ventas', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('returns list with total computed', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/ventas',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body)).toBe(true)
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('total')
      expect(body[0]).toHaveProperty('cliente')
    }
  })

  it('cajero can read ventas', async () => {
    const t = await loginAs(app, 'cajero')
    const res = await app.inject({
      method: 'GET', url: '/api/ventas',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('POST /api/ventas', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'vendedor') })
  afterAll(() => app.close())

  it('creates venta and returns total', async () => {
    const firstCliente = await app.prisma.cliente.findFirst()
    const res = await app.inject({
      method: 'POST', url: '/api/ventas',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        tipo: 'Normal',
        clienteId: firstCliente?.id,
        items: [{ productoId: 1, cantidad: 2, precioUnitario: 10000 }],
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.total).toBe(20000)
    if (body.id) {
      await app.prisma.ordenItem.deleteMany({ where: { ordenId: body.id } }).catch(() => {})
      await app.prisma.orden.delete({ where: { id: body.id } }).catch(() => {})
    }
  })
})
