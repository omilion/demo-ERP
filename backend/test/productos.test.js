import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

describe('GET /api/productos', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app)
  })

  afterAll(() => app.close())

  it('returns paginated result with estado computed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('items')
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('limit')
    expect(Array.isArray(body.items)).toBe(true)
    if (body.items.length > 0) {
      expect(body.items[0]).toHaveProperty('estado')
      expect(['Normal', 'Crítico', 'Sin stock']).toContain(body.items[0].estado)
    }
  })

  it('rejects unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/productos' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects forbidden role', async () => {
    const cajaToken = await loginAs(app, 'cajero')
    const res = await app.inject({
      method: 'GET',
      url: '/api/productos',
      headers: { authorization: `Bearer ${cajaToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/productos', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app, 'bodeguero')
  })

  afterAll(async () => {
    await app.prisma.producto.deleteMany({ where: { codigoInterno: { startsWith: 'TEST-' } } })
    await app.close()
  })

  it('creates producto and returns it with estado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        codigoInterno: 'TEST-001',
        nombre: 'Producto Test Plan',
        bodega: 'Inventario',
        stock: 5,
        stockCritico: 10,
        precioLista: 9900,
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.codigoInterno).toBe('TEST-001')
    expect(body.estado).toBe('Crítico')
  })
})

describe('GET /api/productos/:id', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app)
  })

  afterAll(() => app.close())

  it('returns producto by id', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
    })
    const { items: productos } = JSON.parse(listRes.body)
    const id = productos[0].id
    const res = await app.inject({
      method: 'GET',
      url: `/api/productos/${id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).id).toBe(id)
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/productos/999999',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /api/productos/:id/historial-precios', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app)
  })

  afterAll(() => app.close())

  it('returns historial array', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/productos',
      headers: { authorization: `Bearer ${token}` },
    })
    const { items: productos } = JSON.parse(listRes.body)
    const id = productos[0].id
    const res = await app.inject({
      method: 'GET',
      url: `/api/productos/${id}/historial-precios`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(JSON.parse(res.body))).toBe(true)
  })
})
