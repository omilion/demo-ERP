import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

function tokenFor(app, role = 'admin') {
  return app.jwt.sign({
    id: 1, role, nombre: `QA ${role}`, permisosExtra: null,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })
}

function testCode(prefix = 'TEST') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

describe('Módulo de Sugerencias de OC y Órdenes de Compra a Proveedores', () => {
  let app, token, prisma, testProveedor, testProducto, testCliente, testOrden

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = tokenFor(app)
    prisma = app.prisma

    // Crear proveedor
    testProveedor = await prisma.proveedor.create({
      data: {
        nombre: 'Proveedor Recurrente Test ' + Date.now(),
        rut: '77' + Math.floor(1000000 + Math.random() * 9000000) + '-2',
        pagoFactura: '30 días',
      },
    })

    // Crear producto con stock bajo
    testProducto = await prisma.producto.create({
      data: {
        codigoInterno: testCode('PROV-PROD'),
        nombre: 'Producto Reposición Test',
        stock: 2,
        stockCritico: 10,
        precioLista: 20000,
        proveedorId: testProveedor.id,
      },
    })

    // Relacionar en ProductoProveedor
    await prisma.productoProveedor.create({
      data: {
        productoId: testProducto.id,
        proveedorId: testProveedor.id,
        costo: 12000,
        cantidad: 2,
        activo: true,
      },
    })

    // Crear cliente y orden de venta con fecha reciente para generar ritmo de venta
    testCliente = await prisma.cliente.create({
      data: {
        nombre: 'Cliente Test OC',
        rut: '12' + Math.floor(1000000 + Math.random() * 9000000) + '-3',
      },
    })

    testOrden = await prisma.orden.create({
      data: {
        nInterno: 999900 + Math.floor(Math.random() * 999),
        clienteId: testCliente.id,
        rutCliente: testCliente.rut,
        tipo: 'Venta directa',
        userId: 1,
        createdAt: new Date(),
        estado: 'Entregada',
        items: {
          create: [
            {
              productoId: testProducto.id,
              codigoInterno: testProducto.codigoInterno,
              nombre: testProducto.nombre,
              cantidad: 30, // 30 unidades vendidas
              precioUnitario: 20000,
            },
          ],
        },
      },
    })
  })

  afterAll(async () => {
    if (testOrden) {
      await prisma.ordenItem.deleteMany({ where: { ordenId: testOrden.id } })
      await prisma.orden.delete({ where: { id: testOrden.id } }).catch(() => {})
    }
    if (testCliente) {
      await prisma.cliente.delete({ where: { id: testCliente.id } }).catch(() => {})
    }
    if (testProducto) {
      await prisma.movimientoBodega.deleteMany({ where: { productoId: testProducto.id } })
      await prisma.ordenCompraProveedorItem.deleteMany({ where: { productoId: testProducto.id } })
      await prisma.productoProveedor.deleteMany({ where: { productoId: testProducto.id } })
      await prisma.producto.delete({ where: { id: testProducto.id } }).catch(() => {})
    }
    if (testProveedor) {
      await prisma.ordenCompraProveedor.deleteMany({ where: { proveedorId: testProveedor.id } })
      await prisma.proveedor.delete({ where: { id: testProveedor.id } }).catch(() => {})
    }
    await app.close()
  })

  it('calcula sugerencia de compra cruzando ventas del período vs stock actual', async () => {
    const hoy = new Date()
    const hace15Dias = new Date(hoy.getTime() - 15 * 24 * 60 * 60 * 1000)

    const resSug = await app.inject({
      method: 'GET',
      url: `/api/ordenes-compra-proveedores/sugerencias?proveedorId=${testProveedor.id}&desde=${hace15Dias.toISOString().slice(0, 10)}&hasta=${hoy.toISOString().slice(0, 10)}&diasProyeccion=30`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(resSug.statusCode).toBe(200)
    const sugData = JSON.parse(resSug.body)
    expect(sugData.items.length).toBeGreaterThanOrEqual(1)

    const item = sugData.items.find(i => i.productoId === testProducto.id)
    expect(item).toBeDefined()
    expect(item.ventasPeriodo).toBe(30)
    expect(item.stockActual).toBe(2)
    expect(item.stockCritico).toBe(10)
    expect(item.cantidadSugerida).toBeGreaterThan(0)
    expect(item.costoUnitario).toBe(12000)
  })

  it('crea borrador de OC, ejecuta flujo de aprobación gerencial y recepción en bodega', async () => {
    // 1. Crear Orden de Compra en borrador
    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/ordenes-compra-proveedores',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        proveedorId: testProveedor.id,
        proveedorNombre: testProveedor.nombre,
        proveedorRut: testProveedor.rut,
        fechaRequerida: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        condicionPago: '30 días',
        observaciones: 'OC generada desde sugerencia automática de ventas',
        items: [
          {
            productoId: testProducto.id,
            codigoInterno: testProducto.codigoInterno,
            nombre: testProducto.nombre,
            cantidadPedida: 40,
            costoUnitario: 12000,
            ventasPeriodo: 30,
            stockActual: 2,
            stockCritico: 10,
          },
        ],
      },
    })

    expect(resCreate.statusCode).toBe(201)
    const oc = JSON.parse(resCreate.body)
    expect(oc.id).toBeDefined()
    expect(oc.numeroOc).toMatch(/^OCP-\d{4}-\d{4}$/)
    expect(oc.estado).toBe('Borrador')
    expect(oc.subtotalNeto).toBe(40 * 12000)
    expect(oc.total).toBe(Math.round(40 * 12000 * 1.19))

    // 2. Aprobación por Gerencia
    const resAprobar = await app.inject({
      method: 'POST',
      url: `/api/ordenes-compra-proveedores/${oc.id}/aprobar`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(resAprobar.statusCode).toBe(200)
    const aprobada = JSON.parse(resAprobar.body)
    expect(aprobada.data.estado).toBe('Aprobada por Gerencia')
    expect(aprobada.data.fechaAprobacion).toBeDefined()

    // 3. Enviar a proveedor
    const resEnviar = await app.inject({
      method: 'POST',
      url: `/api/ordenes-compra-proveedores/${oc.id}/enviar`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(resEnviar.statusCode).toBe(200)
    expect(JSON.parse(resEnviar.body).data.estado).toBe('Enviada a Proveedor')

    // 4. Recepción en Bodega
    const stockAntes = (await prisma.producto.findUnique({ where: { id: testProducto.id } })).stock

    const resRec = await app.inject({
      method: 'POST',
      url: `/api/ordenes-compra-proveedores/${oc.id}/recepcionar`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })

    expect(resRec.statusCode).toBe(200)
    const recBody = JSON.parse(resRec.body)
    expect(recBody.data.estado).toBe('Completada')

    // Verificar que el stock físico en BD aumentó en 40 unidades
    const prodFinal = await prisma.producto.findUnique({ where: { id: testProducto.id } })
    expect(prodFinal.stock).toBe(stockAntes + 40)

    // Verificar movimiento de bodega
    const mov = await prisma.movimientoBodega.findFirst({
      where: {
        productoId: testProducto.id,
        origenTipo: 'orden_compra_proveedor',
        origenId: oc.id,
      },
    })
    expect(mov).toBeDefined()
    expect(mov.tipo).toBe('ingreso')
    expect(mov.cantidad).toBe(40)
    expect(mov.stockAnterior).toBe(stockAntes)
    expect(mov.stockPosterior).toBe(stockAntes + 40)

    const tiempos = await app.inject({
      method: 'GET',
      url: '/api/ordenes-compra-proveedores/metricas/tiempos',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(tiempos.statusCode).toBe(200)
    expect(JSON.parse(tiempos.body).ocARecepcion.muestras).toBeGreaterThanOrEqual(1)
  })
})
