import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, user) {
  return app.jwt.sign({
    id: user.id,
    role: user.role,
    nombre: user.nombre,
    permisosExtra: user.permisosExtra ?? null,
    sucursalId: user.sucursalId ?? null,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

describe('usuarios legacy parity and safety', () => {
  let app
  let admin
  let token
  let sucursal
  const marker = `spr43-${Date.now()}`

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    await app.prisma.user.deleteMany({ where: { email: { contains: marker } } }).catch(() => {})
    await app.prisma.sucursal.deleteMany({ where: { nombre: { contains: marker } } }).catch(() => {})
    admin = await app.prisma.user.create({
      data: { email: `${marker}-admin@plastimar.cl`, passwordHash: 'x', role: 'admin', nombre: `${marker} Admin`, activo: true },
    })
    token = tokenFor(app, admin)
    const sucursalId = 980000 + Math.floor(Date.now() % 10000)
    sucursal = await app.prisma.sucursal.upsert({
      where: { id: sucursalId },
      update: { nombre: `${marker} Sucursal`, activo: true },
      create: { id: sucursalId, nombre: `${marker} Sucursal` },
    })
  })

  afterAll(async () => {
    const users = await app.prisma.user.findMany({ where: { email: { contains: marker } }, select: { id: true } }).catch(() => [])
    await app.prisma.session.deleteMany({ where: { userId: { in: users.map(u => u.id) } } }).catch(() => {})
    await app.prisma.user.deleteMany({ where: { email: { contains: marker } } }).catch(() => {})
    await app.prisma.sucursal.deleteMany({ where: { nombre: { contains: marker } } }).catch(() => {})
    await app.close()
  })

  it('creates users with legacy fields and rejects duplicated rut or seller code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: `${marker}-vendedor@PLASTIMAR.cl`,
        password: 'secret123',
        role: 'vendedor',
        nombre: `${marker} Vendedor`,
        rut: `${marker}-rut`,
        codigoVendedor: `${marker}-cod`,
        sucursalId: sucursal.id,
        permisoDescuentos: true,
        permisosExtra: { ventas: ['read'] },
      },
    })
    expect(res.statusCode).toBe(201)
    const created = JSON.parse(res.body)
    expect(created).toMatchObject({
      email: `${marker}-vendedor@plastimar.cl`,
      rut: `${marker}-rut`,
      codigoVendedor: `${marker}-cod`,
      sucursalId: sucursal.id,
      permisoDescuentos: true,
    })
    expect(created.passwordHash).toBeUndefined()

    const dupRut = await app.inject({
      method: 'POST',
      url: '/api/usuarios',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: `${marker}-otro@plastimar.cl`,
        password: 'secret123',
        role: 'vendedor',
        nombre: `${marker} Otro`,
        rut: `${marker}-RUT`,
      },
    })
    expect(dupRut.statusCode).toBe(409)
    expect(JSON.parse(dupRut.body).error).toMatch(/rut/)

    const dupCode = await app.inject({
      method: 'POST',
      url: '/api/usuarios',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: `${marker}-cod@plastimar.cl`,
        password: 'secret123',
        role: 'vendedor',
        nombre: `${marker} Codigo`,
        codigoVendedor: `${marker}-cod`,
      },
    })
    expect(dupCode.statusCode).toBe(409)
    expect(JSON.parse(dupCode.body).error).toMatch(/codigoVendedor/)
  })

  it('validates permissions shape, soft deletes users and protects self admin deactivation', async () => {
    const user = await app.prisma.user.create({
      data: { email: `${marker}-baja@plastimar.cl`, passwordHash: 'x', role: 'bodeguero', nombre: `${marker} Baja`, activo: true },
    })

    const invalidPerms = await app.inject({
      method: 'PUT',
      url: `/api/usuarios/${user.id}/permisos`,
      headers: { authorization: `Bearer ${token}` },
      payload: { permisosExtra: { '*': ['delete'] } },
    })
    expect(invalidPerms.statusCode).toBe(400)

    const validPerms = await app.inject({
      method: 'PUT',
      url: `/api/usuarios/${user.id}/permisos`,
      headers: { authorization: `Bearer ${token}` },
      payload: { permisosExtra: { taller: ['read', 'write'] } },
    })
    expect(validPerms.statusCode).toBe(200)
    expect(JSON.parse(validPerms.body).permisosExtra).toEqual({ taller: ['read', 'write'] })

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/usuarios/${user.id}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(del.statusCode).toBe(204)
    const reloaded = await app.prisma.user.findUnique({ where: { id: user.id } })
    expect(reloaded.activo).toBe(false)

    const selfDeactivate = await app.inject({
      method: 'PUT',
      url: `/api/usuarios/${admin.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { activo: false },
    })
    expect(selfDeactivate.statusCode).toBe(409)
  })

  it('updates passwords through PUT /:id and PUT /:id/password, invalidating sessions and allowing login', async () => {
    const userEmail = `${marker}-pwd@plastimar.cl`
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/usuarios',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: userEmail,
        password: 'initialPass123',
        role: 'cajero',
        nombre: `${marker} Password User`,
      },
    })
    expect(createRes.statusCode).toBe(201)
    const user = JSON.parse(createRes.body)

    // Initial login works
    const login1 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: userEmail, password: 'initialPass123' },
    })
    expect(login1.statusCode).toBe(200)

    // Reject short password
    const shortRes = await app.inject({
      method: 'PUT',
      url: `/api/usuarios/${user.id}/password`,
      headers: { authorization: `Bearer ${token}` },
      payload: { password: '12345' },
    })
    expect(shortRes.statusCode).toBe(400)

    // Update password via PUT /:id/password
    const updatePwdRes = await app.inject({
      method: 'PUT',
      url: `/api/usuarios/${user.id}/password`,
      headers: { authorization: `Bearer ${token}` },
      payload: { password: 'secondPass456' },
    })
    expect(updatePwdRes.statusCode).toBe(200)

    // Old password fails
    const loginOld = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: userEmail, password: 'initialPass123' },
    })
    expect(loginOld.statusCode).toBe(401)

    // New password succeeds
    const login2 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: userEmail, password: 'secondPass456' },
    })
    expect(login2.statusCode).toBe(200)

    // Update password together with profile data via PUT /:id
    const updateProfileRes = await app.inject({
      method: 'PUT',
      url: `/api/usuarios/${user.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        nombre: `${marker} Pwd User Modificado`,
        cargo: 'Jefe de Caja',
        password: 'thirdPass789',
      },
    })
    expect(updateProfileRes.statusCode).toBe(200)
    const updatedUser = JSON.parse(updateProfileRes.body)
    expect(updatedUser.nombre).toBe(`${marker} Pwd User Modificado`)
    expect(updatedUser.cargo).toBe('Jefe de Caja')

    // Second password now fails
    const loginOld2 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: userEmail, password: 'secondPass456' },
    })
    expect(loginOld2.statusCode).toBe(401)

    // Third password succeeds
    const login3 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: userEmail, password: 'thirdPass789' },
    })
    expect(login3.statusCode).toBe(200)
  })
})

