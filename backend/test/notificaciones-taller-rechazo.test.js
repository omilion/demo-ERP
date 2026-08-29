// Cuando el taller rechaza un producto, la venta queda detenida y quien la hizo
// tiene que enterarse. El rechazo por item ya existia y exige motivo, pero solo
// quedaba en la bitacora del taller: nadie avisaba a la vendedora.
//
// El caso que describio Plastimar es un producto descontinuado ingresado por
// error. Son pocos, pero si nadie se entera la OT queda detenida sin dueno.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function hasUsableDatabaseUrl() {
  try {
    const url = new URL(process.env.DATABASE_URL || '')
    return Boolean(url.hostname && url.username && url.password)
  } catch {
    return false
  }
}

const describeDb = hasUsableDatabaseUrl() ? describe : describe.skip

describeDb('notificacion: el taller rechazo un producto', () => {
  let app
  const marca = `RECH-${Date.now()}`
  const creado = {}
  let tokenDueno
  let tokenOtro

  const tokenPara = (id, role = 'vendedor') => app.jwt.sign({
    id, role, nombre: `${marca} ${role}`, permisosExtra: null,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()

    const dueno = await app.prisma.user.create({
      data: { email: `${marca}-duena@plastimar.cl`, passwordHash: 'x', role: 'vendedor', nombre: `${marca} Duena`, activo: true },
    })
    const otro = await app.prisma.user.create({
      data: { email: `${marca}-otro@plastimar.cl`, passwordHash: 'x', role: 'vendedor', nombre: `${marca} Otro`, activo: true },
    })
    creado.usuarios = [dueno.id, otro.id]
    tokenDueno = tokenPara(dueno.id)
    tokenOtro = tokenPara(otro.id)

    const cliente = await app.prisma.cliente.create({
      data: { rut: `${marca}-9`, nombre: `${marca} Cliente`, activo: true },
    })
    creado.clienteId = cliente.id

    const orden = await app.prisma.orden.create({
      data: { tipo: 'Venta Sala', clienteId: cliente.id, userId: dueno.id, creadorNombre: `${marca} Duena` },
    })
    creado.ordenId = orden.id

    const odt = await app.prisma.odt.create({
      data: { ordenId: orden.id, clienteNombre: `${marca} Cliente`, estado: 'Pendiente' },
    })
    creado.odtId = odt.id

    const producto = await app.prisma.producto.create({
      data: { codigoInterno: `${marca}-P`, nombre: `${marca} Producto descontinuado`, activo: true },
    })
    creado.productoId = producto.id

    const item = await app.prisma.odtItem.create({
      data: { odtId: odt.id, productoId: producto.id, cantidad: 1, nombre: `${marca} Producto descontinuado` },
    })
    creado.itemId = item.id

    const taller = await app.prisma.taller.upsert({
      where: { nombre: `${marca} Corte` },
      update: {},
      create: { nombre: `${marca} Corte`, activo: true },
    })
    creado.tallerId = taller.id

    await app.prisma.odtItemTaller.create({
      data: { odtItemId: item.id, tallerId: taller.id, estado: 'rechazado', obs: 'Producto descontinuado' },
    })
  })

  afterAll(async () => {
    await app.prisma.odtItemTaller.deleteMany({ where: { odtItemId: creado.itemId } }).catch(() => {})
    await app.prisma.odtItem.deleteMany({ where: { odtId: creado.odtId } }).catch(() => {})
    await app.prisma.odt.deleteMany({ where: { id: creado.odtId } }).catch(() => {})
    await app.prisma.orden.deleteMany({ where: { id: creado.ordenId } }).catch(() => {})
    await app.prisma.cliente.deleteMany({ where: { id: creado.clienteId } }).catch(() => {})
    await app.prisma.taller.deleteMany({ where: { id: creado.tallerId } }).catch(() => {})
    await app.prisma.producto.deleteMany({ where: { id: creado.productoId } }).catch(() => {})
    await app.prisma.user.deleteMany({ where: { id: { in: creado.usuarios || [] } } }).catch(() => {})
    await app.close()
  })

  const notificaciones = token => app.inject({
    method: 'GET', url: '/api/notificaciones', headers: { authorization: `Bearer ${token}` },
  }).then(res => {
    expect(res.statusCode).toBe(200)
    const cuerpo = res.json()
    return Array.isArray(cuerpo) ? cuerpo : (cuerpo.items || [])
  })

  it('le avisa a la vendedora de esa venta, con el motivo', async () => {
    const propias = (await notificaciones(tokenDueno)).filter(n => n.tipo === 'taller_item_rechazado')
    const mia = propias.find(n => String(n.detalle || '').includes(marca))
    expect(mia).toBeTruthy()
    expect(mia.detalle).toContain('Producto descontinuado')
    expect(mia.severidad).toBe('alta')
  })

  // Lo que hace util el aviso es que llegue a quien corresponde: si le llega a
  // todo el equipo, se vuelve ruido y nadie lo atiende.
  it('no le llega a otra vendedora', async () => {
    const ajenas = (await notificaciones(tokenOtro))
      .filter(n => n.tipo === 'taller_item_rechazado' && String(n.detalle || '').includes(marca))
    expect(ajenas).toHaveLength(0)
  })

  it('nombra la venta para poder ubicarla', async () => {
    const propias = (await notificaciones(tokenDueno)).filter(n => n.tipo === 'taller_item_rechazado')
    const mia = propias.find(n => String(n.detalle || '').includes(marca))
    expect(mia.titulo).toMatch(/venta #/i)
    expect(mia.link).toContain(String(creado.odtId))
  })
})
