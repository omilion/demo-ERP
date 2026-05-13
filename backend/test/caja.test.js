import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

describe('GET /api/caja/turno', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'cajero') })
  afterAll(() => app.close())

  it('returns null or active turno', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/caja/turno', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body === null || body.estado === 'abierto').toBe(true)
  })

  it('rrhh cannot access caja', async () => {
    const t = await loginAs(app, 'rrhh')
    const res = await app.inject({ method: 'GET', url: '/api/caja/turno', headers: { authorization: `Bearer ${t}` } })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/caja/turno (abrir)', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'cajero') })
  afterAll(() => app.close())

  it('opens a turno', async () => {
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (existing) await app.prisma.turno.update({ where: { id: existing.id }, data: { estado: 'cerrado' } })

    const res = await app.inject({
      method: 'POST', url: '/api/caja/turno',
      headers: { authorization: `Bearer ${token}` },
      payload: { cajaId: 1 },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.estado).toBe('abierto')
    await app.prisma.turno.update({ where: { id: body.id }, data: { estado: 'cerrado' } }).catch(() => {})
  })
})

describe('POST /api/caja/turno (conflicto)', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'cajero') })
  afterAll(() => app.close())

  it('returns 409 if turno already open', async () => {
    const user = await app.prisma.user.findFirst()
    const userId = user.id
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    let turnoId = existing?.id
    if (!existing) {
      const nuevo = await app.prisma.turno.create({ data: { cajaId: 1, userId, estado: 'abierto' } })
      turnoId = nuevo.id
    }
    const res = await app.inject({
      method: 'POST', url: '/api/caja/turno',
      headers: { authorization: `Bearer ${token}` },
      payload: { cajaId: 1 },
    })
    expect(res.statusCode).toBe(409)
    // cleanup
    if (turnoId) await app.prisma.turno.update({ where: { id: turnoId }, data: { estado: 'cerrado' } }).catch(() => {})
  })
})

describe('POST /api/caja/turno/:id/cerrar', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'cajero') })
  afterAll(() => app.close())

  it('closes an open turno', async () => {
    const user = await app.prisma.user.findFirst()
    const userId = user.id
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (existing) await app.prisma.turno.update({ where: { id: existing.id }, data: { estado: 'cerrado' } })
    const nuevo = await app.prisma.turno.create({ data: { cajaId: 1, userId, estado: 'abierto' } })
    const res = await app.inject({
      method: 'POST', url: `/api/caja/turno/${nuevo.id}/cerrar`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).estado).toBe('cerrado')
  })

  it('returns 400 if already closed', async () => {
    const user = await app.prisma.user.findFirst()
    const userId = user.id
    const closed = await app.prisma.turno.create({ data: { cajaId: 1, userId, estado: 'cerrado' } })
    const res = await app.inject({
      method: 'POST', url: `/api/caja/turno/${closed.id}/cerrar`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
    // cleanup
    await app.prisma.turno.delete({ where: { id: closed.id } }).catch(() => {})
  })
})

describe('POST /api/caja/turno/:id/movimientos', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'cajero') })
  afterAll(() => app.close())

  it('creates movimiento on open turno', async () => {
    const user = await app.prisma.user.findFirst()
    const userId = user.id
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (existing) await app.prisma.turno.update({ where: { id: existing.id }, data: { estado: 'cerrado' } })
    const turno = await app.prisma.turno.create({ data: { cajaId: 1, userId, estado: 'abierto' } })
    const res = await app.inject({
      method: 'POST', url: `/api/caja/turno/${turno.id}/movimientos`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tipo: 'Ingreso', monto: 5000, medioPago: 'Efectivo' },
    })
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body).monto).toBe(5000)
    // cleanup
    await app.prisma.turno.update({ where: { id: turno.id }, data: { estado: 'cerrado' } }).catch(() => {})
  })
})
