import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

async function loginAs(app, role = 'taller') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

describe('GET /api/odts adjunta imagen de producto para la vista de taller', () => {
  let app, token, producto, centroCosto, odt

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app)
  })

  afterAll(async () => {
    if (odt) await app.prisma.odt.delete({ where: { id: odt.id } }).catch(() => {})
    if (centroCosto) await app.prisma.centroCosto.delete({ where: { id: centroCosto.id } }).catch(() => {})
    if (producto) await app.prisma.producto.delete({ where: { id: producto.id } }).catch(() => {})
    await app.close()
  })

  it('devuelve foto chica y grande normalizadas dentro de cada item', async () => {
    const marker = `TEST-ODT-FOTO-${Date.now()}`
    producto = await app.prisma.producto.create({
      data: {
        codigoInterno: `${marker}-PROD`,
        nombre: `${marker} producto`,
        fotoUrl: '/uploads/productos/chicas/test.jpg',
        fotoUrlGrande: '/uploads/productos/grandes/test.jpg',
      },
    })
    centroCosto = await app.prisma.centroCosto.create({
      data: { codigo: `${marker}-CC`, nombre: `${marker} centro de costo` },
    })
    odt = await app.prisma.odt.create({
      data: { centroCostoId: centroCosto.id, clienteNombre: marker, descripcion: `${marker} descripcion`, estado: 'Pendiente' },
    })
    await app.prisma.odtItem.create({
      data: { odtId: odt.id, productoId: producto.id, nombre: producto.nombre, codigoInterno: producto.codigoInterno, cantidad: 1 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/odts?search=${encodeURIComponent(marker)}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].items[0].producto).toMatchObject({
      id: producto.id,
      fotoUrl: '/uploads/fotos_chicas/test.jpg',
      fotoUrlGrande: '/uploads/fotos_grandes/test.jpg',
    })
  })
})
