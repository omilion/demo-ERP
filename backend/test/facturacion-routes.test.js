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
  const qaCafIds = []

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = tokenFor(app)
  })

  afterAll(async () => {
    await app.prisma.factDocumento.deleteMany({ where: { extra: { path: ['qaMarker'], equals: true } } })
    if (qaCafIds.length) {
      await app.prisma.factFolioAjuste.deleteMany({ where: { cafId: { in: qaCafIds } } })
      await app.prisma.factCaf.deleteMany({ where: { id: { in: qaCafIds } } })
    }
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
    expect(JSON.parse(emitir.body).error).toMatch(/certificado|resolución/)

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

  it('ajusta un CAF considerando solo documentos de su propio rango', async () => {
    const caf = await app.prisma.factCaf.create({
      data: {
        tipoDte: 43,
        folioDesde: 890001,
        folioHasta: 890060,
        siguienteFolio: 890001,
        fechaAutorizacion: '2026-07-23',
        ambiente: 'certificacion',
        xml: '<CAF/>',
      },
    })
    qaCafIds.push(caf.id)
    await app.prisma.factDocumento.create({
      data: {
        tipoDte: 43,
        folio: 990000,
        estado: 'aceptado',
        ambiente: 'certificacion',
        extra: { qaMarker: true },
      },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/facturacion/cafs/${caf.id}/ajustar-folio`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        siguienteFolio: 890010,
        motivo: 'Recuperacion desde respaldo historico',
        confirmacion: 'AJUSTAR FOLIO',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({
      maxUsado: 0,
      caf: { siguienteFolio: 890010 },
      ajuste: { folioAnterior: 890001, folioNuevo: 890010 },
    })
  })

  it('reanuda un CAF de certificacion desde el mayor folio seguro y registra auditoria', async () => {
    const caf = await app.prisma.factCaf.create({
      data: {
        tipoDte: 43,
        folioDesde: 870001,
        folioHasta: 870060,
        siguienteFolio: 870001,
        fechaAutorizacion: '2026-07-23',
        ambiente: 'certificacion',
        xml: '<CAF/>',
      },
    })
    qaCafIds.push(caf.id)
    await app.prisma.factFolioAjuste.create({
      data: {
        cafId: caf.id, tipoDte: caf.tipoDte,
        folioAnterior: 870021, folioNuevo: 870001,
        motivo: '[REINICIO CERTIFICACION] prueba previa', usuarioNombre: 'QA',
      },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/facturacion/cafs/${caf.id}/reanudar-certificacion`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        motivo: 'Reanudacion automatizada del CAF de pruebas',
        confirmacion: 'REANUDAR CAF CERTIFICACION',
      },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.caf.siguienteFolio).toBe(870021)
    expect(body.disponibles).toBe(40)
    expect(body.ajuste).toMatchObject({ folioAnterior: 870001, folioNuevo: 870021 })
    expect(body.ajuste.motivo).toMatch(/REANUDACION CERTIFICACION/)
  })

  it('rechaza reanudar un CAF de certificacion anterior a la resolucion vigente', async () => {
    const caf = await app.prisma.factCaf.create({
      data: {
        tipoDte: 43,
        folioDesde: 875001,
        folioHasta: 875060,
        siguienteFolio: 875001,
        fechaAutorizacion: '2018-07-13',
        ambiente: 'certificacion',
        xml: '<CAF/>',
      },
    })
    qaCafIds.push(caf.id)

    const listado = await app.inject({
      method: 'GET',
      url: '/api/facturacion/cafs',
      headers: { authorization: `Bearer ${token}` },
    })
    const cafListado = JSON.parse(listado.body).cafs.find(item => item.id === caf.id)
    expect(cafListado).toMatchObject({ disponibles: 0, vigenteResolucion: false })
    expect(cafListado.bloqueo).toMatch(/anterior a la resolucion vigente/)

    const res = await app.inject({
      method: 'POST',
      url: `/api/facturacion/cafs/${caf.id}/reanudar-certificacion`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        motivo: 'Intento controlado sobre CAF historico',
        confirmacion: 'REANUDAR CAF CERTIFICACION',
      },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error).toMatch(/anterior a la resolucion vigente/)
  })

  it('rechaza reanudar un CAF de produccion', async () => {
    const caf = await app.prisma.factCaf.create({
      data: {
        tipoDte: 43,
        folioDesde: 880001,
        folioHasta: 880060,
        siguienteFolio: 880021,
        fechaAutorizacion: '2026-07-23',
        ambiente: 'produccion',
        xml: '<CAF/>',
      },
    })
    qaCafIds.push(caf.id)
    const res = await app.inject({
      method: 'POST',
      url: `/api/facturacion/cafs/${caf.id}/reanudar-certificacion`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        motivo: 'Intento controlado sobre CAF productivo',
        confirmacion: 'REANUDAR CAF CERTIFICACION',
      },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error).toMatch(/Solo se pueden reanudar folios/)
    const unchanged = await app.prisma.factCaf.findUnique({ where: { id: caf.id } })
    expect(unchanged.siguienteFolio).toBe(880021)
  })

  it('GET /api/facturacion/documentos filters by ordenId (for the venta Documentos tab)', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/facturacion/documentos',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        tipoDte: 33,
        ordenId: 987654321,
        receptor: { rut: '11111111-1', razonSocial: 'Cliente Prueba' },
        items: [{ nombre: 'Tela acabada', cantidad: 1, precio: 1000 }],
        extra: { qaMarker: true }
      }
    })
    expect(created.statusCode).toBe(201)
    const doc = JSON.parse(created.body)

    const filtered = await app.inject({
      method: 'GET', url: `/api/facturacion/documentos?ordenId=${doc.ordenId}`,
      headers: { authorization: `Bearer ${token}` }
    })
    expect(filtered.statusCode).toBe(200)
    const { documentos } = JSON.parse(filtered.body)
    expect(documentos.some((d) => d.id === doc.id)).toBe(true)
    expect(documentos.every((d) => d.ordenId === doc.ordenId)).toBe(true)

    await app.inject({
      method: 'DELETE', url: `/api/facturacion/documentos/${doc.id}`,
      headers: { authorization: `Bearer ${token}` }
    })
  })
})
