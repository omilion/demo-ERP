import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, { role = 'admin', sucursalId = 9821, nombre = `QA ${role}`, permisosExtra = null } = {}) {
  return app.jwt.sign({
    id: 1,
    role,
    nombre,
    permisosExtra,
    sucursalId,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

async function ensureSucursal(app, id, nombre) {
  return app.prisma.sucursal.upsert({
    where: { id },
    update: { nombre, activo: true },
    create: { id, nombre, activo: true },
  })
}

let seq = 1

async function createOrdenAndOdt(app, marker, sucursalId) {
  const localMarker = `${marker}-${seq++}`
  const user = await app.prisma.user.findFirst({ select: { id: true } })
  const cliente = await app.prisma.cliente.create({
    data: {
      rut: `bt-${localMarker}`,
      nombre: `Cliente ${localMarker}`,
      razonSocial: `Cliente ${localMarker}`,
      email: `bt-${localMarker}@test.local`,
      activo: true,
    },
  })
  const orden = await app.prisma.orden.create({
    data: {
      tipo: 'Test',
      estado: 'Activa',
      estadoPago: 'No pagada',
      estadoEntrega: 'Pendiente entrega',
      clienteId: cliente.id,
      rutCliente: cliente.rut,
      userId: user.id,
      sucursalId,
    },
  })
  const odt = await app.prisma.odt.create({
    data: {
      ordenId: orden.id,
      tipo: 'Espumas',
      clienteNombre: cliente.nombre,
      descripcion: `ODT ${localMarker}`,
      estado: 'Pendiente',
      sucursalId,
    },
  })
  return { cliente, orden, odt }
}

describe('bitacora taller legacy parity', () => {
  let app
  const base = 9821
  const marker = `spr02-${Date.now()}`
  const created = { clienteIds: [], ordenIds: [], odtIds: [], userIds: [] }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    await Promise.all([
      ensureSucursal(app, base, `Sucursal QA A ${marker}`),
      ensureSucursal(app, base + 1, `Sucursal QA B ${marker}`),
    ])
  })

  afterAll(async () => {
    await app.prisma.bitacoraTaller.deleteMany({ where: { texto: { contains: marker } } }).catch(() => {})
    await app.prisma.odt.deleteMany({ where: { id: { in: created.odtIds } } }).catch(() => {})
    await app.prisma.orden.deleteMany({ where: { id: { in: created.ordenIds } } }).catch(() => {})
    await app.prisma.cliente.deleteMany({ where: { id: { in: created.clienteIds } } }).catch(() => {})
    await app.prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => {})
    await app.close()
  })

  it('creates standalone daily entries with selected operator, reporter and sucursal scope', async () => {
    const token = tokenFor(app, { role: 'taller', sucursalId: base, nombre: 'Encargado QA' })
    const otherToken = tokenFor(app, { role: 'taller', sucursalId: base + 1, nombre: 'Otro Encargado' })

    const create = await app.inject({
      method: 'POST',
      url: '/api/bitacora-taller',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        usuario: `Operario ${marker}`,
        fecha: '2026-05-20',
        texto: `${marker} actividad diaria sin odt`,
      },
    })
    expect(create.statusCode).toBe(201)
    const createdEntry = JSON.parse(create.body)
    expect(createdEntry).toMatchObject({
      odtId: null,
      usuario: `Operario ${marker}`,
      usuarioReporta: 'Encargado QA',
      sucursalId: base,
      texto: `${marker} actividad diaria sin odt`,
    })

    const sameSucursal = await app.inject({
      method: 'GET',
      url: `/api/bitacora-taller?search=${marker}&desde=2026-05-01&hasta=2026-05-31`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(sameSucursal.statusCode).toBe(200)
    expect(JSON.parse(sameSucursal.body).items).toEqual([
      expect.objectContaining({ id: createdEntry.id, sucursalNombre: `Sucursal QA A ${marker}` }),
    ])

    const otherSucursal = await app.inject({
      method: 'GET',
      url: `/api/bitacora-taller?search=${marker}`,
      headers: { authorization: `Bearer ${otherToken}` },
    })
    expect(otherSucursal.statusCode).toBe(200)
    expect(JSON.parse(otherSucursal.body).items).toHaveLength(0)
  })

  it('updates operator/date/text without rewriting the original reporter', async () => {
    const entry = await app.prisma.bitacoraTaller.create({
      data: {
        usuario: `Operario original ${marker}`,
        usuarioReporta: 'Reporta original',
        sucursalId: base,
        fecha: new Date('2026-05-21T12:00:00Z'),
        texto: `${marker} antes de editar`,
      },
    })
    const token = tokenFor(app, { role: 'taller', sucursalId: base })
    const wrongSucursal = tokenFor(app, { role: 'taller', sucursalId: base + 1 })

    const blocked = await app.inject({
      method: 'PUT',
      url: `/api/bitacora-taller/${entry.id}`,
      headers: { authorization: `Bearer ${wrongSucursal}` },
      payload: { texto: `${marker} no debe editar` },
    })
    expect(blocked.statusCode).toBe(404)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/bitacora-taller/${entry.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        usuario: `Operario editado ${marker}`,
        fecha: '2026-05-22',
        texto: `${marker} editado`,
        usuarioReporta: 'No debe cambiar',
      },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({
      usuario: `Operario editado ${marker}`,
      usuarioReporta: 'Reporta original',
      texto: `${marker} editado`,
    })
  })

  it('exports all filtered scoped rows with legacy columns and sucursal', async () => {
    await app.prisma.bitacoraTaller.createMany({
      data: [
        {
          usuario: `Export A ${marker}`,
          usuarioReporta: 'Reporta A',
          sucursalId: base,
          fecha: new Date('2026-05-23T12:00:00Z'),
          texto: `${marker} export visible`,
        },
        {
          usuario: `Export B ${marker}`,
          usuarioReporta: 'Reporta B',
          sucursalId: base + 1,
          fecha: new Date('2026-05-23T12:00:00Z'),
          texto: `${marker} export oculto`,
        },
      ],
    })
    const res = await app.inject({
      method: 'GET',
      url: `/api/bitacora-taller/export?search=${marker}&desde=2026-05-01&hasta=2026-05-31`,
      headers: { authorization: `Bearer ${tokenFor(app, { role: 'taller', sucursalId: base })}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.body).toContain('Operario;Fecha reporte;Detalle Actividades;Reporta Encargado;Sucursal')
    expect(res.body).toContain(`${marker} export visible`)
    expect(res.body).toContain(`Sucursal QA A ${marker}`)
    expect(res.body).not.toContain(`${marker} export oculto`)
  })

  it('filters operator exactly and resolves legacy login labels when possible', async () => {
    const login = `legacyop${seq++}`
    const user = await app.prisma.user.create({
      data: {
        email: `${login}@plastimar.cl`,
        passwordHash: 'x',
        role: 'taller',
        nombre: `Legacy Operario ${marker}`,
        sucursalId: base,
      },
    })
    created.userIds.push(user.id)
    await app.prisma.bitacoraTaller.createMany({
      data: [
        {
          usuario: login,
          usuarioReporta: 'Reporta exacto',
          sucursalId: base,
          fecha: new Date('2026-05-25T12:00:00Z'),
          texto: `${marker} filtro exacto visible`,
        },
        {
          usuario: `${login}-otro`,
          usuarioReporta: 'Reporta exacto',
          sucursalId: base,
          fecha: new Date('2026-05-25T12:00:00Z'),
          texto: `${marker} filtro exacto oculto`,
        },
      ],
    })

    const token = tokenFor(app, { role: 'taller', sucursalId: base })
    const list = await app.inject({
      method: 'GET',
      url: `/api/bitacora-taller?operario=${encodeURIComponent(login)}&desde=2026-05-01&hasta=2026-05-31`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(list.statusCode).toBe(200)
    const items = JSON.parse(list.body).items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      usuario: login,
      usuarioLabel: `Legacy Operario ${marker}`,
      texto: `${marker} filtro exacto visible`,
    })

    const exportRes = await app.inject({
      method: 'GET',
      url: `/api/bitacora-taller/export?operario=${encodeURIComponent(login)}&desde=2026-05-01&hasta=2026-05-31`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(exportRes.statusCode).toBe(200)
    expect(exportRes.body).toContain(`Legacy Operario ${marker}`)
    expect(exportRes.body).not.toContain(`${marker} filtro exacto oculto`)
  })

  it('requires delete permission for destructive removal', async () => {
    const entry = await app.prisma.bitacoraTaller.create({
      data: {
        usuario: `Delete ${marker}`,
        usuarioReporta: 'Reporta delete',
        sucursalId: base,
        fecha: new Date('2026-05-24T12:00:00Z'),
        texto: `${marker} delete target`,
      },
    })
    const tallerToken = tokenFor(app, { role: 'taller', sucursalId: base })
    const adminToken = tokenFor(app, { role: 'admin', sucursalId: base })

    const denied = await app.inject({
      method: 'DELETE',
      url: `/api/bitacora-taller/${entry.id}`,
      headers: { authorization: `Bearer ${tallerToken}` },
    })
    expect(denied.statusCode).toBe(403)

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/bitacora-taller/${entry.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(deleted.statusCode).toBe(200)
    await expect(app.prisma.bitacoraTaller.findUnique({ where: { id: entry.id } })).resolves.toBeNull()
  })

  it('keeps ODT bitacora entries dated and scoped to the ODT sucursal', async () => {
    const fixture = await createOrdenAndOdt(app, marker, base)
    created.clienteIds.push(fixture.cliente.id)
    created.ordenIds.push(fixture.orden.id)
    created.odtIds.push(fixture.odt.id)
    const token = tokenFor(app, { role: 'taller', sucursalId: base, nombre: 'Tecnico QA' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/odts/${fixture.odt.id}/bitacora`,
      headers: { authorization: `Bearer ${token}` },
      payload: { texto: `${marker} nota odt` },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({
      odtId: fixture.odt.id,
      usuario: 'Tecnico QA',
      usuarioReporta: 'Tecnico QA',
      sucursalId: base,
      texto: `${marker} nota odt`,
    })
    expect(body.fecha).toBeTruthy()
  })

  it('blocks ODT detail and lifecycle actions across sucursals', async () => {
    const fixture = await createOrdenAndOdt(app, marker, base + 1)
    created.clienteIds.push(fixture.cliente.id)
    created.ordenIds.push(fixture.orden.id)
    created.odtIds.push(fixture.odt.id)

    const tallerToken = tokenFor(app, { role: 'taller', sucursalId: base })
    const adminToken = tokenFor(app, { role: 'admin', sucursalId: base })

    const detail = await app.inject({
      method: 'GET',
      url: `/api/odts/${fixture.odt.id}`,
      headers: { authorization: `Bearer ${tallerToken}` },
    })
    expect(detail.statusCode).toBe(404)

    const cerrar = await app.inject({
      method: 'POST',
      url: `/api/odts/${fixture.odt.id}/cerrar`,
      headers: { authorization: `Bearer ${tallerToken}` },
      payload: { estado: 'Terminada', razon: 'No autorizado' },
    })
    expect(cerrar.statusCode).toBe(404)

    const anular = await app.inject({
      method: 'POST',
      url: `/api/odts/${fixture.odt.id}/anular`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { razon: 'No autorizado' },
    })
    expect(anular.statusCode).toBe(404)

    const eliminar = await app.inject({
      method: 'DELETE',
      url: `/api/odts/${fixture.odt.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { razon: 'No autorizado' },
    })
    expect(eliminar.statusCode).toBe(404)

    await expect(app.prisma.odt.findUnique({ where: { id: fixture.odt.id } }))
      .resolves.toMatchObject({ estado: 'Pendiente', eliminado: false })
  })
})
