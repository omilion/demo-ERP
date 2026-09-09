import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin') {
  return app.jwt.sign({
    id: 1,
    role,
    nombre: `Test ${role}`,
    permisosExtra: null,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

// Dossier QA Plastimar 08-09-2026, hallazgo 4: dos rutas devolvian 500 en
// produccion y ninguna prueba las ejercitaba. Las suites existentes solo
// cubrian helpers (buildHistorialWhere) o el motor DTE, nunca el endpoint,
// asi que el fallo solo aparecia con la ruta montada. Estas pruebas llaman a
// la ruta real para que una regresion del mismo tipo no vuelva a pasar.
describe('rutas que devolvian 500 en produccion (dossier QA 08-09-2026)', () => {
  let app
  let adminToken

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    adminToken = tokenFor(app, 'admin')
  })

  afterAll(async () => {
    await app.close()
  })

  // Fallaba con ReferenceError: can is not defined. El preHandler usaba can()
  // sin importarlo, asi que reventaba antes de ejecutar el handler: 500 para
  // cualquier usuario y en el 100% de las llamadas.
  it('GET /api/facturacion/recibidos responde sin error de servidor', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/facturacion/recibidos',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    expect(res.statusCode).toBeLessThan(500)
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json().documentos)).toBe(true)
  })

  // Fallaba con PrismaClientValidationError: el orderBy pedia nulls:'last'
  // sobre TallerHistorialMaterial.fecha, que es obligatoria en el modelo.
  // Prisma 7 solo admite ordenamiento de nulos en campos opcionales.
  it('GET /api/historial-materiales responde sin error de servidor', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/historial-materiales',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    expect(res.statusCode).toBeLessThan(500)
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json().items)).toBe(true)
  })
})
