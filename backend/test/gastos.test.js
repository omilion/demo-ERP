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

describe('SPR-24 gastos legacy parity', () => {
  let app
  let adminToken
  let cajeroToken
  const created = { gastos: [], movimientos: [], turnos: [] }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    adminToken = tokenFor(app, 'admin')
    cajeroToken = tokenFor(app, 'cajero')
  })

  afterAll(async () => {
    await app.prisma.movimientoCaja.deleteMany({ where: { id: { in: created.movimientos } } }).catch(() => {})
    await app.prisma.turno.deleteMany({ where: { id: { in: created.turnos } } }).catch(() => {})
    await app.prisma.gasto.deleteMany({ where: { id: { in: created.gastos } } }).catch(() => {})
    await app.close()
  })

  it('validates required name, minimum length and case-insensitive duplicates', async () => {
    const marker = `Gasto Test ${Date.now()}`
    const blank = await app.inject({
      method: 'POST',
      url: '/api/gastos',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { nombre: '   ' },
    })
    expect(blank.statusCode).toBe(400)

    const short = await app.inject({
      method: 'POST',
      url: '/api/gastos',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { nombre: 'A' },
    })
    expect(short.statusCode).toBe(400)

    const createdRes = await app.inject({
      method: 'POST',
      url: '/api/gastos',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { nombre: ` ${marker} ` },
    })
    expect(createdRes.statusCode).toBe(201)
    const gasto = JSON.parse(createdRes.body)
    created.gastos.push(gasto.id)
    expect(gasto.nombre).toBe(marker)

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/gastos',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { nombre: marker.toUpperCase() },
    })
    expect(duplicate.statusCode).toBe(409)
  })

  it('exports the complete gastos catalog as CSV', async () => {
    const marker = `Gasto Export ${Date.now()}`
    const gasto = await app.prisma.gasto.create({ data: { nombre: marker, activo: true } })
    created.gastos.push(gasto.id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/gastos/export',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.body).toContain('Nombre')
    expect(res.body).toContain(marker)
  })

  it('keeps caja history when deleting a used gasto by deactivating it', async () => {
    const gasto = await app.prisma.gasto.create({ data: { nombre: `Gasto Usado ${Date.now()}`, activo: true } })
    created.gastos.push(gasto.id)
    const movimiento = await app.prisma.movimientoCaja.create({
      data: {
        tipo: 'Egreso',
        monto: 1500,
        medioPago: 'Efectivo',
        gastoTipoId: gasto.id,
        origenTipo: 'gasto',
        origenId: gasto.id,
        usuario: 'Test admin',
      },
    })
    created.movimientos.push(movimiento.id)

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/gastos/${gasto.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.activo).toBe(false)
    expect(body.desactivadoPorUso).toBe(true)

    const persisted = await app.prisma.gasto.findUnique({ where: { id: gasto.id } })
    expect(persisted.activo).toBe(false)
    const linked = await app.prisma.movimientoCaja.findUnique({ where: { id: movimiento.id } })
    expect(linked.gastoTipoId).toBe(gasto.id)
  })

  it('requires admin for mutations while allowing caja to read active categories', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/gastos',
      headers: { authorization: `Bearer ${cajeroToken}` },
    })
    expect(list.statusCode).toBe(200)

    const create = await app.inject({
      method: 'POST',
      url: '/api/gastos',
      headers: { authorization: `Bearer ${cajeroToken}` },
      payload: { nombre: `Gasto Cajero ${Date.now()}` },
    })
    expect(create.statusCode).toBe(403)

    const exportRes = await app.inject({
      method: 'GET',
      url: '/api/gastos/export',
      headers: { authorization: `Bearer ${cajeroToken}` },
    })
    expect(exportRes.statusCode).toBe(403)
  })

  it('shows the gasto name in caja turno, historico search and caja export', async () => {
    const marker = `Gasto Caja Visible ${Date.now()}`
    const gasto = await app.prisma.gasto.create({ data: { nombre: marker, activo: true } })
    created.gastos.push(gasto.id)
    const user = await app.prisma.user.findFirst({ select: { id: true } })
    const caja = await app.prisma.caja.findFirst({ select: { id: true } })
    const turno = await app.prisma.turno.create({
      data: {
        cajaId: caja.id,
        userId: user.id,
        estado: 'abierto',
        apertura: new Date(Date.now() + 60_000),
      },
    })
    created.turnos.push(turno.id)
    const movimiento = await app.prisma.movimientoCaja.create({
      data: {
        turnoId: turno.id,
        tipo: 'Egreso',
        monto: -3200,
        medioPago: 'Efectivo',
        gastoTipoId: gasto.id,
        origenTipo: 'gasto',
        origenId: gasto.id,
        referencia: `Referencia ${marker}`,
        usuario: 'Test admin',
        fecha: new Date(),
      },
    })
    created.movimientos.push(movimiento.id)

    const turnoRes = await app.inject({
      method: 'GET',
      url: '/api/caja/turno',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(turnoRes.statusCode).toBe(200)
    const turnoBody = JSON.parse(turnoRes.body)
    expect(turnoBody.movimientos.some(m => m.id === movimiento.id && m.gastoTipo?.nombre === marker)).toBe(true)

    const histRes = await app.inject({
      method: 'GET',
      url: `/api/caja/historico?search=${encodeURIComponent(marker)}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(histRes.statusCode).toBe(200)
    const histBody = JSON.parse(histRes.body)
    expect(histBody.items.some(m => m.id === movimiento.id && m.gastoTipo?.nombre === marker)).toBe(true)

    const exportRes = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/caja?turnoId=${turno.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(exportRes.statusCode).toBe(200)
    expect(exportRes.body).toContain('Gasto')
    expect(exportRes.body).toContain(marker)
  })
})
