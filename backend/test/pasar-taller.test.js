import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin', sucursalId = null, permisosExtra = null) {
  return app.jwt.sign({
    id: 1,
    role,
    nombre: `Test ${role}`,
    permisosExtra,
    sucursalId,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

let seq = 1

async function ensureTalleres(app) {
  const data = [
    { nombre: 'confecciones' },
    { nombre: 'espumas' },
    { nombre: 'externo' },
  ]
  const talleres = []
  for (const taller of data) {
    const existing = await app.prisma.taller.findFirst({ where: { nombre: taller.nombre } })
    talleres.push(existing
      ? await app.prisma.taller.update({ where: { id: existing.id }, data: { activo: true } })
      : await app.prisma.taller.create({ data: { ...taller, activo: true } }))
  }
  return talleres
}

async function createFixture(app, marker, options = {}) {
  const user = await app.prisma.user.findFirst({ select: { id: true } })
  const cliente = await app.prisma.cliente.create({
    data: {
      rut: `pt-${marker}-${seq++}`,
      nombre: `Cliente PT ${marker}`,
      razonSocial: `Cliente PT ${marker}`,
      activo: true,
    },
  })
  const transitorio = await app.prisma.producto.create({
    data: {
      codigoInterno: `PT-TR-${marker}-${seq++}`,
      nombre: `Producto transitorio ${marker}`,
      estadoInventario: 'Transitorio',
      precioLista: 1000,
      activo: true,
    },
  })
  const inventariado = await app.prisma.producto.create({
    data: {
      codigoInterno: `PT-INV-${marker}-${seq++}`,
      nombre: `Producto inventariado ${marker}`,
      estadoInventario: 'Inventariado',
      precioLista: 1000,
      activo: true,
    },
  })
  const orden = await app.prisma.orden.create({
    data: {
      nInterno: 930000000 + seq++,
      tipo: 'Venta sala',
      estado: options.estado || 'Activa',
      estadoPago: 'No pagada',
      estadoEntrega: 'Pendiente entrega',
      clienteId: cliente.id,
      rutCliente: cliente.rut,
      userId: user.id,
      sucursalId: options.sucursalId ?? 9201,
      items: {
        create: [
          {
            productoId: transitorio.id,
            codigoInterno: transitorio.codigoInterno,
            nombre: transitorio.nombre,
            descripcion: 'Medida especial 100x200',
            cantidad: 3,
            nEntregados: options.nEntregados ?? 0,
            precioUnitario: 1000,
          },
          {
            productoId: inventariado.id,
            codigoInterno: inventariado.codigoInterno,
            nombre: inventariado.nombre,
            cantidad: 2,
            precioUnitario: 1000,
          },
        ],
      },
    },
    include: { items: true },
  })
  return { cliente, orden, transitorio, inventariado }
}

async function cleanup(app, fixture) {
  if (!fixture) return
  const odts = await app.prisma.odt.findMany({ where: { ordenId: fixture.orden.id }, select: { id: true } })
  const odtIds = odts.map(o => o.id)
  const items = odtIds.length
    ? await app.prisma.odtItem.findMany({ where: { odtId: { in: odtIds } }, select: { id: true } })
    : []
  const itemIds = items.map(i => i.id)
  if (itemIds.length) await app.prisma.odtItemTaller.deleteMany({ where: { odtItemId: { in: itemIds } } })
  if (odtIds.length) {
    await app.prisma.bitacoraTaller.deleteMany({ where: { odtId: { in: odtIds } } })
    await app.prisma.odtItem.deleteMany({ where: { odtId: { in: odtIds } } })
    await app.prisma.odt.deleteMany({ where: { id: { in: odtIds } } })
  }
  await app.prisma.orden.delete({ where: { id: fixture.orden.id } }).catch(() => {})
  await app.prisma.producto.deleteMany({ where: { id: { in: [fixture.transitorio.id, fixture.inventariado.id] } } })
  await app.prisma.cliente.delete({ where: { id: fixture.cliente.id } }).catch(() => {})
}

describe('pasar taller legacy parity', () => {
  let app
  let talleres

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    talleres = await ensureTalleres(app)
  })

  afterAll(async () => {
    await app.close()
  })

  it('lista solo productos transitorios pendientes de la venta', async () => {
    const marker = `list-${Date.now()}`
    const fixture = await createFixture(app, marker)
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/pasar-taller/orden?ordenId=${fixture.orden.id}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'vendedor', 9201)}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.orden.id).toBe(fixture.orden.id)
      expect(body.items).toHaveLength(1)
      expect(body.items[0]).toMatchObject({
        productoId: fixture.transitorio.id,
        estadoInventario: 'Transitorio',
        enTaller: false,
        pendienteEntrega: 3,
      })
      expect(body.items[0].codigoInterno).toBe(fixture.transitorio.codigoInterno)
    } finally {
      await cleanup(app, fixture)
    }
  })

  it('permite leer pasar-taller a usuarios con ventas.write aunque no tengan taller.read', async () => {
    const marker = `read-sales-${Date.now()}`
    const fixture = await createFixture(app, marker)
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/pasar-taller/orden?ordenId=${fixture.orden.id}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'cajero', 9201, { ventas: ['write'] })}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).items).toHaveLength(1)

      const talleresRes = await app.inject({
        method: 'GET',
        url: '/api/pasar-taller/talleres',
        headers: { authorization: `Bearer ${tokenFor(app, 'cajero', 9201, { ventas: ['write'] })}` },
      })
      expect(talleresRes.statusCode).toBe(200)
      expect(JSON.parse(talleresRes.body).length).toBeGreaterThan(0)
    } finally {
      await cleanup(app, fixture)
    }
  })

  it('crea o reutiliza ODT, hace upsert por producto y permite multiples talleres', async () => {
    const marker = `send-${Date.now()}`
    const fixture = await createFixture(app, marker)
    const ordenItem = fixture.orden.items.find(i => i.productoId === fixture.transitorio.id)
    const tallerIds = talleres.map(t => t.id)
    try {
      const payload = {
        ordenId: fixture.orden.id,
        prioridad: 'alta',
        obsGeneral: 'Prioridad cliente',
        items: [{
          ordenItemId: ordenItem.id,
          cantidad: 3,
          obs: 'Forro con cierre',
          tallerIds,
        }],
      }
      const first = await app.inject({
        method: 'POST',
        url: '/api/pasar-taller/enviar',
        headers: { authorization: `Bearer ${tokenFor(app, 'vendedor', 9201)}` },
        payload,
      })
      expect(first.statusCode).toBe(200)
      const body = JSON.parse(first.body)
      expect(body.ok).toBe(true)

      const second = await app.inject({
        method: 'POST',
        url: '/api/pasar-taller/enviar',
        headers: { authorization: `Bearer ${tokenFor(app, 'vendedor', 9201)}` },
        payload: {
          ...payload,
          obsGeneral: 'Prioridad cliente actualizada',
          items: [{ ...payload.items[0], obs: 'Forro actualizado', tallerIds: tallerIds.slice(0, 2) }],
        },
      })
      expect(second.statusCode).toBe(200)

      const odts = await app.prisma.odt.findMany({
        where: { ordenId: fixture.orden.id },
        include: { items: { include: { talleres: true } }, bitacora: true },
      })
      expect(odts).toHaveLength(1)
      expect(odts[0]).toMatchObject({ prioridad: 'alta', obsGeneral: 'Prioridad cliente actualizada' })
      expect(odts[0].items).toHaveLength(1)
      expect(odts[0].items[0]).toMatchObject({ codigoInterno: fixture.transitorio.codigoInterno, cantidad: 3 })
      expect(odts[0].items[0].obs).toContain('Medida especial 100x200')
      expect(odts[0].items[0].obs).toContain('Forro actualizado')
      expect(odts[0].items[0].talleres).toHaveLength(2)
      expect(odts[0].bitacora.length).toBeGreaterThanOrEqual(2)
    } finally {
      await cleanup(app, fixture)
    }
  })

  it('serializa envios concurrentes para no duplicar ODT ni item', async () => {
    const marker = `race-${Date.now()}`
    const fixture = await createFixture(app, marker)
    const ordenItem = fixture.orden.items.find(i => i.productoId === fixture.transitorio.id)
    const payload = {
      ordenId: fixture.orden.id,
      prioridad: 'alta',
      items: [{
        ordenItemId: ordenItem.id,
        cantidad: 2,
        obs: 'Concurrente',
        tallerIds: [talleres[0].id, talleres[1].id],
      }],
    }
    try {
      const [first, second] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/pasar-taller/enviar',
          headers: { authorization: `Bearer ${tokenFor(app, 'vendedor', 9201)}` },
          payload,
        }),
        app.inject({
          method: 'POST',
          url: '/api/pasar-taller/enviar',
          headers: { authorization: `Bearer ${tokenFor(app, 'vendedor', 9201)}` },
          payload,
        }),
      ])
      expect(first.statusCode).toBe(200)
      expect(second.statusCode).toBe(200)
      const odts = await app.prisma.odt.findMany({
        where: { ordenId: fixture.orden.id },
        include: { items: { include: { talleres: true } } },
      })
      expect(odts).toHaveLength(1)
      expect(odts[0].items).toHaveLength(1)
      expect(odts[0].items[0].talleres).toHaveLength(2)
    } finally {
      await cleanup(app, fixture)
    }
  })

  it('clasifica la ODT por el taller seleccionado, no por talleres activos', async () => {
    const marker = `tipo-${Date.now()}`
    const fixture = await createFixture(app, marker)
    const ordenItem = fixture.orden.items.find(i => i.productoId === fixture.transitorio.id)
    const confecciones = talleres.find(t => t.nombre === 'confecciones')
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pasar-taller/enviar',
        headers: { authorization: `Bearer ${tokenFor(app, 'vendedor', 9201)}` },
        payload: {
          ordenId: fixture.orden.id,
          items: [{
            ordenItemId: ordenItem.id,
            cantidad: 1,
            obs: 'Solo confecciones',
            tallerIds: [confecciones.id],
          }],
        },
      })
      expect(res.statusCode).toBe(200)
      const odt = await app.prisma.odt.findFirst({ where: { ordenId: fixture.orden.id } })
      expect(odt.tipo).toBe('Confecciones')

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/odts?tipo=Confecciones',
        headers: { authorization: `Bearer ${tokenFor(app, 'vendedor', 9201)}` },
      })
      expect(listRes.statusCode).toBe(200)
      const listBody = JSON.parse(listRes.body)
      expect(listBody.items.map(item => item.id)).toContain(odt.id)
    } finally {
      await cleanup(app, fixture)
    }
  })

  it('rechaza productos fuera de la venta, no transitorios o sobre cantidad vendida', async () => {
    const marker = `reject-${Date.now()}`
    const fixture = await createFixture(app, marker)
    const transitorioItem = fixture.orden.items.find(i => i.productoId === fixture.transitorio.id)
    const inventariadoItem = fixture.orden.items.find(i => i.productoId === fixture.inventariado.id)
    try {
      const base = {
        ordenId: fixture.orden.id,
        items: [{ ordenItemId: inventariadoItem.id, cantidad: 1, tallerIds: [talleres[0].id] }],
      }
      const inventariadoRes = await app.inject({
        method: 'POST',
        url: '/api/pasar-taller/enviar',
        headers: { authorization: `Bearer ${tokenFor(app, 'taller', 9201)}` },
        payload: base,
      })
      expect(inventariadoRes.statusCode).toBe(409)
      expect(JSON.parse(inventariadoRes.body).error).toMatch(/no es transitorio/)

      const overQtyRes = await app.inject({
        method: 'POST',
        url: '/api/pasar-taller/enviar',
        headers: { authorization: `Bearer ${tokenFor(app, 'taller', 9201)}` },
        payload: {
          ordenId: fixture.orden.id,
          items: [{ ordenItemId: transitorioItem.id, cantidad: 4, tallerIds: [talleres[0].id] }],
        },
      })
      expect(overQtyRes.statusCode).toBe(409)
      expect(JSON.parse(overQtyRes.body).error).toMatch(/cantidad vendida/)
    } finally {
      await cleanup(app, fixture)
    }
  })

  it('aplica scope por sucursal y bloquea ODT cerradas', async () => {
    const marker = `scope-${Date.now()}`
    const fixture = await createFixture(app, marker, { sucursalId: 9203 })
    const ordenItem = fixture.orden.items.find(i => i.productoId === fixture.transitorio.id)
    try {
      const forbidden = await app.inject({
        method: 'POST',
        url: '/api/pasar-taller/enviar',
        headers: { authorization: `Bearer ${tokenFor(app, 'taller', 9999)}` },
        payload: {
          ordenId: fixture.orden.id,
          items: [{ ordenItemId: ordenItem.id, cantidad: 1, tallerIds: [talleres[0].id] }],
        },
      })
      expect(forbidden.statusCode).toBe(404)

      const odt = await app.prisma.odt.create({
        data: {
          ordenId: fixture.orden.id,
          sucursalId: 9203,
          tipo: 'Espumas',
          descripcion: 'Cerrada',
          estado: 'Terminada',
        },
      })
      const closed = await app.inject({
        method: 'POST',
        url: '/api/pasar-taller/enviar',
        headers: { authorization: `Bearer ${tokenFor(app, 'taller', 9203)}` },
        payload: {
          odtId: odt.id,
          items: [{ ordenItemId: ordenItem.id, cantidad: 1, tallerIds: [talleres[0].id] }],
        },
      })
      expect(closed.statusCode).toBe(409)
      expect(JSON.parse(closed.body).error).toMatch(/ODT cerrada|ODT no activa/)
    } finally {
      await cleanup(app, fixture)
    }
  })

  it('permite quitar item de taller con trazabilidad', async () => {
    const marker = `del-${Date.now()}`
    const fixture = await createFixture(app, marker)
    const ordenItem = fixture.orden.items.find(i => i.productoId === fixture.transitorio.id)
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/pasar-taller/enviar',
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9201)}` },
        payload: {
          ordenId: fixture.orden.id,
          items: [{ ordenItemId: ordenItem.id, cantidad: 1, tallerIds: [talleres[0].id] }],
        },
      })
      expect(created.statusCode).toBe(200)
      const odt = await app.prisma.odt.findFirst({
        where: { ordenId: fixture.orden.id },
        include: { items: { include: { talleres: true } } },
      })
      const odtItemId = odt.items[0].id
      const tallerItemId = odt.items[0].talleres[0].id
      const deleted = await app.inject({
        method: 'DELETE',
        url: `/api/pasar-taller/items/${odtItemId}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9201)}` },
      })
      expect(deleted.statusCode).toBe(200)
      const item = await app.prisma.odtItem.findUnique({ where: { id: odtItemId } })
      expect(item.eliminado).toBe(true)
      const bitacora = await app.prisma.bitacoraTaller.findMany({ where: { odtId: odt.id } })
      expect(bitacora.some(entry => entry.texto.includes('Item eliminado'))).toBe(true)

      const detail = await app.inject({
        method: 'GET',
        url: `/api/odts/${odt.id}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9201)}` },
      })
      expect(detail.statusCode).toBe(200)
      expect(JSON.parse(detail.body).items.map(i => i.id)).not.toContain(odtItemId)

      const workflow = await app.inject({
        method: 'PUT',
        url: `/api/odts/${odt.id}/items/${odtItemId}/talleres/${tallerItemId}/estado`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9201)}` },
        payload: { estado: 'listo' },
      })
      expect(workflow.statusCode).toBe(404)
    } finally {
      await cleanup(app, fixture)
    }
  })

  it('scopea listado de ODT por sucursal', async () => {
    const marker = `scope-list-${Date.now()}`
    const own = await createFixture(app, `${marker}-own`, { sucursalId: 9211 })
    const other = await createFixture(app, `${marker}-other`, { sucursalId: 9212 })
    const ownItem = own.orden.items.find(i => i.productoId === own.transitorio.id)
    const otherItem = other.orden.items.find(i => i.productoId === other.transitorio.id)
    try {
      for (const [fixture, item] of [[own, ownItem], [other, otherItem]]) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/pasar-taller/enviar',
          headers: { authorization: `Bearer ${tokenFor(app, 'admin', fixture.orden.sucursalId)}` },
          payload: {
            ordenId: fixture.orden.id,
            items: [{ ordenItemId: item.id, cantidad: 1, tallerIds: [talleres[0].id] }],
          },
        })
        expect(res.statusCode).toBe(200)
      }
      const ownOdt = await app.prisma.odt.findFirst({ where: { ordenId: own.orden.id } })
      const otherOdt = await app.prisma.odt.findFirst({ where: { ordenId: other.orden.id } })
      const res = await app.inject({
        method: 'GET',
        url: '/api/odts?tipo=Confecciones',
        headers: { authorization: `Bearer ${tokenFor(app, 'taller', 9211)}` },
      })
      expect(res.statusCode).toBe(200)
      const ids = JSON.parse(res.body).items.map(item => item.id)
      expect(ids).toContain(ownOdt.id)
      expect(ids).not.toContain(otherOdt.id)
    } finally {
      await cleanup(app, own)
      await cleanup(app, other)
    }
  })

  it('bloquea quitar items de ODT cerrada o con taller iniciado', async () => {
    const marker = `del-lock-${Date.now()}`
    const fixture = await createFixture(app, marker)
    const ordenItem = fixture.orden.items.find(i => i.productoId === fixture.transitorio.id)
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/pasar-taller/enviar',
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9201)}` },
        payload: {
          ordenId: fixture.orden.id,
          items: [{ ordenItemId: ordenItem.id, cantidad: 1, tallerIds: [talleres[0].id] }],
        },
      })
      expect(created.statusCode).toBe(200)
      const odt = await app.prisma.odt.findFirst({
        where: { ordenId: fixture.orden.id },
        include: { items: { include: { talleres: true } } },
      })
      await app.prisma.odtItemTaller.update({
        where: { id: odt.items[0].talleres[0].id },
        data: { estado: 'en_proceso' },
      })
      const started = await app.inject({
        method: 'DELETE',
        url: `/api/pasar-taller/items/${odt.items[0].id}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9201)}` },
      })
      expect(started.statusCode).toBe(409)
      expect(JSON.parse(started.body).error).toMatch(/trabajo iniciado/)

      await app.prisma.odtItemTaller.update({
        where: { id: odt.items[0].talleres[0].id },
        data: { estado: 'pendiente' },
      })
      await app.prisma.odt.update({ where: { id: odt.id }, data: { estado: 'Terminada' } })
      const closed = await app.inject({
        method: 'DELETE',
        url: `/api/pasar-taller/items/${odt.items[0].id}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9201)}` },
      })
      expect(closed.statusCode).toBe(409)
      expect(JSON.parse(closed.body).error).toMatch(/ODT cerrada/)
    } finally {
      await cleanup(app, fixture)
    }
  })
})
