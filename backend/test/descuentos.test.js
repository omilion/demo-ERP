import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin', permisosExtra = null) {
  return app.jwt.sign({
    id: 1,
    role,
    nombre: `Test ${role}`,
    permisosExtra,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

describe('descuentos catalogos', () => {
  let app
  let adminToken
  const createdMarco = []
  const createdNormales = []

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    adminToken = tokenFor(app, 'admin')
  })

  afterAll(async () => {
    await app.prisma.descuentoPorcMarco.deleteMany({ where: { id: { in: createdMarco } } }).catch(() => {})
    await app.prisma.descuentoPorc.deleteMany({ where: { id: { in: createdNormales } } }).catch(() => {})
    await app.close()
  })

  it('crea, modifica, lista y elimina descuentos Convenio Marco', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/descuentos/marco',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { valor: 1.8 },
    })
    expect(create.statusCode).toBe(201)
    const created = JSON.parse(create.body)
    createdMarco.push(created.id)
    expect(created.valor).toBe(1.8)

    const update = await app.inject({
      method: 'PUT',
      url: `/api/descuentos/marco/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { valor: '2.5' },
    })
    expect(update.statusCode).toBe(200)
    expect(JSON.parse(update.body).valor).toBe(2.5)

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/descuentos/marco',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { valor: 2.5 },
    })
    expect(duplicate.statusCode).toBe(409)
    expect(JSON.parse(duplicate.body).error).toMatch(/ya existe/)

    const list = await app.inject({
      method: 'GET',
      url: '/api/descuentos',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(list.statusCode).toBe(200)
    expect(JSON.parse(list.body).marco.some(d => d.id === created.id && d.valor === 2.5)).toBe(true)

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/descuentos/marco/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(del.statusCode).toBe(204)

    const afterDelete = await app.inject({
      method: 'GET',
      url: '/api/descuentos',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(JSON.parse(afterDelete.body).marco.some(d => d.id === created.id)).toBe(false)
  })

  it('valida porcentajes y permisos al administrar descuentos', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/descuentos/marco',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { valor: 'abc' },
    })
    expect(invalid.statusCode).toBe(400)
    expect(JSON.parse(invalid.body).error).toMatch(/entre 0 y 100|valor requerido/)

    const decimalNormal = await app.inject({
      method: 'POST',
      url: '/api/descuentos/normales',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { valor: 4.5 },
    })
    expect(decimalNormal.statusCode).toBe(400)
    expect(JSON.parse(decimalNormal.body).error).toMatch(/entero/)

    const vendedorToken = tokenFor(app, 'vendedor')
    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/descuentos/marco',
      headers: { authorization: `Bearer ${vendedorToken}` },
      payload: { valor: 3 },
    })
    expect(forbidden.statusCode).toBe(403)

    const ventasDeleteToken = tokenFor(app, 'vendedor', { ventas: ['delete'] })
    const deleteOnly = await app.inject({
      method: 'POST',
      url: '/api/descuentos/normales',
      headers: { authorization: `Bearer ${ventasDeleteToken}` },
      payload: { valor: 5 },
    })
    expect(deleteOnly.statusCode).toBe(403)

    let allowedValor = 4
    while (await app.prisma.descuentoPorc.findFirst({ where: { valor: allowedValor, activo: true } })) {
      allowedValor += 1
    }
    const extraToken = tokenFor(app, 'vendedor', { descuentos: ['write'] })
    const allowed = await app.inject({
      method: 'POST',
      url: '/api/descuentos/normales',
      headers: { authorization: `Bearer ${extraToken}` },
      payload: { valor: allowedValor },
    })
    expect(allowed.statusCode).toBe(201)
    createdNormales.push(JSON.parse(allowed.body).id)

    let discountOnlyValor = allowedValor + 1
    while (await app.prisma.descuentoPorc.findFirst({ where: { valor: discountOnlyValor, activo: true } })) {
      discountOnlyValor += 1
    }
    const discountOnlyToken = tokenFor(app, 'cajero', { descuentos: ['write'] })
    const discountOnly = await app.inject({
      method: 'POST',
      url: '/api/descuentos/normales',
      headers: { authorization: `Bearer ${discountOnlyToken}` },
      payload: { valor: discountOnlyValor },
    })
    expect(discountOnly.statusCode).toBe(201)
    createdNormales.push(JSON.parse(discountOnly.body).id)
  })
})

describe('descuentos reglas comerciales', () => {
  let app
  let adminToken
  let vendedorToken
  const created = {
    reglas: [],
    solicitudes: [],
    ordenes: [],
    cotizaciones: [],
    productos: [],
    clientes: [],
  }

  beforeAll(async () => {
    process.env.DESCUENTOS_REGLAS_ENABLED = 'true'
    app = buildApp({ logger: false })
    await app.ready()
    adminToken = tokenFor(app, 'admin')
    vendedorToken = tokenFor(app, 'vendedor')
  })

  afterAll(async () => {
    if (created.ordenes.length) {
      await app.prisma.movimientoBodega.deleteMany({ where: { ordenId: { in: created.ordenes } } }).catch(() => {})
      await app.prisma.movimientoCaja.deleteMany({ where: { ordenId: { in: created.ordenes } } }).catch(() => {})
      await app.prisma.ordenItem.deleteMany({ where: { ordenId: { in: created.ordenes } } }).catch(() => {})
      await app.prisma.orden.deleteMany({ where: { id: { in: created.ordenes } } }).catch(() => {})
    }
    if (created.solicitudes.length) await app.prisma.descuentoSolicitud.deleteMany({ where: { id: { in: created.solicitudes } } }).catch(() => {})
    if (created.reglas.length) await app.prisma.descuentoRegla.deleteMany({ where: { id: { in: created.reglas } } }).catch(() => {})
    if (created.cotizaciones.length) await app.prisma.cotizacionLicitacion.deleteMany({ where: { id: { in: created.cotizaciones } } }).catch(() => {})
    if (created.productos.length) {
      await app.prisma.movimientoBodega.deleteMany({ where: { productoId: { in: created.productos } } }).catch(() => {})
      await app.prisma.producto.deleteMany({ where: { id: { in: created.productos } } }).catch(() => {})
    }
    if (created.clientes.length) await app.prisma.cliente.deleteMany({ where: { id: { in: created.clientes } } }).catch(() => {})
    await app.close()
  })

  async function createCliente(marker) {
    const cliente = await app.prisma.cliente.create({
      data: { rut: marker, nombre: marker, activo: true },
    })
    created.clientes.push(cliente.id)
    return cliente
  }

  async function createProducto(marker, suffix, categoria) {
    const producto = await app.prisma.producto.create({
      data: {
        codigoInterno: `${marker}-${suffix}`,
        nombre: `${marker} ${suffix}`,
        categoria,
        activo: true,
        stock: 50,
        estadoInventario: 'Inventariado',
      },
    })
    created.productos.push(producto.id)
    return producto
  }

  async function createRule(marker, overrides = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/descuentos/reglas',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        nombre: `${marker} regla`,
        tiposVenta: ['Normal'],
        categoriaNombres: ['Sillas'],
        porcentajeSugerido: 10,
        porcentajeAutoaprobado: 10,
        porcentajeMaximo: 10,
        requiereAprobacion: false,
        prioridad: 500,
        ...overrides,
      },
    })
    expect(res.statusCode).toBe(201)
    const regla = JSON.parse(res.body)
    created.reglas.push(regla.id)
    return regla
  }

  it('autoriza una regla 10% sillas y descuenta solo la base elegible', async () => {
    const marker = `TEST-DESC-RULE-${Date.now()}`
    const cliente = await createCliente(marker)
    const silla = await createProducto(marker, 'SILLA', 'Sillas')
    const mesa = await createProducto(marker, 'MESA', 'Mesas')
    const regla = await createRule(marker)
    const items = [
      { productoId: silla.id, codigoInterno: silla.codigoInterno, nombre: silla.nombre, cantidad: 2, precioUnitario: 5000 },
      { productoId: mesa.id, codigoInterno: mesa.codigoInterno, nombre: mesa.nombre, cantidad: 1, precioUnitario: 5000 },
    ]

    const evaluacionRes = await app.inject({
      method: 'POST',
      url: '/api/descuentos/evaluar',
      headers: { authorization: `Bearer ${vendedorToken}` },
      payload: { tipo: 'Normal', clienteId: cliente.id, items },
    })
    expect(evaluacionRes.statusCode).toBe(200)
    const evaluacion = JSON.parse(evaluacionRes.body)
    expect(evaluacion.selected.reglaId).toBe(regla.id)
    expect(evaluacion.selected.estado).toBe('AUTORIZADA')
    expect(evaluacion.selected.baseElegible).toBe(10000)
    expect(evaluacion.selected.montoDescuento).toBe(1000)
    expect(evaluacion.selected.totalAntes).toBe(15000)
    expect(evaluacion.selected.totalDespues).toBe(14000)
    expect(evaluacion.selected.itemsElegibles).toHaveLength(1)
    expect(evaluacion.selected.itemsElegibles[0].codigoInterno).toBe(silla.codigoInterno)

    const mesaOnlyRes = await app.inject({
      method: 'POST',
      url: '/api/descuentos/evaluar',
      headers: { authorization: `Bearer ${vendedorToken}` },
      payload: {
        tipo: 'Normal',
        clienteId: cliente.id,
        items: [{ productoId: mesa.id, codigoInterno: mesa.codigoInterno, nombre: mesa.nombre, cantidad: 1, precioUnitario: 5000 }],
      },
    })
    expect(mesaOnlyRes.statusCode).toBe(200)
    expect(JSON.parse(mesaOnlyRes.body).reglas.some(r => r.reglaId === regla.id)).toBe(false)

    const solicitudRes = await app.inject({
      method: 'POST',
      url: '/api/descuentos/solicitudes',
      headers: { authorization: `Bearer ${vendedorToken}` },
      payload: { tipo: 'Normal', clienteId: cliente.id, reglaId: regla.id, descuentoPct: 10, items },
    })
    expect(solicitudRes.statusCode).toBe(201)
    const solicitud = JSON.parse(solicitudRes.body).solicitud
    created.solicitudes.push(solicitud.id)
    expect(solicitud.estado).toBe('AUTORIZADA')

    const changedDraft = await app.inject({
      method: 'POST',
      url: '/api/ventas',
      headers: { authorization: `Bearer ${vendedorToken}` },
      payload: {
        tipo: 'Normal',
        clienteId: cliente.id,
        descuentoAutorizacionId: solicitud.id,
        items: [
          { productoId: silla.id, cantidad: 3, precioUnitario: 5000 },
          { productoId: mesa.id, cantidad: 1, precioUnitario: 5000 },
        ],
      },
    })
    expect(changedDraft.statusCode).toBe(409)
    expect(JSON.parse(changedDraft.body).error).toMatch(/cambio/)

    const ventaRes = await app.inject({
      method: 'POST',
      url: '/api/ventas',
      headers: { authorization: `Bearer ${vendedorToken}` },
      payload: {
        tipo: 'Normal',
        clienteId: cliente.id,
        descuentoAutorizacionId: solicitud.id,
        items: items.map(({ productoId, cantidad, precioUnitario }) => ({ productoId, cantidad, precioUnitario })),
      },
    })
    expect(ventaRes.statusCode).toBe(201)
    const venta = JSON.parse(ventaRes.body)
    created.ordenes.push(venta.id)
    expect(venta.total).toBe(14000)
    expect(venta.descuentoMonto).toBe(1000)
    expect(venta.descuentoSnapshot.baseElegible).toBe(10000)

    const applied = await app.prisma.descuentoSolicitud.findUnique({ where: { id: solicitud.id } })
    expect(applied.estado).toBe('APLICADA')
  })

  it('deja pendiente sobre autoaprobado y permite aplicar tras aprobacion admin', async () => {
    const marker = `TEST-DESC-PENDING-${Date.now()}`
    const cliente = await createCliente(marker)
    const silla = await createProducto(marker, 'SILLA', 'Sillas')
    const regla = await createRule(marker, {
      porcentajeSugerido: 15,
      porcentajeAutoaprobado: 10,
      porcentajeMaximo: 20,
      requiereAprobacion: true,
    })
    const items = [{ productoId: silla.id, codigoInterno: silla.codigoInterno, nombre: silla.nombre, cantidad: 2, precioUnitario: 10000 }]

    const pendingRes = await app.inject({
      method: 'POST',
      url: '/api/descuentos/solicitudes',
      headers: { authorization: `Bearer ${vendedorToken}` },
      payload: { tipo: 'Normal', clienteId: cliente.id, reglaId: regla.id, descuentoPct: 15, items },
    })
    expect(pendingRes.statusCode).toBe(201)
    const pending = JSON.parse(pendingRes.body).solicitud
    created.solicitudes.push(pending.id)
    expect(pending.estado).toBe('PENDIENTE')

    const rejectedEval = await app.inject({
      method: 'POST',
      url: '/api/descuentos/evaluar',
      headers: { authorization: `Bearer ${vendedorToken}` },
      payload: { tipo: 'Normal', clienteId: cliente.id, reglaId: regla.id, descuentoPct: 25, items },
    })
    expect(rejectedEval.statusCode).toBe(200)
    expect(JSON.parse(rejectedEval.body).selected.estado).toBe('RECHAZADA')

    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/descuentos/solicitudes/${pending.id}/aprobar`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { motivo: 'Aprobado test' },
    })
    expect(approveRes.statusCode).toBe(200)
    expect(JSON.parse(approveRes.body).descuentoPctAprobado).toBe(15)

    const ventaRes = await app.inject({
      method: 'POST',
      url: '/api/ventas',
      headers: { authorization: `Bearer ${vendedorToken}` },
      payload: {
        tipo: 'Normal',
        clienteId: cliente.id,
        descuentoAutorizacionId: pending.id,
        items: [{ productoId: silla.id, cantidad: 2, precioUnitario: 10000 }],
      },
    })
    expect(ventaRes.statusCode).toBe(201)
    const venta = JSON.parse(ventaRes.body)
    created.ordenes.push(venta.id)
    expect(venta.total).toBe(17000)
    expect(venta.descuentoSnapshot.estado).toBe('AUTORIZADA')
  })

  it('copia la autorizacion de descuento desde cotizacion adjudicada a venta', async () => {
    const marker = `TEST-DESC-COT-${Date.now()}`
    const cliente = await createCliente(marker)
    const silla = await createProducto(marker, 'SILLA', 'Sillas')
    const regla = await createRule(marker, { tiposVenta: ['Licitacion'] })
    const cot = await app.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion: marker,
        rutCliente: cliente.rut,
        estado: 'Adjudicada',
        plazo: '10 dias',
        ordenCompra: `${marker}-OC`,
        items: {
          create: [{ codigoInterno: silla.codigoInterno, nombre: silla.nombre, cantidad: 2, cantAdjudicados: 2, precio: 10000 }],
        },
      },
    })
    created.cotizaciones.push(cot.id)

    const solicitudRes = await app.inject({
      method: 'POST',
      url: `/api/cotizaciones/${cot.id}/descuento/solicitar`,
      headers: { authorization: `Bearer ${vendedorToken}` },
      payload: { reglaId: regla.id, descuentoPct: 10 },
    })
    expect(solicitudRes.statusCode).toBe(201)
    const solicitud = JSON.parse(solicitudRes.body).solicitud
    created.solicitudes.push(solicitud.id)
    expect(solicitud.estado).toBe('AUTORIZADA')

    const cotConDescuento = await app.prisma.cotizacionLicitacion.findUnique({ where: { id: cot.id } })
    expect(cotConDescuento.descuentoSolicitudId).toBe(solicitud.id)
    expect(cotConDescuento.descuentoMonto).toBe(2380)

    const ventaRes = await app.inject({
      method: 'POST',
      url: `/api/cotizaciones/${cot.id}/crear-venta`,
      headers: { authorization: `Bearer ${vendedorToken}` },
    })
    expect(ventaRes.statusCode).toBe(201)
    const venta = JSON.parse(ventaRes.body).orden
    created.ordenes.push(venta.id)
    expect(venta.descuentoSolicitudId).toBe(solicitud.id)
    expect(venta.descuentoMonto).toBe(2380)
    expect(venta.descuentoSnapshot.baseElegible).toBe(23800)
  })
})
