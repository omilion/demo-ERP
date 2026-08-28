import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { buildTrazabilidadOrden } from '../src/routes/facturacion/trazabilidad.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

describe('buildTrazabilidadOrden', () => {
  it('marca completo el recorrido N° interno → guía → DTE 52 → factura', () => {
    const result = buildTrazabilidadOrden({
      orden: { id: 1, nInterno: 1001, tipo: 'Normal', estado: 'Activa', estadoPago: 'No pagada', estadoEntrega: 'Pendiente entrega' },
      guias: [{ id: 10, nGuia: 'G-10', fechaGuia: new Date(), eliminado: false }],
      documentos: [
        { id: 20, guiaDespachoId: 10, tipoDte: 52, folio: 55, estado: 'emitido' },
        { id: 21, ordenId: 1, tipoDte: 33, folio: 88, estado: 'aceptado' },
      ],
    })
    expect(result.completa).toBe(true)
    expect(result.guias[0].dte.folio).toBe(55)
    expect(result.documentosVenta[0].folio).toBe(88)
  })

  it('informa cada eslabón faltante sin ocultar los demás', () => {
    const result = buildTrazabilidadOrden({
      orden: { id: 1, nInterno: null, tipo: 'Normal', estado: 'Activa' },
      guias: [],
      documentos: [],
    })
    expect(result.excepciones.map(item => item.codigo)).toEqual(['SIN_INTERNO', 'SIN_GUIA', 'SIN_DTE_VENTA'])
  })
})

describe('API de trazabilidad tributaria', () => {
  let app
  let token
  const created = { ordenId: null, missingOrdenId: null, guiaId: null, documentoIds: [] }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = app.jwt.sign({ id: 1, role: 'admin', nombre: 'Test', scope: 'erp', aud: 'plastimar:erp', tokenType: 'access' })
    const cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
    const orden = await app.prisma.orden.create({
      data: { tipo: 'Normal', clienteId: cliente.id, userId: 1, nInterno: 981000000 + Math.floor(Math.random() * 1000000) },
    })
    created.ordenId = orden.id
    const missingOrden = await app.prisma.orden.create({
      data: { tipo: 'Normal', clienteId: cliente.id, userId: 1, nInterno: 982000000 + Math.floor(Math.random() * 1000000) },
    })
    created.missingOrdenId = missingOrden.id
    const guia = await app.prisma.guiaDespacho.create({
      data: { ordenId: orden.id, nInterno: orden.nInterno, nGuia: `TEST-${orden.nInterno}`, fechaGuia: new Date() },
    })
    created.guiaId = guia.id
    const docs = await Promise.all([
      app.prisma.factDocumento.create({ data: { ordenId: orden.id, guiaDespachoId: guia.id, tipoDte: 52, folio: 101, estado: 'emitido' } }),
      app.prisma.factDocumento.create({ data: { ordenId: orden.id, tipoDte: 33, folio: 102, estado: 'aceptado' } }),
    ])
    created.documentoIds = docs.map(item => item.id)
  })

  afterAll(async () => {
    if (created.documentoIds.length) await app.prisma.factDocumento.deleteMany({ where: { id: { in: created.documentoIds } } }).catch(() => {})
    if (created.guiaId) await app.prisma.guiaDespacho.delete({ where: { id: created.guiaId } }).catch(() => {})
    if (created.ordenId) await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
    if (created.missingOrdenId) await app.prisma.orden.delete({ where: { id: created.missingOrdenId } }).catch(() => {})
    await app.close()
  })

  it('expone el recorrido completo de una venta', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/facturacion/trazabilidad/orden/${created.ordenId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.statusCode, response.body).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.completa).toBe(true)
    expect(body.guias).toHaveLength(1)
    expect(body.documentosVenta).toHaveLength(1)
  })

  it('incluye ventas incompletas en el informe de excepciones', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/facturacion/trazabilidad/excepciones?limit=500',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.statusCode, response.body).toBe(200)
    const body = JSON.parse(response.body)
    const item = body.items.find(row => row.orden.id === created.missingOrdenId)
    expect(item?.excepciones.map(exception => exception.codigo)).toEqual(expect.arrayContaining(['SIN_GUIA', 'SIN_DTE_VENTA']))
    expect(body.porCodigo.SIN_GUIA).toBeGreaterThan(0)
  })
})
