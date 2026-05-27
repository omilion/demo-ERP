import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { createErpAccessTokenPayload } from '../src/plugins/jwt.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin', sucursalId = null) {
  return app.jwt.sign(createErpAccessTokenPayload({
    id: 1,
    role,
    nombre: `QA ${role}`,
    sucursalId,
    permisosExtra: null,
  }))
}

async function createSucursal(app, id, nombre) {
  return app.prisma.sucursal.upsert({
    where: { id },
    update: { nombre, activo: true },
    create: { id, nombre, activo: true },
  })
}

describe('SPR-12 cobranza y pagos proveedores', () => {
  let app
  const marker = `SPR12-${Date.now()}`
  const base = 820000 + (Date.now() % 10000)
  const created = { sucursales: [], proveedores: [], pagos: [], ordenes: [], cobranzas: [] }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.prisma.cobranzaHistorico.deleteMany({ where: { id: { in: created.cobranzas } } }).catch(() => {})
    await app.prisma.orden.deleteMany({ where: { id: { in: created.ordenes } } }).catch(() => {})
    await app.prisma.pagoProveedor.deleteMany({ where: { id: { in: created.pagos } } }).catch(() => {})
    await app.prisma.proveedor.deleteMany({ where: { id: { in: created.proveedores } } }).catch(() => {})
    await app.prisma.sucursal.deleteMany({ where: { id: { in: created.sucursales } } }).catch(() => {})
    await app.close()
  })

  it('scopes pagos-proveedores list, detail, export and mutations by sucursal', async () => {
    const sucA = await createSucursal(app, base, `${marker} A`)
    const sucB = await createSucursal(app, base + 1, `${marker} B`)
    created.sucursales.push(sucA.id, sucB.id)
    const proveedor = await app.prisma.proveedor.create({
      data: { nombre: `${marker} Proveedor`, rut: `${base}-K`, codigoProveedor: base, activo: true },
    })
    created.proveedores.push(proveedor.id)
    const pagoA = await app.prisma.pagoProveedor.create({
      data: { proveedorId: proveedor.id, sucursalId: sucA.id, documento: 'Factura', nDoc: `${marker}-A`, estado: 'Pendiente', total: 1000, usuario: 'QA A' },
    })
    const pagoB = await app.prisma.pagoProveedor.create({
      data: { proveedorId: proveedor.id, sucursalId: sucB.id, documento: 'Factura', nDoc: `${marker}-B`, estado: 'Pendiente', total: 2000, usuario: 'QA B' },
    })
    const pagoGlobal = await app.prisma.pagoProveedor.create({
      data: { proveedorId: proveedor.id, documento: 'Factura', nDoc: `${marker}-GLOBAL`, estado: 'Pendiente', total: 3000, usuario: 'QA Global' },
    })
    const pagoGasto = await app.prisma.pagoProveedor.create({
      data: {
        proveedorId: proveedor.id,
        sucursalId: sucA.id,
        documento: 'Factura',
        nDoc: `${marker}-GASTO`,
        estado: 'Pendiente',
        total: 5000,
        usuario: 'QA Gasto',
        bodega: 'GTransporte',
        detallesFactura: {
          create: [{ codigoInterno: `${marker}-NO-STOCK`, destino: 'producto', cantidad: 1, precio: 5000 }],
        },
      },
    })
    created.pagos.push(pagoA.id, pagoB.id, pagoGlobal.id, pagoGasto.id)
    const tokenA = tokenFor(app, 'admin', sucA.id)
    const tokenB = tokenFor(app, 'admin', sucB.id)

    const list = await app.inject({
      method: 'GET',
      url: `/api/pagos-proveedores?search=${marker}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(list.statusCode).toBe(200)
    const body = JSON.parse(list.body)
    expect(body.items.map(i => i.nDoc)).toContain(`${marker}-A`)
    expect(body.items.map(i => i.nDoc)).not.toContain(`${marker}-B`)
    expect(body.items.map(i => i.nDoc)).not.toContain(`${marker}-GLOBAL`)
    expect(body.stats.facturasNoPagadas).toBeGreaterThanOrEqual(1)

    const exportRes = await app.inject({
      method: 'GET',
      url: `/api/pagos-proveedores/export?search=${marker}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(exportRes.statusCode).toBe(200)
    expect(exportRes.body).toContain(`${marker}-A`)
    expect(exportRes.body).not.toContain(`${marker}-B`)

    const blockedDetail = await app.inject({
      method: 'GET',
      url: `/api/pagos-proveedores/${pagoA.id}`,
      headers: { authorization: `Bearer ${tokenB}` },
    })
    expect(blockedDetail.statusCode).toBe(404)

    const blockedGlobalUpdate = await app.inject({
      method: 'PUT',
      url: `/api/pagos-proveedores/${pagoGlobal.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { obs: 'no debe modificar global' },
    })
    expect(blockedGlobalUpdate.statusCode).toBe(404)

    const blockedGlobalStock = await app.inject({
      method: 'POST',
      url: `/api/stock-ingresos/aplicar/${pagoGlobal.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(blockedGlobalStock.statusCode).toBe(404)

    const blockedGastoStock = await app.inject({
      method: 'POST',
      url: `/api/stock-ingresos/aplicar/${pagoGasto.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(blockedGastoStock.statusCode).toBe(400)
    expect(JSON.parse(blockedGastoStock.body).error).toMatch(/no permite aplicar stock/)

    const missingReasonDelete = await app.inject({
      method: 'DELETE',
      url: `/api/pagos-proveedores/${pagoA.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(missingReasonDelete.statusCode).toBe(400)
    expect(JSON.parse(missingReasonDelete.body).error).toMatch(/Motivo/)

    const blockedDelete = await app.inject({
      method: 'DELETE',
      url: `/api/pagos-proveedores/${pagoA.id}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { motivo: 'scope test' },
    })
    expect(blockedDelete.statusCode).toBe(404)
  })

  it('keeps legacy provider payment routes behind proveedores permissions and scope', async () => {
    const suc = await createSucursal(app, base + 2, `${marker} C`)
    created.sucursales.push(suc.id)
    const proveedor = await app.prisma.proveedor.create({
      data: { nombre: `${marker} Legacy Provider`, rut: `${base + 2}-K`, codigoProveedor: base + 2, activo: true },
    })
    created.proveedores.push(proveedor.id)
    const pago = await app.prisma.pagoProveedor.create({
      data: { proveedorId: proveedor.id, sucursalId: suc.id, documento: 'Boleta', nDoc: `${marker}-LEG`, estado: 'Pendiente', total: 4000 },
    })
    created.pagos.push(pago.id)

    const vendedor = tokenFor(app, 'vendedor', suc.id)
    const detail = await app.inject({
      method: 'GET',
      url: `/api/proveedores/${proveedor.id}`,
      headers: { authorization: `Bearer ${vendedor}` },
    })
    expect(detail.statusCode).toBe(403)

    const pagos = await app.inject({
      method: 'GET',
      url: `/api/proveedores/${proveedor.id}/pagos`,
      headers: { authorization: `Bearer ${vendedor}` },
    })
    expect(pagos.statusCode).toBe(403)
  })

  it('scopes cobranza historico and export through linked venta sucursal', async () => {
    const sucA = await createSucursal(app, base + 3, `${marker} D`)
    const sucB = await createSucursal(app, base + 4, `${marker} E`)
    created.sucursales.push(sucA.id, sucB.id)
    const user = await app.prisma.user.findFirst({ select: { id: true } })
    const cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
    const ordenA = await app.prisma.orden.create({
      data: { tipo: 'Normal', userId: user.id, clienteId: cliente.id, sucursalId: sucA.id, nInterno: base + 300, estadoPago: 'No pagada' },
    })
    const ordenB = await app.prisma.orden.create({
      data: { tipo: 'Normal', userId: user.id, clienteId: cliente.id, sucursalId: sucB.id, nInterno: base + 301, estadoPago: 'No pagada' },
    })
    created.ordenes.push(ordenA.id, ordenB.id)
    const cobA = await app.prisma.cobranzaHistorico.create({
      data: { ordenId: ordenA.id, interno: ordenA.nInterno, cliente: `${marker} Cliente A`, rut: `${base + 3}-K`, estado: 'PENDIENTE', valorFactura: 111, fechaFactura: new Date() },
    })
    const cobB = await app.prisma.cobranzaHistorico.create({
      data: { ordenId: ordenB.id, interno: ordenB.nInterno, cliente: `${marker} Cliente B`, rut: `${base + 4}-K`, estado: 'PENDIENTE', valorFactura: 222, fechaFactura: new Date() },
    })
    created.cobranzas.push(cobA.id, cobB.id)
    const tokenA = tokenFor(app, 'admin', sucA.id)

    const list = await app.inject({
      method: 'GET',
      url: `/api/cobranza-historico?search=${marker}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(list.statusCode).toBe(200)
    const body = JSON.parse(list.body)
    expect(body.items.map(i => i.cliente)).toContain(`${marker} Cliente A`)
    expect(body.items.map(i => i.cliente)).not.toContain(`${marker} Cliente B`)

    const exportRes = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/cobranza?search=${marker}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(exportRes.statusCode).toBe(200)
    expect(exportRes.body).toContain(`${marker} Cliente A`)
    expect(exportRes.body).not.toContain(`${marker} Cliente B`)
  })
})
