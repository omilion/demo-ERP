import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import { resolveOdtItemEstadoTaller } from '../src/routes/ventas/get.js'

describe('resolveOdtItemEstadoTaller', () => {
  it('pendiente si no tiene ninguna estacion de taller asignada', () => {
    expect(resolveOdtItemEstadoTaller([])).toBe('pendiente')
  })
  it('pendiente si todas las estaciones relevantes estan canceladas (nada quedo hecho de verdad)', () => {
    expect(resolveOdtItemEstadoTaller([{ estado: 'cancelado' }])).toBe('pendiente')
  })
  it('pendiente si alguna estacion no cancelada sigue sin terminar', () => {
    expect(resolveOdtItemEstadoTaller([{ estado: 'listo' }, { estado: 'en_proceso' }])).toBe('pendiente')
  })
  it('listo solo cuando todas las estaciones no canceladas estan listas', () => {
    expect(resolveOdtItemEstadoTaller([{ estado: 'listo' }, { estado: 'listo' }])).toBe('listo')
    expect(resolveOdtItemEstadoTaller([{ estado: 'listo' }, { estado: 'cancelado' }])).toBe('listo')
  })
})

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

async function loginAs(app, role = 'admin', sucursalId = null, permisosExtra = null) {
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

describe('GET /api/ventas', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('returns list with total computed', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/ventas',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('items')
    expect(Array.isArray(body.items)).toBe(true)
    if (body.items.length > 0) {
      expect(body.items[0]).toHaveProperty('total')
      expect(body.items[0]).toHaveProperty('cliente')
    }
  })

  it('cajero can read ventas', async () => {
    const t = await loginAs(app, 'cajero')
    const res = await app.inject({
      method: 'GET', url: '/api/ventas',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('POST /api/ventas', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'vendedor') })
  afterAll(() => app.close())

  it('creates venta and returns total', async () => {
    const firstCliente = await app.prisma.cliente.findFirst()
    const marker = `TEST-VENTA-CREATE-${Date.now()}`
    const producto = await app.prisma.producto.create({
      data: { codigoInterno: `${marker}-P`, nombre: `${marker} Producto`, activo: true },
    })
    const res = await app.inject({
      method: 'POST', url: '/api/ventas',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        tipo: 'Normal',
        clienteId: firstCliente?.id,
        items: [{ productoId: producto.id, cantidad: 2, precioUnitario: 10000 }],
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.total).toBe(20000)
    if (body.id) {
      await app.prisma.ordenItem.deleteMany({ where: { ordenId: body.id } }).catch(() => {})
      await app.prisma.orden.delete({ where: { id: body.id } }).catch(() => {})
    }
    await app.prisma.producto.delete({ where: { id: producto.id } }).catch(() => {})
  })

  it('acepta solo marketplaces acordados y normaliza Paris a París', async () => {
    const firstCliente = await app.prisma.cliente.findFirst()
    const marker = `TEST-VENTA-MARKETPLACE-${Date.now()}`
    const producto = await app.prisma.producto.create({
      data: { codigoInterno: `${marker}-P`, nombre: `${marker} Producto`, activo: true },
    })
    let ordenId = null
    try {
      const payload = {
        tipo: 'Marketplace',
        clienteId: firstCliente?.id,
        items: [{ productoId: producto.id, cantidad: 1, precioUnitario: 10000 }],
      }
      const invalida = await app.inject({
        method: 'POST', url: '/api/ventas',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...payload, marketplaceCanal: 'Otro' },
      })
      expect(invalida.statusCode).toBe(400)

      // CU-05 exige la referencia externa: sin el numero de orden del portal la
      // comision no se puede conciliar contra el comprobante del marketplace.
      const sinReferencia = await app.inject({
        method: 'POST', url: '/api/ventas',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...payload, marketplaceCanal: 'Paris', marketplaceComisionPct: 10 },
      })
      expect(sinReferencia.statusCode).toBe(400)

      const valida = await app.inject({
        method: 'POST', url: '/api/ventas',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...payload, marketplaceCanal: 'Paris', marketplaceReferencia: `${marker}-REF`, marketplaceComisionPct: 10 },
      })
      expect(valida.statusCode).toBe(201)
      const body = JSON.parse(valida.body)
      ordenId = body.id
      expect(body.marketplaceCanal).toBe('París')
      expect(body.marketplaceReferencia).toBe(`${marker}-REF`)
      expect(body.marketplaceComisionMonto).toBe(1000)
    } finally {
      if (ordenId) {
        await app.prisma.ordenItem.deleteMany({ where: { ordenId } }).catch(() => {})
        await app.prisma.orden.delete({ where: { id: ordenId } }).catch(() => {})
      }
      await app.prisma.producto.delete({ where: { id: producto.id } }).catch(() => {})
    }
  })

  it('rejects direct facturado on create outside Cobranza/Caja', async () => {
    const firstCliente = await app.prisma.cliente.findFirst()
    const marker = `TEST-VENTA-CREATE-FACT-${Date.now()}`
    const producto = await app.prisma.producto.create({
      data: { codigoInterno: `${marker}-P`, nombre: `${marker} Producto`, activo: true },
    })
    try {
      const res = await app.inject({
        method: 'POST', url: '/api/ventas',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          tipo: 'Normal',
          clienteId: firstCliente?.id,
          facturado: 1000,
          items: [{ productoId: producto.id, cantidad: 1, precioUnitario: 10000 }],
        },
      })
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).error).toBe('Los abonos, facturado y estado de pago se registran desde Cobranza/Caja')
    } finally {
      await app.prisma.producto.delete({ where: { id: producto.id } }).catch(() => {})
    }
  })

  it('rejects new ventas for inactive clientes', async () => {
    const marker = `TEST-VENTA-CLIENTE-INACTIVO-${Date.now()}`
    const cliente = await app.prisma.cliente.create({
      data: { rut: marker, nombre: marker, activo: false },
    })
    const producto = await app.prisma.producto.create({
      data: { codigoInterno: `${marker}-P`, nombre: `${marker} Producto`, activo: true },
    })
    try {
      const res = await app.inject({
        method: 'POST', url: '/api/ventas',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          tipo: 'Normal',
          clienteId: cliente.id,
          items: [{ productoId: producto.id, cantidad: 1, precioUnitario: 10000 }],
        },
      })
      expect(res.statusCode).toBe(409)
      expect(JSON.parse(res.body).error).toMatch(/inactivo/)
    } finally {
      await app.prisma.producto.delete({ where: { id: producto.id } }).catch(() => {})
      await app.prisma.cliente.delete({ where: { id: cliente.id } }).catch(() => {})
    }
  })
})

