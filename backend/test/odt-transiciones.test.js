// Transiciones de una OT y la puerta de cierre.
//
// Sale del P0-3 de la auditoria de Talleres. La OT tenia catalogo de estados pero
// ninguna regla de movimiento: cualquier estado saltaba a cualquier otro, asi que una
// OT recien creada podia marcarse Entregada sin haber pasado por el taller, y una OT
// con etapas a medias podia cerrarse. Bodega la recibia incompleta y el desajuste
// aparecia recien al despachar.
//
// El historial no se agrega aca: la bitacora de taller ya registra cada cambio.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { validateOdtEstadoTransition, TRANSICIONES_ODT } from '../src/routes/odts/operations.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function hasUsableDatabaseUrl() {
  try {
    const url = new URL(process.env.DATABASE_URL || '')
    return Boolean(url.hostname && url.username && url.password)
  } catch { return false }
}
const describeDb = hasUsableDatabaseUrl() ? describe : describe.skip

describe('las transiciones validas de una OT', () => {
  it('deja avanzar por el camino normal del taller', () => {
    expect(validateOdtEstadoTransition('Pendiente', 'En proceso')).toBeNull()
    expect(validateOdtEstadoTransition('En proceso', 'Terminada')).toBeNull()
    expect(validateOdtEstadoTransition('Terminada', 'Entregada')).toBeNull()
  })

  it('no deja saltarse el taller', () => {
    expect(validateOdtEstadoTransition('Pendiente', 'Entregada')).toMatch(/no se puede pasar/i)
  })

  it('no revive una OT anulada', () => {
    expect(validateOdtEstadoTransition('Anulada', 'En proceso')).toMatch(/no se puede pasar/i)
    expect(TRANSICIONES_ODT.Anulada).toEqual([])
  })

  it('permite el reproceso: de Terminada vuelve a En proceso', () => {
    // Ocurre de verdad y hay que dejarlo pasar; lo que no se permite es saltar etapas.
    expect(validateOdtEstadoTransition('Terminada', 'En proceso')).toBeNull()
  })

  it('no congela las OT con la grafia heredada', () => {
    // 647 OT del legado quedaron en "Listo", que no esta en el catalogo. Si se
    // rechazara su transicion, no tendrian ninguna accion disponible.
    expect(validateOdtEstadoTransition('Listo', 'Terminada')).toBeNull()
  })

  it('rechaza un estado que no existe', () => {
    expect(validateOdtEstadoTransition('Pendiente', 'Inventado')).toMatch(/no valido/i)
  })
})

describeDb('la puerta de cierre de una OT', () => {
  let app, userId, producto, taller
  const creado = { odts: [], centros: [] }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    userId = (await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })).id
    producto = await app.prisma.producto.findFirst({ where: { activo: true }, select: { id: true } })
    taller = await app.prisma.taller.findFirst({ where: { activo: true }, select: { id: true } })
  })
  afterAll(async () => {
    for (const id of creado.odts) await app.prisma.odt.delete({ where: { id } }).catch(() => {})
    for (const id of creado.centros) await app.prisma.centroCosto.delete({ where: { id } }).catch(() => {})
    await app.close()
  })

  const supervisora = () => app.jwt.sign({
    id: userId, role: 'taller',
    permisosExtra: { 'taller.gestion': ['read', 'write'], 'taller.cerrar': ['read', 'write'] },
    nombre: 'supervisora', scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })

  async function otConEtapas(estados) {
    const marca = `CIERRE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const centro = await app.prisma.centroCosto.create({ data: { codigo: marca, nombre: marca } })
    creado.centros.push(centro.id)
    const odt = await app.prisma.odt.create({
      data: { centroCostoId: centro.id, clienteNombre: marca, estado: 'En proceso' },
    })
    creado.odts.push(odt.id)
    for (const [i, estado] of estados.entries()) {
      const item = await app.prisma.odtItem.create({
        data: { odtId: odt.id, productoId: producto.id, nombre: `${marca}-${i}`, cantidad: 1 },
      })
      await app.prisma.odtItemTaller.create({
        data: { odtItemId: item.id, tallerId: taller.id, estado },
      })
    }
    return odt
  }

  const cerrar = odtId => app.inject({
    method: 'POST', url: `/api/odts/${odtId}/cerrar`,
    headers: { authorization: `Bearer ${supervisora()}` },
    payload: { estado: 'Terminada' },
  })

  it('cierra cuando todas las etapas estan listas', async () => {
    const odt = await otConEtapas(['listo', 'listo'])
    expect((await cerrar(odt.id)).statusCode).toBe(200)
  })

  it('no cierra con una etapa a medias, y dice cual', async () => {
    const odt = await otConEtapas(['listo', 'pendiente'])
    const res = await cerrar(odt.id)
    expect(res.statusCode).toBe(409)
    const error = JSON.parse(res.body).error
    // Un "no se puede cerrar" a secas obliga a ir a buscar la causa a mano.
    expect(error).toMatch(/1 etapa/i)
    expect(error).toMatch(/pendiente/i)
  })

  it('la etapa cancelada no impide cerrar', async () => {
    const odt = await otConEtapas(['listo', 'cancelado'])
    expect((await cerrar(odt.id)).statusCode).toBe(200)
  })

  it('reconoce la grafia heredada en mayuscula como etapa lista', async () => {
    const odt = await otConEtapas(['Listo'])
    expect((await cerrar(odt.id)).statusCode).toBe(200)
  })
})
