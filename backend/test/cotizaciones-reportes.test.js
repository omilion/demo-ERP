import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

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

function tokenFor(app, role = 'admin', sucursalId = null, permisosExtra = null) {
  return app.jwt.sign({
    id: 1,
    role,
    nombre: `Test ${role}`,
    permisosExtra,
    sucursalId,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

const describeDb = hasUsableDatabaseUrl() ? describe : describe.skip

describeDb('reportes legacy de licitaciones', () => {
  let app
  const marker = `SPR35-${Date.now()}`
  const created = { cotizaciones: [], clientes: [], ordenes: [] }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.prisma.cotizacionLicitacionItem.deleteMany({ where: { cotizacionId: { in: created.cotizaciones } } }).catch(() => {})
    await app.prisma.cotizacionLicitacion.deleteMany({ where: { id: { in: created.cotizaciones } } }).catch(() => {})
    await app.prisma.ordenItem.deleteMany({ where: { ordenId: { in: created.ordenes } } }).catch(() => {})
    await app.prisma.orden.deleteMany({ where: { id: { in: created.ordenes } } }).catch(() => {})
    await app.prisma.cliente.deleteMany({ where: { id: { in: created.clientes } } }).catch(() => {})
    await app.close()
  })

  async function seedLicitaciones() {
    if (created.cotizaciones.length) return
    const cliente = await app.prisma.cliente.create({
      data: {
        rut: `${marker}-RUT`,
        nombre: `${marker} cliente`,
        razonSocial: `${marker} razon social`,
        email: `${marker.toLowerCase()}@cliente.test`,
        activo: true,
      },
    })
    created.clientes.push(cliente.id)

    const scoped = await app.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion: `${marker}-A`,
        fecha: new Date('2026-05-20T00:00:00.000Z'),
        fechaCreacion: new Date('2026-05-10T12:30:00.000Z'),
        rutCliente: cliente.rut,
        estado: 'Pendiente',
        plazo: '10 dias',
        ordenCompra: `${marker}-OC`,
        usuario: `${marker}-usuario`,
        sucursalId: 9811,
        items: {
          create: [
            { nombre: `${marker} Item A`, cantidad: 2, cantAdjudicados: 1, precio: 1000 },
            { nombre: `${marker} Item B`, cantidad: 3, cantAdjudicados: 2, precio: 500 },
          ],
        },
      },
    })
    const otherBranch = await app.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion: `${marker}-OTRA`,
        fechaCreacion: new Date('2026-05-11T12:30:00.000Z'),
        rutCliente: cliente.rut,
        estado: 'Pendiente',
        sucursalId: 9812,
        items: { create: [{ nombre: `${marker} otra sucursal`, cantidad: 1, cantAdjudicados: 0, precio: 9999 }] },
      },
    })
    created.cotizaciones.push(scoped.id, otherBranch.id)
  }

  it('filtra como legacy por fecha, estado, ID, RUT y sucursal; devuelve totales neto/IVA/total', async () => {
    await seedLicitaciones()
    const res = await app.inject({
      method: 'GET',
      url: `/api/cotizaciones/reportes?estado=Pendiente&idLicitacion=${marker}&rutCliente=${marker}-R&fechaDesde=2026-05-01&fechaHasta=2026-05-31&limit=20`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9811)}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.total).toBe(1)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].idLicitacion).toBe(`${marker}-A`)
    expect(body.items[0].clienteRazonSocial).toBe(`${marker} razon social`)
    expect(body.items[0].detalle).toContain(`${marker} Item A X 2 / Adjudicados 1`)
    expect(body.items[0].totalNeto).toBe(3500)
    expect(body.items[0].iva).toBe(665)
    expect(body.items[0].totalConIva).toBe(4165)
    expect(body.items[0].totalAdjudicado).toBe(2000)
    expect(body.stats.totalConIva).toBe(4165)
  })

  it('exporta resumen y detalle con columnas legacy y respeta scope de sucursal', async () => {
    await seedLicitaciones()
    const resumen = await app.inject({
      method: 'GET',
      url: `/api/cotizaciones/reportes/export?formato=resumen&idLicitacion=${marker}&estado=Pendiente`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9811)}` },
    })
    expect(resumen.statusCode).toBe(200)
    expect(resumen.headers['content-type']).toContain('text/csv')
    expect(resumen.body).toContain('Razon Social')
    expect(resumen.body).toContain(`${marker.toLowerCase()}@cliente.test`)
    expect(resumen.body).not.toContain(`${marker} otra sucursal`)

    const detalle = await app.inject({
      method: 'GET',
      url: `/api/cotizaciones/reportes/export?formato=detalle&idLicitacion=${marker}&estado=Pendiente`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9811)}` },
    })
    expect(detalle.statusCode).toBe(200)
    expect(detalle.body).toContain('Detalle;Cantidad;Adjudicada')
    expect(detalle.body).toContain(`${marker} Item A`)
    expect(detalle.body).toContain(`${marker} Item B`)
    expect(detalle.body).not.toContain(`${marker} otra sucursal`)
  })

  it('encuentra RUT con o sin puntos y guion como en legacy', async () => {
    const rut = `76.105.${String(Date.now()).slice(-3)}-7`
    const rutSinFormato = rut.replace(/[^0-9Kk]/g, '')
    const cliente = await app.prisma.cliente.create({
      data: { rut, nombre: `${marker} rut cliente`, razonSocial: `${marker} rut razon`, activo: true },
    })
    const cot = await app.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion: `${marker}-RUT-FORMAT`,
        rutCliente: rut,
        estado: 'Pendiente',
        sucursalId: 9811,
        items: { create: [{ nombre: `${marker} rut item`, cantidad: 1, cantAdjudicados: 0, precio: 1000 }] },
      },
    })
    created.clientes.push(cliente.id)
    created.cotizaciones.push(cot.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/cotizaciones/reportes?rutCliente=${rutSinFormato}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9811)}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.items.some(item => item.idLicitacion === `${marker}-RUT-FORMAT`)).toBe(true)
  })

  it('mantiene permisos de licitaciones para reporte y exportacion', async () => {
    await seedLicitaciones()
    const denied = await app.inject({
      method: 'GET',
      url: '/api/cotizaciones/reportes',
      headers: { authorization: `Bearer ${tokenFor(app, 'cajero', 9811)}` },
    })
    expect(denied.statusCode).toBe(403)

    const allowed = await app.inject({
      method: 'GET',
      url: `/api/cotizaciones/reportes/export?formato=detalle&idLicitacion=${marker}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'solo_lectura', 9811)}` },
    })
    expect(allowed.statusCode).toBe(200)
  })

  it('detecta ventas legacy por orden.licitacion aunque cotizacion.ordenId este vacio', async () => {
    const legacyMarker = `${marker}-LEGACY`
    const cliente = await app.prisma.cliente.create({
      data: { rut: `${legacyMarker}-RUT`, nombre: `${legacyMarker} cliente`, activo: true },
    })
    created.clientes.push(cliente.id)
    const cot = await app.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion: legacyMarker,
        estado: 'Adjudicada',
        sucursalId: 9811,
        rutCliente: cliente.rut,
        items: { create: [{ nombre: `${legacyMarker} item`, cantidad: 1, cantAdjudicados: 1, precio: 1000 }] },
      },
    })
    const orden = await app.prisma.orden.create({
      data: {
        tipo: 'Licitacion',
        licitacion: legacyMarker,
        clienteId: cliente.id,
        rutCliente: cliente.rut,
        userId: 1,
        sucursalId: 9811,
        creadorNombre: legacyMarker,
      },
    })
    created.cotizaciones.push(cot.id)
    created.ordenes.push(orden.id)

    const report = await app.inject({
      method: 'GET',
      url: `/api/cotizaciones/reportes?idLicitacion=${legacyMarker}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9811)}` },
    })
    expect(report.statusCode).toBe(200)
    const body = JSON.parse(report.body)
    expect(body.items[0].ordenId).toBe(orden.id)
    expect(body.items[0].ventaVinculada).toBe(true)

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/cotizaciones/${cot.id}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9811)}` },
    })
    expect(del.statusCode).toBe(409)
    expect(JSON.parse(del.body).error).toMatch(/venta vinculada/)
  })
})
