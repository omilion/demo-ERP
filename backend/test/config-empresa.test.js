import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { isValidRut } from '../src/routes/config/index.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin') {
  return app.jwt.sign({
    id: 1,
    role,
    nombre: `QA ${role}`,
    permisosExtra: null,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

function empresaPayload(marker, overrides = {}) {
  return {
    nombre: `QA Perfil ${marker}`,
    rut: '12.345.678-5',
    razonSocial: `QA Perfil ${marker} SpA`,
    giro: 'Servicios de prueba',
    email: `perfil-${marker}@plastimar.test`,
    telefono: '+56 32 111 1111',
    direccion: 'Direccion QA 123',
    region: 'Valparaiso',
    comuna: 'Vina del Mar',
    ...overrides,
  }
}

describe('config empresa legacy perfil parity', () => {
  let app
  const marker = `spr31-${Date.now()}`
  const codeBase = 800000 + Math.floor(Date.now() % 100000)

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.prisma.empresaConfig.deleteMany({ where: { nombre: { contains: marker } } }).catch(() => {})
    await app.close()
  })

  it('validates Chilean RUT like the legacy perfil form', () => {
    expect(isValidRut('12.345.678-5')).toBe(true)
    expect(isValidRut('12345678-5')).toBe(true)
    expect(isValidRut('11.111.111-2')).toBe(false)
    expect(isValidRut('00000000-0')).toBe(false)
  })

  it('does not expose email signatures or operational locks to a user without Configuración', async () => {
    const email = `qa-config-sin-acceso-${marker}@plastimar.test`
    const user = await app.prisma.user.create({
      data: { email, passwordHash: 'x', role: 'vendedor', nombre: 'QA Sin Configuracion', activo: true },
    })
    try {
      const token = app.jwt.sign({
        id: user.id,
        role: user.role,
        nombre: user.nombre,
        permisosExtra: null,
        scope: 'erp',
        aud: 'plastimar:erp',
        tokenType: 'access',
      })
      const headers = { authorization: `Bearer ${token}` }
      expect((await app.inject({ method: 'GET', url: '/api/config/firmas', headers })).statusCode).toBe(403)
      expect((await app.inject({ method: 'GET', url: '/api/config/bloqueos', headers })).statusCode).toBe(403)
    } finally {
      await app.prisma.user.delete({ where: { id: user.id } })
    }
  })

  it('creates, lists and reads multiple company profiles with legacy fields', async () => {
    const token = tokenFor(app)
    const first = await app.inject({
      method: 'POST',
      url: '/api/config/empresas',
      headers: { authorization: `Bearer ${token}` },
      payload: empresaPayload(`${marker}-a`, { codigoEmpresa: codeBase + 1 }),
    })
    expect(first.statusCode).toBe(201)
    const firstBody = JSON.parse(first.body)
    expect(firstBody).toMatchObject({
      nombre: `QA Perfil ${marker}-a`,
      rut: '12.345.678-5',
      razonSocial: `QA Perfil ${marker}-a SpA`,
      giro: 'Servicios de prueba',
      email: `perfil-${marker}-a@plastimar.test`,
      telefono: '+56 32 111 1111',
      direccion: 'Direccion QA 123',
      region: 'Valparaiso',
      comuna: 'Vina del Mar',
      codigoEmpresa: codeBase + 1,
    })

    const second = await app.inject({
      method: 'POST',
      url: '/api/config/empresas',
      headers: { authorization: `Bearer ${token}` },
      payload: empresaPayload(`${marker}-b`, { rut: '12.345.678-5' }),
    })
    expect(second.statusCode).toBe(201)
    expect(JSON.parse(second.body).codigoEmpresa).toBeGreaterThan(0)

    const list = await app.inject({
      method: 'GET',
      url: '/api/config/empresas',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(list.statusCode).toBe(200)
    const items = JSON.parse(list.body)
    expect(items.map(item => item.nombre)).toEqual(expect.arrayContaining([
      `QA Perfil ${marker}-a`,
      `QA Perfil ${marker}-b`,
    ]))

    const detail = await app.inject({
      method: 'GET',
      url: `/api/config/empresas/${firstBody.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(detail.statusCode).toBe(200)
    expect(JSON.parse(detail.body)).toMatchObject({ id: firstBody.id, codigoEmpresa: codeBase + 1 })
  })

  it('blocks invalid RUT, short names, duplicate names and duplicate legacy codes', async () => {
    const token = tokenFor(app)
    const base = await app.inject({
      method: 'POST',
      url: '/api/config/empresas',
      headers: { authorization: `Bearer ${token}` },
      payload: empresaPayload(`${marker}-dup`, { codigoEmpresa: codeBase + 20 }),
    })
    expect(base.statusCode).toBe(201)

    const invalidRut = await app.inject({
      method: 'POST',
      url: '/api/config/empresas',
      headers: { authorization: `Bearer ${token}` },
      payload: empresaPayload(`${marker}-bad-rut`, { rut: '11.111.111-2' }),
    })
    expect(invalidRut.statusCode).toBe(400)
    expect(JSON.parse(invalidRut.body).error).toMatch(/rut invalido/)

    const shortName = await app.inject({
      method: 'POST',
      url: '/api/config/empresas',
      headers: { authorization: `Bearer ${token}` },
      payload: empresaPayload(`${marker}-short`, { nombre: 'abc' }),
    })
    expect(shortName.statusCode).toBe(400)
    expect(JSON.parse(shortName.body).error).toMatch(/nombre/)

    const duplicateName = await app.inject({
      method: 'POST',
      url: '/api/config/empresas',
      headers: { authorization: `Bearer ${token}` },
      payload: empresaPayload(`${marker}-other`, { nombre: `QA Perfil ${marker}-dup` }),
    })
    expect(duplicateName.statusCode).toBe(409)

    const duplicateCode = await app.inject({
      method: 'POST',
      url: '/api/config/empresas',
      headers: { authorization: `Bearer ${token}` },
      payload: empresaPayload(`${marker}-code`, { codigoEmpresa: codeBase + 20 }),
    })
    expect(duplicateCode.statusCode).toBe(409)
  })

  it('updates and deletes company profiles with admin-only permissions', async () => {
    const admin = tokenFor(app)
    const vendedor = tokenFor(app, 'vendedor')
    const created = await app.inject({
      method: 'POST',
      url: '/api/config/empresas',
      headers: { authorization: `Bearer ${admin}` },
      payload: empresaPayload(`${marker}-edit`, { codigoEmpresa: codeBase + 30 }),
    })
    expect(created.statusCode).toBe(201)
    const id = JSON.parse(created.body).id

    const deniedList = await app.inject({
      method: 'GET',
      url: '/api/config/empresas',
      headers: { authorization: `Bearer ${vendedor}` },
    })
    expect(deniedList.statusCode).toBe(403)

    const deniedSingleton = await app.inject({
      method: 'GET',
      url: '/api/config/empresa',
      headers: { authorization: `Bearer ${vendedor}` },
    })
    expect(deniedSingleton.statusCode).toBe(403)

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/config/empresas/${id}`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { nombre: `QA Perfil ${marker}-editado`, codigoEmpresa: codeBase + 33 },
    })
    expect(updated.statusCode).toBe(200)
    expect(JSON.parse(updated.body)).toMatchObject({ id, nombre: `QA Perfil ${marker}-editado`, codigoEmpresa: codeBase + 33 })

    const deniedDelete = await app.inject({
      method: 'DELETE',
      url: `/api/config/empresas/${id}`,
      headers: { authorization: `Bearer ${vendedor}` },
    })
    expect(deniedDelete.statusCode).toBe(403)

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/config/empresas/${id}`,
      headers: { authorization: `Bearer ${admin}` },
    })
    expect(deleted.statusCode).toBe(204)
  })
})
