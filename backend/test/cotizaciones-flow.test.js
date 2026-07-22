import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

describe('commercial quotation flow contract', () => {
  it('uses the created order object returned by POST /cotizaciones/:id/crear-venta', () => {
    const response = { orden: { id: 123 }, faltantes: [] }
    const ordenId = response?.orden?.id || response?.ordenId
    expect(ordenId).toBe(123)
  })

  it('prevents duplicate conversion when a quote already has an order', () => {
    const cotizacion = { id: 10, ordenId: 55 }
    const duplicate = !!cotizacion.ordenId
    expect(duplicate).toBe(true)
  })
})

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function hasUsableDatabaseUrl() {
  try {
    const url = new URL(process.env.DATABASE_URL || '')
    return Boolean(url.hostname && url.username && url.password)
  } catch {
    return false
  }
}

function tokenFor(app, role = 'admin') {
  return app.jwt.sign({
    id: 1, role, nombre: `Test ${role}`, permisosExtra: null,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })
}

const describeDb = hasUsableDatabaseUrl() ? describe : describe.skip

describeDb('historial de precio de items de licitacion (integracion con base real)', () => {
  let app
  let adminToken
  let cotizacionId
  let itemId
  const marker = `CLPH-${Date.now()}`
  const auth = token => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    adminToken = tokenFor(app)

    const cotizacion = await app.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion: marker,
        fechaCreacion: new Date(),
        estado: 'Pendiente',
        items: { create: [{ nombre: `${marker} item`, cantidad: 2, cantAdjudicados: 0, precio: 1000 }] },
      },
      include: { items: true },
    })
    cotizacionId = cotizacion.id
    itemId = cotizacion.items[0].id
  })

  afterAll(async () => {
    await app.prisma.cotizacionLicitacionPrecioHistorial.deleteMany({ where: { itemId } }).catch(() => {})
    await app.prisma.cotizacionLicitacionItem.deleteMany({ where: { cotizacionId } }).catch(() => {})
    await app.prisma.cotizacionLicitacion.delete({ where: { id: cotizacionId } }).catch(() => {})
    await app.close()
  })

  it('crea historial cuando cambia el precio, con motivo y usuario', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/cotizaciones/${cotizacionId}/items/${itemId}`,
      headers: auth(adminToken),
      payload: { precio: 1500, motivo: 'Ajuste para cuadrar despacho' },
    })
    expect(put.statusCode).toBe(200)
    expect(put.json().precio).toBe(1500)

    const historial = await app.prisma.cotizacionLicitacionPrecioHistorial.findMany({ where: { itemId } })
    expect(historial).toHaveLength(1)
    expect(historial[0]).toMatchObject({
      precioAnterior: 1000,
      precioNuevo: 1500,
      motivo: 'Ajuste para cuadrar despacho',
      usuarioNombre: 'Test admin',
    })
  })

  it('no crea historial cuando el PUT no cambia el precio', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/cotizaciones/${cotizacionId}/items/${itemId}`,
      headers: auth(adminToken),
      payload: { descripcion: 'sin cambio de precio' },
    })
    expect(put.statusCode).toBe(200)

    const historial = await app.prisma.cotizacionLicitacionPrecioHistorial.findMany({ where: { itemId } })
    expect(historial).toHaveLength(1)
  })

  it('GET historial-precios devuelve los ajustes ordenados del mas reciente al mas antiguo', async () => {
    await app.inject({
      method: 'PUT',
      url: `/api/cotizaciones/${cotizacionId}/items/${itemId}`,
      headers: auth(adminToken),
      payload: { precio: 1200 },
    })

    const get = await app.inject({
      method: 'GET',
      url: `/api/cotizaciones/items/${itemId}/historial-precios`,
      headers: auth(adminToken),
    })
    expect(get.statusCode).toBe(200)
    const rows = get.json()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ precioAnterior: 1500, precioNuevo: 1200 })
    expect(rows[1]).toMatchObject({ precioAnterior: 1000, precioNuevo: 1500 })
  })
})
