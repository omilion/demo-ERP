import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import { createErpAccessTokenPayload } from '../src/plugins/jwt.js'

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
  let app, token, adminToken

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app, 'cajero')
    adminToken = await loginAs(app, 'admin')
  })
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

  it('rejects invalid movimiento amounts and does not write caja rows', async () => {
    const user = await app.prisma.user.findFirst()
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (existing) await app.prisma.turno.update({ where: { id: existing.id }, data: { estado: 'cerrado' } })
    const turno = await app.prisma.turno.create({ data: { cajaId: 1, userId: user.id, estado: 'abierto' } })
    const before = await app.prisma.movimientoCaja.count({ where: { turnoId: turno.id } })

    const res = await app.inject({
      method: 'POST', url: `/api/caja/turno/${turno.id}/movimientos`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tipo: 'Ingreso', monto: 0, medioPago: 'Efectivo' },
    })

    expect(res.statusCode).toBe(400)
    const after = await app.prisma.movimientoCaja.count({ where: { turnoId: turno.id } })
    expect(after).toBe(before)

    await app.prisma.turno.update({ where: { id: turno.id }, data: { estado: 'cerrado' } }).catch(() => {})
  })

  it('rejects sale payments through manual movimientos', async () => {
    const user = await app.prisma.user.findFirst()
    const cliente = await app.prisma.cliente.findFirst()
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (existing) await app.prisma.turno.update({ where: { id: existing.id }, data: { estado: 'cerrado' } })
    const turno = await app.prisma.turno.create({ data: { cajaId: 1, userId: user.id, estado: 'abierto' } })
    const orden = await app.prisma.orden.create({
      data: {
        tipo: 'Normal',
        clienteId: cliente.id,
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

  it('lets admin reverse an open-turno movement with soft delete', async () => {
    const user = await app.prisma.user.findFirst()
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (existing) await app.prisma.turno.update({ where: { id: existing.id }, data: { estado: 'cerrado' } })
    const turno = await app.prisma.turno.create({ data: { cajaId: 1, userId: user.id, estado: 'abierto' } })
    const movimiento = await app.prisma.movimientoCaja.create({
      data: {
        turnoId: turno.id,
        tipo: 'Ingreso',
        monto: 7000,
        medioPago: 'Efectivo',
        referencia: `QA-REVERSA-${Date.now()}`,
        origenTipo: 'manual',
        fecha: new Date(),
      },
    })

    const res = await app.inject({
      method: 'DELETE', url: `/api/caja/movimientos/${movimiento.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { motivo: 'prueba anulacion' },
    })

    expect(res.statusCode).toBe(204)
    const deleted = await app.prisma.movimientoCaja.findUnique({ where: { id: movimiento.id } })
    expect(deleted.eliminado).toBe(true)

    await app.prisma.movimientoCaja.delete({ where: { id: movimiento.id } }).catch(() => {})
    await app.prisma.turno.update({ where: { id: turno.id }, data: { estado: 'cerrado' } }).catch(() => {})
  })

  it('does not let cajero reverse caja movements without delete permission', async () => {
    const user = await app.prisma.user.findFirst()
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (existing) await app.prisma.turno.update({ where: { id: existing.id }, data: { estado: 'cerrado' } })
    const turno = await app.prisma.turno.create({ data: { cajaId: 1, userId: user.id, estado: 'abierto' } })
    const movimiento = await app.prisma.movimientoCaja.create({
      data: {
        turnoId: turno.id,
        tipo: 'Ingreso',
        monto: 3000,
        medioPago: 'Efectivo',
        referencia: `QA-DENY-REVERSA-${Date.now()}`,
        origenTipo: 'manual',
        fecha: new Date(),
      },
    })

    const res = await app.inject({
      method: 'DELETE', url: `/api/caja/movimientos/${movimiento.id}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(403)
    const unchanged = await app.prisma.movimientoCaja.findUnique({ where: { id: movimiento.id } })
    expect(unchanged.eliminado).toBe(false)

    await app.prisma.movimientoCaja.delete({ where: { id: movimiento.id } }).catch(() => {})
    await app.prisma.turno.update({ where: { id: turno.id }, data: { estado: 'cerrado' } }).catch(() => {})
  })
})

describe('POST /api/caja/cobranza/orden/:id/pago', () => {
  let app, token, adminToken

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app, 'cajero')
    adminToken = await loginAs(app, 'admin')
  })
  afterAll(() => app.close())

  async function createOrdenConTurno({ withDocument = true, docMonto = 10000 } = {}) {
    const user = await app.prisma.user.findFirst()
    const cliente = await app.prisma.cliente.findFirst()
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (existing) await app.prisma.turno.update({ where: { id: existing.id }, data: { estado: 'cerrado' } })
    const turno = await app.prisma.turno.create({ data: { cajaId: 1, userId: user.id, estado: 'abierto' } })
    const orden = await app.prisma.orden.create({
      data: {
        tipo: 'Normal',
        clienteId: cliente.id,
        userId: user.id,
        estadoPago: 'No pagada',
        abono: 0,
        items: { create: [{ productoId: 1, cantidad: 1, precioUnitario: 10000 }] },
      },
      include: { items: true },
    })
    const doc = withDocument ? await app.prisma.movimientoCaja.create({
      data: {
        turnoId: turno.id,
        ordenId: orden.id,
        sucursalId: 1,
        tipo: 'Ingreso',
        monto: docMonto,
        medioPago: 'Referencial',
        documento: 'Factura Plast',
        nDoc: `DOC-${orden.id}-${Date.now()}`,
        tipoDocumento: 'Factura',
        estadoDoc: 'Activa',
        estadoPagoDoc: 'No pagada',
        origenTipo: 'orden',
        origenId: orden.id,
        fecha: new Date(),
      },
    }) : null
    return { turno, orden, doc }
  }

  function paymentPayload(doc, payload) {
    return {
      ...payload,
      documento: doc.documento,
      nDoc: doc.nDoc,
      tipoDocumento: doc.tipoDocumento,
    }
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
    const { turno, orden, doc } = await createOrdenConTurno()
    const res = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: paymentPayload(doc, { monto: 10000, medioPago: 'Efectivo' }),
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
    const { turno, orden, doc } = await createOrdenConTurno()
    const res = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: paymentPayload(doc, { monto: 10001, medioPago: 'Efectivo' }),
    })

    expect(res.statusCode).toBe(409)
    const unchanged = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(unchanged.abono).toBe(0)
    expect(unchanged.estadoPago).toBe('No pagada')

    await cleanup(turno.id, orden.id)
  })

  it('registers partial payment and keeps remaining saldo', async () => {
    const { turno, orden, doc } = await createOrdenConTurno()
    const res = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: paymentPayload(doc, { monto: 4000, medioPago: 'Efectivo' }),
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.orden.abono).toBe(4000)
    expect(body.orden.estadoPago).toBe('Parcial')
    expect(body.orden.saldo).toBe(6000)
    expect(body.movimiento.estadoPagoDoc).toBe('Parcial')

    await cleanup(turno.id, orden.id)
  })

  it('rejects invalid payment amounts and leaves venta unchanged', async () => {
    const { turno, orden, doc } = await createOrdenConTurno()
    const res = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: paymentPayload(doc, { monto: -1, medioPago: 'Efectivo' }),
    })

    expect(res.statusCode).toBe(400)
    const unchanged = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(unchanged.abono).toBe(0)
    expect(unchanged.estadoPago).toBe('No pagada')
    const movimientos = await app.prisma.movimientoCaja.count({ where: { ordenId: orden.id, medioPago: { not: 'Referencial' } } })
    expect(movimientos).toBe(0)

    await cleanup(turno.id, orden.id)
  })

  it('rejects payment when there is no open turno and leaves venta unchanged', async () => {
    const { turno, orden, doc } = await createOrdenConTurno()
    await app.prisma.turno.update({ where: { id: turno.id }, data: { estado: 'cerrado' } })
    const res = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: paymentPayload(doc, { monto: 5000, medioPago: 'Efectivo' }),
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('No hay turno abierto')
    const unchanged = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(unchanged.abono).toBe(0)
    expect(unchanged.estadoPago).toBe('No pagada')

    await cleanup(turno.id, orden.id)
  })

  it('reverses sale payment when deleting an open-turno movimiento once', async () => {
    const { turno, orden, doc } = await createOrdenConTurno()
    const firstPayment = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: paymentPayload(doc, { monto: 6000, medioPago: 'Efectivo' }),
    })
    const secondPayment = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: paymentPayload(doc, { monto: 4000, medioPago: 'Transferencia' }),
    })
    expect(firstPayment.statusCode).toBe(201)
    expect(secondPayment.statusCode).toBe(201)
    const movimiento = JSON.parse(secondPayment.body).movimiento

    const res = await app.inject({
      method: 'DELETE', url: `/api/caja/movimientos/${movimiento.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { motivo: 'prueba reversa' },
    })

    expect(res.statusCode).toBe(204)
    const reversed = await app.prisma.movimientoCaja.findUnique({ where: { id: movimiento.id } })
    expect(reversed.eliminado).toBe(true)
    const ordenReversada = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(ordenReversada.abono).toBe(6000)
    expect(ordenReversada.estadoPago).toBe('Parcial')

    const secondDelete = await app.inject({
      method: 'DELETE', url: `/api/caja/movimientos/${movimiento.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { motivo: 'prueba reversa repetida' },
    })
    expect(secondDelete.statusCode).toBe(409)
    expect(JSON.parse(secondDelete.body).error).toBe('Movimiento ya eliminado')
    const unchanged = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(unchanged.abono).toBe(6000)

    await cleanup(turno.id, orden.id)
  })

  it('rejects Referencial as cobranza payment and leaves venta unchanged', async () => {
    const { turno, orden, doc } = await createOrdenConTurno()
    const res = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: paymentPayload(doc, { monto: 5000, medioPago: 'Referencial' }),
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('Medio Referencial no registra abono de caja')
    const unchanged = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(unchanged.abono).toBe(0)
    expect(unchanged.estadoPago).toBe('No pagada')

    await cleanup(turno.id, orden.id)
  })

  it('creates referential sale document and updates document state with payments', async () => {
    const { turno, orden } = await createOrdenConTurno()
    const marker = `DOC-VENTA-${Date.now()}`
    const documento = await app.inject({
      method: 'POST',
      url: `/api/caja/cobranza/orden/${orden.id}/documento`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        monto: 10000,
        documento: 'Factura Plast',
        nDoc: marker,
        tipoDocumento: 'Factura',
      },
    })
    expect(documento.statusCode).toBe(201)
    const docBody = JSON.parse(documento.body).movimiento
    expect(docBody.medioPago).toBe('Referencial')
    expect(docBody.estadoPagoDoc).toBe('No pagada')

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/caja/cobranza/orden/${orden.id}/documento`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        monto: 10000,
        documento: 'Factura Plast',
        nDoc: marker,
        tipoDocumento: 'Factura duplicada',
      },
    })
    expect(duplicate.statusCode).toBe(409)

    const partial = await app.inject({
      method: 'POST',
      url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        monto: 4000,
        medioPago: 'Efectivo',
        documento: 'Factura Plast',
        nDoc: marker,
        tipoDocumento: 'Factura',
      },
    })
    expect(partial.statusCode).toBe(201)
    const refParcial = await app.prisma.movimientoCaja.findUnique({ where: { id: docBody.id } })
    expect(refParcial.estadoPagoDoc).toBe('Parcial')

    const final = await app.inject({
      method: 'POST',
      url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        monto: 6000,
        medioPago: 'Transferencia',
        documento: 'Factura Plast',
        nDoc: marker,
        tipoDocumento: 'Factura',
      },
    })
    expect(final.statusCode).toBe(201)
    const refPagada = await app.prisma.movimientoCaja.findUnique({ where: { id: docBody.id } })
    expect(refPagada.estadoPagoDoc).toBe('Pagada')

    await cleanup(turno.id, orden.id)
  })

  it('does not change venta abono when deleting or restoring a referential document', async () => {
    const { turno, orden, doc } = await createOrdenConTurno()
    const payment = await app.inject({
      method: 'POST',
      url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: paymentPayload(doc, { monto: 4000, medioPago: 'Efectivo' }),
    })
    expect(payment.statusCode).toBe(201)

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/caja/movimientos/${doc.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { motivo: 'anula doc referencial' },
    })
    expect(deleted.statusCode).toBe(204)
    const afterDelete = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(afterDelete.abono).toBe(4000)
    expect(afterDelete.estadoPago).toBe('Parcial')

    const restored = await app.inject({
      method: 'PATCH',
      url: `/api/caja/movimientos/${doc.id}/reactivar`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { motivo: 'reactiva doc referencial' },
    })
    expect(restored.statusCode).toBe(200)
    const afterRestore = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(afterRestore.abono).toBe(4000)
    expect(afterRestore.estadoPago).toBe('Parcial')

    await cleanup(turno.id, orden.id)
  })

  it('requires payments to point to an active referential sale document when one exists', async () => {
    const { turno, orden } = await createOrdenConTurno({ withDocument: false })
    const marker = `DOC-VENTA-REQ-${Date.now()}`

    const noDocument = await app.inject({
      method: 'POST',
      url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: { monto: 1000, medioPago: 'Efectivo' },
    })
    expect(noDocument.statusCode).toBe(400)
    expect(JSON.parse(noDocument.body).error).toBe('Crea un documento referencial activo antes de registrar el pago')

    const documento = await app.inject({
      method: 'POST',
      url: `/api/caja/cobranza/orden/${orden.id}/documento`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        monto: 5000,
        documento: 'Factura Plast',
        nDoc: marker,
        tipoDocumento: 'Factura',
      },
    })
    expect(documento.statusCode).toBe(201)

    const missing = await app.inject({
      method: 'POST',
      url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: { monto: 1000, medioPago: 'Efectivo' },
    })
    expect(missing.statusCode).toBe(400)
    expect(JSON.parse(missing.body).error).toBe('Selecciona un documento referencial activo para registrar el pago')

    const wrong = await app.inject({
      method: 'POST',
      url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: { monto: 1000, medioPago: 'Efectivo', documento: 'Factura Plast', nDoc: `${marker}-x` },
    })
    expect(wrong.statusCode).toBe(404)
    expect(JSON.parse(wrong.body).error).toBe('Documento referencial no encontrado para la venta')

    const overDoc = await app.inject({
      method: 'POST',
      url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: { monto: 6000, medioPago: 'Efectivo', documento: 'Factura Plast', nDoc: marker },
    })
    expect(overDoc.statusCode).toBe(409)
    expect(JSON.parse(overDoc.body).error).toBe('El monto excede el saldo del documento referencial')

    const unchanged = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(unchanged.abono).toBe(0)
    expect(unchanged.estadoPago).toBe('No pagada')
    const realPayments = await app.prisma.movimientoCaja.count({
      where: { ordenId: orden.id, medioPago: { not: 'Referencial' } },
    })
    expect(realPayments).toBe(0)

    await cleanup(turno.id, orden.id)
  })

  it('reactivates a deleted sale payment and reapplies the venta abono', async () => {
    const { turno, orden, doc } = await createOrdenConTurno()
    const payment = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${token}` },
      payload: paymentPayload(doc, { monto: 6000, medioPago: 'Efectivo' }),
    })
    expect(payment.statusCode).toBe(201)
    const movimiento = JSON.parse(payment.body).movimiento

    const deleted = await app.inject({
      method: 'DELETE', url: `/api/caja/movimientos/${movimiento.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { motivo: 'prueba reactivar' },
    })
    expect(deleted.statusCode).toBe(204)
    const reversedOrder = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(reversedOrder.abono).toBe(0)

    const restored = await app.inject({
      method: 'PATCH', url: `/api/caja/movimientos/${movimiento.id}/reactivar`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { motivo: 'prueba reactivacion' },
    })
    expect(restored.statusCode).toBe(200)
    const body = JSON.parse(restored.body)
    expect(body.eliminado).toBe(false)
    expect(body.estadoDoc).toBe('Activa')
    const restoredOrder = await app.prisma.orden.findUnique({ where: { id: orden.id } })
    expect(restoredOrder.abono).toBe(6000)
    expect(restoredOrder.estadoPago).toBe('Parcial')

    await cleanup(turno.id, orden.id)
  })
})

describe('Caja sucursal scope and cierre', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'cajero') })
  afterAll(() => app.close())

  it('allows simultaneous open turnos in different sucursales and scopes GET /turno', async () => {
    const marker = Date.now()
    const baseId = 900000 + (marker % 50000)
    const created = { sucursales: [], cajas: [], users: [], turnos: [] }
    try {
      const sucursal1 = await app.prisma.sucursal.upsert({
        where: { id: baseId },
        update: { nombre: `QA Sucursal A ${marker}`, activo: true },
        create: { id: baseId, nombre: `QA Sucursal A ${marker}`, activo: true },
      })
      const sucursal2 = await app.prisma.sucursal.upsert({
        where: { id: baseId + 1 },
        update: { nombre: `QA Sucursal B ${marker}`, activo: true },
        create: { id: baseId + 1, nombre: `QA Sucursal B ${marker}`, activo: true },
      })
      created.sucursales.push(sucursal1.id, sucursal2.id)
      const caja1 = await app.prisma.caja.upsert({
        where: { id: baseId },
        update: { nombre: `QA Caja A ${marker}`, sucursalId: sucursal1.id, activa: true },
        create: { id: baseId, nombre: `QA Caja A ${marker}`, sucursalId: sucursal1.id, activa: true },
      })
      const caja2 = await app.prisma.caja.upsert({
        where: { id: baseId + 1 },
        update: { nombre: `QA Caja B ${marker}`, sucursalId: sucursal2.id, activa: true },
        create: { id: baseId + 1, nombre: `QA Caja B ${marker}`, sucursalId: sucursal2.id, activa: true },
      })
      created.cajas.push(caja1.id, caja2.id)
      const user1 = await app.prisma.user.create({ data: { email: `qa-caja-a-${marker}@plastimar.cl`, passwordHash: 'x', role: 'cajero', nombre: 'QA Caja A', sucursalId: sucursal1.id } })
      const user2 = await app.prisma.user.create({ data: { email: `qa-caja-b-${marker}@plastimar.cl`, passwordHash: 'x', role: 'cajero', nombre: 'QA Caja B', sucursalId: sucursal2.id } })
      created.users.push(user1.id, user2.id)
      const token1 = app.jwt.sign(createErpAccessTokenPayload(user1))
      const token2 = app.jwt.sign(createErpAccessTokenPayload(user2))

      const open1 = await app.inject({ method: 'POST', url: '/api/caja/turno', headers: { authorization: `Bearer ${token1}` }, payload: { cajaId: caja1.id } })
      const open2 = await app.inject({ method: 'POST', url: '/api/caja/turno', headers: { authorization: `Bearer ${token2}` }, payload: { cajaId: caja2.id } })
      expect(open1.statusCode).toBe(201)
      expect(open2.statusCode).toBe(201)
      const turno1 = JSON.parse(open1.body)
      const turno2 = JSON.parse(open2.body)
      created.turnos.push(turno1.id, turno2.id)

      const scoped1 = await app.inject({ method: 'GET', url: '/api/caja/turno', headers: { authorization: `Bearer ${token1}` } })
      const scoped2 = await app.inject({ method: 'GET', url: '/api/caja/turno', headers: { authorization: `Bearer ${token2}` } })
      expect(JSON.parse(scoped1.body).id).toBe(turno1.id)
      expect(JSON.parse(scoped2.body).id).toBe(turno2.id)
    } finally {
      if (created.turnos.length) await app.prisma.turno.deleteMany({ where: { id: { in: created.turnos } } }).catch(() => {})
      if (created.users.length) await app.prisma.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => {})
      if (created.cajas.length) await app.prisma.caja.deleteMany({ where: { id: { in: created.cajas } } }).catch(() => {})
      if (created.sucursales.length) await app.prisma.sucursal.deleteMany({ where: { id: { in: created.sucursales } } }).catch(() => {})
    }
  })

  it('excludes Referencial from cierre totals and separates cheque fecha', async () => {
    const user = await app.prisma.user.findFirst()
    const existing = await app.prisma.turno.findFirst({ where: { estado: 'abierto' } })
    if (existing) await app.prisma.turno.update({ where: { id: existing.id }, data: { estado: 'cerrado' } })
    const turno = await app.prisma.turno.create({ data: { cajaId: 1, userId: user.id, estado: 'abierto' } })
    await app.prisma.movimientoCaja.createMany({
      data: [
        { turnoId: turno.id, sucursalId: 1, tipo: 'Ingreso', monto: 1000, medioPago: 'Efectivo', referencia: 'QA efectivo', fecha: new Date() },
        { turnoId: turno.id, sucursalId: 1, tipo: 'Ingreso', monto: 5000, medioPago: 'Referencial', referencia: 'QA referencial', fecha: new Date() },
        { turnoId: turno.id, sucursalId: 1, tipo: 'Ingreso', monto: 300, medioPago: 'Cheque fecha', referencia: 'QA cheque fecha', fecha: new Date() },
      ],
    })

    const closed = await app.inject({
      method: 'POST', url: `/api/caja/turno/${turno.id}/cerrar`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(closed.statusCode).toBe(200)
    const cierre = await app.inject({
      method: 'GET', url: `/api/caja/turno/${turno.id}/cierre`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(cierre.statusCode).toBe(200)
    const body = JSON.parse(cierre.body)
    expect(body.efectivo).toBe(1000)
    expect(body.chequeFecha).toBe(300)
    expect(body.total).toBe(1300)

    await app.prisma.movimientoCaja.deleteMany({ where: { turnoId: turno.id } }).catch(() => {})
    await app.prisma.cierreCaja.delete({ where: { turnoId: turno.id } }).catch(() => {})
    await app.prisma.turno.delete({ where: { id: turno.id } }).catch(() => {})
  })
})

describe('GET /api/caja/historico filters', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'cajero') })
  afterAll(() => app.close())

  it('applies ordenId and nDoc filters to items and stats', async () => {
    const user = await app.prisma.user.findFirst()
    const cliente = await app.prisma.cliente.findFirst()
    const marker = `QA-FILTRO-${Date.now()}`
    const otherMarker = `${marker}-OTRO`
    const orden = await app.prisma.orden.create({
      data: {
        tipo: 'Normal',
        clienteId: cliente.id,
        userId: user.id,
        estadoPago: 'No pagada',
        abono: 0,
      },
    })
    const otherOrden = await app.prisma.orden.create({
      data: {
        tipo: 'Normal',
        clienteId: cliente.id,
        userId: user.id,
        estadoPago: 'No pagada',
        abono: 0,
      },
    })
    await app.prisma.movimientoCaja.createMany({
      data: [
        {
          tipo: 'Ingreso',
          monto: 2500,
          medioPago: 'Efectivo',
          ordenId: orden.id,
          sucursalId: 1,
          nDoc: marker,
          origenTipo: 'orden',
          origenId: orden.id,
          fecha: new Date(),
        },
        {
          tipo: 'Ingreso',
          monto: 9000,
          medioPago: 'Efectivo',
          ordenId: otherOrden.id,
          sucursalId: 1,
          nDoc: otherMarker,
          origenTipo: 'orden',
          origenId: otherOrden.id,
          fecha: new Date(),
        },
      ],
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/caja/historico?ordenId=${orden.id}&nDoc=${marker}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.total).toBe(1)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].ordenId).toBe(orden.id)
    expect(body.items[0].nDoc).toBe(marker)
    expect(body.stats.totalIngresos).toBe(2500)

    await app.prisma.movimientoCaja.deleteMany({ where: { nDoc: { in: [marker, otherMarker] } } }).catch(() => {})
    await app.prisma.orden.deleteMany({ where: { id: { in: [orden.id, otherOrden.id] } } }).catch(() => {})
  })
})
