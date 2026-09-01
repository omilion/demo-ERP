// La recepcion entre etapas: quien recibe declara que le llego conforme.
//
// Es el P0-5 de la auditoria de Talleres -calidad-, resuelto como aceptacion en el
// traspaso y no como una puerta aparte. La razon es practica: las encuestas no
// mencionan a nadie haciendo control de calidad, y un estado "pendiente de calidad"
// que nadie vacia bloquea la operacion entera. Ya pasó con operarioResponsableId, que
// existe hace meses y tiene cero OT asignadas.
//
// Quien recibe es el primer interesado en que el trabajo venga bien y ya esta ahi.
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

describeDb('la etapa siguiente recibe el trabajo de la anterior', () => {
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

  const token = (extra = { 'taller.avance': ['read', 'write'] }) => app.jwt.sign({
    id: userId, role: 'taller', nombre: 'confeccion', permisosExtra: extra,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })

  async function etapaEn(estado, cantidad = 100) {
    const marca = `REC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const centro = await app.prisma.centroCosto.create({ data: { codigo: marca, nombre: marca } })
    creado.centros.push(centro.id)
    const odt = await app.prisma.odt.create({
      data: { centroCostoId: centro.id, clienteNombre: marca, estado: 'En proceso' },
    })
    creado.odts.push(odt.id)
    const item = await app.prisma.odtItem.create({
      data: { odtId: odt.id, productoId: producto.id, nombre: marca, cantidad },
    })
    const etapa = await app.prisma.odtItemTaller.create({
      data: { odtItemId: item.id, tallerId: taller.id, estado, fechaListo: estado === 'listo' ? new Date() : null },
    })
    return { odt, item, etapa }
  }

  const recibir = (ctx, payload) => app.inject({
    method: 'POST',
    url: `/api/odts/${ctx.odt.id}/items/${ctx.item.id}/talleres/${ctx.etapa.id}/recepcion`,
    headers: { authorization: `Bearer ${token()}` },
    payload,
  })

  const etapaDe = async ctx => app.prisma.odtItemTaller.findUnique({ where: { id: ctx.etapa.id } })

  it('acepta el trabajo conforme y lo deja registrado con su autor', async () => {
    const ctx = await etapaEn('listo')
    const res = await recibir(ctx, { cantidadAceptada: 100 })
    expect(res.statusCode).toBe(201)
    const rec = JSON.parse(res.body)
    expect(rec.cantidadAceptada).toBe(100)
    expect(rec.cantidadRechazada).toBe(0)
    expect(rec.decision).toBe('aceptada')
    expect(rec.usuario).toBeTruthy()
    // Aceptar no cambia el estado: la etapa ya estaba lista y lo sigue estando.
    expect((await etapaDe(ctx)).estado).toBe('listo')
  })

  it('registra el rechazo parcial y devuelve la etapa a proceso', async () => {
    // El caso real que describe Corte: de 100 cortes, 8 con el color cambiado.
    const ctx = await etapaEn('listo')
    const res = await recibir(ctx, {
      cantidadAceptada: 92, cantidadRechazada: 8, defecto: 'Color distinto al solicitado',
    })
    expect(res.statusCode).toBe(201)
    const rec = JSON.parse(res.body)
    expect(rec.cantidadRevisada).toBe(100)
    expect(rec.decision).toBe('reproceso')

    // Con trabajo que rehacer la etapa deja de estar lista, y con eso la puerta de
    // cierre de la OT la detiene sola: no hizo falta un estado nuevo.
    const etapa = await etapaDe(ctx)
    expect(etapa.estado).toBe('en_proceso')
    expect(etapa.fechaListo).toBeNull()
  })

  it('no acepta un rechazo sin decir que estuvo mal', async () => {
    const ctx = await etapaEn('listo')
    const res = await recibir(ctx, { cantidadAceptada: 90, cantidadRechazada: 10 })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/defecto/i)
  })

  it('no recibe una etapa que el taller todavia no declara lista', async () => {
    const ctx = await etapaEn('en_proceso')
    const res = await recibir(ctx, { cantidadAceptada: 10 })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error).toMatch(/lista/i)
  })

  it('exige alguna cantidad que revisar', async () => {
    const ctx = await etapaEn('listo')
    const res = await recibir(ctx, { cantidadAceptada: 0, cantidadRechazada: 0 })
    expect(res.statusCode).toBe(400)
  })

  it('el descarte no manda la etapa a reproceso', async () => {
    // Lo descartado no se rehace: se pierde y se sigue con lo aceptado.
    const ctx = await etapaEn('listo')
    const res = await recibir(ctx, {
      cantidadAceptada: 95, cantidadRechazada: 5, defecto: 'Material fallado', decision: 'descarte',
    })
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body).decision).toBe('descarte')
    expect((await etapaDe(ctx)).estado).toBe('listo')
  })

  it('deja rastro en la bitacora de la OT', async () => {
    const ctx = await etapaEn('listo')
    await recibir(ctx, { cantidadAceptada: 40, cantidadRechazada: 60, defecto: 'Medidas fuera de tolerancia' })
    const bitacora = await app.prisma.bitacoraTaller.findMany({ where: { odtId: ctx.odt.id } })
    const entrada = bitacora.find(b => String(b.texto).includes('Recepción'))
    expect(entrada).toBeTruthy()
    expect(entrada.texto).toMatch(/rechaza 60/)
    expect(entrada.texto).toMatch(/Medidas fuera de tolerancia/)
  })

  // La calidad de lo que sale de un taller la aprueba su jefe. Hasta ahora el sistema
  // no podia siquiera nombrarlo: el rol `taller` gobierna todos los talleres por igual.
  describe('quien aprueba la calidad', () => {
    let otroUsuario

    beforeAll(async () => {
      otroUsuario = await app.prisma.user.findFirst({
        where: { activo: true, id: { not: userId } }, select: { id: true },
      })
    })

    const comoUsuario = (id, extra, role = 'taller') => app.jwt.sign({
      id, role, nombre: `u${id}`, permisosExtra: extra,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })

    const recibirComo = (ctx, token, payload) => app.inject({
      method: 'POST',
      url: `/api/odts/${ctx.odt.id}/items/${ctx.item.id}/talleres/${ctx.etapa.id}/recepcion`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    })

    it('el jefe del taller aprueba', async () => {
      const ctx = await etapaEn('listo')
      await app.prisma.taller.update({ where: { id: taller.id }, data: { jefeId: userId } })
      try {
        const res = await recibirComo(ctx, comoUsuario(userId, { 'taller.avance': ['read', 'write'] }), { cantidadAceptada: 100 })
        expect(res.statusCode).toBe(201)
      } finally {
        await app.prisma.taller.update({ where: { id: taller.id }, data: { jefeId: null } })
      }
    })

    it('un operario cualquiera no aprueba lo que sale del taller', async () => {
      if (!otroUsuario) return
      const ctx = await etapaEn('listo')
      await app.prisma.taller.update({ where: { id: taller.id }, data: { jefeId: otroUsuario.id } })
      try {
        // Con el rol de operario, que es quien ejecuta y no quien aprueba.
        const res = await recibirComo(ctx, comoUsuario(userId, null, 'taller_operario'), { cantidadAceptada: 100 })
        expect(res.statusCode).toBe(403)
        expect(JSON.parse(res.body).error).toMatch(/jefe/i)
      } finally {
        await app.prisma.taller.update({ where: { id: taller.id }, data: { jefeId: null } })
      }
    })

    it('la coordinacion tambien aprueba: alguien tiene que poder destrabar', async () => {
      if (!otroUsuario) return
      const ctx = await etapaEn('listo')
      await app.prisma.taller.update({ where: { id: taller.id }, data: { jefeId: otroUsuario.id } })
      try {
        const res = await recibirComo(ctx, comoUsuario(userId, { 'taller.gestion': ['read', 'write'] }), { cantidadAceptada: 100 })
        expect(res.statusCode).toBe(201)
      } finally {
        await app.prisma.taller.update({ where: { id: taller.id }, data: { jefeId: null } })
      }
    })

    it('un taller sin jefe asignado no bloquea a nadie', async () => {
      // Un control que nadie puede ejercer detiene el trabajo en vez de ordenarlo.
      const ctx = await etapaEn('listo')
      const res = await recibirComo(ctx, comoUsuario(userId, { 'taller.avance': ['read', 'write'] }), { cantidadAceptada: 100 })
      expect(res.statusCode).toBe(201)
    })
  })

  it('conserva cada recepcion: son append-only', async () => {
    const ctx = await etapaEn('listo')
    await recibir(ctx, { cantidadAceptada: 50, cantidadRechazada: 50, defecto: 'Primera revision' })
    await app.prisma.odtItemTaller.update({ where: { id: ctx.etapa.id }, data: { estado: 'listo' } })
    await recibir(ctx, { cantidadAceptada: 50 })
    const recepciones = await app.prisma.odtEtapaRecepcion.findMany({
      where: { odtItemTallerId: ctx.etapa.id }, orderBy: { id: 'asc' },
    })
    expect(recepciones).toHaveLength(2)
    expect(recepciones[0].cantidadRechazada).toBe(50)
    expect(recepciones[1].cantidadRechazada).toBe(0)
  })
})
