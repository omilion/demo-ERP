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

describe('SPR-46 venta web / OC online', () => {
  let app
  let token
  const created = { clientes: [], productos: [], ocs: [], ordenes: [] }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = tokenFor(app)
  })

  afterAll(async () => {
    await app.prisma.movimientoBodega.deleteMany({ where: { ordenId: { in: created.ordenes } } }).catch(() => {})
    await app.prisma.ordenItem.deleteMany({ where: { ordenId: { in: created.ordenes } } }).catch(() => {})
    await app.prisma.orden.deleteMany({ where: { id: { in: created.ordenes } } }).catch(() => {})
    await app.prisma.ordenCompraOnline.deleteMany({ where: { id: { in: created.ocs } } }).catch(() => {})
    await app.prisma.producto.deleteMany({ where: { id: { in: created.productos } } }).catch(() => {})
    await app.prisma.cliente.deleteMany({ where: { id: { in: created.clientes } } }).catch(() => {})
    await app.close()
  })

  it('validates OC online monetary updates and exports filtered rows', async () => {
    const marker = `OCWEB-${Date.now()}`
    const oc = await app.prisma.ordenCompraOnline.create({
      data: { nCompra: marker, fechaHora: new Date(), emailComprador: `${marker}@cliente.cl`, total: 1000, estadoCompra: 'Pendiente', canal: 'Web' },
    })
    created.ocs.push(oc.id)

    const invalid = await app.inject({
      method: 'PUT',
      url: `/api/ordenes-compra/${oc.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { total: -1 },
    })
    expect(invalid.statusCode).toBe(400)

    const exportRes = await app.inject({
      method: 'GET',
      url: '/api/ordenes-compra/export?estado=Pendiente&canal=Web',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(exportRes.statusCode).toBe(200)
    expect(exportRes.body).toContain(marker)
  })

  it('processes an OC online into a real Venta Web with stock traceability', async () => {
    const marker = `OCWEB-PROC-${Date.now()}`
    const cliente = await app.prisma.cliente.create({ data: { rut: marker, nombre: `Cliente ${marker}`, activo: true } })
    created.clientes.push(cliente.id)
    const producto = await app.prisma.producto.create({
      data: {
        codigoInterno: `${marker}-P`,
        nombre: `Producto ${marker}`,
        activo: true,
        stock: 5,
        estadoInventario: 'Inventariado',
      },
    })
    created.productos.push(producto.id)
    const oc = await app.prisma.ordenCompraOnline.create({
      data: {
        nCompra: marker,
        fechaHora: new Date(),
        emailComprador: `${marker}@cliente.cl`,
        total: 2000,
        estadoCompra: 'Pendiente',
        canal: 'Web',
        items: { create: [{ codigoInterno: producto.codigoInterno, nombre: producto.nombre, cantidad: 2, precio: 1000 }] },
      },
    })
    created.ocs.push(oc.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/ordenes-compra/${oc.id}/procesar-venta`,
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId: cliente.id },
    })
    expect(res.statusCode).toBe(201)
    const venta = JSON.parse(res.body)
    created.ordenes.push(venta.id)
    expect(venta.tipo).toBe('Venta Web')
    expect(venta.licitacion).toBe(marker)
    expect(venta.items).toHaveLength(1)

    const updatedOc = await app.prisma.ordenCompraOnline.findUnique({ where: { id: oc.id } })
    expect(updatedOc.estadoCompra).toBe('Procesada')
    const updatedProduct = await app.prisma.producto.findUnique({ where: { id: producto.id } })
    expect(updatedProduct.stock).toBe(3)
  })

  it('soft-anuls OC online instead of deleting rows', async () => {
    const marker = `OCWEB-DEL-${Date.now()}`
    const oc = await app.prisma.ordenCompraOnline.create({
      data: { nCompra: marker, fechaHora: new Date(), emailComprador: `${marker}@cliente.cl`, total: 1000, estadoCompra: 'Pendiente', canal: 'Web' },
    })
    created.ocs.push(oc.id)

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/ordenes-compra/${oc.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(204)
    const persisted = await app.prisma.ordenCompraOnline.findUnique({ where: { id: oc.id } })
    expect(persisted.estadoCompra).toBe('Anulada')
  })
})
