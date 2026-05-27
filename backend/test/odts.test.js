import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

async function createTestOrden(app) {
  const user = await app.prisma.user.findFirst({ select: { id: true } })
  const cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
  return app.prisma.orden.create({
    data: {
      tipo: 'Test',
      estado: 'Activa',
      estadoPago: 'No pagada',
      estadoEntrega: 'Pendiente entrega',
      clienteId: cliente.id,
      userId: user.id,
      nInterno: 970000000 + Math.floor(Math.random() * 100000),
    },
  })
}

describe('GET /api/odts', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'taller') })
  afterAll(() => app.close())

  it('returns list of odts', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/odts', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('items')
    expect(Array.isArray(body.items)).toBe(true)
  })

  it('cajero cannot read odts', async () => {
    const t = await loginAs(app, 'cajero')
    const res = await app.inject({ method: 'GET', url: '/api/odts', headers: { authorization: `Bearer ${t}` } })
    expect(res.statusCode).toBe(403)
  })

  it('finds ODTs by the linked order internal number', async () => {
    const orden = await createTestOrden(app)
    const odt = await app.prisma.odt.create({
      data: {
        ordenId: orden.id,
        tipo: 'Confecciones',
        clienteNombre: 'Busqueda N Interno',
        descripcion: 'ODT vinculada a venta interna',
        estado: 'Pendiente',
        eliminado: false,
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/odts?search=${orden.nInterno}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: odt.id, ordenId: orden.id, nInterno: orden.nInterno }),
    ]))

    await app.prisma.odt.delete({ where: { id: odt.id } }).catch(() => {})
    await app.prisma.orden.delete({ where: { id: orden.id } }).catch(() => {})
  })
})

describe('POST /api/odts', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'taller') })
  afterAll(() => app.close())

  it('creates odt', async () => {
    const orden = await createTestOrden(app)
    const res = await app.inject({
      method: 'POST', url: '/api/odts',
      headers: { authorization: `Bearer ${token}` },
      payload: { ordenId: orden.id, tipo: 'Espumas', clienteNombre: 'Test Cliente', descripcion: 'Prueba', estado: 'Pendiente' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.tipo).toBe('Espumas')
    if (body.id) await app.prisma.odt.delete({ where: { id: body.id } }).catch(() => {})
    await app.prisma.orden.delete({ where: { id: orden.id } }).catch(() => {})
  })

  it('rejects standalone odts without linked orden', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/odts',
      headers: { authorization: `Bearer ${token}` },
      payload: { tipo: 'Espumas', clienteNombre: 'Test Cliente', descripcion: 'Prueba', estado: 'Pendiente' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/ordenId/)
  })
})

describe('DELETE /api/odts/:id', () => {
  let app

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready() })
  afterAll(() => app.close())

  it('requires taller delete permission for destructive ODT removal', async () => {
    const token = await loginAs(app, 'taller')
    const res = await app.inject({
      method: 'DELETE', url: '/api/odts/999999',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('allows admin through the gate before returning not found', async () => {
    const token = await loginAs(app, 'admin')
    const res = await app.inject({
      method: 'DELETE', url: '/api/odts/999999',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('ODT lifecycle', () => {
  let app, tallerToken, adminToken
  const created = { odtIds: [], ordenIds: [] }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    tallerToken = await loginAs(app, 'taller')
    adminToken = await loginAs(app, 'admin')
  })
  afterAll(async () => {
    await app.prisma.odt.deleteMany({ where: { id: { in: created.odtIds } } }).catch(() => {})
    await app.prisma.orden.deleteMany({ where: { id: { in: created.ordenIds } } }).catch(() => {})
    await app.close()
  })

  it('closes an ODT with terminal state, fechaTermino and bitacora', async () => {
    const orden = await createTestOrden(app)
    created.ordenIds.push(orden.id)
    const odt = await app.prisma.odt.create({
      data: { ordenId: orden.id, tipo: 'Espumas', clienteNombre: 'Lifecycle ODT', estado: 'En proceso', eliminado: false },
    })
    created.odtIds.push(odt.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/odts/${odt.id}/cerrar`,
      headers: { authorization: `Bearer ${tallerToken}` },
      payload: { estado: 'Terminada', razon: 'Trabajo terminado', usuario: 'QA Taller' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({ id: odt.id, estado: 'Terminada', eliminado: false })
    expect(body.fechaTermino).toBeTruthy()

    await expect(app.prisma.odt.findUnique({ where: { id: odt.id } }))
      .resolves.toMatchObject({ estado: 'Terminada', eliminado: false })
    const bitacora = await app.prisma.bitacoraTaller.findFirst({ where: { odtId: odt.id, texto: { contains: 'ODT cerrada' } } })
    expect(bitacora).toBeTruthy()
  })

  it('annuls an ODT as soft delete and list respects active/deleted state', async () => {
    const orden = await createTestOrden(app)
    created.ordenIds.push(orden.id)
    const odt = await app.prisma.odt.create({
      data: { ordenId: orden.id, tipo: 'Madera', clienteNombre: 'Lifecycle Anulada', estado: 'Pendiente', eliminado: false },
    })
    created.odtIds.push(odt.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/odts/${odt.id}/anular`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { razon: 'Duplicada', usuario: 'QA Taller' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ id: odt.id, estado: 'Anulada', eliminado: true })

    await expect(app.prisma.odt.findUnique({ where: { id: odt.id } }))
      .resolves.toMatchObject({ estado: 'Anulada', eliminado: true })

    const hidden = await app.inject({
      method: 'GET',
      url: `/api/odts?search=${odt.id}`,
      headers: { authorization: `Bearer ${tallerToken}` },
    })
    expect(JSON.parse(hidden.body).items).toHaveLength(0)

    const hiddenDetail = await app.inject({
      method: 'GET',
      url: `/api/odts/${odt.id}`,
      headers: { authorization: `Bearer ${tallerToken}` },
    })
    expect(hiddenDetail.statusCode).toBe(404)

    const visible = await app.inject({
      method: 'GET',
      url: `/api/odts?includeEliminados=true&estado=Anulada&search=${odt.id}`,
      headers: { authorization: `Bearer ${tallerToken}` },
    })
    expect(JSON.parse(visible.body).items).toMatchObject([{ id: odt.id, estado: 'Anulada', eliminado: true }])
  })

  it('requires delete permission to annul through generic ODT update', async () => {
    const orden = await createTestOrden(app)
    created.ordenIds.push(orden.id)
    const odt = await app.prisma.odt.create({
      data: { ordenId: orden.id, tipo: 'Madera', clienteNombre: 'Lifecycle Put Anulada', estado: 'Pendiente', eliminado: false },
    })
    created.odtIds.push(odt.id)

    const forbidden = await app.inject({
      method: 'PUT',
      url: `/api/odts/${odt.id}`,
      headers: { authorization: `Bearer ${tallerToken}` },
      payload: { estado: 'Anulada' },
    })
    expect(forbidden.statusCode).toBe(403)

    const allowed = await app.inject({
      method: 'PUT',
      url: `/api/odts/${odt.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { estado: 'Anulada' },
    })
    expect(allowed.statusCode).toBe(200)
    expect(JSON.parse(allowed.body)).toMatchObject({ id: odt.id, estado: 'Anulada', eliminado: true })
  })
})
