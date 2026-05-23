import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

async function loginAs(app, role = 'admin') {
  return app.jwt.sign({
    id: 1,
    role,
    nombre: `Test ${role}`,
    permisosExtra: null,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
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
    expect(body).toHaveProperty('items')
    expect(Array.isArray(body.items)).toBe(true)
    if (body.items.length > 0) {
      expect(body.items[0]).toHaveProperty('total')
      expect(body.items[0]).toHaveProperty('cliente')
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

describe('GET /api/ventas/:id', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('returns venta with total and cliente', async () => {
    const listRes = await app.inject({ method: 'GET', url: '/api/ventas', headers: { authorization: `Bearer ${token}` } })
    const { items: ventas } = JSON.parse(listRes.body)
    if (ventas.length === 0) return
    const id = ventas[0].id
    const res = await app.inject({ method: 'GET', url: `/api/ventas/${id}`, headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('total')
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ventas/999999', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(404)
  })
})

describe('PUT /api/ventas/:id', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('updates estadoPago and returns total', async () => {
    const listRes = await app.inject({ method: 'GET', url: '/api/ventas', headers: { authorization: `Bearer ${token}` } })
    const { items: ventas } = JSON.parse(listRes.body)
    if (ventas.length === 0) return
    const id = ventas[0].id
    const res = await app.inject({
      method: 'PUT', url: `/api/ventas/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { estadoPago: 'Pagada' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveProperty('total')
  })

  it('replaces items and returns recalculated total', async () => {
    const marker = `TEST-VENTA-ITEMS-${Date.now()}`
    const created = { productos: [], ordenId: null }
    try {
      const [cliente, user] = await Promise.all([
        app.prisma.cliente.findFirst(),
        app.prisma.user.findFirst(),
      ])
      const productos = await Promise.all([
        app.prisma.producto.create({ data: { codigoInterno: `${marker}-A`, nombre: `${marker} A`, activo: true } }),
        app.prisma.producto.create({ data: { codigoInterno: `${marker}-B`, nombre: `${marker} B`, activo: true } }),
      ])
      created.productos = productos.map(p => p.id)
      const orden = await app.prisma.orden.create({
        data: {
          tipo: 'Normal',
          clienteId: cliente.id,
          userId: user.id,
          descuentoPct: 0,
          items: { create: [{ productoId: productos[0].id, cantidad: 1, precioUnitario: 1000 }] },
        },
      })
      created.ordenId = orden.id

      const res = await app.inject({
        method: 'PUT', url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          descuentoPct: 10,
          items: [
            { productoId: productos[0].id, cantidad: 2, precioUnitario: 5000 },
            { productoId: productos[1].id, cantidad: 1, precioUnitario: 10000 },
          ],
        },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.items).toHaveLength(2)
      expect(body.total).toBe(18000)
      const dbItems = await app.prisma.ordenItem.findMany({ where: { ordenId: orden.id }, orderBy: { productoId: 'asc' } })
      expect(dbItems.map(i => [i.productoId, i.cantidad, i.precioUnitario])).toEqual([
        [productos[0].id, 2, 5000],
        [productos[1].id, 1, 10000],
      ])
    } finally {
      if (created.ordenId) {
        await app.prisma.ordenItem.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
      }
      if (created.productos.length) {
        await app.prisma.producto.deleteMany({ where: { id: { in: created.productos } } }).catch(() => {})
      }
    }
  })

  it('updates metadata without replacing delivered items', async () => {
    const marker = `TEST-VENTA-DELIVERED-META-${Date.now()}`
    const created = { productos: [], ordenId: null }
    try {
      const [cliente, user] = await Promise.all([
        app.prisma.cliente.findFirst(),
        app.prisma.user.findFirst(),
      ])
      const producto = await app.prisma.producto.create({
        data: { codigoInterno: `${marker}-A`, nombre: `${marker} A`, activo: true },
      })
      created.productos = [producto.id]
      const orden = await app.prisma.orden.create({
        data: {
          tipo: 'Normal',
          clienteId: cliente.id,
          userId: user.id,
          descuentoPct: 0,
          items: {
            create: [{
              productoId: producto.id,
              cantidad: 3,
              nEntregados: 1,
              precioUnitario: 7000,
            }],
          },
        },
      })
      created.ordenId = orden.id

      const res = await app.inject({
        method: 'PUT', url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { observaciones: marker, estadoPago: 'Parcial' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.observaciones).toBe(marker)
      expect(body.estadoPago).toBe('Parcial')
      expect(body.items).toHaveLength(1)
      expect(body.items[0].productoId).toBe(producto.id)
      expect(body.items[0].cantidad).toBe(3)
      expect(body.items[0].nEntregados).toBe(1)
      expect(body.total).toBe(21000)
      const dbItems = await app.prisma.ordenItem.findMany({ where: { ordenId: orden.id } })
      expect(dbItems).toHaveLength(1)
      expect(dbItems[0].productoId).toBe(producto.id)
      expect(dbItems[0].nEntregados).toBe(1)
    } finally {
      if (created.ordenId) {
        await app.prisma.ordenItem.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
      }
      if (created.productos.length) {
        await app.prisma.producto.deleteMany({ where: { id: { in: created.productos } } }).catch(() => {})
      }
    }
  })

  it('rejects replacing items with unknown product and keeps existing items', async () => {
    const marker = `TEST-VENTA-UNKNOWN-${Date.now()}`
    const created = { productos: [], ordenId: null }
    try {
      const [cliente, user] = await Promise.all([
        app.prisma.cliente.findFirst(),
        app.prisma.user.findFirst(),
      ])
      const active = await app.prisma.producto.create({ data: { codigoInterno: `${marker}-A`, nombre: `${marker} A`, activo: true } })
      created.productos = [active.id]
      const orden = await app.prisma.orden.create({
        data: {
          tipo: 'Normal',
          clienteId: cliente.id,
          userId: user.id,
          items: { create: [{ productoId: active.id, cantidad: 3, precioUnitario: 7000 }] },
        },
      })
      created.ordenId = orden.id

      const res = await app.inject({
        method: 'PUT', url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { items: [{ productoId: active.id + 1000000, cantidad: 1, precioUnitario: 1000 }] },
      })

      expect(res.statusCode).toBe(404)
      const dbItems = await app.prisma.ordenItem.findMany({ where: { ordenId: orden.id } })
      expect(dbItems).toHaveLength(1)
      expect(dbItems[0].productoId).toBe(active.id)
      expect(dbItems[0].cantidad).toBe(3)
    } finally {
      if (created.ordenId) {
        await app.prisma.ordenItem.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
      }
      if (created.productos.length) {
        await app.prisma.producto.deleteMany({ where: { id: { in: created.productos } } }).catch(() => {})
      }
    }
  })

  it('rejects replacing items with inactive product and keeps existing items', async () => {
    const marker = `TEST-VENTA-INACTIVE-${Date.now()}`
    const created = { productos: [], ordenId: null }
    try {
      const [cliente, user] = await Promise.all([
        app.prisma.cliente.findFirst(),
        app.prisma.user.findFirst(),
      ])
      const active = await app.prisma.producto.create({ data: { codigoInterno: `${marker}-A`, nombre: `${marker} A`, activo: true } })
      const inactive = await app.prisma.producto.create({ data: { codigoInterno: `${marker}-I`, nombre: `${marker} I`, activo: false } })
      created.productos = [active.id, inactive.id]
      const orden = await app.prisma.orden.create({
        data: {
          tipo: 'Normal',
          clienteId: cliente.id,
          userId: user.id,
          items: { create: [{ productoId: active.id, cantidad: 3, precioUnitario: 7000 }] },
        },
      })
      created.ordenId = orden.id

      const res = await app.inject({
        method: 'PUT', url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { items: [{ productoId: inactive.id, cantidad: 1, precioUnitario: 1000 }] },
      })

      expect(res.statusCode).toBe(400)
      const dbItems = await app.prisma.ordenItem.findMany({ where: { ordenId: orden.id } })
      expect(dbItems).toHaveLength(1)
      expect(dbItems[0].productoId).toBe(active.id)
      expect(dbItems[0].cantidad).toBe(3)
    } finally {
      if (created.ordenId) {
        await app.prisma.ordenItem.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
      }
      if (created.productos.length) {
        await app.prisma.producto.deleteMany({ where: { id: { in: created.productos } } }).catch(() => {})
      }
    }
  })

  it('rejects an empty items replacement', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/ventas/1',
      headers: { authorization: `Bearer ${token}` },
      payload: { items: [] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/ventas/999999',
      headers: { authorization: `Bearer ${token}` },
      payload: { estadoPago: 'Pagada' },
    })
    expect(res.statusCode).toBe(404)
  })
})
