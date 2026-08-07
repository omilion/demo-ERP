import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin') {
  return app.jwt.sign({
    id: 1, role, nombre: `Test ${role}`, permisosExtra: null,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })
}

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

describe('reportes movimientos anormales (descuadres por codigo alterado)', () => {
  let app, adminToken, cajeroToken, producto, vendedor, cliente
  const ordenesCreadas = []

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    adminToken = tokenFor(app, 'admin')
    cajeroToken = tokenFor(app, 'cajero')
    const tag = uniq()
    producto = await app.prisma.producto.create({
      data: { codigoInterno: `SKU-REAL-${tag}`, nombre: `Producto Real ${tag}`, bodega: 'Inventario', precioLista: 1000, stock: 50 },
    })
    vendedor = await app.prisma.user.findFirst({ where: { role: 'vendedor' } }) || await app.prisma.user.findFirst()
    cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
  })

  afterAll(async () => {
    await app.prisma.ordenItem.deleteMany({ where: { ordenId: { in: ordenesCreadas } } })
    await app.prisma.orden.deleteMany({ where: { id: { in: ordenesCreadas } } })
    await app.prisma.producto.delete({ where: { id: producto.id } }).catch(() => {})
    await app.close()
  })

  async function createOrden({ tipo = 'Normal', codigoInterno, nombre, createdAt = new Date() }) {
    const orden = await app.prisma.orden.create({
      data: {
        nInterno: 960000 + ordenesCreadas.length + Math.floor(Math.random() * 10000),
        tipo,
        clienteId: cliente?.id,
        userId: vendedor?.id || 1,
        rutCliente: `TEST-${uniq()}`,
        sucursalId: 1,
        createdAt,
        items: { create: [{ productoId: producto.id, cantidad: 2, precioUnitario: 1000, codigoInterno, nombre }] },
      },
      include: { items: true },
    })
    ordenesCreadas.push(orden.id)
    return orden
  }

  it('detecta un OrdenItem con codigo declarado distinto al del producto vinculado (paquete de licitacion)', async () => {
    const anomala = await createOrden({ tipo: 'Licitación', codigoInterno: 'PACK-LICITACION-01', nombre: 'Kit Consolidado' })
    await createOrden({ tipo: 'Normal', codigoInterno: producto.codigoInterno }) // igual al real: no es anomalia
    await createOrden({ tipo: 'Normal', codigoInterno: null }) // sin override: no es anomalia

    const res = await app.inject({
      method: 'GET', url: '/api/reportes/movimientos-anormales',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const encontrada = body.items.find(i => i.ordenId === anomala.id)
    expect(encontrada).toBeTruthy()
    expect(encontrada).toMatchObject({
      productoId: producto.id,
      codigoDeclarado: 'PACK-LICITACION-01',
      codigoReal: producto.codigoInterno,
      nombreDeclarado: 'Kit Consolidado',
      nombreReal: producto.nombre,
      motivo: 'codigo_y_nombre',
      tipo: 'Licitación',
    })
    // El vinculo real (stock) sigue siendo el producto verdadero, no el codigo declarado.
    expect(encontrada.stockActual).toBe(producto.stock)
    expect(body.items.every(i => i.codigoDeclarado !== producto.codigoInterno)).toBe(true)
  })

  it('soloLicitacion=true filtra a solo ventas tipo Licitación', async () => {
    const licitacion = await createOrden({ tipo: 'Licitación', codigoInterno: 'PACK-LIC-02' })
    const normal = await createOrden({ tipo: 'Venta directa', codigoInterno: 'CODIGO-DISTINTO-NORMAL' })

    const res = await app.inject({
      method: 'GET', url: '/api/reportes/movimientos-anormales?soloLicitacion=true',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    const body = JSON.parse(res.body)
    const ids = body.items.map(i => i.ordenId)
    expect(ids).toContain(licitacion.id)
    expect(ids).not.toContain(normal.id)
  })

  it('respeta el rango de fechas desde/hasta', async () => {
    const vieja = await createOrden({ tipo: 'Licitación', codigoInterno: 'PACK-VIEJA', createdAt: new Date('2020-01-01T00:00:00Z') })

    const res = await app.inject({
      method: 'GET', url: '/api/reportes/movimientos-anormales?desde=2026-01-01',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    const body = JSON.parse(res.body)
    expect(body.items.map(i => i.ordenId)).not.toContain(vieja.id)
  })

  it('el resumen cuenta ordenes y licitaciones unicas, no lineas', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/reportes/movimientos-anormales',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    const body = JSON.parse(res.body)
    expect(body.resumen.totalCasos).toBe(body.pager.total)
    expect(body.resumen.totalOrdenes).toBeGreaterThan(0)
    expect(body.resumen.totalLicitaciones).toBeGreaterThan(0)
  })

  it('requiere permiso de bodega:read', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/reportes/movimientos-anormales',
      headers: { authorization: `Bearer ${cajeroToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('export CSV incluye las columnas de reconciliacion', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/reportes/export/movimientos-anormales',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('csv')
    expect(res.body).toContain('Código declarado (venta)')
    expect(res.body).toContain('Código real (producto)')
  })
})
