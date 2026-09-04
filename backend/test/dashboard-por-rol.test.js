// El tablero de inicio mostraba los mismos indicadores a todos: una cortadora
// veia el total vendido y las cuentas por pagar a proveedores. Acotaba por
// sucursal, pero no por permiso de modulo.
//
// Ahora cada bloque se entrega solo a quien puede abrir ese modulo. Ademas de la
// filtracion, evita ofrecer tarjetas que al hacer clic llevan a un 403.
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

describeDb('tablero de inicio: cada rol ve lo suyo', () => {
  let app
  let userId

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    const u = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })
    userId = u.id
  })
  afterAll(async () => { await app.close() })

  const pedir = async (role, permisosExtra = null) => {
    const token = app.jwt.sign({
      id: userId, role, nombre: 'Test', permisosExtra,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
    const res = await app.inject({ method: 'GET', url: '/api/dashboard/stats', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    return res.json()
  }

  it('admin ve todo, como antes', async () => {
    const b = await pedir('admin')
    for (const bloque of ['ventas', 'odts', 'stock', 'proveedores', 'cobranzaHistorico', 'productosCalidad']) {
      expect(b[bloque], bloque).not.toBeNull()
    }
  })

  it('el taller no ve ventas ni cobranza', async () => {
    const b = await pedir('taller')
    expect(b.ventas).toBeNull()
    expect(b.kpis).toBeNull()
    expect(b.crm).toBeNull()
    expect(b.cobranzaHistorico).toBeNull()
    // Lo suyo si lo ve.
    expect(b.odts).not.toBeNull()
    expect(b.talleres).not.toBeNull()
  })

  it('una cortadora tampoco: el rol acotado no abre el tablero entero', async () => {
    const b = await pedir('taller_operario')
    expect(b.ventas).toBeNull()
    expect(b.proveedores).toBeNull()
    expect(b.odts).not.toBeNull()
  })

  it('bodega no ve el taller ni la cobranza, pero si proveedores', async () => {
    const b = await pedir('bodeguero')
    expect(b.odts).toBeNull()
    expect(b.cobranzaHistorico).toBeNull()
    expect(b.stock).not.toBeNull()
    expect(b.proveedores).not.toBeNull()
  })

  it('caja ve cobranza y no bodega', async () => {
    const b = await pedir('cajero')
    expect(b.cobranzaHistorico).not.toBeNull()
    expect(b.stock).toBeNull()
  })

  // El permiso extra tiene que abrir el bloque igual que el rol: si no, un
  // usuario con acceso concedido veria su pantalla de inicio vacia.
  it('un permiso extra abre su bloque', async () => {
    const sin = await pedir('rrhh')
    expect(sin.stock).toBeNull()
    const con = await pedir('rrhh', { bodega: ['read'] })
    expect(con.stock).not.toBeNull()
  })
})

// RRHH quedaba con el tablero vacio: su rol no incluia ningun modulo de los que
// el tablero mostraba. Se resolvio por los dos lados -bloque propio y acceso a
// reportes- porque cada uno arregla una mitad distinta del problema.
describe('el tablero de RRHH', () => {
  let app
  let userId
  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    const u = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })
    userId = u.id
  })
  afterAll(async () => { await app.close() })

  const pedir = async role => {
    const token = app.jwt.sign({
      id: userId, role, nombre: 'Test', permisosExtra: null,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
    const res = await app.inject({ method: 'GET', url: '/api/dashboard/stats', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    return res.json()
  }

  it('ya no llega vacio: trae su propio bloque', async () => {
    const b = await pedir('rrhh')
    expect(b.rrhh).not.toBeNull()
    expect(b.rrhh).toHaveProperty('dotacionActiva')
    expect(b.rrhh).toHaveProperty('contratosPorVencer')
    expect(b.rrhh).toHaveProperty('licenciasActivas')
  })

  it('sigue sin ver ventas, bodega ni cobranza', async () => {
    const b = await pedir('rrhh')
    expect(b.ventas).toBeNull()
    expect(b.stock).toBeNull()
    expect(b.cobranzaHistorico).toBeNull()
  })

  // El bloque es de conteos: la ficha de cada persona y los sueldos viven en su
  // modulo, no en la pantalla de inicio.
  it('no expone datos personales ni sueldos', async () => {
    const b = await pedir('rrhh')
    const texto = JSON.stringify(b.rrhh)
    expect(texto).not.toMatch(/rut|sueldo|nombres|apellido/i)
  })

  it('nadie mas ve el bloque de RRHH', async () => {
    for (const role of ['vendedor', 'bodeguero', 'taller_operario']) {
      expect((await pedir(role)).rrhh, role).toBeNull()
    }
  })
})

// El coordinador comercial responde por el avance de la fuerza de venta, pero
// veia exactamente lo mismo que un vendedor: su propio panel. El desempeno por
// vendedor es un modulo aparte (`equipo_comercial`) justamente para que no lo
// herede quien solo tiene ventas:read.
describe('el desempeno por vendedor', () => {
  let app
  let userId
  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    const u = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })
    userId = u.id
  })
  afterAll(async () => { await app.close() })

  const pedir = async role => {
    const token = app.jwt.sign({
      id: userId, role, nombre: 'Test', permisosExtra: null,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
    const res = await app.inject({ method: 'GET', url: '/api/dashboard/stats', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    return res.json()
  }

  it('el coordinador ve el desglose por vendedor', async () => {
    const b = await pedir('coordinador_comercial')
    expect(b.equipoComercial).not.toBeNull()
    expect(Array.isArray(b.equipoComercial.vendedores)).toBe(true)
    expect(b.equipoComercial).toHaveProperty('total')
  })

  it('el vendedor no: veria el rendimiento de sus companeros', async () => {
    expect((await pedir('vendedor')).equipoComercial).toBeNull()
  })

  // Tienen ventas:read para consultar notas. Si el permiso colgara del modulo
  // en vez de ser propio, se lo llevarian de arrastre.
  it('nadie con solo ventas:read lo hereda', async () => {
    for (const role of ['bodeguero', 'cajero', 'solo_lectura']) {
      expect((await pedir(role)).equipoComercial, role).toBeNull()
    }
  })

  it('el ranking viene ordenado de mayor a menor', async () => {
    const { vendedores } = (await pedir('coordinador_comercial')).equipoComercial
    const totales = vendedores.map(v => v.total)
    expect(totales).toEqual([...totales].sort((a, b) => b - a))
  })
})
