// Verifica LA GUARDIA de cada endpoint del proceso de cada persona.
//
// Alcance, dicho con precision: comprueba que el control de acceso deja pasar a
// quien corresponde y frena a quien no. NO comprueba que la operacion se
// complete: los POST van con cuerpo vacio, de modo que quien pasa la guardia
// recibe un 400 de validacion. Eso es suficiente para lo que este archivo
// afirma -y solo para eso-.
//
// Un 404 o un 5xx hacen fallar la prueba: el primero significa que la ruta no
// existe y el segundo que algo se rompio antes de llegar a la guardia. Contar
// cualquiera de los dos como exito da confianza falsa.
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

describeDb('la guardia de cada endpoint del proceso de cada persona', () => {
  let app
  let userId
  let odtId

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    const u = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })
    userId = u.id
    // Se prueba contra una OT que existe de verdad. Con un id fijo, una base que no
    // tenga esa fila devuelve 404 y la guardia de más abajo lo lee como "la ruta no
    // existe": el test falla por datos y acusa un problema de rutas que no hay.
    const centro = await app.prisma.centroCosto.create({
      data: { codigo: `RECORRIDO-${Date.now()}`, nombre: 'Recorrido de personas' },
    })
    const odt = await app.prisma.odt.create({
      data: { centroCostoId: centro.id, clienteNombre: 'Recorrido', estado: 'Pendiente' },
    })
    odtId = odt.id
  })
  afterAll(async () => { await app.close() })

  const pasaLaGuardia = async (quien, method, url) => {
    const { role, extra } = PERSONAS[quien]
    const token = app.jwt.sign({
      id: userId, role, nombre: quien, permisosExtra: extra,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
    const res = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: {} })
    expect(res.statusCode, `${quien} ${method} ${url}: la ruta no existe`).not.toBe(404)
    expect(res.statusCode, `${quien} ${method} ${url}: error del servidor, no de permisos`).toBeLessThan(500)
    return res.statusCode !== 403
  }
  const puede = pasaLaGuardia

  describe('la cortadora alcanza el avance y no el cierre', () => {
    it('la guardia la deja entrar a la OT y al avance', async () => {
      expect(await puede('cortadora', 'GET', '/api/odts?limit=1')).toBe(true)
      expect(await puede('cortadora', 'POST', `/api/odts/${odtId}/bitacora`)).toBe(true)
    })
    it('no cierra la OT', async () => {
      expect(await puede('cortadora', 'POST', `/api/odts/${odtId}/cerrar`)).toBe(false)
    })
    it('no entra a ventas', async () => {
      expect(await puede('cortadora', 'GET', '/api/ventas?limit=1')).toBe(false)
    })

    // La pantalla de Corte exigia taller:write, el permiso de gestion. El rol
    // taller_operario tiene taller:read y taller.avance:write, asi que quedaba
    // bloqueado justo de la pantalla para la que existe: no podia anotar lo que
    // acababa de cortar ni subir la foto.
    it('registra su avance y su evidencia en la pantalla de Corte', async () => {
      // Se comprueba que la guardia la deje pasar, no que la tarea exista: sin item
      // real el handler responde 404, que es despues del permiso. Lo que este caso
      // afirma es que ya no responde 403.
      const token = app.jwt.sign({
        id: userId, role: 'taller_operario', nombre: 'cortadora', permisosExtra: null,
        scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
      })
      for (const url of ['/api/taller-corte/items/1/avances', '/api/taller-corte/items/1/evidencias']) {
        const res = await app.inject({
          method: 'POST', url, headers: { authorization: `Bearer ${token}` }, payload: {},
        })
        expect(res.statusCode, `${url} deberia dejar pasar al operario`).not.toBe(403)
      }
    })

    // Declarar el propio avance y decidir quien hace el trabajo son cosas distintas:
    // el mismo endpoint del avance aceptaba el responsable, asi que una cortadora
    // podia reasignarle la tarea a otra.
    it('no reasigna la tarea a otra persona', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/odts/${odtId}/items/1/talleres/1/estado`,
        headers: { authorization: `Bearer ${app.jwt.sign({
          id: userId, role: 'taller_operario', nombre: 'cortadora', permisosExtra: null,
          scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
        })}` },
        payload: { operarioResponsableId: userId },
      })
      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error).toMatch(/coordinaci/i)
    })
  })

  describe('la supervisora si cierra', () => {
    it('gestiona y cierra la OT', async () => {
      expect(await puede('supervisora', 'POST', `/api/odts/${odtId}/bitacora`)).toBe(true)
      expect(await puede('supervisora', 'POST', `/api/odts/${odtId}/cerrar`)).toBe(true)
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
        ['POST', `/api/odts/${odtId}/cerrar`], ['GET', '/api/rrhh/trabajadores?limit=1']]) {
        expect(await puede('gerencia', method, url), `${method} ${url}`).toBe(true)
      }
    })
  })
})

// Facturacion, despacho y bodega etiquetados por funcion. Lo que hay que
// garantizar es que nadie pierda lo que ya hacia y que se separe lo que antes
// venia en el mismo paquete.
describe('el segundo grupo de modulos etiquetados', () => {
  let app
  let userId

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    const u = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })
    userId = u.id
  })
  afterAll(async () => { await app.close() })

  const pasa = async (role, extra, method, url) => {
    const token = app.jwt.sign({
      id: userId, role, nombre: 'Test', permisosExtra: extra,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
    const res = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: {} })
    expect(res.statusCode, `${method} ${url}: la ruta no existe`).not.toBe(404)
    expect(res.statusCode, `${method} ${url}: error del servidor, no de permisos`).toBeLessThan(500)
    return res.statusCode !== 403
  }

  // Daniela: emite documentos, no administra folios.
  const facturacion = { 'facturacion.emitir': ['read', 'write'], 'despacho.guias': ['read', 'write'] }

  it('facturacion emite y envia documentos', async () => {
    expect(await pasa('bodeguero', facturacion, 'POST', '/api/facturacion/documentos/1/emitir')).toBe(true)
    expect(await pasa('bodeguero', facturacion, 'POST', '/api/facturacion/enviar-lote')).toBe(true)
  })

  it('pero no administra CAF ni folios', async () => {
    expect(await pasa('bodeguero', facturacion, 'POST', '/api/facturacion/cafs')).toBe(false)
    expect(await pasa('bodeguero', facturacion, 'DELETE', '/api/facturacion/cafs/1')).toBe(false)
  })

  it('emite guias de despacho', async () => {
    expect(await pasa('bodeguero', facturacion, 'POST', '/api/despachos/guias')).toBe(true)
  })

  // Diego Avila: mueve inventario, no compra.
  const inventario = { 'bodega.movimientos': ['read', 'write'], 'ventas.entregas': ['write'] }

  it('inventario registra movimientos', async () => {
    expect(await pasa('bodeguero', inventario, 'POST', '/api/productos/1/movimientos')).toBe(true)
  })

  // El rol bodeguero ya da bodega:write, asi que compras cae al modulo. Lo que
  // el etiquetado permite es acotar a alguien cuyo rol NO otorgue el modulo.
  it('un rol sin bodega:write no alcanza compras aunque tenga movimientos', async () => {
    const soloMovimientos = { 'bodega.movimientos': ['read', 'write'] }
    expect(await pasa('taller_operario', soloMovimientos, 'POST', '/api/productos/1/movimientos')).toBe(true)
    expect(await pasa('taller_operario', soloMovimientos, 'POST', '/api/productos/1/proveedores')).toBe(false)
  })

  it('gerencia sigue pasando por todo', async () => {
    for (const [m, u] of [['POST', '/api/facturacion/cafs'], ['POST', '/api/despachos/guias'],
      ['POST', '/api/productos/1/movimientos'], ['POST', '/api/productos/1/proveedores']]) {
      expect(await pasa('admin', null, m, u), `${m} ${u}`).toBe(true)
    }
  })
})
