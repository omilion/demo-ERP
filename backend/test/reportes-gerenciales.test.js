import { describe, it, expect, beforeAll, afterAll } from 'vitest'
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

function ordenTotal(orden) {
  const subtotal = (orden.items || []).reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)
  const cargos = (orden.cargos || []).reduce((s, c) => s + Number(c.valor || 0), 0)
  const base = subtotal + cargos
  return base - Math.round(base * (orden.descuentoPct || 0) / 100)
}

const describeDb = hasUsableDatabaseUrl() ? describe : describe.skip

describeDb('reportes gerenciales backend', () => {
  let app
  let token
  const marker = `RPT-${Date.now()}`
  const rut = `99.${String(Date.now()).slice(-3)}.111-1`
  const desde = '2026-04-01'
  const hasta = '2026-04-30'
  const fecha = new Date('2026-04-15T12:00:00.000Z')
  const createdIds = {
    ordenes: [],
    cobranza: [],
    movimientosCaja: [],
    productos: [],
    movimientosBodega: [],
    licitaciones: [],
    odts: [],
    despachos: [],
  }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = tokenFor(app, 'admin')
  })

  afterAll(async () => {
    await app.prisma.guiaDespacho.deleteMany({ where: { origenTipo: marker } }).catch(() => {})
    await app.prisma.despacho.deleteMany({ where: { id: { in: createdIds.despachos } } }).catch(() => {})
    await app.prisma.odt.deleteMany({ where: { id: { in: createdIds.odts } } }).catch(() => {})
    await app.prisma.cotizacionLicitacionItem.deleteMany({ where: { cotizacionId: { in: createdIds.licitaciones } } }).catch(() => {})
    await app.prisma.cotizacionLicitacion.deleteMany({ where: { id: { in: createdIds.licitaciones } } }).catch(() => {})
    await app.prisma.movimientoBodega.deleteMany({ where: { id: { in: createdIds.movimientosBodega } } }).catch(() => {})
    await app.prisma.producto.deleteMany({ where: { id: { in: createdIds.productos } } }).catch(() => {})
    await app.prisma.movimientoCaja.deleteMany({ where: { id: { in: createdIds.movimientosCaja } } }).catch(() => {})
    await app.prisma.cobranzaHistorico.deleteMany({ where: { id: { in: createdIds.cobranza } } }).catch(() => {})
    await app.prisma.ordenItem.deleteMany({ where: { ordenId: { in: createdIds.ordenes } } }).catch(() => {})
    await app.prisma.orden.deleteMany({ where: { id: { in: createdIds.ordenes } } }).catch(() => {})
    await app.close()
  })

  it('cuadra ventas por periodo, cliente, vendedor y tipo contra ordenes base', async () => {
    const cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
    const orden = await app.prisma.orden.create({
      data: {
        nInterno: 910000 + Math.floor(Math.random() * 50000),
        tipo: 'Venta directa',
        clienteId: cliente.id,
        rutCliente: rut,
        userId: 1,
        creadorNombre: marker,
        sucursalId: 1,
        createdAt: fecha,
        items: {
          create: [
            { productoId: 1, cantidad: 2, precioUnitario: 1000 },
            { productoId: 1, cantidad: 1, precioUnitario: 500 },
          ],
        },
      },
      include: { items: true },
    })
    createdIds.ordenes.push(orden.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/ventas?desde=${desde}&hasta=${hasta}&rut=${encodeURIComponent(rut)}&vendedor=${encodeURIComponent(marker)}&periodo=dia`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const expected = ordenTotal(orden)
    expect(body.fuentes.ordenes.count).toBe(1)
    expect(body.fuentes.ordenes.total).toBe(expected)
    expect(body.total).toBe(expected)
    expect(body.byPeriodo['2026-04-15'].total).toBe(expected)
    expect(body.byCliente[`Orden interna | ${rut}`].total).toBe(expected)
    expect(body.byVendedor[`Orden interna | ${marker}`].total).toBe(expected)
    expect(body.byTipo['Venta directa'].total).toBe(expected)
  })

  it('expone el catálogo de filtros y aplica tipos canónicos del sistema', async () => {
    const opciones = await app.inject({
      method: 'GET',
      url: '/api/reportes/gerencial/v1/filtros',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(opciones.statusCode).toBe(200)
    const filtros = JSON.parse(opciones.body)
    expect(filtros.tiposVenta).toContain('Compra Ágil')
    expect(filtros.tiposVenta).toContain('Marketplace')
    expect(filtros.vendedores.every(v => v.id && v.nombre && !Object.hasOwn(v, 'email'))).toBe(true)

    const cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
    const orden = await app.prisma.orden.create({
      data: {
        nInterno: 915000 + Math.floor(Math.random() * 50000),
        tipo: 'Compra Ágil',
        clienteId: cliente.id,
        rutCliente: `${rut}-agil`,
        userId: 1,
        creadorNombre: marker,
        sucursalId: 1,
        createdAt: fecha,
        items: { create: [{ productoId: 1, cantidad: 1, precioUnitario: 2300 }] },
      },
    })
    createdIds.ordenes.push(orden.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/ventas?desde=${desde}&hasta=${hasta}&tipo=${encodeURIComponent('Compra Ágil')}&vendedor=${encodeURIComponent(marker)}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.fuentes.ordenes.count).toBe(1)
    expect(body.fuentes.ordenes.total).toBe(2300)
  })

  it('entrega control comercial trazable con comparativo de período', async () => {
    const cliente = await app.prisma.cliente.findFirst({ select: { id: true, rut: true } })
    const commercialMarker = `${marker}-COM-${Date.now()}`
    const current = await app.prisma.orden.create({
      data: {
        nInterno: 916000 + Math.floor(Math.random() * 50000),
        tipo: 'Normal', clienteId: cliente.id, rutCliente: cliente.rut, userId: 1,
        creadorNombre: commercialMarker, sucursalId: 1, createdAt: fecha,
        items: { create: [{ productoId: 1, cantidad: 2, precioUnitario: 1000 }] },
      },
    })
    const previous = await app.prisma.orden.create({
      data: {
        nInterno: 917000 + Math.floor(Math.random() * 50000),
        tipo: 'Normal', clienteId: cliente.id, rutCliente: cliente.rut, userId: 1,
        creadorNombre: commercialMarker, sucursalId: 1, createdAt: new Date('2026-03-15T12:00:00.000Z'),
        items: { create: [{ productoId: 1, cantidad: 1, precioUnitario: 1000 }] },
      },
    })
    createdIds.ordenes.push(current.id, previous.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/v1/comercial?desde=${desde}&hasta=${hasta}&vendedor=${encodeURIComponent(commercialMarker)}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.meta.estado).toBe('operacional_estimado')
    expect(body.kpis.ventas).toBe(2000)
    expect(body.kpis.ordenes).toBe(1)
    expect(body.kpis.unidades).toBe(2)
    expect(body.kpis.comparativos.periodoAnterior.ventas).toBe(1000)
    expect(body.kpis.comparativos.periodoAnterior.variacionVentas).toBe(1)
    expect(body.rankings.vendedores[0]).toMatchObject({ label: commercialMarker, ventas: 2000, ordenes: 1 })

    const exportRes = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/comercial.xlsx?desde=${desde}&hasta=${hasta}&vendedor=${encodeURIComponent(commercialMarker)}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(exportRes.statusCode).toBe(200)
    expect(exportRes.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(exportRes.rawPayload.length).toBeGreaterThan(1000)
  })

  it('entrega las pestañas operación, finanzas y riesgos con corte y fuente declarados', async () => {
    const endpoints = [
      ['operacion', 'operacional_actual'],
      ['finanzas', 'operacional_no_contable'],
      ['riesgos', 'riesgo_operacional_actual'],
    ]
    for (const [section, estado] of endpoints) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/reportes/gerencial/v1/${section}?desde=${desde}&hasta=${hasta}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode, `${section}: ${res.body}`).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.meta.estado).toBe(estado)
      expect(body.meta.mensajeEstado).toBeTruthy()
      expect(body.filtros.desde).toBe(desde)
      expect(body.filtros.hasta).toBe(hasta)
      expect(body.kpis).toBeTruthy()
    }
  })

  it('exporta ventas respetando la sucursal del usuario', async () => {
    const cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
    const scopedMarker = `${marker}-EXP-${Date.now()}`
    const ventaScoped = await app.prisma.orden.create({
      data: {
        nInterno: 920000 + Math.floor(Math.random() * 50000),
        tipo: 'Venta directa',
        clienteId: cliente.id,
        rutCliente: `${rut}-a`,
        userId: 1,
        creadorNombre: `${scopedMarker}-A`,
        sucursalId: 9701,
        createdAt: fecha,
        items: { create: [{ productoId: 1, cantidad: 1, precioUnitario: 1000 }] },
      },
    })
    const ventaOtraSucursal = await app.prisma.orden.create({
      data: {
        nInterno: 930000 + Math.floor(Math.random() * 50000),
        tipo: 'Venta directa',
        clienteId: cliente.id,
        rutCliente: `${rut}-b`,
        userId: 1,
        creadorNombre: `${scopedMarker}-B`,
        sucursalId: 9702,
        createdAt: fecha,
        items: { create: [{ productoId: 1, cantidad: 1, precioUnitario: 1000 }] },
      },
    })
    const ventaNormalScoped = await app.prisma.orden.create({
      data: {
        nInterno: 940000 + Math.floor(Math.random() * 50000),
        tipo: 'Normal',
        clienteId: cliente.id,
        rutCliente: `${rut}-c`,
        userId: 1,
        creadorNombre: `${scopedMarker}-C`,
        sucursalId: 9701,
        createdAt: fecha,
        items: { create: [{ productoId: 1, cantidad: 1, precioUnitario: 2000 }] },
      },
    })
    createdIds.ordenes.push(ventaScoped.id, ventaOtraSucursal.id, ventaNormalScoped.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/ventas?scope=todos&search=${encodeURIComponent(scopedMarker)}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9701)}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(`${scopedMarker}-A`)
    expect(res.body).not.toContain(`${scopedMarker}-B`)

    const exportTipo = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/ventas?scope=todos&tipo=venta-directa&search=${encodeURIComponent(scopedMarker)}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9701)}` },
    })
    expect(exportTipo.statusCode).toBe(200)
    expect(exportTipo.body).toContain(`${scopedMarker}-A`)
    // C es tipo 'Normal'. Plastimar confirmo que es la venta simple, un tipo
    // propio, no una forma de escribir la venta directa: ya no cae en este filtro.
    expect(exportTipo.body).not.toContain(`${scopedMarker}-C`)
    expect(exportTipo.body).not.toContain(`${scopedMarker}-B`)

    // Y se alcanza por su propio tipo, para que no quede sin filtro que la muestre.
    const exportSimple = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/ventas?scope=todos&tipo=normal&search=${encodeURIComponent(scopedMarker)}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9701)}` },
    })
    expect(exportSimple.statusCode).toBe(200)
    expect(exportSimple.body).toContain(`${scopedMarker}-C`)
    expect(exportSimple.body).not.toContain(`${scopedMarker}-A`)

    const gerencial = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/ventas?desde=${desde}&hasta=${hasta}&tipo=venta-directa&vendedor=${encodeURIComponent(scopedMarker)}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9701)}` },
    })
    expect(gerencial.statusCode).toBe(200)
    const body = JSON.parse(gerencial.body)
    // Solo A: C es 'Normal' -la venta simple- y ya no cae en venta directa.
    expect(body.fuentes.ordenes.count).toBe(1)
    expect(body.fuentes.ordenes.total).toBe(1000)
    expect(body.byVendedor[`Orden interna | ${scopedMarker}-A`].total).toBe(1000)
    expect(body.byVendedor[`Orden interna | ${scopedMarker}-C`]).toBeUndefined()
    expect(body.byVendedor[`Orden interna | ${scopedMarker}-B`]).toBeUndefined()

    // La venta simple se reporta bajo su propio tipo, no se pierde.
    const gerencialSimple = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/ventas?desde=${desde}&hasta=${hasta}&tipo=normal&vendedor=${encodeURIComponent(scopedMarker)}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9701)}` },
    })
    const bodySimple = JSON.parse(gerencialSimple.body)
    expect(bodySimple.fuentes.ordenes.count).toBe(1)
    expect(bodySimple.byVendedor[`Orden interna | ${scopedMarker}-C`].total).toBe(2000)
  })

  it('cuadra cuentas por cobrar y caja contra registros fuente', async () => {
    const pendiente = await app.prisma.cobranzaHistorico.create({
      data: { rut, cliente: marker, fechaFactura: fecha, estado: 'PENDIENTE', valorFactura: 7000, monto: 0 },
    })
    const cancelada = await app.prisma.cobranzaHistorico.create({
      data: { rut, cliente: marker, fechaFactura: fecha, estado: 'CANCELADA', valorFactura: 3000, monto: 3000 },
    })
    const ingreso = await app.prisma.movimientoCaja.create({
      data: { tipo: 'Ingreso', monto: 5000, medioPago: 'Efectivo', referencia: marker, fecha, usuario: marker, sucursalId: 1 },
    })
    const egreso = await app.prisma.movimientoCaja.create({
      data: { tipo: 'Egreso', monto: -1200, medioPago: 'Transferencia', referencia: marker, fecha, usuario: marker, sucursalId: 1 },
    })
    createdIds.cobranza.push(pendiente.id, cancelada.id)
    createdIds.movimientosCaja.push(ingreso.id, egreso.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/cobranza-caja?desde=${desde}&hasta=${hasta}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const baseCobranza = await app.prisma.cobranzaHistorico.findMany({ where: { fechaFactura: { gte: new Date(2026, 3, 1), lte: new Date(2026, 3, 30, 23, 59, 59, 999) } } })
    const baseCaja = await app.prisma.movimientoCaja.findMany({ where: { eliminado: false, fecha: { gte: new Date(2026, 3, 1), lte: new Date(2026, 3, 30, 23, 59, 59, 999) }, NOT: { medioPago: { equals: 'Referencial', mode: 'insensitive' } } } })
    const expectedPorCobrar = baseCobranza.filter(c => c.estado === 'PENDIENTE').reduce((s, c) => s + (c.valorFactura || 0), 0)
    // La base historica contiene ambas capitalizaciones (Ingreso/ingreso).
    // El reporte las normaliza para no perder movimientos importados.
    const expectedIngresos = baseCaja.filter(m => String(m.tipo).toLowerCase() === 'ingreso').reduce((s, m) => s + (m.monto || 0), 0)
    const expectedEgresos = baseCaja.filter(m => String(m.tipo).toLowerCase() === 'egreso').reduce((s, m) => s + Math.abs(m.monto || 0), 0)
    expect(body.cuentasPorCobrar.porCobrar).toBe(expectedPorCobrar)
    expect(body.caja.ingresos).toBe(expectedIngresos)
    expect(body.caja.egresos).toBe(expectedEgresos)
  })

  it('reporta stock critico y movimientos de bodega contra queries base', async () => {
    const producto = await app.prisma.producto.create({
      data: { codigoInterno: marker, nombre: marker, precioLista: 1000, stock: 1, stockCritico: 2 },
    })
    const mov = await app.prisma.movimientoBodega.create({
      data: { productoId: producto.id, tipo: 'egreso', cantidad: -3, motivo: marker, userId: 1, createdAt: fecha },
    })
    createdIds.productos.push(producto.id)
    createdIds.movimientosBodega.push(mov.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/stock?desde=${desde}&hasta=${hasta}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const baseCriticos = await app.prisma.producto.findMany({ where: { activo: true, stockCritico: { gt: 0 } } })
    const baseMovs = await app.prisma.movimientoBodega.findMany({ where: { createdAt: { gte: new Date(2026, 3, 1), lte: new Date(2026, 3, 30, 23, 59, 59, 999) } } })
    expect(body.stockCritico.totales.productosCriticos).toBe(baseCriticos.filter(p => (p.stock || 0) <= (p.stockCritico || 0)).length)
    expect(body.movimientos.productos.egreso.total).toBe(baseMovs.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.cantidad, 0))
  })

  it('clasifica licitaciones ganadas y perdidas', async () => {
    const ganada = await app.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion: `${marker}-G`,
        fecha,
        usuario: marker,
        estado: 'Adjudicada',
        rutCliente: rut,
        items: { create: [{ cantidad: 2, cantAdjudicados: 2, precio: 4000 }] },
      },
    })
    const perdida = await app.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion: `${marker}-P`,
        fecha,
        usuario: marker,
        estado: 'Perdida',
        rutCliente: rut,
        items: { create: [{ cantidad: 1, cantAdjudicados: 0, precio: 1000 }] },
      },
    })
    createdIds.licitaciones.push(ganada.id, perdida.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/licitaciones?desde=${desde}&hasta=${hasta}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const base = await app.prisma.cotizacionLicitacion.findMany({
      where: { fecha: { gte: new Date(2026, 3, 1), lte: new Date(2026, 3, 30, 23, 59, 59, 999) } },
      include: { items: true },
    })
    const resultado = l => {
      const estado = String(l.estado || '').toLowerCase()
      if (estado.includes('perd') || estado.includes('rechaz') || estado.includes('no adjudic')) return 'perdida'
      if (estado.includes('gan') || estado.includes('adjudic') || l.ordenId || l.items.some(i => i.cantAdjudicados > 0)) return 'ganada'
      return 'pendiente'
    }
    const expectedGanadas = base.filter(l => resultado(l) === 'ganada').length
    const expectedPerdidas = base.filter(l => resultado(l) === 'perdida').length
    expect(body.byResultado.ganada.count).toBe(expectedGanadas)
    expect(body.byResultado.perdida.count).toBe(expectedPerdidas)
  })

  it('cuadra taller y despachos pendientes contra la base', async () => {
    const cliente = await app.prisma.cliente.findFirst({ select: { id: true } })
    const orden = await app.prisma.orden.create({
      data: { tipo: 'Normal', clienteId: cliente.id, userId: 1, creadorNombre: marker, createdAt: fecha },
    })
    createdIds.ordenes.push(orden.id)
    const odt = await app.prisma.odt.create({
      data: { ordenId: orden.id, tipo: 'Confeccion', clienteNombre: marker, descripcion: marker, estado: 'Pendiente', createdAt: fecha },
    })
    const despacho = await app.prisma.despacho.create({
      data: { ordenId: orden.id, odtId: odt.id, fechaEntrega: fecha, contacto: marker, origenTipo: 'odt', origenId: odt.id },
    })
    createdIds.odts.push(odt.id)
    createdIds.despachos.push(despacho.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/operaciones?desde=${desde}&hasta=${hasta}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const baseOdts = await app.prisma.odt.findMany({ where: { eliminado: false, createdAt: { lte: new Date(2026, 3, 30, 23, 59, 59, 999) } } })
    expect(body.taller.pendientes).toBe(baseOdts.filter(o => String(o.estado || '').toLowerCase() !== 'terminada').length)
    expect(body.despachos.pendientes).toBeGreaterThanOrEqual(1)
  })

  it('entrega un resumen gerencial versionado con un corte comun y solo secciones autorizadas', async () => {
    const adminRes = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/v1/resumen?desde=${desde}&hasta=${hasta}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(adminRes.statusCode).toBe(200)
    const admin = JSON.parse(adminRes.body)
    expect(admin.meta).toMatchObject({ version: 'gerencial.v1', estado: 'operacional_no_certificado' })
    expect(new Date(admin.meta.generadoEn).getTime()).not.toBeNaN()
    expect(admin.filtros).toMatchObject({ desde, hasta, periodo: 'mes' })
    expect(Object.keys(admin.secciones).sort()).toEqual(['cobranzaCaja', 'licitaciones', 'operaciones', 'stock', 'ventas'])
    expect(admin.secciones.ventas.total).toBeGreaterThanOrEqual(0)
    expect(admin.secciones.cobranzaCaja.caja).toBeTruthy()

    // El jefe de taller puede revisar su inventario, pero no recibe ventas, caja,
    // licitaciones ni operaciones transversales que requieren ademas despacho.
    const tallerRes = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/v1/resumen?desde=${desde}&hasta=${hasta}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'taller')}` },
    })
    expect(tallerRes.statusCode).toBe(200)
    expect(Object.keys(JSON.parse(tallerRes.body).secciones)).toEqual(['stock'])

    // Un perfil con caja/cobranza otorgadas por permisos extra no hereda ventas.
    // Esta fue la fuga del export CSV: su condicion anterior usaba "ventas O cobranza".
    const finanzasSoloToken = tokenFor(app, 'rrhh', null, { caja: ['read'], cobranza: ['read'] })
    const finanzasSoloRes = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/v1/resumen?desde=${desde}&hasta=${hasta}`,
      headers: { authorization: `Bearer ${finanzasSoloToken}` },
    })
    expect(finanzasSoloRes.statusCode).toBe(200)
    expect(Object.keys(JSON.parse(finanzasSoloRes.body).secciones)).toEqual(['cobranzaCaja'])

    const exportFinanzas = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/gerencial?desde=${desde}&hasta=${hasta}`,
      headers: { authorization: `Bearer ${finanzasSoloToken}` },
    })
    expect(exportFinanzas.statusCode).toBe(200)
    expect(exportFinanzas.body).toContain('Cobranza;CxC pendiente')
    expect(exportFinanzas.body).not.toContain('Ventas;Total periodo')
  })

  it('exporta el consolidado gerencial en CSV', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/gerencial?desde=${desde}&hasta=${hasta}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.body).toContain('Seccion;Indicador;Valor;Detalle')
    expect(res.body).toContain('Ventas;Total periodo')
    expect(res.body).toContain('Cobranza;CxC pendiente')
    expect(res.body).toContain('Caja;Neto')
    expect(res.body).toContain('Stock;Productos criticos')
    expect(res.body).toContain('Licitaciones;pendiente')
    expect(res.body).toContain('Operacion;Despachos pendientes')
  })

  it('exporta el consolidado gerencial en XLSX', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/export/gerencial.xlsx?desde=${desde}&hasta=${hasta}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin')}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(res.headers['content-disposition']).toContain('.xlsx')
    expect(res.rawPayload.subarray(0, 2).toString()).toBe('PK')
  })
})
