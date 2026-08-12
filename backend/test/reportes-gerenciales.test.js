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
    expect(body.byCliente[rut].total).toBe(expected)
    expect(body.byVendedor[marker].total).toBe(expected)
    expect(body.byTipo['Venta directa'].total).toBe(expected)
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
    expect(exportTipo.body).toContain(`${scopedMarker}-C`)
    expect(exportTipo.body).not.toContain(`${scopedMarker}-B`)

    const gerencial = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/ventas?desde=${desde}&hasta=${hasta}&tipo=venta-directa&vendedor=${encodeURIComponent(scopedMarker)}`,
      headers: { authorization: `Bearer ${tokenFor(app, 'admin', 9701)}` },
    })
    expect(gerencial.statusCode).toBe(200)
    const body = JSON.parse(gerencial.body)
    expect(body.fuentes.ordenes.count).toBe(2)
    expect(body.fuentes.ordenes.total).toBe(3000)
    expect(body.byVendedor[`${scopedMarker}-A`].total).toBe(1000)
    expect(body.byVendedor[`${scopedMarker}-C`].total).toBe(2000)
    expect(body.byVendedor[`${scopedMarker}-B`]).toBeUndefined()
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
