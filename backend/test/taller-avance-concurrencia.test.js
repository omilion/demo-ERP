// El avance de taller bajo concurrencia y quien puede registrarlo.
//
// Sale de la auditoria de Talleres. Dos operarias registran avance sobre la misma
// tarea en turnos que se solapan: si la suma se valida fuera de la transaccion, ambas
// leen el mismo total previo, las dos pasan el chequeo y entre ambas anotan mas de lo
// pedido. Nadie lo nota hasta que el conteo no calza con lo que salio del taller.
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

describeDb('el avance de taller no se pasa de la cantidad pedida', () => {
  let app, userId, producto, taller
  const creado = { odts: [], centros: [] }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    const u = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })
    userId = u.id
    producto = await app.prisma.producto.findFirst({ where: { activo: true }, select: { id: true } })
    // La ruta de Corte solo resuelve tareas de ese taller: cualquier otro da 404.
    taller = await app.prisma.taller.findFirst({ where: { activo: true, nombre: { equals: 'Taller de Corte', mode: 'insensitive' } }, select: { id: true } })
  })

  afterAll(async () => {
    for (const id of creado.odts) await app.prisma.odt.delete({ where: { id } }).catch(() => {})
    for (const id of creado.centros) await app.prisma.centroCosto.delete({ where: { id } }).catch(() => {})
    await app.close()
  })

  const token = (role, extra = null) => app.jwt.sign({
    id: userId, role, nombre: 'operaria', permisosExtra: extra,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })

  // Una tarea de taller con `cantidad` unidades pedidas.
  async function tareaCon(cantidad) {
    const marca = `AVC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const centro = await app.prisma.centroCosto.create({ data: { codigo: marca, nombre: marca } })
    creado.centros.push(centro.id)
    const odt = await app.prisma.odt.create({
      data: { centroCostoId: centro.id, clienteNombre: marca, estado: 'Pendiente' },
    })
    creado.odts.push(odt.id)
    const item = await app.prisma.odtItem.create({
      data: { odtId: odt.id, productoId: producto.id, nombre: marca, cantidad },
    })
    return app.prisma.odtItemTaller.create({
      data: { odtItemId: item.id, tallerId: taller.id, estado: 'pendiente' },
    })
  }

  const registrar = (tareaId, cantidadTerminada) => app.inject({
    method: 'POST',
    url: `/api/taller-corte/items/${tareaId}/avances`,
    headers: { authorization: `Bearer ${token('taller_operario')}` },
    payload: { cantidadTerminada, fechaTrabajo: new Date().toISOString() },
  })

  const totalDe = async tareaId => {
    const r = await app.prisma.odtAvance.aggregate({
      where: { odtItemTallerId: tareaId }, _sum: { cantidadTerminada: true },
    })
    return Number(r._sum.cantidadTerminada || 0)
  }

  it('el operario puede registrar su propio avance', async () => {
    const tarea = await tareaCon(10)
    const res = await registrar(tarea.id, 4)
    expect(res.statusCode).toBe(201)
    expect(await totalDe(tarea.id)).toBe(4)
  })

  it('rechaza el avance que se pasa del objetivo', async () => {
    const tarea = await tareaCon(10)
    expect((await registrar(tarea.id, 8)).statusCode).toBe(201)
    const segundo = await registrar(tarea.id, 5)
    expect(segundo.statusCode).toBe(409)
    expect(await totalDe(tarea.id)).toBe(8)
  })

  it('dos avances simultaneos no superan entre ambos la cantidad pedida', async () => {
    const tarea = await tareaCon(10)
    // Se lanzan a la vez a proposito: es el caso que la validacion fuera de la
    // transaccion dejaba pasar.
    const [a, b] = await Promise.all([registrar(tarea.id, 7), registrar(tarea.id, 7)])
    const codigos = [a.statusCode, b.statusCode].sort()
    expect(codigos).toEqual([201, 409])
    expect(await totalDe(tarea.id)).toBe(7)
  })

  it('conserva ambos autores cuando los dos avances caben', async () => {
    const tarea = await tareaCon(10)
    const [a, b] = await Promise.all([registrar(tarea.id, 4), registrar(tarea.id, 5)])
    expect([a.statusCode, b.statusCode]).toEqual([201, 201])
    expect(await totalDe(tarea.id)).toBe(9)
    const avances = await app.prisma.odtAvance.findMany({ where: { odtItemTallerId: tarea.id } })
    // Append-only: los dos registros quedan, con su hora y su autor.
    expect(avances).toHaveLength(2)
    expect(avances.every(a2 => a2.usuario && a2.fechaTrabajo)).toBe(true)
  })
})
