// Última etapa de la ficha de taller: cuando la producción termina, bodega y
// despacho tienen que enterarse solos, sin que nadie avise por WhatsApp.
//
// Lo delicado es CUÁNDO dispara. Una OT pasa por varias estaciones; si el aviso
// sale con la primera lista, bodega prepara un despacho incompleto. Si no sale
// nunca, la OT terminada se queda esperando a que alguien la mire.
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

describeDb('el aviso de produccion terminada', () => {
  let app
  const marca = `TERM-${Date.now()}`
  const creado = { talleres: [] }
  let bodeguero
  let estacionCorte
  let estacionCostura

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()

    bodeguero = await app.prisma.user.create({
      data: { email: `${marca}-bod@plastimar.cl`, passwordHash: 'x', role: 'bodeguero', nombre: `${marca} Bodega`, activo: true },
    })

    // Toda OT debe declarar origen: una orden de venta o un centro de costo
    // (constraint odts_origen_requerido_new). Acá basta el centro de costo, que no
    // arrastra cliente ni sucursal: el aviso de término no depende de la procedencia.
    const centro = await app.prisma.centroCosto.create({
      data: { codigo: `${marca}-CC`, nombre: `${marca} Interno` },
    })
    creado.centroCostoId = centro.id

    const odt = await app.prisma.odt.create({
      data: { centroCostoId: centro.id, clienteNombre: `${marca} Cliente`, estado: 'Pendiente' },
    })
    creado.odtId = odt.id

    const producto = await app.prisma.producto.create({
      data: { codigoInterno: `${marca}-P`, nombre: `${marca} Producto`, activo: true },
    })
    creado.productoId = producto.id

    const item = await app.prisma.odtItem.create({
      data: { odtId: odt.id, productoId: producto.id, cantidad: 3, nombre: `${marca} Producto` },
    })
    creado.itemId = item.id

    // Dos estaciones: la OT no esta lista hasta que ambas terminen.
    for (const nombre of [`${marca} Corte`, `${marca} Costura`]) {
      const t = await app.prisma.taller.upsert({ where: { nombre }, update: {}, create: { nombre, activo: true } })
      creado.talleres.push(t.id)
    }
    estacionCorte = await app.prisma.odtItemTaller.create({
      data: { odtItemId: item.id, tallerId: creado.talleres[0], estado: 'pendiente' },
    })
    estacionCostura = await app.prisma.odtItemTaller.create({
      data: { odtItemId: item.id, tallerId: creado.talleres[1], estado: 'pendiente' },
    })
  })

  afterAll(async () => {
    await app.prisma.odtItemTaller.deleteMany({ where: { odtItemId: creado.itemId } }).catch(() => {})
    await app.prisma.odtItem.deleteMany({ where: { odtId: creado.odtId } }).catch(() => {})
    await app.prisma.odt.deleteMany({ where: { id: creado.odtId } }).catch(() => {})
    await app.prisma.producto.deleteMany({ where: { id: creado.productoId } }).catch(() => {})
    await app.prisma.taller.deleteMany({ where: { id: { in: creado.talleres } } }).catch(() => {})
    await app.prisma.user.deleteMany({ where: { id: bodeguero.id } }).catch(() => {})
    await app.close()
  })

  const avisoDeEstaOdt = async () => {
    const token = app.jwt.sign({
      id: bodeguero.id, role: 'bodeguero', nombre: 'Bodega', permisosExtra: null,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
    const res = await app.inject({ method: 'GET', url: '/api/notificaciones', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const cuerpo = res.json()
    const lista = Array.isArray(cuerpo) ? cuerpo : (cuerpo.items || [])
    return lista.find(n => n.tipo === 'odt_lista_despacho' && String(n.titulo).includes(`#${creado.odtId}`))
  }

  it('no avisa mientras hay estaciones pendientes', async () => {
    expect(await avisoDeEstaOdt()).toBeUndefined()
  })

  // El caso que importa: avisar con la primera estación lista haría que bodega
  // prepare un despacho al que todavía le falta la mitad del trabajo.
  it('tampoco avisa con una sola estacion lista', async () => {
    await app.prisma.odtItemTaller.update({ where: { id: estacionCorte.id }, data: { estado: 'listo', fechaListo: new Date() } })
    expect(await avisoDeEstaOdt()).toBeUndefined()
  })

  it('avisa cuando todas terminaron', async () => {
    await app.prisma.odtItemTaller.update({ where: { id: estacionCostura.id }, data: { estado: 'listo', fechaListo: new Date() } })
    const aviso = await avisoDeEstaOdt()
    expect(aviso).toBeTruthy()
    expect(aviso.link).toContain(String(creado.odtId))
  })

  // Una estación cancelada no es trabajo pendiente: si contara, la OT quedaría
  // esperando para siempre por algo que nadie va a hacer.
  it('una estacion cancelada no retiene el aviso', async () => {
    await app.prisma.odtItemTaller.update({ where: { id: estacionCostura.id }, data: { estado: 'cancelado' } })
    expect(await avisoDeEstaOdt()).toBeTruthy()
  })
})
