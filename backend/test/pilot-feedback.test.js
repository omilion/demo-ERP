import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, user) {
  return app.jwt.sign({
    id: user.id,
    role: user.role,
    nombre: user.nombre,
    permisosExtra: user.permisosExtra ?? null,
    authVersion: Number(user.authVersion || 0),
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })
}

describe('feedback de marcha blanca', () => {
  const marker = `feedback-${Date.now()}`
  let app
  let reporter
  let admin
  let reporterToken
  let adminToken
  let privateDir
  let feedbackId

  beforeAll(async () => {
    privateDir = await mkdtemp(path.join(os.tmpdir(), 'plastimar-feedback-'))
    process.env.FEEDBACK_STORAGE_DIR = privateDir
    app = buildApp({ logger: false })
    await app.ready()
    reporter = await app.prisma.user.create({ data: { email: `${marker}-bodega@plastimar.cl`, passwordHash: 'x', role: 'bodeguero', nombre: `${marker} Bodega`, activo: true } })
    admin = await app.prisma.user.create({ data: { email: `${marker}-admin@plastimar.cl`, passwordHash: 'x', role: 'admin', nombre: `${marker} Admin`, activo: true } })
    reporterToken = tokenFor(app, reporter)
    adminToken = tokenFor(app, admin)
  })

  afterAll(async () => {
    await app.prisma.pilotFeedback.deleteMany({ where: { reporterName: { contains: marker } } }).catch(() => {})
    await app.prisma.user.deleteMany({ where: { email: { contains: marker } } }).catch(() => {})
    await app.close()
    await rm(privateDir, { recursive: true, force: true })
    delete process.env.FEEDBACK_STORAGE_DIR
  })

  it('admite un reporte contextualizado y nunca expone la ruta privada de la captura', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/feedback', headers: { authorization: `Bearer ${reporterToken}` },
      payload: {
        module: 'bodega', submodule: 'picking', route: '/bodega/picking', entityType: 'venta', entityId: 20440,
        category: 'falla', severity: 'alta', esReproducible: 'siempre', note: 'Al confirmar el picking no se actualiza el estado de la venta.',
        comportamientoEsperado: 'La venta debe quedar en packing.', externalApi: false,
        screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9YQAAAABJRU5ErkJggg==',
        annotation: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
      },
    })
    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    feedbackId = body.item.id
    expect(body.item).toMatchObject({ module: 'bodega', status: 'nuevo', category: 'falla', severity: 'alta', esReproducible: 'siempre', hasScreenshot: true })
    expect(body.item.screenshotPath).toBeUndefined()
    expect(body.item.note).not.toContain('token=')
  })

  it('distingue falla, falta y mejora, y exige su señal específica', async () => {
    const invalid = await app.inject({
      method: 'POST', url: '/api/feedback', headers: { authorization: `Bearer ${reporterToken}` },
      payload: { module: 'ventas', route: '/ventas/nueva', category: 'falla', note: 'La acción no responde al confirmar.' },
    })
    expect(invalid.statusCode).toBe(400)

    const base = { module: 'ventas', route: '/ventas/nueva', note: 'Observación de prueba con contexto suficiente.', externalApi: false }
    const [missing, improvement] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/feedback', headers: { authorization: `Bearer ${reporterToken}` }, payload: { ...base, category: 'falta', queFalta: 'Campo de referencia de OC', paraQueSeNecesita: 'Conciliar la venta con la orden del cliente.', bloqueaFlujo: true } }),
      app.inject({ method: 'POST', url: '/api/feedback', headers: { authorization: `Bearer ${reporterToken}` }, payload: { ...base, category: 'mejora', queExisteHoy: 'El listado obliga a abrir cada venta.', queSePropone: 'Agregar vista rápida con los datos del despacho.', impactoEsperado: 'Reduce clics del bodeguero.' } }),
    ])
    expect(missing.statusCode).toBe(201)
    expect(improvement.statusCode).toBe(201)

    const list = await app.inject({ method: 'GET', url: '/api/feedback?module=ventas', headers: { authorization: `Bearer ${adminToken}` } })
    const body = JSON.parse(list.body)
    expect(body.byCategory).toMatchObject({ falta: 1, mejora: 1 })
    expect(body.byModuleCategory).toEqual(expect.arrayContaining([
      expect.objectContaining({ module: 'ventas', category: 'falta', total: 1 }),
      expect.objectContaining({ module: 'ventas', category: 'mejora', total: 1 }),
    ]))
  })

  it('restringe el triage y la evidencia a administración', async () => {
    const forbiddenList = await app.inject({ method: 'GET', url: '/api/feedback', headers: { authorization: `Bearer ${reporterToken}` } })
    expect(forbiddenList.statusCode).toBe(403)
    const forbiddenCapture = await app.inject({ method: 'GET', url: `/api/feedback/${feedbackId}/captura`, headers: { authorization: `Bearer ${reporterToken}` } })
    expect(forbiddenCapture.statusCode).toBe(403)

    const list = await app.inject({ method: 'GET', url: '/api/feedback?status=nuevo', headers: { authorization: `Bearer ${adminToken}` } })
    expect(list.statusCode).toBe(200)
    expect(JSON.parse(list.body).items.some(item => item.id === feedbackId)).toBe(true)

    const capture = await app.inject({ method: 'GET', url: `/api/feedback/${feedbackId}/captura`, headers: { authorization: `Bearer ${adminToken}` } })
    expect(capture.statusCode).toBe(200)
    expect(capture.headers['content-type']).toContain('image/png')
    expect(capture.headers['cache-control']).toContain('private')
  })

  it('permite registrar el cierre con referencia trazable', async () => {
    const response = await app.inject({
      method: 'PATCH', url: `/api/feedback/${feedbackId}`, headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'resuelto', priority: 'alta', resolutionReference: 'commit local feedback-marcha-blanca', resolutionNote: 'Se validó el cambio en plastimar_test.' },
    })
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body).item).toMatchObject({ status: 'resuelto', priority: 'alta', resolutionReference: 'commit local feedback-marcha-blanca' })
  })
})
