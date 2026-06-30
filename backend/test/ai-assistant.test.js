import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildApp } from '../src/app.js'
import { getToolDefinitions, runTool } from '../src/routes/ai/tools/index.js'
import { documentToolDefinitions, runDocumentTool } from '../src/routes/ai/documents.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin') {
  return app.jwt.sign({ id: 1, role, nombre: `Test ${role}`, email: `${role}@test.cl`, permisosExtra: null, scope: 'erp', aud: 'plastimar:erp', tokenType: 'access' })
}

describe('AI assistant — tool definitions', () => {
  it('expone herramientas de consulta con JSON schema válido', () => {
    const defs = getToolDefinitions()
    expect(defs.length).toBeGreaterThanOrEqual(6)
    for (const d of defs) {
      expect(typeof d.name).toBe('string')
      expect(typeof d.description).toBe('string')
      expect(d.input_schema?.type).toBe('object')
    }
    const names = defs.map(d => d.name)
    expect(names).toEqual(expect.arrayContaining([
      'consultar_ventas', 'consultar_taller', 'consultar_caja', 'consultar_crm', 'consultar_stock', 'consultar_rrhh',
    ]))
  })

  it('expone herramientas de documentos', () => {
    const names = documentToolDefinitions.map(d => d.name)
    expect(names).toEqual(expect.arrayContaining(['generar_excel', 'generar_pptx']))
  })
})

