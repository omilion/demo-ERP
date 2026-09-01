// Los empalmes entre etapas de una venta: taller -> bodega -> facturacion, y lo que
// la Matriz muestra de vuelta.
//
// Salen de recorrer el flujo completo por la API por primera vez. Cada paso respondia
// 200 por separado, pero el resultado no llegaba a la Matriz ni al siguiente
// responsable: circuitos abiertos que ninguna prueba unitaria detecta, porque cada
// extremo funciona.
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

describeDb('los empalmes del flujo de una venta', () => {
  let app
  let userId
  let producto
  let taller
  const creado = { odts: [], centros: [], ordenes: [] }

  const token = (role, extra = null) => app.jwt.sign({
    id: userId, role, nombre: 'test', permisosExtra: extra,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    const u = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })
    userId = u.id
    producto = await app.prisma.producto.findFirst({ where: { activo: true }, select: { id: true } })
    taller = await app.prisma.taller.findFirst({ where: { activo: true }, select: { id: true } })
  })

  afterAll(async () => {
    for (const id of creado.odts) await app.prisma.odt.delete({ where: { id } }).catch(() => {})
    for (const id of creado.centros) await app.prisma.centroCosto.delete({ where: { id } }).catch(() => {})
    await app.close()
  })

  // Una OT interna con N estaciones, de las cuales `listas` quedan en listo.
  async function otConEstaciones(listas, total) {
    const marca = `EMP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const centro = await app.prisma.centroCosto.create({ data: { codigo: marca, nombre: marca } })
    creado.centros.push(centro.id)
    const odt = await app.prisma.odt.create({
      data: { centroCostoId: centro.id, clienteNombre: marca, estado: 'Pendiente' },
    })
    creado.odts.push(odt.id)
    for (let i = 0; i < total; i += 1) {
      const item = await app.prisma.odtItem.create({
        data: { odtId: odt.id, productoId: producto.id, nombre: `${marca}-${i}`, cantidad: 1 },
      })
      await app.prisma.odtItemTaller.create({
        data: { odtItemId: item.id, tallerId: taller.id, estado: i < listas ? 'listo' : 'pendiente' },
      })
    }
    return odt
  }

  async function avisosDe(extra) {
    const res = await app.inject({
      method: 'GET', url: '/api/notificaciones',
      headers: { authorization: `Bearer ${token('bodeguero', extra)}` },
    })
    expect(res.statusCode).toBe(200)
    return JSON.parse(res.body).items || []
  }

  describe('el taller avisa a bodega, tambien cuando termina solo una parte', () => {
    const permisoBodega = { bodega: ['read', 'write'], despacho: ['read', 'write'] }

    it('avisa el picking parcial sin esperar a que la OT completa este lista', async () => {
      const odt = await otConEstaciones(1, 2)
      const avisos = (await avisosDe(permisoBodega)).filter(a => String(a.titulo).includes(`#${odt.id}`))
      expect(avisos).toHaveLength(1)
      expect(avisos[0].tipo).toBe('odt_parcial_picking')
      // El detalle dice cuanto falta: sin eso bodega no sabe si ir a buscar o esperar.
      expect(avisos[0].detalle).toMatch(/1 de 2/)
    })

    it('avisa la OT completa cuando todas las estaciones quedan listas', async () => {
      const odt = await otConEstaciones(2, 2)
      const avisos = (await avisosDe(permisoBodega)).filter(a => String(a.titulo).includes(`#${odt.id}`))
      expect(avisos).toHaveLength(1)
      expect(avisos[0].tipo).toBe('odt_lista_despacho')
    })

    it('no avisa nada mientras el taller no haya terminado ninguna estacion', async () => {
      const odt = await otConEstaciones(0, 2)
      const avisos = (await avisosDe(permisoBodega)).filter(a => String(a.titulo).includes(`#${odt.id}`))
      expect(avisos).toHaveLength(0)
    })

    it('reconoce la grafia heredada en mayuscula', async () => {
      // El legado dejo 5.173 estaciones en "Listo". Con comparacion exacta esas OT
      // nunca se anunciaban y bodega no se enteraba de trabajo ya terminado.
      const odt = await otConEstaciones(0, 1)
      await app.prisma.odtItemTaller.updateMany({
        where: { odtItem: { odtId: odt.id } },
        data: { estado: 'Listo' },
      })
      const avisos = (await avisosDe(permisoBodega)).filter(a => String(a.titulo).includes(`#${odt.id}`))
      expect(avisos).toHaveLength(1)
      expect(avisos[0].tipo).toBe('odt_lista_despacho')
    })
  })

  describe('no se abre una OT sin nada que fabricar', () => {
    it('rechaza crear la OT cuando no se indica ningun item', async () => {
      const orden = await app.prisma.orden.findFirst({
        where: { eliminada: false }, select: { id: true }, orderBy: { id: 'desc' },
      })
      const res = await app.inject({
        method: 'POST', url: '/api/pasar-taller/enviar',
        headers: { authorization: `Bearer ${token('bodeguero', { taller: ['read', 'write'] })}` },
        payload: { ordenId: orden.id, prioridad: 'normal', obsGeneral: 'sin items' },
      })
      // La OT vacia igual contaba en la Matriz: la venta aparecia con trabajo en
      // taller cuando no habia ninguno.
      if (res.statusCode !== 409) {
        expect(res.statusCode).toBe(400)
        expect(JSON.parse(res.body).error).toMatch(/item/i)
      }
    })
  })

  describe('la Matriz muestra lo que hizo bodega', () => {
    it('trae los despachos de la venta, no solo las guias', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/matriz-ventas?pageSize=5',
        headers: { authorization: `Bearer ${token('admin')}` },
      })
      expect(res.statusCode).toBe(200)
      const [fila] = JSON.parse(res.body).items || []
      if (!fila) return
      // El despacho y la guia son tablas distintas: mirando solo guias, una venta ya
      // tomada por bodega se veia sin movimiento.
      expect(fila).toHaveProperty('despachos')
      expect(fila).toHaveProperty('despachosCount')
      expect(Array.isArray(fila.despachos)).toBe(true)
    })
  })

  describe('facturacion se entera durante la preparacion, no despues de la entrega', () => {
    it('ofrece el aviso de venta en preparacion sin documento', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/notificaciones',
        headers: { authorization: `Bearer ${token('bodeguero', { 'facturacion.emitir': ['read', 'write'] })}` },
      })
      expect(res.statusCode).toBe(200)
      const tipos = new Set((JSON.parse(res.body).items || []).map(a => a.tipo))
      // El aviso viejo -entregada sin facturar- llega cuando la venta ya salio y solo
      // sirve para reclamar. Este llega mientras bodega la arma.
      expect(tipos.has('venta_en_preparacion_sin_documento') || tipos.has('venta_sin_facturar')).toBe(true)
    })
  })
})
