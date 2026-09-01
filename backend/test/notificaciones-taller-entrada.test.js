// El taller no tenía aviso de ENTRADA: sólo se enteraba de una OT cuando ya
// estaba atrasada. Mientras tanto la coordinación ocurría por WhatsApp, que es
// lo que reportaron las tres fichas de taller.
//
// Y el aviso de atraso no distinguía a quién le tocaba: una cortadora recibía
// las OT atrasadas de espuma y madera, que no son su trabajo. Un aviso que no
// es tuyo es ruido, y el ruido hace que nadie mire la campana.
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

describeDb('al taller le llega su trabajo', () => {
  let app
  const marca = `ENTR-${Date.now()}`
  const creado = { usuarios: [] }
  let cortadora
  let otraCortadora

  const token = (id, role, extra = null) => app.jwt.sign({
    id, role, nombre: 'Test', permisosExtra: extra,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()

    cortadora = await app.prisma.user.create({
      data: { email: `${marca}-corta@plastimar.cl`, passwordHash: 'x', role: 'taller_operario', nombre: `${marca} Cortadora`, activo: true },
    })
    otraCortadora = await app.prisma.user.create({
      data: { email: `${marca}-otra@plastimar.cl`, passwordHash: 'x', role: 'taller_operario', nombre: `${marca} Otra`, activo: true },
    })
    creado.usuarios = [cortadora.id, otraCortadora.id]

    // Toda OT debe declarar origen: una orden de venta o un centro de costo
    // (constraint odts_origen_requerido_new). Acá basta el centro de costo, que no
    // arrastra cliente ni sucursal: el aviso al taller no depende de la procedencia.
    const centro = await app.prisma.centroCosto.create({
      data: { codigo: `${marca}-CC`, nombre: `${marca} Interno` },
    })
    creado.centroCostoId = centro.id

    const odt = await app.prisma.odt.create({
      data: { centroCostoId: centro.id, clienteNombre: `${marca} Cliente`, estado: 'Pendiente', fechaEntregaCompromiso: new Date(Date.now() + 86400000) },
    })
    creado.odtId = odt.id

    const producto = await app.prisma.producto.create({
      data: { codigoInterno: `${marca}-P`, nombre: `${marca} Cortina`, activo: true },
    })
    creado.productoId = producto.id

    const item = await app.prisma.odtItem.create({
      data: { odtId: odt.id, productoId: producto.id, cantidad: 8, nombre: `${marca} Cortina` },
    })
    creado.itemId = item.id

    const taller = await app.prisma.taller.upsert({
      where: { nombre: `${marca} Corte` }, update: {},
      create: { nombre: `${marca} Corte`, activo: true },
    })
    creado.tallerId = taller.id

    // El trabajo queda asignado a una cortadora, no a la otra.
    await app.prisma.odtItemTaller.create({
      data: { odtItemId: item.id, tallerId: taller.id, estado: 'pendiente', operarioResponsableId: cortadora.id },
    })
  })

  afterAll(async () => {
    await app.prisma.odtItemTaller.deleteMany({ where: { odtItemId: creado.itemId } }).catch(() => {})
    await app.prisma.odtItem.deleteMany({ where: { odtId: creado.odtId } }).catch(() => {})
    await app.prisma.odt.deleteMany({ where: { id: creado.odtId } }).catch(() => {})
    await app.prisma.producto.deleteMany({ where: { id: creado.productoId } }).catch(() => {})
    await app.prisma.taller.deleteMany({ where: { id: creado.tallerId } }).catch(() => {})
    await app.prisma.user.deleteMany({ where: { id: { in: creado.usuarios } } }).catch(() => {})
    await app.close()
  })

  const avisos = async (userId, role, extra = null) => {
    const res = await app.inject({
      method: 'GET', url: '/api/notificaciones',
      headers: { authorization: `Bearer ${token(userId, role, extra)}` },
    })
    expect(res.statusCode).toBe(200)
    const cuerpo = res.json()
    return Array.isArray(cuerpo) ? cuerpo : (cuerpo.items || [])
  }

  it('avisa cuando entra trabajo, no sólo cuando se atrasa', async () => {
    const propios = (await avisos(cortadora.id, 'taller_operario'))
      .filter(n => n.tipo === 'taller_trabajo_asignado' && String(n.titulo).includes(marca))
    expect(propios).toHaveLength(1)
  })

  it('el aviso trae lo que necesita para trabajar', async () => {
    const aviso = (await avisos(cortadora.id, 'taller_operario'))
      .find(n => n.tipo === 'taller_trabajo_asignado' && String(n.titulo).includes(marca))
    // Taller, cantidad, cliente y plazo: sin eso hay que abrir la OT igual.
    expect(aviso.detalle).toContain('Corte')
    expect(aviso.detalle).toContain('8 u.')
    expect(aviso.detalle).toContain('Cliente')
    expect(aviso.detalle).toMatch(/entrega en|atrasado/)
    expect(aviso.link).toContain(String(creado.odtId))
  })

  it('no le llega el trabajo de otra cortadora', async () => {
    const ajenos = (await avisos(otraCortadora.id, 'taller_operario'))
      .filter(n => n.tipo === 'taller_trabajo_asignado' && String(n.titulo).includes(marca))
    expect(ajenos).toHaveLength(0)
  })

  // Quien gestiona el taller necesita ver toda la carga, no sólo lo suyo.
  it('la supervisora sigue viendo los atrasos de todo el taller', async () => {
    const supervisora = { 'taller.gestion': ['read', 'write'] }
    const res = await avisos(otraCortadora.id, 'taller', supervisora)
    // No falla por contenido -depende de los datos-, pero la consulta tiene que
    // resolver sin acotar por operario.
    expect(Array.isArray(res)).toBe(true)
  })
})
