// Ver la nomina y ver cuanto gana cada persona son dos cosas distintas.
//
// Sale de la auditoria de Gerencia, que lo clasifica como riesgo critico: las cuentas
// `solo_lectura` tienen `rrhh:read`, y el modelo devuelve `sueldoLiquido`. En
// produccion hay dos de esas cuentas activas, o sea que dos personas podian listar a
// todo el personal con su sueldo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { can } from '../src/middleware/rbac.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function hasUsableDatabaseUrl() {
  try {
    const url = new URL(process.env.DATABASE_URL || '')
    return Boolean(url.hostname && url.username && url.password)
  } catch { return false }
}
const describeDb = hasUsableDatabaseUrl() ? describe : describe.skip

describe('quien puede ver remuneraciones', () => {
  it('solo_lectura ve la nomina pero no los sueldos', () => {
    expect(can('solo_lectura', 'rrhh', 'read', null)).toBe(true)
    // Los permisos por funcion heredan del modulo: sin negarlo explicito, `rrhh:read`
    // le daria tambien la remuneracion.
    expect(can('solo_lectura', 'rrhh.remuneracion', 'read', null)).toBe(false)
  })

  it('el rol de RRHH si las ve', () => {
    expect(can('rrhh', 'rrhh.remuneracion', 'read', null)).toBe(true)
  })

  it('administracion las ve', () => {
    expect(can('admin', 'rrhh.remuneracion', 'read', null)).toBe(true)
  })
})

describeDb('la respuesta de RRHH no filtra sueldos a quien no corresponde', () => {
  let app, trabajador

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    trabajador = await app.prisma.trabajador.findFirst({ select: { id: true } })
  })
  afterAll(async () => { await app.close() })

  const token = role => app.jwt.sign({
    id: 1, role, nombre: 'observador', permisosExtra: null,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })

  const pedir = (url, role) => app.inject({
    method: 'GET', url, headers: { authorization: `Bearer ${token(role)}` },
  })

  // Recorre la respuesta completa: el trabajador viene anidado dentro de contratos,
  // licencias y vacaciones, y bastaba con olvidar uno para filtrar el dato.
  function buscaCampo(valor, campo) {
    if (Array.isArray(valor)) return valor.some(v => buscaCampo(v, campo))
    if (!valor || typeof valor !== 'object') return false
    if (Object.prototype.hasOwnProperty.call(valor, campo)) return true
    return Object.values(valor).some(v => buscaCampo(v, campo))
  }

  it('solo_lectura recibe el listado sin sueldoLiquido', async () => {
    const res = await pedir('/api/rrhh/trabajadores?page=1', 'solo_lectura')
    expect(res.statusCode).toBe(200)
    expect(buscaCampo(JSON.parse(res.body), 'sueldoLiquido')).toBe(false)
    expect(buscaCampo(JSON.parse(res.body), 'sueldoBase')).toBe(false)
  })

  it('solo_lectura no recibe sueldos anidados en el panel operativo', async () => {
    const res = await pedir('/api/rrhh/operativo', 'solo_lectura')
    expect(res.statusCode).toBe(200)
    expect(buscaCampo(JSON.parse(res.body), 'sueldoLiquido')).toBe(false)
  })

  it('solo_lectura no recibe las liquidaciones de la ficha', async () => {
    if (!trabajador) return
    const res = await pedir(`/api/rrhh/trabajadores/${trabajador.id}`, 'solo_lectura')
    expect(res.statusCode).toBe(200)
    const cuerpo = JSON.parse(res.body)
    expect(buscaCampo(cuerpo, 'liquidaciones')).toBe(false)
    expect(buscaCampo(cuerpo, 'sueldoLiquido')).toBe(false)
    // Lo demas de la ficha sigue llegando: se oculta la remuneracion, no la persona.
    expect(cuerpo.nombres || cuerpo.rut).toBeTruthy()
  })

  it('el rol de RRHH si recibe el sueldo', async () => {
    const res = await pedir('/api/rrhh/trabajadores?page=1', 'rrhh')
    expect(res.statusCode).toBe(200)
    const cuerpo = JSON.parse(res.body)
    if (!cuerpo.items?.length) return
    expect(buscaCampo(cuerpo, 'sueldoLiquido')).toBe(true)
  })
})
