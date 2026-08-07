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

describe('routes /api/ubicaciones (nomenclatura estructurada)', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = tokenFor(app)
  })

  afterAll(async () => {
    await app.prisma.ubicacion.deleteMany({ where: { nombre: { startsWith: 'QA-' } } })
    await app.close()
  })

  it('POST con los 5 campos compone el nombre y guarda cada campo por separado', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/ubicaciones',
      headers: { authorization: `Bearer ${token}` },
      payload: { sucursal: 'QA', area: 'Test', estante: '01', cuerpo: 'A', nivel: '01' }
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.nombre).toBe('QA-Test-01-A-01')
    expect(body).toMatchObject({ sucursal: 'QA', area: 'Test', estante: '01', cuerpo: 'A', nivel: '01' })
  })

  it('POST con campos estructurados incompletos falla con 400 y lista lo que falta', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/ubicaciones',
      headers: { authorization: `Bearer ${token}` },
      payload: { sucursal: 'QA', area: 'Test' }
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error).toContain('estante')
    expect(body.error).toContain('cuerpo')
    expect(body.error).toContain('nivel')
  })

  it('POST sin campos estructurados sigue aceptando nombre libre (compatibilidad legacy)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/ubicaciones',
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre: 'QA-legacy-freeform' }
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.nombre).toBe('QA-legacy-freeform')
    expect(body.sucursal).toBeNull()
  })

  it('PUT recompone el nombre cuando cambian los campos estructurados', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/ubicaciones',
      headers: { authorization: `Bearer ${token}` },
      payload: { sucursal: 'QA', area: 'Editar', estante: '02', cuerpo: 'B', nivel: '01' }
    })
    const doc = JSON.parse(created.body)

    const updated = await app.inject({
      method: 'PUT', url: `/api/ubicaciones/${doc.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { sucursal: 'QA', area: 'Editar', estante: '02', cuerpo: 'B', nivel: '02' }
    })
    expect(updated.statusCode).toBe(200)
    expect(JSON.parse(updated.body).nombre).toBe('QA-Editar-02-B-02')
  })

  it('GET / incluye los campos estructurados en la lista', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ubicaciones', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const { items } = JSON.parse(res.body)
    const creada = items.find(u => u.nombre === 'QA-Test-01-A-01')
    expect(creada).toBeTruthy()
    expect(creada.area).toBe('Test')
  })
})
