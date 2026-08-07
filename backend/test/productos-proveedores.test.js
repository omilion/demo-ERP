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

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

describe('endpoints proveedores por producto', () => {
  let app, token, producto, provA, provB

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app)
    const tag = uniq()
    producto = await app.prisma.producto.create({
      data: { codigoInterno: `PP-${tag}`, nombre: `Producto PP ${tag}`, bodega: 'Inventario', precioLista: 0, stock: 0 },
    })
    provA = await app.prisma.proveedor.create({ data: { nombre: `Prov A ${tag}`, rut: `A-${tag}` } })
    provB = await app.prisma.proveedor.create({ data: { nombre: `Prov B ${tag}`, rut: `B-${tag}` } })
  })

  afterAll(async () => {
    await app.prisma.productoProveedor.deleteMany({ where: { productoId: producto.id } })
    await app.prisma.producto.delete({ where: { id: producto.id } }).catch(() => {})
    await app.prisma.proveedor.deleteMany({ where: { id: { in: [provA.id, provB.id] } } }).catch(() => {})
    await app.close()
  })

  it('pondera el costo al sumar dos proveedores (115)', async () => {
    await app.inject({
      method: 'POST', url: `/api/productos/${producto.id}/proveedores`,
      headers: { authorization: `Bearer ${token}` },
      payload: { proveedorId: provA.id, costo: 100, cantidad: 10 },
    })
    const res = await app.inject({
      method: 'POST', url: `/api/productos/${producto.id}/proveedores`,
      headers: { authorization: `Bearer ${token}` },
      payload: { proveedorId: provB.id, costo: 120, cantidad: 30 },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.stockTotal).toBe(40)
    expect(body.costoPonderado).toBe(115)
    expect(body.items).toHaveLength(2)

    const prod = await app.prisma.producto.findUnique({ where: { id: producto.id } })
    expect(prod.precioLista).toBe(115)
  })

  it('GET devuelve filas con nombre de proveedor y ponderado', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/productos/${producto.id}/proveedores`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.costoPonderado).toBe(115)
    expect(body.items.every(i => i.proveedorNombre)).toBe(true)
  })

  it('PUT recalcula el ponderado al editar costo/cantidad', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/productos/${producto.id}/proveedores/${provB.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { costo: 120, cantidad: 10 },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    // A(100x10) + B(120x10) = 2200/20 = 110
    expect(body.stockTotal).toBe(20)
    expect(body.costoPonderado).toBe(110)
  })

  it('DELETE desactiva la fila y recalcula', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/productos/${producto.id}/proveedores/${provB.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    // solo queda A(100x10)
    expect(body.stockTotal).toBe(10)
    expect(body.costoPonderado).toBe(100)
    expect(body.items).toHaveLength(1)
  })

  it('rechaza sin permiso de bodega write', async () => {
    const cajaToken = await loginAs(app, 'cajero')
    const res = await app.inject({
      method: 'POST', url: `/api/productos/${producto.id}/proveedores`,
      headers: { authorization: `Bearer ${cajaToken}` },
      payload: { proveedorId: provA.id, costo: 50, cantidad: 5 },
    })
    expect(res.statusCode).toBe(403)
  })

  it('guarda y devuelve el codigoProveedor (cruce de codigos)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/productos/${producto.id}/proveedores`,
      headers: { authorization: `Bearer ${token}` },
      payload: { proveedorId: provA.id, costo: 100, cantidad: 10, codigoProveedor: 'ABC-999' },
    })
    expect(res.statusCode).toBe(201)
    const fila = JSON.parse(res.body).items.find(i => i.proveedorId === provA.id)
    expect(fila.codigoProveedor).toBe('ABC-999')
  })

  it('rechaza mapear el mismo codigoProveedor a otro producto del mismo proveedor', async () => {
    const tag = uniq()
    const otroProducto = await app.prisma.producto.create({
      data: { codigoInterno: `PP-${tag}`, nombre: `Otro producto ${tag}`, bodega: 'Inventario', precioLista: 0, stock: 0 },
    })
    try {
      const res = await app.inject({
        method: 'POST', url: `/api/productos/${otroProducto.id}/proveedores`,
        headers: { authorization: `Bearer ${token}` },
        payload: { proveedorId: provA.id, costo: 50, cantidad: 1, codigoProveedor: 'ABC-999' },
      })
      expect(res.statusCode).toBe(409)
      expect(JSON.parse(res.body).error).toContain('ya está mapeado')
    } finally {
      await app.prisma.productoProveedor.deleteMany({ where: { productoId: otroProducto.id } })
      await app.prisma.producto.delete({ where: { id: otroProducto.id } })
    }
  })
})

describe('GET /productos/mapeo-proveedor', () => {
  let app, token, producto, proveedor

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app)
    const tag = uniq()
    producto = await app.prisma.producto.create({
      data: { codigoInterno: `SKU-${tag}`, nombre: `Producto mapeo ${tag}`, bodega: 'Inventario', precioLista: 0, stock: 0 },
    })
    proveedor = await app.prisma.proveedor.create({ data: { nombre: `Prov mapeo ${tag}`, rut: `M-${tag}` } })
    await app.prisma.productoProveedor.create({
      data: { productoId: producto.id, proveedorId: proveedor.id, costo: 10, cantidad: 0, codigoProveedor: 'PROV-XYZ' },
    })
  })

  afterAll(async () => {
    await app.prisma.productoProveedor.deleteMany({ where: { productoId: producto.id } })
    await app.prisma.producto.delete({ where: { id: producto.id } }).catch(() => {})
    await app.prisma.proveedor.delete({ where: { id: proveedor.id } }).catch(() => {})
    await app.close()
  })

  it('resuelve por mapeo guardado (codigoProveedor), sin importar mayus/minus', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/productos/mapeo-proveedor?proveedorId=${proveedor.id}&codigo=prov-xyz`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.matchType).toBe('mapeo')
    expect(body.match.id).toBe(producto.id)
  })

  it('cae a coincidencia directa por codigoInterno si no hay mapeo', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/productos/mapeo-proveedor?proveedorId=${proveedor.id}&codigo=${producto.codigoInterno}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.matchType).toBe('sku')
    expect(body.match.id).toBe(producto.id)
  })

  it('sin match devuelve null', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/productos/mapeo-proveedor?proveedorId=${proveedor.id}&codigo=NO-EXISTE-XYZ`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ match: null, matchType: null })
  })

  it('exige proveedorId y codigo', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/productos/mapeo-proveedor?codigo=X',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
  })
})
