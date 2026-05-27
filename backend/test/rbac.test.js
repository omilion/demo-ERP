import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import { can } from '../src/middleware/rbac.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function signErpToken(app, payload = {}) {
  return app.jwt.sign({
    id: 999,
    role: 'vendedor',
    nombre: 'Test RBAC',
    permisosExtra: null,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
    ...payload,
  })
}

describe('RBAC permissions map', () => {
  it('allows bodeguero to use proveedores payments permissions', () => {
    expect(can('bodeguero', 'proveedores', 'read')).toBe(true)
    expect(can('bodeguero', 'proveedores', 'write')).toBe(true)
  })

  it('matches frontend read access for reportes module', () => {
    for (const role of ['vendedor', 'bodeguero', 'cajero', 'taller', 'solo_lectura']) {
      expect(can(role, 'reportes', 'read')).toBe(true)
      expect(can(role, 'reportes', 'write')).toBe(false)
    }
  })

  it('allows bodeguero to manage dispatch without granting sales writes', () => {
    expect(can('bodeguero', 'despacho', 'read')).toBe(true)
    expect(can('bodeguero', 'despacho', 'write')).toBe(true)
    expect(can('bodeguero', 'despacho', 'delete')).toBe(false)
    expect(can('bodeguero', 'ventas', 'write')).toBe(false)
  })

  it('does not grant proveedores write to vendedor', () => {
    expect(can('vendedor', 'proveedores', 'write')).toBe(false)
  })

  it('keeps cobranza history readable through ventas and payments through cobranza write', () => {
    expect(can('vendedor', 'ventas', 'read')).toBe(true)
    expect(can('vendedor', 'cobranza', 'write')).toBe(false)
    expect(can('cajero', 'cobranza', 'write')).toBe(true)
  })

  it('keeps sensitive deletes admin-only by default', () => {
    expect(can('vendedor', 'ventas', 'delete')).toBe(false)
    expect(can('vendedor', 'clientes', 'delete')).toBe(false)
    expect(can('taller', 'taller', 'delete')).toBe(false)
    expect(can('bodeguero', 'bodega', 'delete')).toBe(false)
    expect(can('bodeguero', 'catalogo', 'delete')).toBe(false)
    expect(can('cajero', 'caja', 'delete')).toBe(false)
    expect(can('admin', 'ventas', 'delete')).toBe(true)
    expect(can('admin', 'clientes', 'delete')).toBe(true)
    expect(can('admin', 'taller', 'delete')).toBe(true)
    expect(can('admin', 'bodega', 'delete')).toBe(true)
    expect(can('admin', 'caja', 'delete')).toBe(true)
  })

  it('keeps admin surfaces strict when extra permissions are disabled', () => {
    expect(can('admin', 'usuarios', 'write', null, { allowExtra: false })).toBe(true)
    expect(can('admin', 'config', 'delete', null, { allowExtra: false })).toBe(true)
    expect(can('admin', 'admin', 'read', null, { allowExtra: false })).toBe(true)
    expect(can('vendedor', 'admin', 'read', { admin: ['read'] }, { allowExtra: false })).toBe(false)
  })

  it('still supports scoped delegated permissions when allowed', () => {
    expect(can('vendedor', 'ventas', 'delete', { ventas: ['delete'] })).toBe(true)
    expect(can('vendedor', 'admin', 'read', { admin: ['read'] })).toBe(true)
  })
})

describe('RBAC middleware', () => {
  let app

  beforeAll(async () => {
    app = buildApp({ logger: false })

    app.get(
      '/api/test/ventas',
      { preHandler: [app.authenticate, app.rbac('ventas', 'read')] },
      async () => ({ ok: true })
    )
    app.get(
      '/api/test/ventas-write',
      { preHandler: [app.authenticate, app.rbac('ventas', 'write')] },
      async () => ({ ok: true })
    )
    app.get(
      '/api/test/ventas-delete',
      { preHandler: [app.authenticate, app.rbac('ventas', 'delete')] },
      async () => ({ ok: true })
    )
    app.get(
      '/api/test/caja-delete',
      { preHandler: [app.authenticate, app.rbac('caja', 'delete')] },
      async () => ({ ok: true })
    )
    app.get(
      '/api/test/admin-strict',
      { preHandler: [app.authenticate, app.rbac('admin', 'read', { allowExtra: false })] },
      async () => ({ ok: true })
    )
    app.get(
      '/api/test/bodega',
      { preHandler: [app.authenticate, app.rbac('bodega', 'write')] },
      async () => ({ ok: true })
    )
    app.get(
      '/api/test/proveedores',
      { preHandler: [app.authenticate, app.rbac('proveedores', 'write')] },
      async () => ({ ok: true })
    )

    await app.ready()
  })

  afterAll(() => app.close())

  it('admin can access ventas', async () => {
    const token = signErpToken(app, { role: 'admin' })
    const res = await app.inject({
      method: 'GET', url: '/api/test/ventas',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('vendedor can access ventas', async () => {
    const token = signErpToken(app, { role: 'vendedor' })
    const res = await app.inject({
      method: 'GET', url: '/api/test/ventas',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('bodeguero cannot write ventas', async () => {
    const token = signErpToken(app, { role: 'bodeguero' })
    const res = await app.inject({
      method: 'GET', url: '/api/test/ventas-write',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('bodeguero can write bodega', async () => {
    const token = signErpToken(app, { role: 'bodeguero' })
    const res = await app.inject({
      method: 'GET', url: '/api/test/bodega',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('bodeguero can write proveedores payments module', async () => {
    const token = signErpToken(app, { role: 'bodeguero' })
    const res = await app.inject({
      method: 'GET', url: '/api/test/proveedores',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('vendedor cannot write proveedores payments module', async () => {
    const token = signErpToken(app, { role: 'vendedor' })
    const res = await app.inject({
      method: 'GET', url: '/api/test/proveedores',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('vendedor cannot delete ventas without delegated permission', async () => {
    const token = signErpToken(app, { role: 'vendedor' })
    const res = await app.inject({
      method: 'GET', url: '/api/test/ventas-delete',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('cajero cannot delete caja movements by default', async () => {
    const token = signErpToken(app, { role: 'cajero' })
    const res = await app.inject({
      method: 'GET', url: '/api/test/caja-delete',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('allows scoped extra permission on operational modules', async () => {
    const token = signErpToken(app, { permisosExtra: { ventas: ['delete'] } })
    const res = await app.inject({
      method: 'GET', url: '/api/test/ventas-delete',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('does not allow extra permissions on strict admin routes', async () => {
    const token = signErpToken(app, { permisosExtra: { admin: ['read'], '*': ['read'] } })
    const res = await app.inject({
      method: 'GET', url: '/api/test/admin-strict',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/test/ventas' })
    expect(res.statusCode).toBe(401)
  })
})
