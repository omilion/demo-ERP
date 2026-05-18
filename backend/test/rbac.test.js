import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import { can } from '../src/middleware/rbac.js'

async function loginAs(app, role) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

describe('RBAC permissions map', () => {
  it('allows bodeguero to use proveedores payments permissions', () => {
    expect(can('bodeguero', 'proveedores', 'read')).toBe(true)
    expect(can('bodeguero', 'proveedores', 'write')).toBe(true)
  })

  it('allows bodeguero to manage dispatch without granting sales writes', () => {
    expect(can('bodeguero', 'despacho', 'read')).toBe(true)
    expect(can('bodeguero', 'despacho', 'write')).toBe(true)
    expect(can('bodeguero', 'ventas', 'write')).toBe(false)
  })

  it('does not grant proveedores write to vendedor', () => {
    expect(can('vendedor', 'proveedores', 'write')).toBe(false)
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
    const token = await loginAs(app, 'admin')
    const res = await app.inject({
      method: 'GET', url: '/api/test/ventas',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('vendedor can access ventas', async () => {
    const token = await loginAs(app, 'vendedor')
    const res = await app.inject({
      method: 'GET', url: '/api/test/ventas',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('bodeguero cannot access ventas', async () => {
    const token = await loginAs(app, 'bodeguero')
    const res = await app.inject({
      method: 'GET', url: '/api/test/ventas',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('bodeguero can write bodega', async () => {
    const token = await loginAs(app, 'bodeguero')
    const res = await app.inject({
      method: 'GET', url: '/api/test/bodega',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('bodeguero can write proveedores payments module', async () => {
    const token = await loginAs(app, 'bodeguero')
    const res = await app.inject({
      method: 'GET', url: '/api/test/proveedores',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('vendedor cannot write proveedores payments module', async () => {
    const token = await loginAs(app, 'vendedor')
    const res = await app.inject({
      method: 'GET', url: '/api/test/proveedores',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/test/ventas' })
    expect(res.statusCode).toBe(401)
  })
})
