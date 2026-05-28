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

describe('SPR-06 cargo transporte legacy parity', () => {
  let app
  let token
  const marker = `Cargo Transporte QA ${Date.now()}`

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = tokenFor(app)
  })

  afterAll(async () => {
    await app.prisma.cargoTransporte.deleteMany({ where: { nombre: { contains: marker } } }).catch(() => {})
    await app.close()
  })

  it('validates percentage value and duplicate zone names', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/cargo-transporte',
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre: marker, valor: 150 },
    })
    expect(invalid.statusCode).toBe(400)

    const created = await app.inject({
      method: 'POST',
      url: '/api/cargo-transporte',
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre: marker, valor: 12.5 },
    })
    expect(created.statusCode).toBe(201)

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/cargo-transporte',
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre: marker.toUpperCase(), valor: 10 },
    })
    expect(duplicate.statusCode).toBe(409)
  })

  it('exports and deactivates instead of physically deleting', async () => {
    const cargo = await app.prisma.cargoTransporte.create({ data: { nombre: `${marker} Export`, valor: 8, activo: true } })

    const exportRes = await app.inject({
      method: 'GET',
      url: '/api/cargo-transporte/export',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(exportRes.statusCode).toBe(200)
    expect(exportRes.headers['content-type']).toContain('text/csv')
    expect(exportRes.body).toContain('Valor en % aplicado a la Venta')
    expect(exportRes.body).toContain(`${marker} Export`)

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/cargo-transporte/${cargo.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(del.statusCode).toBe(200)
    expect(JSON.parse(del.body).activo).toBe(false)

    const persisted = await app.prisma.cargoTransporte.findUnique({ where: { id: cargo.id } })
    expect(persisted.activo).toBe(false)
  })
})
