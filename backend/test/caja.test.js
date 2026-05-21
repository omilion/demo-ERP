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

  it('rejects movimientos on closed turno', async () => {
    const user = await app.prisma.user.findFirst()
    const turno = await app.prisma.turno.create({ data: { cajaId: 1, userId: user.id, estado: 'cerrado' } })
    const res = await app.inject({
      method: 'POST', url: `/api/caja/turno/${turno.id}/movimientos`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tipo: 'Ingreso', monto: 5000, medioPago: 'Efectivo' },
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('Turno cerrado')
    const count = await app.prisma.movimientoCaja.count({ where: { turnoId: turno.id } })
    expect(count).toBe(0)

    await app.prisma.turno.delete({ where: { id: turno.id } }).catch(() => {})
  })

  it('rejects sale payments through manual movimientos', async () => {
    const user = await app.prisma.user.findFirst()
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (existing) await app.prisma.turno.update({ where: { id: existing.id }, data: { estado: 'cerrado' } })
    const turno = await app.prisma.turno.create({ data: { cajaId: 1, userId: user.id, estado: 'abierto' } })
    const orden = await app.prisma.orden.create({
      data: {
        tipo: 'Normal',
        userId: user.id,
        estadoPago: 'No pagada',
        abono: 0,
      },
    })

    const res = await app.inject({
      method: 'POST', url: `/api/caja/turno/${turno.id}/movimientos`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tipo: 'Ingreso', monto: 5000, medioPago: 'Efectivo', ordenId: orden.id },
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('Los pagos de venta deben registrarse por cobranza')
    const unchanged = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(unchanged.abono).toBe(0)
    const movimientos = await app.prisma.movimientoCaja.count({ where: { ordenId: orden.id } })
    expect(movimientos).toBe(0)

    await app.prisma.orden.delete({ where: { id: orden.id } }).catch(() => {})
    await app.prisma.turno.update({ where: { id: turno.id }, data: { estado: 'cerrado' } }).catch(() => {})
  })
})

describe('POST /api/caja/cobranza/orden/:id/pago', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'cajero') })
  afterAll(() => app.close())

  async function createOrdenConTurno() {
    const user = await app.prisma.user.findFirst()
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (existing) await app.prisma.turno.update({ where: { id: existing.id }, data: { estado: 'cerrado' } })
    const turno = await app.prisma.turno.create({ data: { cajaId: 1, userId: user.id, estado: 'abierto' } })
    const orden = await app.prisma.orden.create({
      data: {
        tipo: 'Normal',
        userId: user.id,
        estadoPago: 'No pagada',
        abono: 0,
        items: { create: [{ productoId: 1, cantidad: 1, precioUnitario: 10000 }] },
      },
      include: { items: true },
    })
    return { turno, orden }
  }

  async function cleanup(turnoId, ordenId) {
    if (ordenId) {
      await app.prisma.movimientoCaja.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.ordenItem.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.orden.delete({ where: { id: ordenId } }).catch(() => {})
    }
    if (turnoId) await app.prisma.turno.update({ where: { id: turnoId }, data: { estado: 'cerrado' } }).catch(() => {})
  }

  it('lets cajero register payment, creates movimiento and updates venta state', async () => {
    const { turno, orden } = await createOrdenConTurno()
    const res = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: { monto: 10000, medioPago: 'Efectivo' },
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.movimiento.ordenId).toBe(orden.id)
    expect(body.movimiento.turnoId).toBe(turno.id)
    expect(body.movimiento.origenTipo).toBe('orden')
    expect(body.movimiento.origenId).toBe(orden.id)
    expect(body.orden.abono).toBe(10000)
    expect(body.orden.estadoPago).toBe('Pagada')

    await cleanup(turno.id, orden.id)
  })

  it('rejects overpayment and leaves venta unchanged', async () => {
    const { turno, orden } = await createOrdenConTurno()
    const res = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: { monto: 10001, medioPago: 'Efectivo' },
    })

    expect(res.statusCode).toBe(409)
    const unchanged = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(unchanged.abono).toBe(0)
    expect(unchanged.estadoPago).toBe('No pagada')

    await cleanup(turno.id, orden.id)
  })

  it('rejects payment when there is no open turno and leaves venta unchanged', async () => {
    const { turno, orden } = await createOrdenConTurno()
    await app.prisma.turno.update({ where: { id: turno.id }, data: { estado: 'cerrado' } })
    const res = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: { monto: 5000, medioPago: 'Efectivo' },
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('No hay turno abierto')
    const unchanged = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(unchanged.abono).toBe(0)
    expect(unchanged.estadoPago).toBe('No pagada')

    await cleanup(turno.id, orden.id)
  })
})
