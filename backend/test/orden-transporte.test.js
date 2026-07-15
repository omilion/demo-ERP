import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

async function loginAs(app, role = 'admin', sucursalId = null, permisosExtra = null) {
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

describe('ordenes de transporte', () => {
  let app

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready() })
  afterAll(() => app.close())

  async function createInventariado(marker, stock = 10) {
    return app.prisma.producto.create({
      data: {
        codigoInterno: `${marker}-${Math.random().toString(36).slice(2, 8)}`,
        nombre: `${marker} Producto`,
        activo: true,
        stock,
        estadoInventario: 'Inventariado',
      },
    })
  }

  async function cleanup({ ordenIds = [], productoIds = [] } = {}) {
    if (ordenIds.length) {
      await app.prisma.ordenTransporte.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.movimientoCaja.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.movimientoBodega.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.guiaDespacho.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.despacho.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.multa.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.ordenItem.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.ordenCargo.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.orden.deleteMany({ where: { id: { in: ordenIds } } }).catch(() => {})
    }
    if (productoIds.length) {
      await app.prisma.movimientoBodega.deleteMany({ where: { productoId: { in: productoIds } } }).catch(() => {})
      await app.prisma.producto.deleteMany({ where: { id: { in: productoIds } } }).catch(() => {})
    }
  }

  async function createVentaSala({ producto, cantidad = 1, precioUnitario = 1000 }) {
    const cliente = await app.prisma.cliente.findFirst()
    const token = await loginAs(app, 'vendedor', 9401)
    const res = await app.inject({
      method: 'POST',
      url: '/api/ventas',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        tipo: 'Venta Sala',
        clienteId: cliente.id,
        items: [{ productoId: producto.id, cantidad, precioUnitario }],
      },
    })
    return { res, token }
  }

  it('crea, lista y borra una orden de transporte', async () => {
    const marker = `TEST-OT-${Date.now()}`
    const producto = await createInventariado(marker, 5)
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      const { res: ventaRes } = await createVentaSala({ producto, cantidad: 1 })
      expect(ventaRes.statusCode).toBe(201)
      const venta = JSON.parse(ventaRes.body)
      created.ordenIds.push(venta.id)

      const token = await loginAs(app, 'admin')

      const crear = await app.inject({
        method: 'POST',
        url: `/api/ventas/${venta.id}/ordenes-transporte`,
        headers: { authorization: `Bearer ${token}` },
        payload: { numero: 'OT-1234', fecha: '2026-07-15', transportista: 'Starken' },
      })
      expect(crear.statusCode).toBe(201)
      const ot = JSON.parse(crear.body)
      expect(ot.numero).toBe('OT-1234')
      expect(ot.transportista).toBe('Starken')

      const listar = await app.inject({
        method: 'GET',
        url: `/api/ventas/${venta.id}/ordenes-transporte`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(listar.statusCode).toBe(200)
      expect(JSON.parse(listar.body).items).toHaveLength(1)

      const detalleVenta = await app.inject({
        method: 'GET',
        url: `/api/ventas/${venta.id}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(JSON.parse(detalleVenta.body).ordenesTransporte).toHaveLength(1)

      const borrar = await app.inject({
        method: 'DELETE',
        url: `/api/ventas/ordenes-transporte/${ot.id}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(borrar.statusCode).toBe(204)
    } finally {
      await cleanup(created)
    }
  })

  it('rechaza crear orden de transporte sin numero/fecha/transportista', async () => {
    const marker = `TEST-OT-VALID-${Date.now()}`
    const producto = await createInventariado(marker, 5)
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      const { res: ventaRes } = await createVentaSala({ producto, cantidad: 1 })
      const venta = JSON.parse(ventaRes.body)
      created.ordenIds.push(venta.id)
      const token = await loginAs(app, 'admin')

      const res = await app.inject({
        method: 'POST',
        url: `/api/ventas/${venta.id}/ordenes-transporte`,
        headers: { authorization: `Bearer ${token}` },
        payload: { numero: '', fecha: '2026-07-15', transportista: 'Starken' },
      })
      expect(res.statusCode).toBe(400)
    } finally {
      await cleanup(created)
    }
  })
})
