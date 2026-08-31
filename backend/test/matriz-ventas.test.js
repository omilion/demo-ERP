import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin', sucursalId = null) {
  return app.jwt.sign({
    id: 1,
    role,
    nombre: `Test ${role}`,
    permisosExtra: null,
    sucursalId,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

let seq = 1

async function createProduct(app, marker) {
  return app.prisma.producto.create({
    data: {
      codigoInterno: `MV-${marker}-${seq++}`,
      nombre: `Producto matriz ${marker}`,
      activo: true,
      precioLista: 1000,
    },
  })
}

async function createOrder(app, marker, overrides = {}) {
  const [user, product] = await Promise.all([
    app.prisma.user.findFirst({ select: { id: true } }),
    createProduct(app, marker),
  ])
  const cliente = await app.prisma.cliente.create({
    data: {
      rut: `mv-${marker}-${seq++}`,
      nombre: `Cliente ${marker}`,
      razonSocial: `Cliente ${marker}`,
      email: `mv-${marker}@test.local`,
      activo: true,
    },
  })
  const nInterno = ('nInterno' in overrides) ? overrides.nInterno : (910000000 + seq++)
  const orden = await app.prisma.orden.create({
    data: {
      nInterno,
      tipo: overrides.tipo || 'Venta sala',
      estado: overrides.estado || 'Activa',
      estadoPago: overrides.estadoPago || 'No pagada',
      estadoEntrega: overrides.estadoEntrega || 'Pendiente entrega',
      clienteId: cliente.id,
      rutCliente: cliente.rut,
      userId: user.id,
      sucursalId: overrides.sucursalId,
      createdAt: overrides.createdAt || new Date(),
      licitacion: overrides.licitacion || `OC-${marker}`,
      items: {
        create: [{
          productoId: product.id,
          codigoInterno: product.codigoInterno,
          nombre: product.nombre,
          cantidad: overrides.cantidad || 2,
          precioUnitario: overrides.precioUnitario || 1000,
        }],
      },
      cargos: overrides.cargo == null ? undefined : {
        create: [{ nombre: 'Cargo test', valor: overrides.cargo }],
      },
    },
  })
  return { orden, cliente, product }
}

async function cleanup(app, fixture) {
  if (!fixture) return
  await app.prisma.movimientoCaja.deleteMany({ where: { ordenId: fixture.orden.id } }).catch(() => {})
  await app.prisma.multa.deleteMany({ where: { ordenId: fixture.orden.id } }).catch(() => {})
  await app.prisma.cotizacionLicitacion.deleteMany({ where: { ordenId: fixture.orden.id } }).catch(() => {})
  await app.prisma.orden.delete({ where: { id: fixture.orden.id } }).catch(() => {})
  await app.prisma.producto.delete({ where: { id: fixture.product.id } }).catch(() => {})
  await app.prisma.cliente.delete({ where: { id: fixture.cliente.id } }).catch(() => {})
}

describe('matriz ventas legacy parity', () => {
  let app

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('sin filtros muestra todo el set operacional de la sucursal (no solo hoy) y totaliza cargos', async () => {
    const marker = `today-${Date.now()}`
    const todayOrder = await createOrder(app, `${marker}-a`, { sucursalId: 9101, cargo: 500 })
    const otherSucursal = await createOrder(app, `${marker}-b`, { sucursalId: 9102, cargo: 900 })
    const oldOrder = await createOrder(app, `${marker}-c`, {
      sucursalId: 9101,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    })
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/matriz-ventas',
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9101)}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.defaultVentasHoy).toBeFalsy()
      const ids = body.items.map(item => item.id)
      expect(ids).toContain(todayOrder.orden.id)
      expect(ids).toContain(oldOrder.orden.id)
      expect(ids).not.toContain(otherSucursal.orden.id)
      const row = body.items.find(item => item.id === todayOrder.orden.id)
      expect(row.total).toBe(2500)

      const totalsRes = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas/totales?nInterno=${todayOrder.orden.nInterno}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9101)}` },
      })
      expect(totalsRes.statusCode).toBe(200)
      const totals = JSON.parse(totalsRes.body)
      expect(totals.ordenes).toMatchObject({ count: 1, total: 2500 })
      expect(totals.ocOnline.count).toBe(0)
      expect(totals.licitaciones.count).toBe(0)
    } finally {
      await cleanup(app, todayOrder)
      await cleanup(app, otherSucursal)
      await cleanup(app, oldOrder)
    }
  })

  it('filters by NC documents and exports NC/ND rows scoped by sucursal', async () => {
    const marker = `nc-${Date.now()}`
    const fixture = await createOrder(app, marker, { sucursalId: 9103 })
    const otherSucursal = await createOrder(app, `${marker}-other`, { sucursalId: 9104 })
    try {
      await app.prisma.movimientoCaja.create({
        data: {
          tipo: 'Ingreso',
          monto: 100,
          medioPago: 'Referencial',
          ordenId: fixture.orden.id,
          sucursalId: null,
          documento: 'NC Plast',
          tipoDocumento: null,
          nDoc: marker,
          fecha: new Date(),
        },
      })
      await app.prisma.movimientoCaja.create({
        data: {
          tipo: 'Ingreso',
          monto: 50,
          medioPago: 'Referencial',
          ordenId: fixture.orden.id,
          sucursalId: 9103,
          documento: 'Factura',
          tipoDocumento: 'ND',
          nDoc: `${marker}-nd`,
          fecha: new Date(),
        },
      })
      await app.prisma.movimientoCaja.create({
        data: {
          tipo: 'Ingreso',
          monto: 777,
          medioPago: 'Referencial',
          ordenId: fixture.orden.id,
          sucursalId: 9103,
          documento: 'NC Plast',
          nDoc: `${marker}-nula`,
          estadoDoc: 'Nula',
          fecha: new Date(),
        },
      })
      await app.prisma.movimientoCaja.create({
        data: {
          tipo: 'Ingreso',
          monto: 888,
          medioPago: 'Referencial',
          ordenId: fixture.orden.id,
          sucursalId: 9103,
          documento: 'Factura',
          tipoDocumento: 'ND',
          nDoc: `${marker}-nd-nula`,
          estadoDoc: 'Nula',
          fecha: new Date(),
        },
      })
      await app.prisma.movimientoCaja.create({
        data: {
          tipo: 'Ingreso',
          monto: 999,
          medioPago: 'Referencial',
          ordenId: otherSucursal.orden.id,
          sucursalId: 9104,
          documento: 'ND Plast',
          nDoc: `${marker}-other-doc`,
          fecha: new Date(),
        },
      })
      await app.prisma.multa.create({
        data: { ordenId: fixture.orden.id, monto: 25, nDocumento: `${marker}-multa`, fecha: new Date() },
      })
      const res = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas?nc=${encodeURIComponent(marker)}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9103)}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.items.map(item => item.id)).toContain(fixture.orden.id)
      const row = body.items.find(item => item.id === fixture.orden.id)
      expect(row.ncTotal).toBe(100)
      expect(row.ndTotal).toBe(50)
      expect(row.multasTotal).toBe(25)
      expect(row.saldo).toBe(1825)
      expect(row.documentos.map(doc => doc.nDoc)).not.toContain(`${marker}-nula`)
      expect(row.documentos.map(doc => doc.nDoc)).not.toContain(`${marker}-nd-nula`)

      const resumenRes = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas/export?formato=resumen&nc=${encodeURIComponent(marker)}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9103)}` },
      })
      expect(resumenRes.statusCode).toBe(200)
      expect(resumenRes.body).toContain(`NC Plast-${marker}`)

      const exportRes = await app.inject({
        method: 'GET',
        url: '/api/matriz-ventas/export?formato=ndnc',
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9103)}` },
      })
      expect(exportRes.statusCode).toBe(200)
      expect(exportRes.body).toContain(marker)
      expect(exportRes.body).not.toContain(`${marker}-nula`)
      expect(exportRes.body).not.toContain(`${marker}-nd-nula`)
      expect(exportRes.body).not.toContain(`${marker}-other-doc`)

      const detalleRes = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas/export?formato=detalle-productos&nc=${encodeURIComponent(marker)}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9103)}` },
      })
      expect(detalleRes.statusCode).toBe(200)
      expect(detalleRes.body.split(/\r?\n/)[0]).toContain('Subcategoria')
    } finally {
      await cleanup(app, fixture)
      await cleanup(app, otherSucursal)
    }
  })

  it('calcula facturado desde documentos referenciales activos de Caja', async () => {
    const marker = `fact-${Date.now()}`
    const fixture = await createOrder(app, marker, { sucursalId: 9105 })
    try {
      await app.prisma.movimientoCaja.create({
        data: {
          tipo: 'Ingreso',
          monto: 1234,
          medioPago: 'Referencial',
          ordenId: fixture.orden.id,
          sucursalId: 9105,
          documento: 'Factura Plast',
          nDoc: marker,
          estadoDoc: 'Activa',
          estadoPagoDoc: 'No pagada',
          fecha: new Date(),
        },
      })
      await app.prisma.movimientoCaja.create({
        data: {
          tipo: 'Egreso',
          monto: -200,
          medioPago: 'Referencial',
          ordenId: fixture.orden.id,
          sucursalId: 9105,
          documento: 'NC Plast',
          nDoc: `${marker}-nc`,
          estadoDoc: 'Activa',
          estadoPagoDoc: 'No pagada',
          fecha: new Date(),
        },
      })
      await app.prisma.movimientoCaja.create({
        data: {
          tipo: 'Ingreso',
          monto: 9999,
          medioPago: 'Referencial',
          ordenId: fixture.orden.id,
          sucursalId: 9105,
          documento: 'Factura Plast',
          nDoc: `${marker}-fact-nula`,
          estadoDoc: 'Nula',
          estadoPagoDoc: 'No pagada',
          fecha: new Date(),
        },
      })
      await app.prisma.movimientoCaja.create({
        data: {
          tipo: 'Egreso',
          monto: -777,
          medioPago: 'Referencial',
          ordenId: fixture.orden.id,
          sucursalId: 9105,
          documento: 'NC Plast',
          nDoc: `${marker}-nc-nula`,
          estadoDoc: 'Nula',
          estadoPagoDoc: 'No pagada',
          fecha: new Date(),
        },
      })

      const res = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas?scope=todos&nInterno=${fixture.orden.nInterno}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9105)}` },
      })
      expect(res.statusCode).toBe(200)
      const row = JSON.parse(res.body).items.find(item => item.id === fixture.orden.id)
      expect(row.facturado).toBe(1234)
      expect(row.ncTotal).toBe(200)
      expect(row.saldo).toBe(1800)
      expect(row.documentos.map(doc => doc.nDoc)).not.toContain(`${marker}-fact-nula`)
      expect(row.documentos.map(doc => doc.nDoc)).not.toContain(`${marker}-nc-nula`)

      const exportRes = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas/export?scope=todos&nInterno=${fixture.orden.nInterno}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9105)}` },
      })
      expect(exportRes.statusCode).toBe(200)
      expect(exportRes.body.split(/\r?\n/)[0]).toContain('Total Facturado')
      expect(exportRes.body).toContain('1234')
      expect(exportRes.body).not.toContain(`${marker}-fact-nula`)
      expect(exportRes.body).not.toContain(`${marker}-nc-nula`)
    } finally {
      await cleanup(app, fixture)
    }
  })

  it('does not duplicate a linked licitacion as a standalone row', async () => {
    const marker = `lic-${Date.now()}`
    const fixture = await createOrder(app, marker, { sucursalId: 9104, tipo: 'Licitacion' })
    try {
      await app.prisma.cotizacionLicitacion.create({
        data: {
          idLicitacion: marker,
          rutCliente: fixture.cliente.rut,
          estado: 'Adjudicada',
          ordenId: fixture.orden.id,
          sucursalId: 9104,
          items: {
            create: [{ codigoInterno: `LIC-${marker}`, nombre: 'Item licitacion', cantidad: 1, cantAdjudicados: 1, precio: 1000 }],
          },
        },
      })
      const res = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas?idLicitacion=${encodeURIComponent(marker)}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9104)}` },
      })
      expect(res.statusCode).toBe(200)
      const rows = JSON.parse(res.body).items
      expect(rows.filter(row => row.id === fixture.orden.id && row.fuente === 'orden')).toHaveLength(1)
      expect(rows.some(row => row.fuente === 'licitacion' && row.ordenVinculadaId === fixture.orden.id)).toBe(false)

      const totalsRes = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas/totales?idLicitacion=${encodeURIComponent(marker)}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9104)}` },
      })
      expect(totalsRes.statusCode).toBe(200)
      const totals = JSON.parse(totalsRes.body)
      expect(totals.ordenes.count).toBe(1)
      expect(totals.licitaciones.count).toBe(0)
    } finally {
      await cleanup(app, fixture)
    }
  })

  it('filters legacy licitacion orders stored directly in orden.licitacion', async () => {
    const marker = `lic-legacy-${Date.now()}`
    const fixture = await createOrder(app, marker, { sucursalId: 9106, tipo: 'Licitacion', licitacion: marker })
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas?idLicitacion=${encodeURIComponent(marker)}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9106)}` },
      })
      expect(res.statusCode).toBe(200)
      const rows = JSON.parse(res.body).items
      expect(rows.some(row => row.fuente === 'orden' && row.id === fixture.orden.id)).toBe(true)

      const totalsRes = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas/totales?idLicitacion=${encodeURIComponent(marker)}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9106)}` },
      })
      expect(totalsRes.statusCode).toBe(200)
      expect(JSON.parse(totalsRes.body).ordenes.count).toBe(1)
    } finally {
      await cleanup(app, fixture)
    }
  })
})

