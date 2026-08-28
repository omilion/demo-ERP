import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { cartolaFingerprint, deriveCompromisoAlert } from '../src/routes/cobranza/gestion.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

describe('reglas de alertas y cartola de cobranza', () => {
  it.each([
    ['preventiva', '2026-09-12T12:00:00Z', 15],
    ['alta', '2026-09-02T12:00:00Z', 5],
    ['critica', '2026-08-28T12:00:00Z', 0],
    ['critica vencida', '2026-08-20T12:00:00Z', 0],
  ])('clasifica alerta %s en su umbral', (_label, fechaCompromiso, umbral) => {
    const result = deriveCompromisoAlert(
      { id: 1, estado: 'PENDIENTE', fechaCompromiso },
      new Date('2026-08-28T08:00:00Z'),
    )
    expect(result.umbral).toBe(umbral)
  })

  it('no alerta compromisos a más de 15 días ni compromisos cerrados', () => {
    expect(deriveCompromisoAlert({ estado: 'PENDIENTE', fechaCompromiso: '2026-09-13' }, new Date('2026-08-28'))).toBeNull()
    expect(deriveCompromisoAlert({ estado: 'CUMPLIDO', fechaCompromiso: '2026-08-28' }, new Date('2026-08-28'))).toBeNull()
  })

  it('genera una huella estable y sensible al monto', () => {
    const item = { fecha: '2026-08-28', descripcion: 'Transferencia cliente', referencia: 'INT-100', monto: 50000, banco: 'Banco' }
    expect(cartolaFingerprint(item)).toBe(cartolaFingerprint({ ...item }))
    expect(cartolaFingerprint(item)).not.toBe(cartolaFingerprint({ ...item, monto: 50001 }))
  })
})

describe('API de gestión, compromisos y conciliación de cobranza', () => {
  let app
  let token
  let orden
  const created = { gestionId: null, compromisoId: null, cartolaIds: [], cartolaFingerprint: null }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = app.jwt.sign({
      id: 1,
      role: 'admin',
      nombre: 'Test Cobranza',
      scope: 'erp',
      aud: 'plastimar:erp',
      tokenType: 'access',
    })
    const cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
    orden = await app.prisma.orden.create({
      data: {
        tipo: 'Normal',
        clienteId: cliente.id,
        userId: 1,
        nInterno: 980000000 + Math.floor(Math.random() * 1000000),
        estadoPago: 'No pagada',
      },
    })
  })

  afterAll(async () => {
    if (created.cartolaFingerprint) await app.prisma.cobranzaCartolaMovimiento.deleteMany({ where: { fingerprint: created.cartolaFingerprint } }).catch(() => {})
    if (created.compromisoId) await app.prisma.cobranzaCompromisoPago.delete({ where: { id: created.compromisoId } }).catch(() => {})
    if (created.gestionId) await app.prisma.cobranzaGestion.delete({ where: { id: created.gestionId } }).catch(() => {})
    if (orden?.id) await app.prisma.orden.delete({ where: { id: orden.id } }).catch(() => {})
    await app.close()
  })

  it('registra una gestión con compromiso, alerta y cierre', async () => {
    const fechaCompromiso = new Date()
    fechaCompromiso.setUTCDate(fechaCompromiso.getUTCDate() + 5)
    const create = await app.inject({
      method: 'POST',
      url: '/api/cobranza-historico/gestiones',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        ordenId: orden.id,
        tipo: 'COMPROMISO',
        canal: 'Teléfono',
        resultado: 'Cliente confirma transferencia',
        detalle: 'Se acuerda pago total dentro de cinco días.',
        compromiso: { fechaCompromiso: fechaCompromiso.toISOString(), monto: 75000 },
      },
    })
    expect(create.statusCode, create.body).toBe(201)
    const gestion = JSON.parse(create.body)
    created.gestionId = gestion.id
    created.compromisoId = gestion.compromiso.id
    expect(gestion.compromiso.estado).toBe('PENDIENTE')

    const alerts = await app.inject({
      method: 'GET',
      url: '/api/cobranza-historico/alertas',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(alerts.statusCode).toBe(200)
    const alertBody = JSON.parse(alerts.body)
    expect(alertBody.items.some(item => item.id === created.compromisoId && item.umbral === 5)).toBe(true)

    const close = await app.inject({
      method: 'PATCH',
      url: `/api/cobranza-historico/compromisos/${created.compromisoId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { estado: 'CUMPLIDO', observacion: 'Pago confirmado' },
    })
    expect(close.statusCode, close.body).toBe(200)
    expect(JSON.parse(close.body).cumplidoAt).toBeTruthy()
  })

  it('importa cartola sin duplicar y permite conciliarla con la venta sugerida', async () => {
    const movimiento = {
      fecha: new Date().toISOString(),
      descripcion: `Transferencia por interno ${orden.nInterno}`,
      referencia: `Pago venta ${orden.nInterno}`,
      monto: 75000,
      banco: 'Banco Prueba',
      cuenta: 'Cuenta 001',
    }
    created.cartolaFingerprint = cartolaFingerprint(movimiento)
    const imported = await app.inject({
      method: 'POST',
      url: '/api/cobranza-historico/cartola/importar',
      headers: { authorization: `Bearer ${token}` },
      payload: { movimientos: [movimiento, movimiento] },
    })
    expect(imported.statusCode, imported.body).toBe(201)
    expect(JSON.parse(imported.body)).toMatchObject({ importados: 1, duplicados: 1 })

    const list = await app.inject({
      method: 'GET',
      url: '/api/cobranza-historico/cartola?estado=PENDIENTE',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(list.statusCode).toBe(200)
    const row = JSON.parse(list.body).items.find(item => item.fingerprint === created.cartolaFingerprint)
    expect(row.sugerencia).toMatchObject({ ordenId: orden.id, nInterno: orden.nInterno })
    created.cartolaIds.push(row.id)

    const reconcile = await app.inject({
      method: 'POST',
      url: `/api/cobranza-historico/cartola/${row.id}/conciliar`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ordenId: orden.id, observacion: 'Referencia y monto verificados' },
    })
    expect(reconcile.statusCode, reconcile.body).toBe(200)
    expect(JSON.parse(reconcile.body)).toMatchObject({ estado: 'CONCILIADO', ordenId: orden.id })
  })
})
