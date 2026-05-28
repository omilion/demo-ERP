import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

describe('SPR-11 cobranza cliente filters', () => {
  let app
  let token
  const created = { historicos: [], clientes: [], productos: [], ordenes: [], movimientos: [] }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = tokenFor(app)
  })

  afterAll(async () => {
    await app.prisma.movimientoCaja.deleteMany({ where: { id: { in: created.movimientos } } }).catch(() => {})
    await app.prisma.ordenItem.deleteMany({ where: { ordenId: { in: created.ordenes } } }).catch(() => {})
    await app.prisma.movimientoBodega.deleteMany({ where: { ordenId: { in: created.ordenes } } }).catch(() => {})
    await app.prisma.orden.deleteMany({ where: { id: { in: created.ordenes } } }).catch(() => {})
    await app.prisma.producto.deleteMany({ where: { id: { in: created.productos } } }).catch(() => {})
    await app.prisma.cliente.deleteMany({ where: { id: { in: created.clientes } } }).catch(() => {})
    await app.prisma.cobranzaHistorico.deleteMany({ where: { id: { in: created.historicos } } }).catch(() => {})
    await app.close()
  })

  it('filters historical cobranza by date field, document number and internal number', async () => {
    const marker = Math.floor(Date.now() % 1000000000)
    const row = await app.prisma.cobranzaHistorico.create({
      data: {
        cliente: `Cliente Cobranza ${marker}`,
        rut: `76${marker}-K`,
        ndoc: marker,
        interno: marker + 1,
        estado: 'PENDIENTE',
        valorFactura: 5000,
        fechaFactura: new Date('2026-05-10T12:00:00Z'),
        fechaPago: new Date('2026-05-20T12:00:00Z'),
      },
    })
    created.historicos.push(row.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/cobranza-historico?fechaCampo=fechaPago&fechaDesde=2026-05-01&fechaHasta=2026-05-31&ndoc=${marker}&interno=${marker + 1}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.items.some(i => i.id === row.id)).toBe(true)

    const exportRes = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/cobranza?fechaCampo=fechaPago&fechaDesde=2026-05-01&fechaHasta=2026-05-31&ndoc=${marker}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(exportRes.statusCode).toBe(200)
    expect(exportRes.body).toContain(String(marker))
  })

  it('filters active cobranza by sale date and referenced document fields', async () => {
    const marker = `COB-ACT-${Date.now()}`
    const cliente = await app.prisma.cliente.create({ data: { rut: marker, nombre: `Cliente ${marker}`, activo: true } })
    created.clientes.push(cliente.id)
    const producto = await app.prisma.producto.create({
      data: { codigoInterno: `${marker}-P`, nombre: `Producto ${marker}`, activo: true },
    })
    created.productos.push(producto.id)
    const orden = await app.prisma.orden.create({
      data: {
        nInterno: Math.floor(Date.now() % 1000000000),
        tipo: 'Normal',
        estadoPago: 'No pagada',
        clienteId: cliente.id,
        rutCliente: cliente.rut,
        userId: 1,
        creadorNombre: `Vendedor ${marker}`,
        createdAt: new Date('2026-05-12T12:00:00Z'),
        items: { create: [{ productoId: producto.id, cantidad: 1, precioUnitario: 5000, codigoInterno: producto.codigoInterno, nombre: producto.nombre }] },
      },
    })
    created.ordenes.push(orden.id)
    const mov = await app.prisma.movimientoCaja.create({
      data: {
        tipo: 'Ingreso',
        monto: 5000,
        medioPago: 'Referencial',
        documento: 'Factura Plast',
        nDoc: marker,
        ordenId: orden.id,
        fecha: new Date('2026-05-13T12:00:00Z'),
      },
    })
    created.movimientos.push(mov.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/ventas?estadoPago=No%20pagada&fechaDesde=2026-05-01&fechaHasta=2026-05-31&documento=Factura&nDoc=${marker}&fechaDocDesde=2026-05-13&fechaDocHasta=2026-05-13&creador=${encodeURIComponent(marker)}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.items.some(i => i.id === orden.id)).toBe(true)
  })
})
