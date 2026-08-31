// Estado de la carga de recetas.
//
// Las recetas entran por un script que lee el Excel de MK: es una operación de
// una vez cada varios meses y su valor está en el informe de simulación, que no
// cabe en un botón. Pero el resultado tiene que verse en la pantalla, para
// completar lo que faltó con el editor que ya existe.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function hasUsableDatabaseUrl() {
  try {
    const url = new URL(process.env.DATABASE_URL || '')
    return Boolean(url.hostname && url.username && url.password)
  } catch { return false }
}
const describeDb = hasUsableDatabaseUrl() ? describe : describe.skip

describeDb('cobertura de recetas', () => {
  let app
  let token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    const u = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })
    token = app.jwt.sign({
      id: u.id, role: 'admin', nombre: 'Test', permisosExtra: null,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
  })
  afterAll(async () => { await app.close() })

  const cobertura = async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/costeo/cobertura',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    return res.json()
  }

  it('informa cuántos productos MK tienen receta', async () => {
    const c = await cobertura()
    expect(c).toHaveProperty('productosMk')
    expect(c).toHaveProperty('conReceta')
    expect(c).toHaveProperty('sinReceta')
  })

  // La primera versión contaba TODAS las recetas, incluidas las de productos
  // fuera del catálogo MK, y devolvía 166%. Un porcentaje sobre 100 delata que
  // el numerador y el denominador no hablan de lo mismo.
  it('el porcentaje no puede superar el 100%', async () => {
    const c = await cobertura()
    expect(c.porcentaje).toBeGreaterThanOrEqual(0)
    expect(c.porcentaje).toBeLessThanOrEqual(100)
    expect(c.conReceta).toBeLessThanOrEqual(c.productosMk)
  })

  it('las cuentas cierran', async () => {
    const c = await cobertura()
    expect(c.conReceta + c.sinReceta).toBe(c.productosMk)
  })

  // Sin las tres tarifas el motor calcula la mano de obra en cero y el costo
  // de fabricación queda corto sin avisar: la pantalla tiene que poder decirlo.
  it('informa las tarifas activas, que la pantalla usa para advertir', async () => {
    const c = await cobertura()
    expect(typeof c.tarifasActivas).toBe('number')
  })

  it('lista los pendientes para poder completarlos', async () => {
    const c = await cobertura()
    expect(Array.isArray(c.pendientes)).toBe(true)
    for (const p of c.pendientes) {
      expect(p).toHaveProperty('codigoInterno')
      expect(p).toHaveProperty('nombre')
    }
  })

  it('exige permiso de costeo', async () => {
    const sinPermiso = app.jwt.sign({
      id: 1, role: 'taller_operario', nombre: 'Test', permisosExtra: null,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
    const res = await app.inject({
      method: 'GET', url: '/api/costeo/cobertura',
      headers: { authorization: `Bearer ${sinPermiso}` },
    })
    expect(res.statusCode).toBe(403)
  })
})