describe('matriz ventas - fecha autonoma, estado inicial y paginacion', () => {
  let app

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('el filtro por fecha es autonomo: encuentra ordenes fuera del scope operacional', async () => {
    const marker = `fecha-${Date.now()}`
    // Orden historica: sin nInterno y fecha antigua -> normalmente excluida por scope operacional
    const hist = await createOrder(app, marker, {
      nInterno: null,
      createdAt: new Date('2018-06-15T12:00:00Z'),
      licitacion: `HIST-${marker}`,
    })
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas?desde=2018-01-01&hasta=2018-12-31&search=${encodeURIComponent(marker)}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.items.map(i => i.id)).toContain(hist.orden.id)
    } finally {
      await cleanup(app, hist)
    }
  })

  it('sin filtros no fuerza ventasHoy y muestra una venta activa recién creada', async () => {
    const marker = `all-${Date.now()}`
    const viejo = await createOrder(app, marker)
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/matriz-ventas',
        headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.defaultVentasHoy).toBeFalsy()
      expect(body.items.map(i => i.id)).toContain(viejo.orden.id)
    } finally {
      await cleanup(app, viejo)
    }
  })

  it('pagina a nivel de consulta: respeta pageSize, total y no solapa paginas', async () => {
    const token = `pag-${Date.now()}`
    const a = await createOrder(app, `${token}-a`, { licitacion: token, createdAt: new Date(Date.now() - 5000) })
    const b = await createOrder(app, `${token}-b`, { licitacion: token, createdAt: new Date() })
    try {
      const fetchPage = async page => JSON.parse((await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas?oc=${token}&pageSize=1&page=${page}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` },
      })).body)
      const p1 = await fetchPage(1)
      const p2 = await fetchPage(2)
      expect(p1.total).toBe(2)
      expect(p2.total).toBe(2)
      expect(p1.limit).toBe(1)
      expect(p1.items).toHaveLength(1)
      expect(p2.items).toHaveLength(1)
      const ids = [...p1.items.map(i => i.id), ...p2.items.map(i => i.id)]
      expect(new Set(ids).size).toBe(2)
      expect(ids).toContain(a.orden.id)
      expect(ids).toContain(b.orden.id)
      // Orden por fecha desc: la mas reciente (b) en la primera pagina
      expect(p1.items[0].id).toBe(b.orden.id)
    } finally {
      await cleanup(app, a)
      await cleanup(app, b)
    }
  })

  it('filtro search unificado busca en multiples campos (cliente, ODT, guia, documento, licitacion/OC, nInterno)', async () => {
    const marker = `search-${Date.now()}`
    const fixture = await createOrder(app, marker, { sucursalId: 9107, licitacion: `LIC-${marker}` })
    const guiaNum = `G-${marker}`
    const ncNum = `NC-${marker}`
    let odt, guia, mov, cotizacion
    try {
      // 1. Create ODT
      odt = await app.prisma.odt.create({
        data: { ordenId: fixture.orden.id, sucursalId: 9107, estado: 'Pendiente' }
      })
      // 2. Create Guia
      guia = await app.prisma.guiaDespacho.create({
        data: { nGuia: guiaNum, fechaGuia: new Date(), orden: { connect: { id: fixture.orden.id } } }
      })
      // 3. Create NC Document (MovimientoCaja)
      mov = await app.prisma.movimientoCaja.create({
        data: {
          tipo: 'Ingreso',
          monto: -500,
          medioPago: 'Referencial',
          ordenId: fixture.orden.id,
          sucursalId: 9107,
          documento: 'NC Plast',
          nDoc: ncNum,
          fecha: new Date(),
        }
      })
      // 4. Create CotizacionLicitacion
      cotizacion = await app.prisma.cotizacionLicitacion.create({
        data: {
          idLicitacion: `COTLIC-${marker}`,
          rutCliente: fixture.cliente.rut,
          estado: 'Adjudicada',
          ordenId: fixture.orden.id,
          sucursalId: 9107,
        }
      })

      // Test searching by client name
      const resName = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas?search=${encodeURIComponent(`Cliente ${marker}`)}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` }
      })
      expect(JSON.parse(resName.body).items.map(i => i.id)).toContain(fixture.orden.id)

      // Test searching by ODT (must be numeric)
      const resOdt = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas?search=${odt.id}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` }
      })
      expect(JSON.parse(resOdt.body).items.map(i => i.id)).toContain(fixture.orden.id)

      // Test searching by Guia (can be non-numeric or numeric)
      const numericGuiaNum = String(23456000 + seq++)
      const guia2 = await app.prisma.guiaDespacho.create({
        data: { nGuia: numericGuiaNum, fechaGuia: new Date(), orden: { connect: { id: fixture.orden.id } } }
      })
      const resGuia = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas?search=${numericGuiaNum}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` }
      })
      expect(JSON.parse(resGuia.body).items.map(i => i.id)).toContain(fixture.orden.id)
      await app.prisma.guiaDespacho.delete({ where: { id: guia2.id } }).catch(() => {})

      // Test searching by Document (NC)
      const resNC = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas?search=${encodeURIComponent(ncNum)}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` }
      })
      expect(JSON.parse(resNC.body).items.map(i => i.id)).toContain(fixture.orden.id)

      // Test searching by Licitacion ID / OC
      const resLic = await app.inject({
        method: 'GET',
        url: `/api/matriz-ventas?search=${encodeURIComponent(`COTLIC-${marker}`)}`,
        headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` }
      })
      expect(JSON.parse(resLic.body).items.map(i => i.id)).toContain(fixture.orden.id)

    } finally {
      if (odt) await app.prisma.odt.delete({ where: { id: odt.id } }).catch(() => {})
      if (guia) await app.prisma.guiaDespacho.delete({ where: { id: guia.id } }).catch(() => {})
      if (mov) await app.prisma.movimientoCaja.delete({ where: { id: mov.id } }).catch(() => {})
      if (cotizacion) await app.prisma.cotizacionLicitacion.delete({ where: { id: cotizacion.id } }).catch(() => {})
      await cleanup(app, fixture)
    }
  })

  it('kpis calcula correctamente hoy, mes, ytd y comparativo anual', async () => {
    const marker = `kpis-${Date.now()}`
    const today = new Date()
    const lastYear = new Date()
    lastYear.setFullYear(today.getFullYear() - 1)

    const f1 = await createOrder(app, `${marker}-hoy`, { sucursalId: 9108, createdAt: today, precioUnitario: 5000, cantidad: 1 })
    const f2 = await createOrder(app, `${marker}-ly`, { sucursalId: 9108, createdAt: lastYear, precioUnitario: 4000, cantidad: 1 })

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/matriz-ventas/totales',
        headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` }
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body).toHaveProperty('kpis')
      expect(body.kpis.hoy.gran).toBeGreaterThanOrEqual(5000)
      expect(body.kpis.mes.gran).toBeGreaterThanOrEqual(5000)
      expect(body.kpis.ytd.total).toBeGreaterThanOrEqual(5000)
      expect(body.kpis.prevYtd.total).toBeGreaterThanOrEqual(4000)
      expect(body.kpis.variacionYtd).toBeDefined()
    } finally {
      await cleanup(app, f1)
      await cleanup(app, f2)
    }
  })

  it('excluye ventas anómalas sin número interno de los KPIs operacionales', async () => {
    const marker = `kpis-sin-interno-${Date.now()}`
    const headers = { authorization: `Bearer ${tokenFor(app, 'admin')}` }
    const before = JSON.parse((await app.inject({ method: 'GET', url: '/api/matriz-ventas/totales', headers })).body)
    const fixture = await createOrder(app, marker, { nInterno: null })

    try {
      const response = await app.inject({ method: 'GET', url: '/api/matriz-ventas/totales', headers })
      expect(response.statusCode).toBe(200)
      const after = JSON.parse(response.body)
      expect(after.kpis.operacional).toEqual(before.kpis.operacional)
    } finally {
      await cleanup(app, fixture)
    }
  })
})

