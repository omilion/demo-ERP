import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildApp } from '../src/app.js'
import { getToolDefinitions } from '../src/routes/ai/tools/index.js'
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
