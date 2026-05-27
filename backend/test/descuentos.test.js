import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin', permisosExtra = null) {
  return app.jwt.sign({
    id: 1,
    role,
    nombre: `Test ${role}`,
    permisosExtra,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

describe('descuentos catalogos', () => {
  let app
  let adminToken
  const createdMarco = []
  const createdNormales = []

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    adminToken = tokenFor(app, 'admin')
  })

  afterAll(async () => {
    await app.prisma.descuentoPorcMarco.deleteMany({ where: { id: { in: createdMarco } } }).catch(() => {})
    await app.prisma.descuentoPorc.deleteMany({ where: { id: { in: createdNormales } } }).catch(() => {})
    await app.close()
  })

  it('crea, modifica, lista y elimina descuentos Convenio Marco', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/descuentos/marco',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { valor: 1.8 },
    })
    expect(create.statusCode).toBe(201)
    const created = JSON.parse(create.body)
    createdMarco.push(created.id)
    expect(created.valor).toBe(1.8)

    const update = await app.inject({
      method: 'PUT',
      url: `/api/descuentos/marco/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { valor: '2.5' },
    })
    expect(update.statusCode).toBe(200)
    expect(JSON.parse(update.body).valor).toBe(2.5)

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/descuentos/marco',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { valor: 2.5 },
    })
    expect(duplicate.statusCode).toBe(409)
    expect(JSON.parse(duplicate.body).error).toMatch(/ya existe/)

    const list = await app.inject({
      method: 'GET',
      url: '/api/descuentos',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(list.statusCode).toBe(200)
    expect(JSON.parse(list.body).marco.some(d => d.id === created.id && d.valor === 2.5)).toBe(true)

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/descuentos/marco/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(del.statusCode).toBe(204)

    const afterDelete = await app.inject({
      method: 'GET',
      url: '/api/descuentos',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(JSON.parse(afterDelete.body).marco.some(d => d.id === created.id)).toBe(false)
  })

  it('valida porcentajes y permisos al administrar descuentos', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/descuentos/marco',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { valor: 'abc' },
    })
    expect(invalid.statusCode).toBe(400)
    expect(JSON.parse(invalid.body).error).toMatch(/entre 0 y 100|valor requerido/)

    const decimalNormal = await app.inject({
      method: 'POST',
      url: '/api/descuentos/normales',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { valor: 4.5 },
    })
    expect(decimalNormal.statusCode).toBe(400)
    expect(JSON.parse(decimalNormal.body).error).toMatch(/entero/)

    const vendedorToken = tokenFor(app, 'vendedor')
    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/descuentos/marco',
      headers: { authorization: `Bearer ${vendedorToken}` },
      payload: { valor: 3 },
    })
    expect(forbidden.statusCode).toBe(403)

    const ventasDeleteToken = tokenFor(app, 'vendedor', { ventas: ['delete'] })
    const deleteOnly = await app.inject({
      method: 'POST',
      url: '/api/descuentos/normales',
      headers: { authorization: `Bearer ${ventasDeleteToken}` },
      payload: { valor: 5 },
    })
    expect(deleteOnly.statusCode).toBe(403)

    let allowedValor = 4
    while (await app.prisma.descuentoPorc.findFirst({ where: { valor: allowedValor, activo: true } })) {
      allowedValor += 1
    }
    const extraToken = tokenFor(app, 'vendedor', { descuentos: ['write'] })
    const allowed = await app.inject({
      method: 'POST',
      url: '/api/descuentos/normales',
      headers: { authorization: `Bearer ${extraToken}` },
      payload: { valor: allowedValor },
    })
    expect(allowed.statusCode).toBe(201)
    createdNormales.push(JSON.parse(allowed.body).id)

    let discountOnlyValor = allowedValor + 1
    while (await app.prisma.descuentoPorc.findFirst({ where: { valor: discountOnlyValor, activo: true } })) {
      discountOnlyValor += 1
    }
    const discountOnlyToken = tokenFor(app, 'cajero', { descuentos: ['write'] })
    const discountOnly = await app.inject({
      method: 'POST',
      url: '/api/descuentos/normales',
      headers: { authorization: `Bearer ${discountOnlyToken}` },
      payload: { valor: discountOnlyValor },
    })
    expect(discountOnly.statusCode).toBe(201)
    createdNormales.push(JSON.parse(discountOnly.body).id)
  })
})