describe('GET /api/ventas/:id', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('returns venta with total and cliente', async () => {
    const listRes = await app.inject({ method: 'GET', url: '/api/ventas', headers: { authorization: `Bearer ${token}` } })
    const { items: ventas } = JSON.parse(listRes.body)
    if (ventas.length === 0) return
    const id = ventas[0].id
    const res = await app.inject({ method: 'GET', url: `/api/ventas/${id}`, headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('total')
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ventas/999999', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(404)
  })

  // OdtItem.estado nunca se actualiza despues de crear el ODT (queda
  // "pendiente" para siempre) - el avance real por estacion de taller vive en
  // OdtItemTaller. Sin el fix, este item aparecia "pendiente" en la venta
  // aunque el taller ya lo hubiera terminado en todas sus estaciones.
  it('el estado de taller por producto refleja OdtItemTaller, no el campo OdtItem.estado (siempre pendiente)', async () => {
    const cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
    const user = await app.prisma.user.findFirst({ select: { id: true } })
    const producto = await app.prisma.producto.findFirst({ select: { id: true } })
    const orden = await app.prisma.orden.create({
      data: {
        tipo: 'Test', estado: 'Activa', estadoPago: 'No pagada', estadoEntrega: 'Pendiente entrega',
        clienteId: cliente.id, userId: user.id, nInterno: 971000000 + Math.floor(Math.random() * 100000),
      },
    })
    const marker = Date.now()
    const tallerA = await app.prisma.taller.create({ data: { nombre: `TEST-VENTA-A-${marker}` } })
    const tallerB = await app.prisma.taller.create({ data: { nombre: `TEST-VENTA-B-${marker}` } })
    const odt = await app.prisma.odt.create({ data: { ordenId: orden.id, tipo: 'Test', estado: 'En proceso', eliminado: false } })

    // Item 1: dos estaciones, ambas listas -> debe verse "listo" pese a que
    // OdtItem.estado se crea (y queda) en "pendiente".
    const item1 = await app.prisma.odtItem.create({
      data: { odtId: odt.id, productoId: producto.id, cantidad: 1, estado: 'pendiente', eliminado: false },
    })
    await app.prisma.odtItemTaller.create({ data: { odtItemId: item1.id, tallerId: tallerA.id, estado: 'listo' } })
    await app.prisma.odtItemTaller.create({ data: { odtItemId: item1.id, tallerId: tallerB.id, estado: 'listo' } })

    // Item 2: una estacion en proceso -> debe seguir "pendiente".
    const item2 = await app.prisma.odtItem.create({
      data: { odtId: odt.id, productoId: producto.id, cantidad: 1, estado: 'pendiente', eliminado: false },
    })
    await app.prisma.odtItemTaller.create({ data: { odtItemId: item2.id, tallerId: tallerA.id, estado: 'en_proceso' } })

    // Item 3: una estacion lista y otra cancelada -> la cancelada no cuenta,
    // debe verse "listo".
    const item3 = await app.prisma.odtItem.create({
      data: { odtId: odt.id, productoId: producto.id, cantidad: 1, estado: 'pendiente', eliminado: false },
    })
    await app.prisma.odtItemTaller.create({ data: { odtItemId: item3.id, tallerId: tallerA.id, estado: 'listo' } })
    await app.prisma.odtItemTaller.create({ data: { odtItemId: item3.id, tallerId: tallerB.id, estado: 'cancelado' } })

    try {
      const res = await app.inject({ method: 'GET', url: `/api/ventas/${orden.id}`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      const byId = Object.fromEntries(body.odts[0].items.map(i => [i.id, i]))
      expect(Array.isArray(byId[item1.id].talleres)).toBe(true)
      expect(byId[item1.id].talleres).toHaveLength(2)
      expect(byId[item1.id].estado).toBe('listo')
      expect(byId[item2.id].estado).toBe('pendiente')
      expect(byId[item3.id].estado).toBe('listo')
    } finally {
      await app.prisma.odtItemTaller.deleteMany({ where: { odtItemId: { in: [item1.id, item2.id, item3.id] } } })
      await app.prisma.odtItem.deleteMany({ where: { id: { in: [item1.id, item2.id, item3.id] } } })
      await app.prisma.odt.delete({ where: { id: odt.id } })
      await app.prisma.taller.deleteMany({ where: { id: { in: [tallerA.id, tallerB.id] } } })
      await app.prisma.orden.delete({ where: { id: orden.id } })
    }
  })
})

describe('POST /api/cotizaciones/:id/crear-venta', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'vendedor') })
  afterAll(() => app.close())

  async function createConvertedCotizacion(marker) {
    const cliente = await app.prisma.cliente.create({
      data: { rut: marker, nombre: marker, activo: true },
    })
    const producto = await app.prisma.producto.create({
      data: {
        codigoInterno: `${marker}-P`,
        nombre: `${marker} Producto`,
        activo: true,
        stock: 10,
        estadoInventario: 'Inventariado',
      },
    })
    const cot = await app.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion: marker,
        rutCliente: cliente.rut,
        estado: 'Adjudicada',
        plazo: '10 dias',
        ordenCompra: `${marker}-OC`,
        items: {
          create: [{ codigoInterno: producto.codigoInterno, nombre: producto.nombre, cantidad: 3, cantAdjudicados: 2, precio: 1500 }],
        },
      },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/cotizaciones/${cot.id}/crear-venta`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    return { clienteId: cliente.id, productoId: producto.id, cotId: cot.id, ordenId: body.orden.id }
  }

  async function cleanupConverted({ ordenId, cotId, productoId, clienteId }) {
    if (ordenId) {
      await app.prisma.movimientoCaja.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.movimientoBodega.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.guiaDespacho.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.despacho.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.multa.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.ordenItem.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.orden.delete({ where: { id: ordenId } }).catch(() => {})
    }
    if (cotId) await app.prisma.cotizacionLicitacion.delete({ where: { id: cotId } }).catch(() => {})
    if (productoId) {
      await app.prisma.movimientoBodega.deleteMany({ where: { productoId } }).catch(() => {})
      await app.prisma.producto.delete({ where: { id: productoId } }).catch(() => {})
    }
    if (clienteId) await app.prisma.cliente.delete({ where: { id: clienteId } }).catch(() => {})
  }

  it('rejects conversion when the canonical cliente is inactive', async () => {
    const marker = `TEST-COT-CLIENTE-INACTIVO-${Date.now()}`
    const cliente = await app.prisma.cliente.create({
      data: { rut: marker, nombre: marker, activo: false },
    })
    const cot = await app.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion: marker,
        rutCliente: cliente.rut,
        estado: 'Adjudicada',
        plazo: '10 dias',
        ordenCompra: `${marker}-OC`,
        items: {
          create: [{ codigoInterno: `${marker}-P`, nombre: 'Item adjudicado', cantidad: 1, cantAdjudicados: 1, precio: 1000 }],
        },
      },
    })
    try {
      const res = await app.inject({
        method: 'POST', url: `/api/cotizaciones/${cot.id}/crear-venta`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(409)
      expect(JSON.parse(res.body).error).toMatch(/inactivo/)
    } finally {
      await app.prisma.cotizacionLicitacion.delete({ where: { id: cot.id } }).catch(() => {})
      await app.prisma.cliente.delete({ where: { id: cliente.id } }).catch(() => {})
    }
  })

  it('creates venta from adjudicated cotizacion and discounts inventariado stock', async () => {
    const marker = `TEST-COT-CREAR-VENTA-${Date.now()}`
    const created = { ordenId: null, cotId: null, productoId: null, clienteId: null }
    try {
      const cliente = await app.prisma.cliente.create({
        data: { rut: marker, nombre: marker, activo: true },
      })
      created.clienteId = cliente.id
      const producto = await app.prisma.producto.create({
        data: {
          codigoInterno: `${marker}-P`,
          nombre: `${marker} Producto`,
          activo: true,
          stock: 5,
          estadoInventario: 'Inventariado',
        },
      })
      created.productoId = producto.id
      const cot = await app.prisma.cotizacionLicitacion.create({
        data: {
          idLicitacion: marker,
          rutCliente: cliente.rut,
          estado: 'Adjudicada',
          plazo: '10 dias',
          ordenCompra: `${marker}-OC`,
          items: {
            create: [{ codigoInterno: producto.codigoInterno, nombre: producto.nombre, cantidad: 3, cantAdjudicados: 2, precio: 1500 }],
          },
        },
      })
      created.cotId = cot.id

      const res = await app.inject({
        method: 'POST',
        url: `/api/cotizaciones/${cot.id}/crear-venta`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      created.ordenId = body.orden.id
      expect(body.orden.tipo).toBe('Licitación')
      expect(body.orden.items).toHaveLength(1)
      expect(body.orden.items[0].cantidad).toBe(2)
      expect(body.orden.items[0].precioUnitario).toBe(1785)
      expect((await app.prisma.producto.findUnique({ where: { id: producto.id } })).stock).toBe(3)
      const linked = await app.prisma.cotizacionLicitacion.findUnique({ where: { id: cot.id } })
      expect(linked.ordenId).toBe(body.orden.id)

      const item = await app.prisma.cotizacionLicitacionItem.findFirst({ where: { cotizacionId: cot.id } })
      await app.prisma.cotizacionLicitacionItem.update({ where: { id: item.id }, data: { cantAdjudicados: 1 } })
      const sync = await app.inject({
        method: 'POST',
        url: `/api/cotizaciones/${cot.id}/actualizar-venta`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(sync.statusCode).toBe(200)
      expect((await app.prisma.producto.findUnique({ where: { id: producto.id } })).stock).toBe(4)
      const syncedItems = await app.prisma.ordenItem.findMany({ where: { ordenId: body.orden.id } })
      expect(syncedItems).toHaveLength(1)
      expect(syncedItems[0].cantidad).toBe(1)
      expect(syncedItems[0].precioUnitario).toBe(1785)
    } finally {
      if (created.ordenId) {
        await app.prisma.movimientoBodega.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.ordenItem.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
      }
      if (created.cotId) await app.prisma.cotizacionLicitacion.delete({ where: { id: created.cotId } }).catch(() => {})
      if (created.productoId) {
        await app.prisma.movimientoBodega.deleteMany({ where: { productoId: created.productoId } }).catch(() => {})
        await app.prisma.producto.delete({ where: { id: created.productoId } }).catch(() => {})
      }
      if (created.clienteId) await app.prisma.cliente.delete({ where: { id: created.clienteId } }).catch(() => {})
    }
  })

  it('bloquea actualizar venta vinculada cuando ya existen entregas, despachos o guias', async () => {
    const scenarios = [
      {
        marker: `TEST-COT-BLOCK-ENT-${Date.now()}`,
        prepare: async (created) => {
          const item = await app.prisma.ordenItem.findFirst({ where: { ordenId: created.ordenId } })
          await app.prisma.ordenItem.update({ where: { id: item.id }, data: { nEntregados: 1 } })
        },
        expected: /entregas/,
      },
      {
        marker: `TEST-COT-BLOCK-DESP-${Date.now()}`,
        prepare: async (created) => {
          await app.prisma.despacho.create({ data: { ordenId: created.ordenId, interno: created.marker } })
        },
        expected: /despachos/,
      },
      {
        marker: `TEST-COT-BLOCK-GUIA-${Date.now()}`,
        prepare: async (created) => {
          await app.prisma.guiaDespacho.create({
            data: { ordenId: created.ordenId, nGuia: created.marker, fechaGuia: new Date() },
          })
        },
        expected: /guias/,
      },
    ]

    for (const scenario of scenarios) {
      const created = { ...(await createConvertedCotizacion(scenario.marker)), marker: scenario.marker }
      try {
        await scenario.prepare(created)
        const item = await app.prisma.cotizacionLicitacionItem.findFirst({ where: { cotizacionId: created.cotId } })
        await app.prisma.cotizacionLicitacionItem.update({ where: { id: item.id }, data: { cantAdjudicados: 1 } })
        const res = await app.inject({
          method: 'POST',
          url: `/api/cotizaciones/${created.cotId}/actualizar-venta`,
          headers: { authorization: `Bearer ${token}` },
        })
        expect(res.statusCode).toBe(409)
        expect(JSON.parse(res.body).error).toMatch(scenario.expected)
      } finally {
        await cleanupConverted(created)
      }
    }
  })
})

describe('POST /api/cotizaciones', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app, 'vendedor') })
  afterAll(() => app.close())

  it('normalizes id, requires fecha and rejects duplicates', async () => {
    const marker = `TEST-COT-ID-${Date.now()}`
    try {
      const missingFecha = await app.inject({
        method: 'POST',
        url: '/api/cotizaciones',
        headers: { authorization: `Bearer ${token}` },
        payload: { idLicitacion: marker },
      })
      expect(missingFecha.statusCode).toBe(400)
      expect(JSON.parse(missingFecha.body).error).toMatch(/fecha requerida/)

      const first = await app.inject({
        method: 'POST',
        url: '/api/cotizaciones',
        headers: { authorization: `Bearer ${token}` },
        payload: { idLicitacion: `ID ${marker}`, fecha: '2026-05-27' },
      })
      expect(first.statusCode).toBe(201)
      expect(JSON.parse(first.body).idLicitacion).toBe(`ID${marker}`)

      const duplicate = await app.inject({
        method: 'POST',
        url: '/api/cotizaciones',
        headers: { authorization: `Bearer ${token}` },
        payload: { idLicitacion: `ID${marker}`, fecha: '2026-05-27' },
      })
      expect(duplicate.statusCode).toBe(409)
      expect(JSON.parse(duplicate.body).error).toMatch(/ya existe/)
    } finally {
      await app.prisma.cotizacionLicitacion.deleteMany({ where: { idLicitacion: { contains: marker } } }).catch(() => {})
    }
  })

  it('valida items al crear y al editar usando el estado final del item', async () => {
    const marker = `TEST-COT-ITEMS-${Date.now()}`
    try {
      const invalidCreate = await app.inject({
        method: 'POST',
        url: '/api/cotizaciones',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          idLicitacion: `${marker}-BAD`,
          fecha: '2026-05-27',
          items: [{ codigoInterno: `${marker}-P`, cantidad: 0, cantAdjudicados: 0, precio: 100 }],
        },
      })
      expect(invalidCreate.statusCode).toBe(400)
      expect(JSON.parse(invalidCreate.body).error).toMatch(/cantidad/)

      const create = await app.inject({
        method: 'POST',
        url: '/api/cotizaciones',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          idLicitacion: marker,
          fecha: '2026-05-27',
          items: [{ codigoInterno: `${marker}-P`, cantidad: 5, cantAdjudicados: 4, precio: 100 }],
        },
      })
      expect(create.statusCode).toBe(201)
      const cot = JSON.parse(create.body)
      const item = cot.items[0]

      const reduceCantidad = await app.inject({
        method: 'PUT',
        url: `/api/cotizaciones/${cot.id}/items/${item.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cantidad: 3 },
      })
      expect(reduceCantidad.statusCode).toBe(400)
      expect(JSON.parse(reduceCantidad.body).error).toMatch(/cantAdjudicados/)

      const invalidAdjudicados = await app.inject({
        method: 'PUT',
        url: `/api/cotizaciones/${cot.id}/items/${item.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cantAdjudicados: 6 },
      })
      expect(invalidAdjudicados.statusCode).toBe(400)
      expect(JSON.parse(invalidAdjudicados.body).error).toMatch(/cantidad/)
    } finally {
      await app.prisma.cotizacionLicitacion.deleteMany({ where: { idLicitacion: { contains: marker } } }).catch(() => {})
    }
  })
})

describe('RBAC /api/cotizaciones', () => {
  let app

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready() })
  afterAll(() => app.close())

  it('usa permisos de licitaciones para consultar cotizaciones', async () => {
    const cajeroToken = await loginAs(app, 'cajero')
    const denied = await app.inject({
      method: 'GET',
      url: '/api/cotizaciones',
      headers: { authorization: `Bearer ${cajeroToken}` },
    })
    expect(denied.statusCode).toBe(403)

    const licitacionesReadToken = await loginAs(app, 'rrhh', null, { licitaciones: ['read'] })
    const allowed = await app.inject({
      method: 'GET',
      url: '/api/cotizaciones',
      headers: { authorization: `Bearer ${licitacionesReadToken}` },
    })
    expect(allowed.statusCode).toBe(200)
  })

  it('permite crear licitacion sin ventas.write pero bloquea pasarla a venta', async () => {
    const marker = `TEST-COT-RBAC-${Date.now()}`
    const licitacionesWriteToken = await loginAs(app, 'solo_lectura', null, { licitaciones: ['read', 'write'] })
    try {
      const create = await app.inject({
        method: 'POST',
        url: '/api/cotizaciones',
        headers: { authorization: `Bearer ${licitacionesWriteToken}` },
        payload: { idLicitacion: marker, fecha: '2026-05-27', estado: 'Adjudicada', plazo: '10', ordenCompra: `${marker}-OC` },
      })
      expect(create.statusCode).toBe(201)
      const cot = JSON.parse(create.body)

      const convert = await app.inject({
        method: 'POST',
        url: `/api/cotizaciones/${cot.id}/crear-venta`,
        headers: { authorization: `Bearer ${licitacionesWriteToken}` },
      })
      expect(convert.statusCode).toBe(403)
    } finally {
      await app.prisma.cotizacionLicitacion.deleteMany({ where: { idLicitacion: marker } }).catch(() => {})
    }
  })

  it('no expone datos financieros de venta vinculada sin ventas.read', async () => {
    const marker = `TEST-COT-RBAC-DETAIL-${Date.now()}`
    const created = { ordenId: null, cotId: null, productoId: null }
    const token = await loginAs(app, 'rrhh', null, { licitaciones: ['read'] })
    try {
      const [user, cliente] = await Promise.all([
        app.prisma.user.findFirst(),
        app.prisma.cliente.findFirst(),
      ])
      const producto = await app.prisma.producto.create({
        data: { codigoInterno: `${marker}-P`, nombre: `${marker} Producto`, activo: true },
      })
      created.productoId = producto.id
      const orden = await app.prisma.orden.create({
        data: {
          tipo: 'Licitacion',
          userId: user.id,
          clienteId: cliente.id,
          items: { create: [{ productoId: producto.id, cantidad: 1, precioUnitario: 1000 }] },
        },
      })
      created.ordenId = orden.id
      const cot = await app.prisma.cotizacionLicitacion.create({
        data: {
          idLicitacion: marker,
          fecha: new Date(),
          estado: 'Adjudicada',
          ordenId: orden.id,
        },
      })
      created.cotId = cot.id
      await app.prisma.movimientoCaja.create({
        data: {
          ordenId: orden.id,
          tipo: 'Ingreso',
          monto: 1000,
          medioPago: 'Referencial',
          documento: 'NC Plast',
          nDoc: marker,
          estadoDoc: 'Activa',
          estadoPagoDoc: 'No pagada',
          origenTipo: 'orden',
          origenId: orden.id,
          fecha: new Date(),
        },
      })

      const res = await app.inject({
        method: 'GET',
        url: `/api/cotizaciones/${cot.id}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.ordenId).toBe(orden.id)
      expect(body.orden).toBe(null)
      expect(body.odts).toEqual([])
      expect(body.despachos).toEqual([])
      expect(body.guias).toEqual([])
    } finally {
      if (created.ordenId) {
        await app.prisma.movimientoCaja.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.ordenItem.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
      }
      if (created.cotId) await app.prisma.cotizacionLicitacion.delete({ where: { id: created.cotId } }).catch(() => {})
      if (created.ordenId) await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
      if (created.productoId) await app.prisma.producto.delete({ where: { id: created.productoId } }).catch(() => {})
    }
  })
})

