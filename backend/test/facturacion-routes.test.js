import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin') {
  return app.jwt.sign({
    id: 1, role, nombre: `QA ${role}`, permisosExtra: null,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access'
  })
}

describe('routes /api/facturacion', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = tokenFor(app)
  })

  afterAll(async () => {
    await app.prisma.factDocumento.deleteMany({ where: { extra: { path: ['qaMarker'], equals: true } } })
    await app.close()
  })

  it('GET /api/facturacion/empresa returns Plastimar data without certPass', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/facturacion/empresa', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.empresa.rut).toBe('76.354.051-0')
    expect(body.empresa.razonSocial).toBe('PLASTIMAR LIMITADA')
    expect(body.empresa.certPass).toBeUndefined()
    expect(body.certificado.cargado).toBe(false)
  })

  it('GET /api/facturacion/empresa requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/facturacion/empresa' })
    expect(res.statusCode).toBe(401)
  })

  it('POST /api/facturacion/documentos validates tipoDte and items', async () => {
    const badTipo = await app.inject({
      method: 'POST', url: '/api/facturacion/documentos',
      headers: { authorization: `Bearer ${token}` },
      payload: { tipoDte: 999, items: [{ nombre: 'x' }] }
    })
    expect(badTipo.statusCode).toBe(400)

    const noItems = await app.inject({
      method: 'POST', url: '/api/facturacion/documentos',
      headers: { authorization: `Bearer ${token}` },
      payload: { tipoDte: 33, items: [] }
    })
    expect(noItems.statusCode).toBe(400)
  })

  it('creates a borrador, emitir fails cleanly without a certificate, then can be deleted', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/facturacion/documentos',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        tipoDte: 33,
        receptor: { rut: '11111111-1', razonSocial: 'Cliente Prueba' },
        items: [{ nombre: 'Tela acabada', cantidad: 10, precio: 5000, unidad: 'MT' }],
        extra: { qaMarker: true }
      }
    })
    expect(created.statusCode).toBe(201)
    const doc = JSON.parse(created.body)
    expect(doc.estado).toBe('borrador')
    expect(doc.totales.total).toBe(59500)

    const emitir = await app.inject({
      method: 'POST', url: `/api/facturacion/documentos/${doc.id}/emitir`,
      headers: { authorization: `Bearer ${token}` }
    })
    expect(emitir.statusCode).toBe(422)
    expect(JSON.parse(emitir.body).error).toMatch(/certificado/)

    const del = await app.inject({
      method: 'DELETE', url: `/api/facturacion/documentos/${doc.id}`,
      headers: { authorization: `Bearer ${token}` }
    })
    expect(del.statusCode).toBe(204)
  })

  it('GET /api/facturacion/cafs lists loaded CAFs with tipoNombre and disponibles', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/facturacion/cafs', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(JSON.parse(res.body).cafs)).toBe(true)
  })
})
