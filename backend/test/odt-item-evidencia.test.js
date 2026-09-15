// Evidencia fotografica generalizada a cualquier estacion de taller (antes
// solo existia para "Taller de Corte", ver backend/src/routes/taller-corte).
// Feedback de Zalma Lobos (taller confecciones, 2026-09-15): sin esto no hay
// como "ratificar el trabajo de salida" fuera de Corte.
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

const PNG_1PX_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describeDb('evidencia fotografica de cualquier estacion de taller', () => {
  let app, userId, producto, tallerConfecciones
  const creado = { odts: [], centros: [] }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    userId = (await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })).id
    producto = await app.prisma.producto.findFirst({ where: { activo: true }, select: { id: true } })
    tallerConfecciones = await app.prisma.taller.findFirst({
      where: { activo: true, NOT: { nombre: { equals: 'Taller de Corte', mode: 'insensitive' } } },
      select: { id: true, nombre: true },
    })
  })
  afterAll(async () => {
    for (const id of creado.odts) await app.prisma.odt.delete({ where: { id } }).catch(() => {})
    for (const id of creado.centros) await app.prisma.centroCosto.delete({ where: { id } }).catch(() => {})
    await app.close()
  })

  const token = () => app.jwt.sign({
    id: userId, role: 'taller', nombre: 'Zalma Test', permisosExtra: { 'taller.avance': ['read', 'write'] },
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })

  async function etapaEnProceso() {
    const marca = `EVID-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const centro = await app.prisma.centroCosto.create({ data: { codigo: marca, nombre: marca } })
    creado.centros.push(centro.id)
    const odt = await app.prisma.odt.create({
      data: { centroCostoId: centro.id, clienteNombre: marca, estado: 'En proceso' },
    })
    creado.odts.push(odt.id)
    const item = await app.prisma.odtItem.create({
      data: { odtId: odt.id, productoId: producto.id, nombre: marca, cantidad: 10 },
    })
    const etapa = await app.prisma.odtItemTaller.create({
      data: { odtItemId: item.id, tallerId: tallerConfecciones.id, estado: 'en_proceso' },
    })
    return { odt, item, etapa }
  }

  const subir = (ctx, body) => app.inject({
    method: 'POST',
    url: `/api/odts/${ctx.odt.id}/items/${ctx.item.id}/talleres/${ctx.etapa.id}/evidencias`,
    headers: { authorization: `Bearer ${token()}` },
    payload: body,
  })

  it('acepta una foto en una estacion que no es Taller de Corte y la deja trazada', async () => {
    const ctx = await etapaEnProceso()
    const res = await subir(ctx, { data: `data:image/png;base64,${PNG_1PX_BASE64}`, nombreArchivo: 'salida.png' })
    expect(res.statusCode, res.body).toBe(201)
    const evidencia = JSON.parse(res.body)
    expect(evidencia.odtItemTallerId).toBe(ctx.etapa.id)
    expect(evidencia.archivoUrl).toMatch(/^\/uploads\/taller-evidencias\//)
    expect(evidencia.usuario).toBeTruthy()

    const enDb = await app.prisma.tallerEvidencia.findUnique({ where: { id: evidencia.id } })
    expect(enDb).toBeTruthy()
    expect(enDb.odtId).toBe(ctx.odt.id)

    const bitacora = await app.prisma.bitacoraTaller.findFirst({
      where: { odtId: ctx.odt.id, texto: { contains: 'Evidencia fotografica' } },
      orderBy: { id: 'desc' },
    })
    expect(bitacora).toBeTruthy()
    expect(bitacora.texto).toContain(tallerConfecciones.nombre)
  })

  it('rechaza datos que no son una imagen valida', async () => {
    const ctx = await etapaEnProceso()
    const res = await subir(ctx, { data: 'data:application/pdf;base64,ZmFrZQ==' })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/imagen/i)
  })

  it('devuelve 404 si la relacion odt/item/taller no existe', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/odts/999999/items/999999/talleres/999999/evidencias',
      headers: { authorization: `Bearer ${token()}` },
      payload: { data: `data:image/png;base64,${PNG_1PX_BASE64}` },
    })
    expect(res.statusCode).toBe(404)
  })
})
