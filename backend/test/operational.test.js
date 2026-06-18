import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin') {
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

async function createTestOrden(app) {
  const user = await app.prisma.user.findFirst({ select: { id: true } })
  const cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
  return app.prisma.orden.create({
    data: {
      tipo: 'Test',
      observaciones: 'Prueba',
      estado: 'Activa',
      estadoPago: 'No pagada',
      estadoEntrega: 'Pendiente entrega',
      clienteId: cliente.id,
      userId: user.id,
    },
  })
}

async function createLinkedOdt(app) {
  const orden = await createTestOrden(app)
  const odt = await app.prisma.odt.create({
    data: {
      ordenId: orden.id,
      tipo: 'Espumas',
      descripcion: 'Trabajo test',
      estado: 'Pendiente',
    },
  })
  return { orden, odt }
}

describe('operational route hardening', () => {
  let app, adminToken, cajaToken, tallerToken

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    adminToken = tokenFor(app)
    cajaToken = tokenFor(app, 'cajero')
    tallerToken = tokenFor(app, 'taller')
  })

  afterAll(async () => {
    await app.close()
  })

  it('normalizes invalid despacho page instead of raising a Prisma skip error', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/despachos?page=abc',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveProperty('items')
  })

  it('returns a clear 400 for invalid despacho dates', async () => {
    const orden = await createTestOrden(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/despachos',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ordenId: orden.id, fechaEntrega: 'no-es-fecha' },
    })
    await app.prisma.orden.delete({ where: { id: orden.id } }).catch(() => {})
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/fechaEntrega/)
  })

  it('rejects new despacho records without a linked orden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/despachos',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { fechaEntrega: new Date().toISOString() },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/ordenId/)
  })

  it('calculates caja historico stats using stored Ingreso/Egreso casing', async () => {
    const marker = `op-${Date.now()}`
    await app.prisma.movimientoCaja.deleteMany({ where: { nDoc: marker } })
    await app.prisma.movimientoCaja.create({
      data: {
        tipo: 'Ingreso',
        monto: 1234,
        medioPago: 'Efectivo',
        nDoc: marker,
        fecha: new Date(),
      },
    })

    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/caja/historico?tipo=ingreso&nDoc=${marker}`,
        headers: { authorization: `Bearer ${cajaToken}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.total).toBe(1)
      expect(body.stats.totalIngresos).toBe(1234)
      expect(body.stats.totalEgresos).toBe(0)
    } finally {
      await app.prisma.movimientoCaja.deleteMany({ where: { nDoc: marker } })
    }
  })

  it('scopes cobranza stats to the active filters', async () => {
    const rut = `99.${Date.now()}-K`
    await app.prisma.cobranzaHistorico.deleteMany({ where: { rut } })
    await app.prisma.cobranzaHistorico.createMany({
      data: [
        { rut, cliente: 'Cliente Operativo', estado: 'CANCELADA', monto: 500, valorFactura: 700, fechaFactura: new Date() },
        { rut, cliente: 'Cliente Operativo', estado: 'PENDIENTE', monto: 0, valorFactura: 300, fechaFactura: new Date() },
      ],
    })

    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/cobranza-historico?search=${encodeURIComponent(rut)}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.total).toBe(2)
      expect(body.stats).toMatchObject({
        cobrado: 500,
        pendiente: 300,
        n_canceladas: 1,
        n_pendientes: 1,
      })
    } finally {
      await app.prisma.cobranzaHistorico.deleteMany({ where: { rut } })
    }
  })

  it('does not create orphan ODT bitacora entries', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/odts/999999999/bitacora',
      headers: { authorization: `Bearer ${tallerToken}` },
      payload: { texto: 'No debe quedar huerfano' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('requires taller assignment when passing items to workshop', async () => {
    const { orden, odt } = await createLinkedOdt(app)
    const marker = `op-pt-${Date.now()}`
    const producto = await app.prisma.producto.create({
      data: {
        codigoInterno: marker,
        nombre: 'Producto transitorio operacional',
        estadoInventario: 'Transitorio',
        activo: true,
        precioLista: 1000,
      },
    })
    const item = await app.prisma.ordenItem.create({
      data: {
        ordenId: orden.id,
        productoId: producto.id,
        codigoInterno: producto.codigoInterno,
        nombre: producto.nombre,
        cantidad: 1,
        precioUnitario: 1000,
      },
    })
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pasar-taller/enviar',
        headers: { authorization: `Bearer ${tallerToken}` },
        payload: { odtId: odt.id, items: [{ ordenItemId: item.id, cantidad: 1 }] },
      })
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).error).toMatch(/talleres/)
    } finally {
      await app.prisma.odt.delete({ where: { id: odt.id } }).catch(() => {})
      await app.prisma.orden.delete({ where: { id: orden.id } }).catch(() => {})
      await app.prisma.producto.delete({ where: { id: producto.id } }).catch(() => {})
    }
  })
})