describe('AI assistant — generación de documentos', () => {
  let root, prev
  beforeAll(async () => {
    prev = process.env.UPLOADS_DIR
    root = await mkdtemp(path.join(os.tmpdir(), 'ai-doc-test-'))
    process.env.UPLOADS_DIR = root
  })
  afterAll(async () => {
    if (prev === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = prev
    await rm(root, { recursive: true, force: true })
  })

  it('genera un Excel descargable', async () => {
    const r = await runDocumentTool('generar_excel', { titulo: 'Ventas', columnas: ['Cliente', 'Monto'], filas: [['ACME', 1000]] })
    expect(r.url).toMatch(/^\/uploads\/ai\/.+\.xlsx$/)
    const files = await readdir(path.join(root, 'ai'))
    expect(files.some(f => f.endsWith('.xlsx'))).toBe(true)
  })

  it('genera un PowerPoint descargable', async () => {
    const r = await runDocumentTool('generar_pptx', { titulo: 'Reporte', secciones: [{ titulo: 'Resumen', vinetas: ['punto 1'] }] })
    expect(r.url).toMatch(/^\/uploads\/ai\/.+\.pptx$/)
    expect(r.diapositivas).toBe(2)
  })
})

describe('AI assistant — RBAC del endpoint', () => {
  let app
  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready() })
  afterAll(() => app.close())

  it('rechaza /api/ai/status sin token (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ai/status' })
    expect(res.statusCode).toBe(401)
  })

  it('rechaza rol no-admin en /api/ai/status (403)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ai/status', headers: { authorization: `Bearer ${tokenFor(app, 'vendedor')}` } })
    expect(res.statusCode).toBe(403)
  })

  it('permite admin en /api/ai/status (200)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ai/status', headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('configured')
    expect(body).toHaveProperty('model')
  })

  it('rechaza rol no-admin en /api/ai/chat (403)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/ai/chat',
      headers: { authorization: `Bearer ${tokenFor(app, 'cajero')}` },
      payload: { messages: [{ role: 'user', content: 'hola' }] },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('AI assistant — consultar_documentacion', () => {
  it('encuentra coincidencia en la documentación', async () => {
    const r = await runTool('consultar_documentacion', { tema: 'ventas' }, { prisma: {} })
    expect(r.encontrado).toBe(true)
    expect(r.documentos.length).toBeGreaterThan(0)
    expect(r.documentos[0].modulo).toBe('ventas')
    expect(r.documentos[0].contenido).toContain('# Módulo de Ventas')
  })

  it('retorna encontrado false cuando no hay coincidencia', async () => {
    const r = await runTool('consultar_documentacion', { tema: 'xyz123noexistebusqueda' }, { prisma: {} })
    expect(r.encontrado).toBe(false)
  })
})

describe('AI assistant — product rentabilidad & times', () => {
  let app
  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
  })
  afterAll(() => app.close())

  it('ficha_producto calculates rentabilidad margin and handles production times', async () => {
    const code = `TEST-PROD-${Date.now()}`
    const category = `TestCat-${Date.now()}`
    
    // Create product
    const product = await app.prisma.producto.create({
      data: {
        codigoInterno: code,
        nombre: `Producto Test Margen ${code}`,
        categoria: category,
        stock: 10,
        precioLista: 10000,
        bodega: 'Inventario',
      }
    })

    // Create provider
    const provider = await app.prisma.proveedor.create({
      data: {
        nombre: `Proveedor Test ${code}`,
        rut: `rut-prov-${code}`,
      }
    })

    // Create pagoProveedor
    const payment = await app.prisma.pagoProveedor.create({
      data: {
        proveedorId: provider.id,
        total: 50000,
        documento: 'Factura',
        nDoc: '12345',
        fechaPago: new Date(),
        estado: 'Pagado',
      }
    })

    // Create detail
    const invoiceDetail = await app.prisma.detalleFacturaProveedor.create({
      data: {
        pagoId: payment.id,
        codigoInterno: code,
        cantidad: 10,
        precio: 6000, // Cost = 6000
      }
    })

    // Create client
    const client = await app.prisma.cliente.create({
      data: {
        rut: `rut-cl-${code}`,
        nombre: `Cliente Test ${code}`,
      }
    })

    // Create sales order with items nested
    const order = await app.prisma.orden.create({
      data: {
        tipo: 'Normal',
        userId: 1,
        clienteId: client.id,
        items: {
          create: [{
            productoId: product.id,
            codigoInterno: code,
            cantidad: 2,
            precioUnitario: 12000, // Price = 12000
          }]
        }
      }
    })

    try {
      // 1. Run ficha_producto
      const r = await runTool('ficha_producto', { producto: code }, { prisma: app.prisma })
      expect(r.encontrado).toBe(true)
      expect(r.producto.codigo).toBe(code)
      expect(r.rentabilidad.costoPromCompra).toBe(6000)
      expect(r.rentabilidad.precioPromVenta).toBe(12000)
      expect(r.rentabilidad.margenPct).toBe(50) // 1 - 6000/12000 = 50%

      // 2. Run ranking_ventas by margen
      const rRank = await runTool('ranking_ventas', {
        agrupar_por: 'producto',
        periodo: 'mes_actual',
        ordenar_por: 'margen',
        limite: 5
      }, { prisma: app.prisma })

      expect(rRank.ordenadoPor).toBe('margen')
      const rankItem = rRank.ranking.find(item => item.producto === `Producto Test Margen ${code}`)
      expect(rankItem).toBeDefined()
      expect(rankItem.margenPct).toBe(50)
      expect(rankItem.costoPromCLP).toBe(6000)
    } finally {
      // Cleanup
      await app.prisma.orden.deleteMany({ where: { id: order.id } })
      await app.prisma.cliente.deleteMany({ where: { id: client.id } })
      await app.prisma.detalleFacturaProveedor.deleteMany({ where: { id: invoiceDetail.id } })
      await app.prisma.pagoProveedor.deleteMany({ where: { id: payment.id } })
      await app.prisma.proveedor.deleteMany({ where: { id: provider.id } })
      await app.prisma.producto.deleteMany({ where: { id: product.id } })
    }
  })

  it('ficha_producto returns encontrado false for unknown product', async () => {
    const r = await runTool('ficha_producto', { producto: 'NON_EXISTENT_PROD_12345' }, { prisma: app.prisma })
    expect(r.encontrado).toBe(false)
  })
})


