// Recorre el proceso de cada persona del levantamiento contra la API real.
//
// La pregunta no es "tiene el permiso" sino las dos que importan al usarlo:
// puede hacer SU trabajo, y no puede hacer el de otro.
//
// Sale de docs/PLAN_CATALOGO_PERMISOS.md. Si alguien cambia un rol o una
// guardia y rompe el trabajo de una persona, esto falla antes que ella.
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

// Cada persona con el rol y los permisos que le corresponden por su trabajo.
const PERSONAS = {
  gerencia:   { role: 'admin', extra: null },
  finanzas:   { role: 'cajero', extra: { rrhh: ['read', 'write'] } },
  facturacion:{ role: 'bodeguero', extra: { 'facturacion.emitir': ['read', 'write'], 'despacho.guias': ['read', 'write'] } },
  coordTaller:{ role: 'bodeguero', extra: { 'taller.gestion': ['read', 'write'], 'ventas.taller': ['write'], 'bodega.compras': ['read', 'write'] } },
  inventario: { role: 'bodeguero', extra: { 'bodega.movimientos': ['read', 'write'], 'ventas.entregas': ['write'] } },
  supervisora:{ role: 'taller', extra: { 'taller.gestion': ['read', 'write'], 'taller.cerrar': ['read', 'write'] } },
  cortadora:  { role: 'taller_operario', extra: null },
}

describeDb('el recorrido de cada persona', () => {
  let app
  let userId

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    const u = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })
    userId = u.id
  })
  afterAll(async () => { await app.close() })

  // Devuelve true si la guardia deja pasar. Un 404 no cuenta como paso: seria
  // ocultar un error de la prueba, que es lo que ocurrio al apuntar a una ruta
  // de cobranza que no existe.
  const puede = async (quien, method, url) => {
    const { role, extra } = PERSONAS[quien]
    const token = app.jwt.sign({
      id: userId, role, nombre: quien, permisosExtra: extra,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
    const res = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: {} })
    expect(res.statusCode, `${quien} ${method} ${url} devolvio 404: la ruta no existe`).not.toBe(404)
    return res.statusCode !== 403
  }

  describe('la cortadora registra su avance y no cierra la OT', () => {
    it('ve la OT y registra avance', async () => {
      expect(await puede('cortadora', 'GET', '/api/odts?limit=1')).toBe(true)
      expect(await puede('cortadora', 'POST', '/api/odts/1/bitacora')).toBe(true)
    })
    it('no cierra la OT', async () => {
      expect(await puede('cortadora', 'POST', '/api/odts/1/cerrar')).toBe(false)
    })
    it('no entra a ventas', async () => {
      expect(await puede('cortadora', 'GET', '/api/ventas?limit=1')).toBe(false)
    })
  })

  describe('la supervisora si cierra', () => {
    it('gestiona y cierra la OT', async () => {
      expect(await puede('supervisora', 'POST', '/api/odts/1/bitacora')).toBe(true)
      expect(await puede('supervisora', 'POST', '/api/odts/1/cerrar')).toBe(true)
    })
  })

  // El caso que motivo los permisos por funcion.
  describe('inventario marca entregas sin poder vender', () => {
    it('marca la entrega de un item', async () => {
      expect(await puede('inventario', 'PUT', '/api/ventas/items/1/entregados')).toBe(true)
    })
    it('no crea ventas', async () => {
      expect(await puede('inventario', 'POST', '/api/ventas')).toBe(false)
    })
    it('no manda ordenes a taller: eso es de coordinacion', async () => {
      expect(await puede('inventario', 'POST', '/api/ventas/1/forzar-taller')).toBe(false)
    })
  })

  describe('coordinacion de taller empuja la orden, no la crea', () => {
    it('manda la orden a taller', async () => {
      expect(await puede('coordTaller', 'POST', '/api/ventas/1/forzar-taller')).toBe(true)
    })
    it('no crea ventas ni marca entregas', async () => {
      expect(await puede('coordTaller', 'POST', '/api/ventas')).toBe(false)
      expect(await puede('coordTaller', 'PUT', '/api/ventas/items/1/entregados')).toBe(false)
    })
  })

  describe('finanzas ve cobranza y RRHH, y nada de produccion', () => {
    it('entra a cobranza y a RRHH', async () => {
      expect(await puede('finanzas', 'GET', '/api/cobranza-historico?limit=1')).toBe(true)
      expect(await puede('finanzas', 'GET', '/api/rrhh/trabajadores?limit=1')).toBe(true)
    })
    it('no entra al taller ni a bodega', async () => {
      expect(await puede('finanzas', 'GET', '/api/odts?limit=1')).toBe(false)
      expect(await puede('finanzas', 'GET', '/api/productos?limit=1')).toBe(false)
    })
  })

  describe('gerencia pasa por todo', () => {
    it('no encuentra puerta cerrada', async () => {
      for (const [method, url] of [['GET', '/api/ventas?limit=1'], ['POST', '/api/ventas'],
        ['POST', '/api/odts/1/cerrar'], ['GET', '/api/rrhh/trabajadores?limit=1']]) {
        expect(await puede('gerencia', method, url), `${method} ${url}`).toBe(true)
      }
    })
  })
})