describe('PUT /api/ventas/:id', () => {
  let app, token

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready(); token = await loginAs(app) })
  afterAll(() => app.close())

  it('rejects direct estadoPago/facturado updates outside Cobranza/Caja', async () => {
    const listRes = await app.inject({ method: 'GET', url: '/api/ventas', headers: { authorization: `Bearer ${token}` } })
    const { items: ventas } = JSON.parse(listRes.body)
    if (ventas.length === 0) return
    const id = ventas[0].id
    const res = await app.inject({
      method: 'PUT', url: `/api/ventas/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { estadoPago: 'Pagada' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('Los abonos, facturado y estado de pago se registran desde Cobranza/Caja')

    const facturado = await app.inject({
      method: 'PUT', url: `/api/ventas/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { facturado: 1000 },
    })
    expect(facturado.statusCode).toBe(400)
    expect(JSON.parse(facturado.body).error).toBe('Los abonos, facturado y estado de pago se registran desde Cobranza/Caja')
  })

  it('replaces items and returns recalculated total', async () => {
    const marker = `TEST-VENTA-ITEMS-${Date.now()}`
    const created = { productos: [], ordenId: null, reglaId: null }
    try {
      const [cliente, user] = await Promise.all([
        app.prisma.cliente.findFirst(),
        app.prisma.user.findFirst(),
      ])
      // Con el catalogo eliminado, el 10% tiene que venir de una regla vigente.
      created.reglaId = (await app.prisma.descuentoRegla.create({
        data: {
          codigo: `${marker}-regla`,
          nombre: `${marker} regla`,
          alcance: 'ventas',
          prioridad: 900,
          porcentajeMax: 10,
          activo: true,
          condiciones: { tiposVenta: ['Normal'], montoMinimo: 0 },
          efecto: { porcentajeSugerido: 10, porcentajeAutoaprobado: 10 },
        },
      })).id
      const productos = [
        await app.prisma.producto.create({ data: { codigoInterno: `${marker}-A`, nombre: `${marker} A`, activo: true } }),
        await app.prisma.producto.create({ data: { codigoInterno: `${marker}-B`, nombre: `${marker} B`, activo: true } }),
      ]
      created.productos = productos.map(p => p.id)
      const orden = await app.prisma.orden.create({
        data: {
          tipo: 'Normal',
          clienteId: cliente.id,
          userId: user.id,
          descuentoPct: 0,
          items: { create: [{ productoId: productos[0].id, cantidad: 1, precioUnitario: 1000 }] },
        },
      })
      created.ordenId = orden.id

      const res = await app.inject({
        method: 'PUT', url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          descuentoPct: 10,
          items: [
            { productoId: productos[0].id, cantidad: 2, precioUnitario: 5000 },
            { productoId: productos[1].id, cantidad: 1, precioUnitario: 10000 },
          ],
        },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.items).toHaveLength(2)
      expect(body.total).toBe(18000)
      const dbItems = await app.prisma.ordenItem.findMany({ where: { ordenId: orden.id }, orderBy: { productoId: 'asc' } })
      expect(dbItems.map(i => [i.productoId, i.cantidad, i.precioUnitario])).toEqual([
        [productos[0].id, 2, 5000],
        [productos[1].id, 1, 10000],
      ])
    } finally {
      if (created.ordenId) {
        await app.prisma.ordenItem.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
      }
      if (created.productos.length) {
        await app.prisma.producto.deleteMany({ where: { id: { in: created.productos } } }).catch(() => {})
      }
      if (created.reglaId) {
        await app.prisma.descuentoRegla.delete({ where: { id: created.reglaId } }).catch(() => {})
      }
    }
  })

  it('updates metadata without replacing delivered items', async () => {
    const marker = `TEST-VENTA-DELIVERED-META-${Date.now()}`
    const created = { productos: [], ordenId: null }
    try {
      const [cliente, user] = await Promise.all([
        app.prisma.cliente.findFirst(),
        app.prisma.user.findFirst(),
      ])
      const producto = await app.prisma.producto.create({
        data: { codigoInterno: `${marker}-A`, nombre: `${marker} A`, activo: true },
      })
      created.productos = [producto.id]
      const orden = await app.prisma.orden.create({
        data: {
          tipo: 'Normal',
          clienteId: cliente.id,
          userId: user.id,
          descuentoPct: 0,
          items: {
            create: [{
              productoId: producto.id,
              cantidad: 3,
              nEntregados: 1,
              precioUnitario: 7000,
            }],
          },
        },
      })
      created.ordenId = orden.id

      const res = await app.inject({
        method: 'PUT', url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { observaciones: marker },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.observaciones).toBe(marker)
      expect(body.items).toHaveLength(1)
      expect(body.items[0].productoId).toBe(producto.id)
      expect(body.items[0].cantidad).toBe(3)
      expect(body.items[0].nEntregados).toBe(1)
      expect(body.total).toBe(21000)
      const dbItems = await app.prisma.ordenItem.findMany({ where: { ordenId: orden.id } })
      expect(dbItems).toHaveLength(1)
      expect(dbItems[0].productoId).toBe(producto.id)
      expect(dbItems[0].nEntregados).toBe(1)
    } finally {
      if (created.ordenId) {
        await app.prisma.ordenItem.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
      }
      if (created.productos.length) {
        await app.prisma.producto.deleteMany({ where: { id: { in: created.productos } } }).catch(() => {})
      }
    }
  })

  it('rejects replacing items with unknown product and keeps existing items', async () => {
    const marker = `TEST-VENTA-UNKNOWN-${Date.now()}`
    const created = { productos: [], ordenId: null }
    try {
      const [cliente, user] = await Promise.all([
        app.prisma.cliente.findFirst(),
        app.prisma.user.findFirst(),
      ])
      const active = await app.prisma.producto.create({ data: { codigoInterno: `${marker}-A`, nombre: `${marker} A`, activo: true } })
      created.productos = [active.id]
      const orden = await app.prisma.orden.create({
        data: {
          tipo: 'Normal',
          clienteId: cliente.id,
          userId: user.id,
          items: { create: [{ productoId: active.id, cantidad: 3, precioUnitario: 7000 }] },
        },
      })
      created.ordenId = orden.id

      const res = await app.inject({
        method: 'PUT', url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { items: [{ productoId: active.id + 1000000, cantidad: 1, precioUnitario: 1000 }] },
      })

      expect(res.statusCode).toBe(404)
      const dbItems = await app.prisma.ordenItem.findMany({ where: { ordenId: orden.id } })
      expect(dbItems).toHaveLength(1)
      expect(dbItems[0].productoId).toBe(active.id)
      expect(dbItems[0].cantidad).toBe(3)
    } finally {
      if (created.ordenId) {
        await app.prisma.ordenItem.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
      }
      if (created.productos.length) {
        await app.prisma.producto.deleteMany({ where: { id: { in: created.productos } } }).catch(() => {})
      }
    }
  })

  it('rejects replacing items with inactive product and keeps existing items', async () => {
    const marker = `TEST-VENTA-INACTIVE-${Date.now()}`
    const created = { productos: [], ordenId: null }
    try {
      const [cliente, user] = await Promise.all([
        app.prisma.cliente.findFirst(),
        app.prisma.user.findFirst(),
      ])
      const active = await app.prisma.producto.create({ data: { codigoInterno: `${marker}-A`, nombre: `${marker} A`, activo: true } })
      const inactive = await app.prisma.producto.create({ data: { codigoInterno: `${marker}-I`, nombre: `${marker} I`, activo: false } })
      created.productos = [active.id, inactive.id]
      const orden = await app.prisma.orden.create({
        data: {
          tipo: 'Normal',
          clienteId: cliente.id,
          userId: user.id,
          items: { create: [{ productoId: active.id, cantidad: 3, precioUnitario: 7000 }] },
        },
      })
      created.ordenId = orden.id

      const res = await app.inject({
        method: 'PUT', url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { items: [{ productoId: inactive.id, cantidad: 1, precioUnitario: 1000 }] },
      })

      expect(res.statusCode).toBe(400)
      const dbItems = await app.prisma.ordenItem.findMany({ where: { ordenId: orden.id } })
      expect(dbItems).toHaveLength(1)
      expect(dbItems[0].productoId).toBe(active.id)
      expect(dbItems[0].cantidad).toBe(3)
    } finally {
      if (created.ordenId) {
        await app.prisma.ordenItem.deleteMany({ where: { ordenId: created.ordenId } }).catch(() => {})
        await app.prisma.orden.delete({ where: { id: created.ordenId } }).catch(() => {})
      }
      if (created.productos.length) {
        await app.prisma.producto.deleteMany({ where: { id: { in: created.productos } } }).catch(() => {})
      }
    }
  })

  it('rejects an empty items replacement', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/ventas/1',
      headers: { authorization: `Bearer ${token}` },
      payload: { items: [] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/ventas/999999',
      headers: { authorization: `Bearer ${token}` },
      payload: { estadoPago: 'Pagada' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('prevents annulling a venta through generic update', async () => {
    const [cliente, user] = await Promise.all([
      app.prisma.cliente.findFirst(),
      app.prisma.user.findFirst(),
    ])
    const orden = await app.prisma.orden.create({
      data: {
        tipo: 'Normal',
        estado: 'Activa',
        clienteId: cliente?.id,
        userId: user?.id,
      },
    })
    try {
      const res = await app.inject({
        method: 'PUT', url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { estado: 'Nula' },
      })
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).error).toMatch(/flujo auditado/)
      const unchanged = await app.prisma.orden.findUnique({ where: { id: orden.id } })
      expect(unchanged.estado).toBe('Activa')
    } finally {
      await app.prisma.orden.delete({ where: { id: orden.id } }).catch(() => {})
    }
  })

  it('prevents audited annulation outside the user sucursal', async () => {
    const [cliente, user] = await Promise.all([
      app.prisma.cliente.findFirst(),
      app.prisma.user.findFirst(),
    ])
    const orden = await app.prisma.orden.create({
      data: {
        tipo: 'Normal',
        estado: 'Activa',
        clienteId: cliente?.id,
        userId: user?.id,
        sucursalId: 9301,
      },
    })
    try {
      const wrongScope = await app.inject({
        method: 'POST', url: `/api/ventas/${orden.id}/anular`,
        headers: { authorization: `Bearer ${await loginAs(app, 'admin', 9302)}` },
      })
      expect(wrongScope.statusCode).toBe(404)
      const unchanged = await app.prisma.orden.findUnique({ where: { id: orden.id } })
      expect(unchanged.eliminada).toBe(false)
      expect(unchanged.estado).toBe('Activa')

      const sameScope = await app.inject({
        method: 'POST', url: `/api/ventas/${orden.id}/anular`,
        headers: { authorization: `Bearer ${await loginAs(app, 'admin', 9301)}` },
      })
      expect(sameScope.statusCode).toBe(200)
      const updated = await app.prisma.orden.findUnique({ where: { id: orden.id } })
      expect(updated.eliminada).toBe(true)
    } finally {
      await app.prisma.orden.delete({ where: { id: orden.id } }).catch(() => {})
    }
  })

  it('ajusta el presupuesto de despacho y registra historial con motivo y usuario', async () => {
    const [cliente, user] = await Promise.all([
      app.prisma.cliente.findFirst(),
      app.prisma.user.findFirst(),
    ])
    const orden = await app.prisma.orden.create({
      data: { tipo: 'Normal', clienteId: cliente.id, userId: user.id, montoDespacho: 10000 },
    })
    try {
      const put = await app.inject({
        method: 'PUT', url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { montoDespacho: 15000, motivoAjusteDespacho: 'Ajuste para cuadrar despacho real' },
      })
      expect(put.statusCode).toBe(200)

      const historial = await app.prisma.despachoAjusteHistorial.findMany({ where: { ordenId: orden.id } })
      expect(historial).toHaveLength(1)
      expect(historial[0]).toMatchObject({
        montoAnterior: 10000,
        montoNuevo: 15000,
        motivo: 'Ajuste para cuadrar despacho real',
        usuarioNombre: 'Test admin',
      })

      const putUnchanged = await app.inject({
        method: 'PUT', url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { montoDespacho: 15000 },
      })
      expect(putUnchanged.statusCode).toBe(200)
      expect(await app.prisma.despachoAjusteHistorial.count({ where: { ordenId: orden.id } })).toBe(1)

      const getHistorial = await app.inject({
        method: 'GET', url: `/api/ventas/${orden.id}/despacho-historial`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(getHistorial.statusCode).toBe(200)
      expect(JSON.parse(getHistorial.body)).toHaveLength(1)
    } finally {
      await app.prisma.despachoAjusteHistorial.deleteMany({ where: { ordenId: orden.id } }).catch(() => {})
      await app.prisma.orden.delete({ where: { id: orden.id } }).catch(() => {})
    }
  })

  it('GET /api/ventas/:id suma montoDespachoReal desde los despachos no eliminados', async () => {
    const [cliente, user] = await Promise.all([
      app.prisma.cliente.findFirst(),
      app.prisma.user.findFirst(),
    ])
    const orden = await app.prisma.orden.create({
      data: { tipo: 'Normal', clienteId: cliente.id, userId: user.id, montoDespacho: 20000 },
    })
    const despachos = await Promise.all([
      app.prisma.despacho.create({ data: { ordenId: orden.id, montoEnvio: 5000 } }),
      app.prisma.despacho.create({ data: { ordenId: orden.id, montoEnvio: 3000 } }),
      app.prisma.despacho.create({ data: { ordenId: orden.id, montoEnvio: 9999, eliminado: true } }),
    ])
    try {
      const res = await app.inject({
        method: 'GET', url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).montoDespachoReal).toBe(8000)
    } finally {
      await app.prisma.despacho.deleteMany({ where: { id: { in: despachos.map(d => d.id) } } }).catch(() => {})
      await app.prisma.orden.delete({ where: { id: orden.id } }).catch(() => {})
    }
  })
})

describe('Venta directa stock, lifecycle and sucursal scope', () => {
  let app

  beforeAll(async () => { app = buildApp({ logger: false }); await app.ready() })
  afterAll(() => app.close())

  async function createInventariado(marker, stock = 10) {
    return app.prisma.producto.create({
      data: {
        codigoInterno: `${marker}-${Math.random().toString(36).slice(2, 8)}`,
        nombre: `${marker} Producto`,
        activo: true,
        stock,
        estadoInventario: 'Inventariado',
      },
    })
  }

  async function cleanup({ ordenIds = [], productoIds = [] } = {}) {
    if (ordenIds.length) {
      await app.prisma.movimientoCaja.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.movimientoBodega.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.guiaDespacho.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.despacho.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.multa.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.ordenItem.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.ordenCargo.deleteMany({ where: { ordenId: { in: ordenIds } } }).catch(() => {})
      await app.prisma.orden.deleteMany({ where: { id: { in: ordenIds } } }).catch(() => {})
    }
    if (productoIds.length) {
      await app.prisma.movimientoBodega.deleteMany({ where: { productoId: { in: productoIds } } }).catch(() => {})
      await app.prisma.producto.deleteMany({ where: { id: { in: productoIds } } }).catch(() => {})
    }
  }

  async function createVentaConTipo({ producto, cantidad = 2, precioUnitario = 1000, sucursalId = 9401, tipo = 'Venta Sala', licitacion, descuentoPct, role = 'vendedor' }) {
    const cliente = await app.prisma.cliente.findFirst()
    const token = await loginAs(app, role, sucursalId)
    const res = await app.inject({
      method: 'POST',
      url: '/api/ventas',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        tipo,
        clienteId: cliente.id,
        ...(licitacion ? { licitacion } : {}),
        ...(descuentoPct != null ? { descuentoPct } : {}),
        items: [{ productoId: producto.id, cantidad, precioUnitario }],
      },
    })
    return { res, token }
  }

  async function createVentaSala(args) {
    return createVentaConTipo({ ...args, tipo: 'Venta Sala' })
  }

  it('descuenta stock inventariado y registra movimiento al crear venta sala', async () => {
    const marker = `TEST-VENTA-STOCK-CREATE-${Date.now()}`
    const producto = await createInventariado(marker, 5)
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      const { res } = await createVentaSala({ producto, cantidad: 2 })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      created.ordenIds.push(body.id)

      const updatedProduct = await app.prisma.producto.findUnique({ where: { id: producto.id } })
      expect(updatedProduct.stock).toBe(3)
      const movimiento = await app.prisma.movimientoBodega.findFirst({ where: { ordenId: body.id, productoId: producto.id } })
      expect(movimiento).toMatchObject({ tipo: 'egreso', cantidad: -2, origenTipo: 'venta_directa', origenId: body.id })
    } finally {
      await cleanup(created)
    }
  })

  it('asigna nInterno secuencial al crear una venta', async () => {
    const marker = `TEST-VENTA-NINTERNO-${Date.now()}`
    const producto = await createInventariado(marker, 5)
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      const { res } = await createVentaSala({ producto, cantidad: 1 })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      created.ordenIds.push(body.id)
      expect(body.nInterno).toBeTypeOf('number')
      expect(body.nInterno).toBeGreaterThan(0)

      const maxExisting = await app.prisma.orden.aggregate({ _max: { nInterno: true }, where: { id: { not: body.id } } })
      expect(body.nInterno).toBeGreaterThan(maxExisting._max.nInterno || 0)
    } finally {
      await cleanup(created)
    }
  })

  it('descuenta stock y normaliza OC al crear Convenio Marco', async () => {
    const marker = `TEST-VENTA-CM-STOCK-${Date.now()}`
    const producto = await createInventariado(marker, 5)
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      const { res } = await createVentaConTipo({
        producto,
        cantidad: 2,
        precioUnitario: 1190,
        tipo: 'Convenio Marco',
        licitacion: `OC ${marker}`,
      })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      created.ordenIds.push(body.id)
      expect(body.licitacion).toBe(`OC${marker}`)
      expect((await app.prisma.producto.findUnique({ where: { id: producto.id } })).stock).toBe(3)

      const adminToken = await loginAs(app, 'admin', 9401)
      const anular = await app.inject({
        method: 'POST',
        url: `/api/ventas/${body.id}/anular`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(anular.statusCode).toBe(200)
      expect((await app.prisma.producto.findUnique({ where: { id: producto.id } })).stock).toBe(5)

      const activar = await app.inject({
        method: 'POST',
        url: `/api/ventas/${body.id}/activar`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(activar.statusCode).toBe(200)
      expect((await app.prisma.producto.findUnique({ where: { id: producto.id } })).stock).toBe(3)
    } finally {
      await cleanup(created)
    }
  })

  // El catalogo de porcentajes autorizados se elimino: un descuento existe solo
  // si una regla vigente lo respalda para ese borrador. Sin regla, se bloquea.
  it('bloquea el descuento cuando ninguna regla vigente lo respalda', async () => {
    const marker = `TEST-VENTA-DCTO-SIN-REGLA-${Date.now()}`
    const producto = await createInventariado(marker, 10)
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      for (const tipo of ['Venta Sala', 'Convenio Marco']) {
        const res = await createVentaConTipo({
          producto,
          cantidad: 1,
          precioUnitario: 333,
          tipo,
          licitacion: tipo === 'Convenio Marco' ? `${marker}-OC` : undefined,
          descuentoPct: 7,
          role: 'admin',
        })
        expect(res.res.statusCode).toBe(400)
        expect(JSON.parse(res.res.body).error).toMatch(/regla de descuento vigente/i)
      }
    } finally {
      await cleanup(created)
    }
  })

  it('acepta el descuento que una regla autoriza y rechaza el que supera su maximo', async () => {
    const marker = `TEST-VENTA-DCTO-REGLA-${Date.now()}`
    const producto = await createInventariado(marker, 10)
    const created = { ordenIds: [], productoIds: [producto.id] }
    let regla
    try {
      regla = await app.prisma.descuentoRegla.create({
        data: {
          codigo: `${marker}-regla`,
          nombre: `${marker} regla`,
          alcance: 'ventas',
          prioridad: 900,
          porcentajeMax: 10,
          activo: true,
          condiciones: { tiposVenta: ['Venta Sala'], montoMinimo: 0 },
          efecto: { porcentajeSugerido: 10, porcentajeAutoaprobado: 10 },
        },
      })

      // Dentro del maximo de la regla: se guarda.
      const autorizado = await createVentaConTipo({
        producto, cantidad: 1, precioUnitario: 333, tipo: 'Venta Sala', descuentoPct: 7, role: 'admin',
      })
      expect(autorizado.res.statusCode).toBe(201)
      const body = JSON.parse(autorizado.res.body)
      created.ordenIds.push(body.id)
      expect(body.descuentoPct).toBe(7)
      expect(body.total).toBe(333 - Math.round(333 * 7 / 100))

      // Sobre el maximo: la regla aplica pero no lo cubre.
      const excedido = await createVentaConTipo({
        producto, cantidad: 1, precioUnitario: 333, tipo: 'Venta Sala', descuentoPct: 25, role: 'admin',
      })
      expect(excedido.res.statusCode).toBe(400)
      expect(JSON.parse(excedido.res.body).error).toMatch(/porcentaje maximo/i)

      // Otro tipo de venta que la regla no cubre: tampoco pasa.
      const otroTipo = await createVentaConTipo({
        producto, cantidad: 1, precioUnitario: 333, tipo: 'Convenio Marco', licitacion: `${marker}-OC`, descuentoPct: 7, role: 'admin',
      })
      expect(otroTipo.res.statusCode).toBe(400)
      expect(JSON.parse(otroTipo.res.body).error).toMatch(/regla de descuento vigente/i)
    } finally {
      await cleanup(created)
      if (regla) await app.prisma.descuentoRegla.delete({ where: { id: regla.id } }).catch(() => {})
    }
  })

  it('rechaza Convenio Marco sin OC o con OC duplicada', async () => {
    const marker = `TEST-VENTA-CM-OC-${Date.now()}`
    const producto = await createInventariado(marker, 10)
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      const sinOc = await createVentaConTipo({ producto, tipo: 'Convenio Marco', licitacion: '' })
      expect(sinOc.res.statusCode).toBe(400)
      expect(JSON.parse(sinOc.res.body).error).toMatch(/OC requerido/)

      const first = await createVentaConTipo({ producto, tipo: 'Convenio Marco', licitacion: `OC ${marker}` })
      expect(first.res.statusCode).toBe(201)
      created.ordenIds.push(JSON.parse(first.res.body).id)

      const duplicate = await createVentaConTipo({ producto, tipo: 'Convenio Marco', licitacion: `OC${marker}` })
      expect(duplicate.res.statusCode).toBe(409)
      expect(JSON.parse(duplicate.res.body).error).toMatch(/ya existe/)
    } finally {
      await cleanup(created)
    }
  })

  it('incluye Licitacion y Convenio Marco en el filtro agrupado de ventas', async () => {
    const marker = `TEST-VENTA-CM-FILTER-${Date.now()}`
    const producto = await createInventariado(marker, 20)
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      const convenio = await createVentaConTipo({ producto, tipo: 'Convenio Marco', licitacion: `${marker}-CM` })
      const licitacion = await createVentaConTipo({ producto, tipo: 'Licitación', licitacion: `${marker}-LIC` })
      const normal = await createVentaConTipo({ producto, tipo: 'Normal', licitacion: `${marker}-NORMAL` })
      expect(convenio.res.statusCode).toBe(201)
      expect(licitacion.res.statusCode).toBe(201)
      expect(normal.res.statusCode).toBe(201)
      const convenioId = JSON.parse(convenio.res.body).id
      const licitacionId = JSON.parse(licitacion.res.body).id
      const normalId = JSON.parse(normal.res.body).id
      created.ordenIds.push(convenioId, licitacionId, normalId)

      const token = await loginAs(app, 'admin', 9401)
      const list = await app.inject({
        method: 'GET',
        url: `/api/ventas?tipo=licitacion-convenio&scope=todos&search=${encodeURIComponent(marker)}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(list.statusCode).toBe(200)
      const ids = JSON.parse(list.body).items.map(item => item.id)
      expect(ids).toContain(convenioId)
      expect(ids).toContain(licitacionId)
      expect(ids).not.toContain(normalId)
    } finally {
      await cleanup(created)
    }
  })

  it('rechaza venta sala cuando el stock inventariado es insuficiente', async () => {
    const marker = `TEST-VENTA-STOCK-LOW-${Date.now()}`
    const producto = await createInventariado(marker, 1)
    const created = { productoIds: [producto.id] }
    try {
      const { res } = await createVentaSala({ producto, cantidad: 2 })
      expect(res.statusCode).toBe(409)
      expect(JSON.parse(res.body).error).toMatch(/Stock insuficiente/)
      const unchanged = await app.prisma.producto.findUnique({ where: { id: producto.id } })
      expect(unchanged.stock).toBe(1)
      const movimientos = await app.prisma.movimientoBodega.count({ where: { productoId: producto.id } })
      expect(movimientos).toBe(0)
    } finally {
      await cleanup(created)
    }
  })

  it('reconcilia stock al reemplazar items de venta sala', async () => {
    const marker = `TEST-VENTA-STOCK-UPDATE-${Date.now()}`
    const productoA = await createInventariado(`${marker}-A`, 10)
    const productoB = await createInventariado(`${marker}-B`, 10)
    const created = { ordenIds: [], productoIds: [productoA.id, productoB.id] }
    try {
      const { res, token } = await createVentaSala({ producto: productoA, cantidad: 2 })
      expect(res.statusCode).toBe(201)
      const venta = JSON.parse(res.body)
      created.ordenIds.push(venta.id)

      const update = await app.inject({
        method: 'PUT',
        url: `/api/ventas/${venta.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          items: [
            { productoId: productoA.id, cantidad: 4, precioUnitario: 1000 },
            { productoId: productoB.id, cantidad: 1, precioUnitario: 1000 },
          ],
        },
      })
      expect(update.statusCode).toBe(200)
      const afterFirst = await app.prisma.producto.findMany({ where: { id: { in: [productoA.id, productoB.id] } }, orderBy: { id: 'asc' } })
      expect(afterFirst.map(p => p.stock)).toEqual([6, 9])

      const second = await app.inject({
        method: 'PUT',
        url: `/api/ventas/${venta.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          items: [{ productoId: productoA.id, cantidad: 1, precioUnitario: 1000 }],
        },
      })
      expect(second.statusCode).toBe(200)
      const afterSecond = await app.prisma.producto.findMany({ where: { id: { in: [productoA.id, productoB.id] } }, orderBy: { id: 'asc' } })
      expect(afterSecond.map(p => p.stock)).toEqual([9, 10])
    } finally {
      await cleanup(created)
    }
  })

  it('bloquea reemplazo de items cuando la venta sala ya tiene documento o pago de caja', async () => {
    const marker = `TEST-VENTA-STOCK-FIN-${Date.now()}`
    const productoA = await createInventariado(`${marker}-A`, 5)
    const productoB = await createInventariado(`${marker}-B`, 5)
    const created = { ordenIds: [], productoIds: [productoA.id, productoB.id] }
    try {
      const { res, token } = await createVentaSala({ producto: productoA, cantidad: 2, precioUnitario: 1000 })
      expect(res.statusCode).toBe(201)
      const venta = JSON.parse(res.body)
      created.ordenIds.push(venta.id)
      await app.prisma.movimientoCaja.create({
        data: {
          ordenId: venta.id,
          sucursalId: 9401,
          tipo: 'Ingreso',
          monto: 2000,
          medioPago: 'Referencial',
          documento: 'Factura Plast',
          nDoc: marker,
          estadoDoc: 'Activa',
          estadoPagoDoc: 'No pagada',
          origenTipo: 'orden',
          origenId: venta.id,
          fecha: new Date(),
        },
      })

      const update = await app.inject({
        method: 'PUT',
        url: `/api/ventas/${venta.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { items: [{ productoId: productoB.id, cantidad: 1, precioUnitario: 1000 }] },
      })
      expect(update.statusCode).toBe(409)
      expect(JSON.parse(update.body).error).toBe('No se pueden reemplazar items con pagos o documentos de caja registrados')
      const after = await app.prisma.producto.findMany({ where: { id: { in: [productoA.id, productoB.id] } }, orderBy: { id: 'asc' } })
      expect(after.map(p => p.stock)).toEqual([3, 5])
    } finally {
      await cleanup(created)
    }
  })

  it('anula y reactiva venta sala reconciliando stock y documentos de caja', async () => {
    const marker = `TEST-VENTA-LIFECYCLE-${Date.now()}`
    const producto = await createInventariado(marker, 5)
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      const { res } = await createVentaSala({ producto, cantidad: 2, precioUnitario: 1000 })
      expect(res.statusCode).toBe(201)
      const venta = JSON.parse(res.body)
      const adminToken = await loginAs(app, 'admin', 9401)
      created.ordenIds.push(venta.id)
      await app.prisma.orden.update({ where: { id: venta.id }, data: { abono: 1000, estadoPago: 'Parcial' } })
      const movimientoCaja = await app.prisma.movimientoCaja.create({
        data: {
          ordenId: venta.id,
          sucursalId: 9401,
          tipo: 'Ingreso',
          monto: 1000,
          medioPago: 'Efectivo',
          documento: 'Factura Plast',
          nDoc: marker,
          estadoDoc: 'Activa',
          estadoPagoDoc: 'Parcial',
          origenTipo: 'orden',
          origenId: venta.id,
          fecha: new Date(),
        },
      })

      const anular = await app.inject({
        method: 'POST',
        url: `/api/ventas/${venta.id}/anular`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(anular.statusCode).toBe(200)
      expect((await app.prisma.producto.findUnique({ where: { id: producto.id } })).stock).toBe(5)
      const movAnulado = await app.prisma.movimientoCaja.findUnique({ where: { id: movimientoCaja.id } })
      expect(movAnulado.eliminado).toBe(true)
      expect(movAnulado.estadoDoc).toBe('Nula')
      const ordenAnulada = await app.prisma.orden.findUnique({ where: { id: venta.id } })
      expect(ordenAnulada.eliminada).toBe(true)
      expect(ordenAnulada.abono).toBe(0)
      expect(ordenAnulada.estadoPago).toBe('No pagada')
      expect(ordenAnulada.estadoFlujoFormal).toBe('ANULADA')
      expect(await app.prisma.ordenEstadoFlujoHistorial.findFirst({
        where: { ordenId: venta.id, estadoAnterior: 'CREADA', estadoNuevo: 'ANULADA' },
      })).toBeTruthy()

      const activar = await app.inject({
        method: 'POST',
        url: `/api/ventas/${venta.id}/activar`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(activar.statusCode).toBe(200)
      expect((await app.prisma.producto.findUnique({ where: { id: producto.id } })).stock).toBe(3)
      const movActivo = await app.prisma.movimientoCaja.findUnique({ where: { id: movimientoCaja.id } })
      expect(movActivo.eliminado).toBe(false)
      expect(movActivo.estadoDoc).toBe('Activa')
      const ordenActiva = await app.prisma.orden.findUnique({ where: { id: venta.id } })
      expect(ordenActiva.eliminada).toBe(false)
      expect(ordenActiva.abono).toBe(1000)
      expect(ordenActiva.estadoPago).toBe('Parcial')
      expect(ordenActiva.estadoFlujoFormal).toBe('CREADA')
      expect(await app.prisma.ordenEstadoFlujoHistorial.findFirst({
        where: { ordenId: venta.id, estadoAnterior: 'ANULADA', estadoNuevo: 'CREADA' },
      })).toBeTruthy()
    } finally {
      await cleanup(created)
    }
  })

  it('rechaza reactivar venta sala si restauraria un documento referencial duplicado', async () => {
    const marker = `TEST-VENTA-ACT-DOC-${Date.now()}`
    const producto = await createInventariado(marker, 5)
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      const { res } = await createVentaSala({ producto, cantidad: 1, precioUnitario: 1000 })
      expect(res.statusCode).toBe(201)
      const venta = JSON.parse(res.body)
      const adminToken = await loginAs(app, 'admin', 9401)
      created.ordenIds.push(venta.id)
      await app.prisma.movimientoCaja.create({
        data: {
          ordenId: venta.id,
          sucursalId: 9401,
          tipo: 'Ingreso',
          monto: 1000,
          medioPago: 'Referencial',
          documento: 'Factura Plast',
          nDoc: marker,
          estadoDoc: 'Activa',
          estadoPagoDoc: 'No pagada',
          origenTipo: 'orden',
          origenId: venta.id,
          fecha: new Date(),
        },
      })

      const anular = await app.inject({
        method: 'POST',
        url: `/api/ventas/${venta.id}/anular`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(anular.statusCode).toBe(200)
      await app.prisma.movimientoCaja.create({
        data: {
          sucursalId: 9401,
          tipo: 'Ingreso',
          monto: 1000,
          medioPago: 'Referencial',
          documento: 'Factura Plast',
          nDoc: marker,
          estadoDoc: 'Activa',
          estadoPagoDoc: 'No pagada',
          fecha: new Date(),
        },
      })

      const activar = await app.inject({
        method: 'POST',
        url: `/api/ventas/${venta.id}/activar`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(activar.statusCode).toBe(409)
      expect(JSON.parse(activar.body).error).toBe('No se puede reactivar la venta: documento referencial duplicado activo')
      expect((await app.prisma.producto.findUnique({ where: { id: producto.id } })).stock).toBe(5)
    } finally {
      await app.prisma.movimientoCaja.deleteMany({ where: { nDoc: marker } }).catch(() => {})
      await cleanup(created)
    }
  })

  it('reactiva solo movimientos anulados por la anulacion de venta', async () => {
    const marker = `TEST-VENTA-ACT-SEL-${Date.now()}`
    const producto = await createInventariado(marker, 5)
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      const { res } = await createVentaSala({ producto, cantidad: 1, precioUnitario: 2000 })
      expect(res.statusCode).toBe(201)
      const venta = JSON.parse(res.body)
      const adminToken = await loginAs(app, 'admin', 9401)
      created.ordenIds.push(venta.id)
      await app.prisma.orden.update({ where: { id: venta.id }, data: { abono: 1000, estadoPago: 'Parcial' } })
      const activeAtAnulacion = await app.prisma.movimientoCaja.create({
        data: {
          ordenId: venta.id,
          sucursalId: 9401,
          tipo: 'Ingreso',
          monto: 1000,
          medioPago: 'Efectivo',
          documento: 'Factura Plast',
          nDoc: `${marker}-active`,
          estadoDoc: 'Activa',
          estadoPagoDoc: 'Parcial',
          origenTipo: 'orden',
          origenId: venta.id,
          fecha: new Date(),
        },
      })
      const independentlyDeleted = await app.prisma.movimientoCaja.create({
        data: {
          ordenId: venta.id,
          sucursalId: 9401,
          tipo: 'Ingreso',
          monto: 500,
          medioPago: 'Transferencia',
          documento: 'Factura Plast',
          nDoc: `${marker}-deleted`,
          estadoDoc: 'Nula',
          estadoPagoDoc: 'Parcial',
          eliminado: true,
          origenTipo: 'orden',
          origenId: venta.id,
          fecha: new Date(),
          fecham: new Date(Date.now() - 60_000),
        },
      })

      const anular = await app.inject({
        method: 'POST',
        url: `/api/ventas/${venta.id}/anular`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(anular.statusCode).toBe(200)

      const activar = await app.inject({
        method: 'POST',
        url: `/api/ventas/${venta.id}/activar`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(activar.statusCode).toBe(200)
      const restored = await app.prisma.movimientoCaja.findUnique({ where: { id: activeAtAnulacion.id } })
      const stillDeleted = await app.prisma.movimientoCaja.findUnique({ where: { id: independentlyDeleted.id } })
      expect(restored.eliminado).toBe(false)
      expect(stillDeleted.eliminado).toBe(true)
      const ordenActiva = await app.prisma.orden.findUnique({ where: { id: venta.id } })
      expect(ordenActiva.abono).toBe(1000)
      expect(ordenActiva.estadoPago).toBe('Parcial')
    } finally {
      await cleanup(created)
    }
  })

  it('bloquea descuento y cargos cuando existen pagos o documentos de caja', async () => {
    const marker = `TEST-VENTA-TOTAL-LOCK-${Date.now()}`
    const producto = await createInventariado(marker, 5)
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      const { res, token } = await createVentaSala({ producto, cantidad: 1, precioUnitario: 2000 })
      expect(res.statusCode).toBe(201)
      const venta = JSON.parse(res.body)
      created.ordenIds.push(venta.id)
      const cargo = await app.prisma.ordenCargo.create({ data: { ordenId: venta.id, nombre: 'Despacho', valor: 500 } })
      await app.prisma.movimientoCaja.create({
        data: {
          ordenId: venta.id,
          sucursalId: 9401,
          tipo: 'Ingreso',
          monto: 2000,
          medioPago: 'Referencial',
          documento: 'Factura Plast',
          nDoc: marker,
          estadoDoc: 'Activa',
          estadoPagoDoc: 'No pagada',
          origenTipo: 'orden',
          origenId: venta.id,
          fecha: new Date(),
        },
      })

      const descuento = await app.inject({
        method: 'PUT',
        url: `/api/ventas/${venta.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { descuentoPct: 10 },
      })
      expect(descuento.statusCode).toBe(409)
      expect(JSON.parse(descuento.body).error).toBe('No se puede modificar descuento con pagos o documentos de caja registrados')

      const addCargo = await app.inject({
        method: 'POST',
        url: `/api/ventas/${venta.id}/cargos`,
        headers: { authorization: `Bearer ${token}` },
        payload: { nombre: 'Otro despacho', valor: 100 },
      })
      expect(addCargo.statusCode).toBe(409)

      const deleteCargo = await app.inject({
        method: 'DELETE',
        url: `/api/ventas/cargos/${cargo.id}`,
        headers: { authorization: `Bearer ${await loginAs(app, 'admin', 9401)}` },
      })
      expect(deleteCargo.statusCode).toBe(409)
    } finally {
      await cleanup(created)
    }
  })

  it('calcula saldo y estado de pago con NC, ND y multas como en legacy', async () => {
    const marker = `TEST-VENTA-AJUSTES-${Date.now()}`
    const producto = await createInventariado(marker, 5)
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      const { res } = await createVentaSala({ producto, cantidad: 1, precioUnitario: 1000 })
      expect(res.statusCode).toBe(201)
      const venta = JSON.parse(res.body)
      created.ordenIds.push(venta.id)
      const adminToken = await loginAs(app, 'admin', 9401)

      const nc = await app.inject({
        method: 'POST',
        url: `/api/caja/cobranza/orden/${venta.id}/documento`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { documento: 'NC Plast', nDoc: `${marker}-NC`, monto: 400, fecha: '2026-05-27' },
      })
      expect(nc.statusCode).toBe(201)
      expect(JSON.parse(nc.body).movimiento.fecha).toContain('2026-05-27')

      const nd = await app.inject({
        method: 'POST',
        url: `/api/caja/cobranza/orden/${venta.id}/documento`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { documento: 'ND Plast', nDoc: `${marker}-ND`, monto: 100 },
      })
      expect(nd.statusCode).toBe(201)

      const multa = await app.inject({
        method: 'POST',
        url: '/api/multas',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ordenId: venta.id, monto: 500, nDocumento: `${marker}-M` },
      })
      expect(multa.statusCode).toBe(201)

      const detail = await app.inject({
        method: 'GET',
        url: `/api/ventas/${venta.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(detail.statusCode).toBe(200)
      const body = JSON.parse(detail.body)
      expect(body.total).toBe(1000)
      expect(body.ajustesFinancieros).toBe(1000)
      expect(body.saldo).toBe(0)
      expect(body.estadoPago).toBe('Pagada')

      const orden = await app.prisma.orden.findUnique({ where: { id: venta.id } })
      expect(orden.estadoPago).toBe('Pagada')
    } finally {
      await cleanup(created)
    }
  })

  it('aplica scope por sucursal en listado, detalle, edicion, cargos y entregados', async () => {
    const marker = `TEST-VENTA-SCOPE-${Date.now()}`
    const producto = await app.prisma.producto.create({
      data: { codigoInterno: `${marker}-P`, nombre: `${marker} Producto`, activo: true },
    })
    const created = { ordenIds: [], productoIds: [producto.id] }
    try {
      const { res } = await createVentaSala({ producto, cantidad: 1, sucursalId: 9501 })
      expect(res.statusCode).toBe(201)
      const venta = JSON.parse(res.body)
      created.ordenIds.push(venta.id)
      const wrongToken = await loginAs(app, 'admin', 9502)

      const list = await app.inject({ method: 'GET', url: '/api/ventas', headers: { authorization: `Bearer ${wrongToken}` } })
      expect(list.statusCode).toBe(200)
      expect(JSON.parse(list.body).items.some(item => item.id === venta.id)).toBe(false)

      const detail = await app.inject({ method: 'GET', url: `/api/ventas/${venta.id}`, headers: { authorization: `Bearer ${wrongToken}` } })
      expect(detail.statusCode).toBe(404)

      const update = await app.inject({
        method: 'PUT',
        url: `/api/ventas/${venta.id}`,
        headers: { authorization: `Bearer ${wrongToken}` },
        payload: { observaciones: 'fuera de scope' },
      })
      expect(update.statusCode).toBe(404)

      const cargo = await app.inject({
        method: 'POST',
        url: `/api/ventas/${venta.id}/cargos`,
        headers: { authorization: `Bearer ${wrongToken}` },
        payload: { nombre: 'Despacho', valor: 1000 },
      })
      expect(cargo.statusCode).toBe(404)

      const delivered = await app.inject({
        method: 'PUT',
        url: `/api/ventas/items/${venta.items[0].id}/entregados`,
        headers: { authorization: `Bearer ${wrongToken}` },
        payload: { nEntregados: 1 },
      })
      expect(delivered.statusCode).toBe(404)
    } finally {
      await cleanup(created)
    }
  })

  it('permite crear y actualizar ventas de tipo Licitacion con campos de metadata y los sincroniza con cotizacion_licitacion', async () => {
    const marker = `TEST-VENTA-LICITACION-${Date.now()}`
    const token = await loginAs(app, 'admin')
    const producto = await createInventariado(marker, 5)
    const created = { ordenIds: [], productoIds: [producto.id], cotIds: [] }
    try {
      const firstCliente = await app.prisma.cliente.findFirst()
      const res = await app.inject({
        method: 'POST',
        url: '/api/ventas',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          tipo: 'Licitación',
          clienteId: firstCliente?.id,
          licitacion: marker,
          licitacionFecha: '2026-05-27',
          licitacionPlazo: '30',
          licitacionReferencia: 'Escuela A-100',
          licitacionOC: 'OC-123',
          items: [{ productoId: producto.id, cantidad: 2, precioUnitario: 1000 }],
        },
      })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      created.ordenIds.push(body.id)

      const cot = await app.prisma.cotizacionLicitacion.findFirst({
        where: { idLicitacion: marker },
        include: { items: true },
      })
      expect(cot).toBeDefined()
      expect(cot.ordenId).toBe(body.id)
      expect(new Date(cot.fecha).toISOString().slice(0, 10)).toBe('2026-05-27')
      expect(cot.plazo).toBe('30')
      expect(cot.referencia).toBe('Escuela A-100')
      expect(cot.ordenCompra).toBe('OC-123')
      // No se auto-adjudica al crear la venta: el organismo licitante adjudica
      // despues, item por item (ver LicitacionDetallePage).
      expect(cot.estado).toBe('Pendiente')
      expect(cot.items.every(item => item.cantAdjudicados === 0)).toBe(true)

      const updateRes = await app.inject({
        method: 'PUT',
        url: `/api/ventas/${body.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          licitacionFecha: '2026-05-28',
          licitacionPlazo: '45',
          licitacionReferencia: 'Escuela A-101',
          licitacionOC: 'OC-124',
        }
      })
      expect(updateRes.statusCode).toBe(200)

      const cotUpdated = await app.prisma.cotizacionLicitacion.findUnique({
        where: { id: cot.id }
      })
      expect(new Date(cotUpdated.fecha).toISOString().slice(0, 10)).toBe('2026-05-28')
      expect(cotUpdated.plazo).toBe('45')
      // Actualizar metadata de la venta tampoco debe forzar Adjudicada.
      expect(cotUpdated.estado).toBe('Pendiente')
      expect(cotUpdated.referencia).toBe('Escuela A-101')
      expect(cotUpdated.ordenCompra).toBe('OC-124')
    } finally {
      await app.prisma.cotizacionLicitacion.deleteMany({ where: { idLicitacion: marker } }).catch(() => {})
      await cleanup(created)
    }
  })
})

// Regresion: el legacy MySQL escribe "Entregado" y "Venta sala"; la validacion
// solo aceptaba "Entregada" y "Venta Sala". Como el formulario lee el estado
// guardado y lo reenvia al guardar, editar cualquiera de esas ordenes moria en
// 400. Al 26-08-2026 eran 16.035 de 16.368 ordenes activas en produccion (98%).
describe('Edicion de ventas con la grafia heredada del legacy', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app, 'admin')
  })

  it('crea Venta Sala anónima sin cliente y mantiene clienteId nulo', async () => {
    const marker = `TEST-VENTA-SALA-ANONIMA-${Date.now()}`
    const producto = await app.prisma.producto.create({
      data: { codigoInterno: `${marker}-P`, nombre: `${marker} Producto`, activo: true },
    })
    let ordenId = null
    try {
      const res = await app.inject({
        method: 'POST', url: '/api/ventas',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          tipo: 'Venta Sala',
          items: [{ productoId: producto.id, cantidad: 1, precioUnitario: 5000 }],
        },
      })
      expect(res.statusCode, res.body).toBe(201)
      const body = JSON.parse(res.body)
      ordenId = body.id
      expect(body.clienteId).toBeNull()
      expect(body.cliente).toBeNull()
      expect(body.total).toBe(5000)
    } finally {
      if (ordenId) await app.prisma.orden.delete({ where: { id: ordenId } }).catch(() => {})
      await app.prisma.producto.delete({ where: { id: producto.id } }).catch(() => {})
    }
  })

  it('mantiene cliente obligatorio fuera de Venta Sala', async () => {
    const marker = `TEST-VENTA-SIN-CLIENTE-${Date.now()}`
    const producto = await app.prisma.producto.create({
      data: { codigoInterno: `${marker}-P`, nombre: `${marker} Producto`, activo: true },
    })
    try {
      const res = await app.inject({
        method: 'POST', url: '/api/ventas',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          tipo: 'Normal',
          items: [{ productoId: producto.id, cantidad: 1, precioUnitario: 5000 }],
        },
      })
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).error).toMatch(/solo Venta Sala/i)
    } finally {
      await app.prisma.producto.delete({ where: { id: producto.id } }).catch(() => {})
    }
  })
  afterAll(async () => { await app.close() })

  async function crearOrdenLegacy(data) {
    let cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
    if (!cliente) {
      cliente = await app.prisma.cliente.create({
        data: {
          rut: `99${Math.floor(10000000 + Math.random() * 89999999)}-K`,
          nombre: 'Cliente Test Legacy',
          razonSocial: 'Cliente Test Legacy',
          email: `test.legacy.${Date.now()}@test.com`,
        },
        select: { id: true },
      })
    }
    let user = await app.prisma.user.findFirst({ select: { id: true } })
    if (!user) {
      user = await app.prisma.user.create({
        data: {
          email: `legacy.${Date.now()}@test.com`,
          passwordHash: 'hash',
          role: 'admin',
          nombre: 'Usuario Test Legacy',
        },
        select: { id: true },
      })
    }
    // Se crea por Prisma a proposito: replica como entra el dato desde los
    // importadores legacy, sin pasar por la validacion de la API.
    return app.prisma.orden.create({
      data: {
        estado: 'Activa',
        estadoPago: 'No pagada',
        clienteId: cliente.id,
        userId: user.id,
        nInterno: 973000000 + Math.floor(Math.random() * 100000),
        ...data,
      },
    })
  }

  it('permite editar una orden guardada como "Entregado" y la persiste como "Entregada"', async () => {
    const orden = await crearOrdenLegacy({ tipo: 'Venta Web', estadoEntrega: 'Entregado' })
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        // El formulario reenvia el mismo estado que leyo de la base.
        payload: { estadoEntrega: 'Entregado', observaciones: 'editada tras el fix' },
      })
      expect(res.statusCode).toBe(200)
      const guardada = await app.prisma.orden.findUnique({
        where: { id: orden.id },
        select: { estadoEntrega: true, observaciones: true },
      })
      expect(guardada.estadoEntrega).toBe('Entregada')
      expect(guardada.observaciones).toBe('editada tras el fix')
    } finally {
      await app.prisma.orden.delete({ where: { id: orden.id } })
    }
  })

  it('no exige guia ni despacho al reenviar un estado entregado que ya estaba guardado', async () => {
    // La orden no tiene guia, despacho ni items entregados: si el guard tratara
    // esto como una transicion nueva a "Entregada", responderia 409.
    const orden = await crearOrdenLegacy({ tipo: 'Venta Web', estadoEntrega: 'Entregado' })
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { estadoEntrega: 'Entregado' },
      })
      expect(res.statusCode).toBe(200)
    } finally {
      await app.prisma.orden.delete({ where: { id: orden.id } })
    }
  })

  it('sigue exigiendo respaldo cuando la entrega es una transicion real', async () => {
    const orden = await crearOrdenLegacy({ tipo: 'Venta Web', estadoEntrega: 'Pendiente entrega' })
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { estadoEntrega: 'Entregada' },
      })
      expect(res.statusCode).toBe(409)
    } finally {
      await app.prisma.orden.delete({ where: { id: orden.id } })
    }
  })

  it('unifica las grafias duplicadas de tipo de venta al guardar', async () => {
    const orden = await crearOrdenLegacy({ tipo: 'Venta sala', estadoEntrega: 'Pendiente entrega' })
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { tipo: 'Venta sala' },
      })
      expect(res.statusCode).toBe(200)
      const guardada = await app.prisma.orden.findUnique({ where: { id: orden.id }, select: { tipo: true } })
      expect(guardada.tipo).toBe('Venta Sala')
    } finally {
      await app.prisma.orden.delete({ where: { id: orden.id } })
    }
  })

  it('rechaza un estado que no corresponde a ningun valor del catalogo', async () => {
    const orden = await crearOrdenLegacy({ tipo: 'Venta Web', estadoEntrega: 'Pendiente entrega' })
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/ventas/${orden.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { estadoEntrega: 'Cualquier cosa' },
      })
      expect(res.statusCode).toBe(400)
    } finally {
      await app.prisma.orden.delete({ where: { id: orden.id } })
    }
  })
})
