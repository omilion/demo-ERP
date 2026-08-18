import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

async function loginAs(app, role = 'admin') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: `${role}@plastimar.cl`, password: 'dev1234' },
  })
  return JSON.parse(res.body).accessToken
}

function testCode(prefix = 'TEST') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

describe('Módulo de Importaciones', () => {
  let app, token, prisma, testProducto, testProveedor

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = await loginAs(app)
    prisma = app.prisma

    // Crear proveedor y producto para pruebas
    testProveedor = await prisma.proveedor.create({
      data: {
        nombre: 'Proveedor China Import ' + Date.now(),
        rut: '99' + Math.floor(1000000 + Math.random() * 9000000) + '-1',
      },
    })

    testProducto = await prisma.producto.create({
      data: {
        codigoInterno: testCode('IMP-PROD'),
        nombre: 'Producto Importado Test',
        stock: 10,
        stockCritico: 5,
        precioLista: 15000,
        proveedorId: testProveedor.id,
      },
    })
  })

  afterAll(async () => {
    if (testProducto) {
      await prisma.movimientoBodega.deleteMany({ where: { productoId: testProducto.id } })
      await prisma.importacionItem.deleteMany({ where: { productoId: testProducto.id } })
      await prisma.productoProveedor.deleteMany({ where: { productoId: testProducto.id } })
      await prisma.producto.delete({ where: { id: testProducto.id } }).catch(() => {})
    }
    if (testProveedor) {
      await prisma.importacion.deleteMany({ where: { proveedorId: testProveedor.id } })
      await prisma.proveedor.delete({ where: { id: testProveedor.id } }).catch(() => {})
    }
    await app.close()
  })

  it('crea, lista y consulta detalle de una importación en tránsito', async () => {
    const contenedorNum = 'MSKU-' + Math.floor(100000 + Math.random() * 900000)
    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/importaciones',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        numeroContenedor: contenedorNum,
        tipoTransporte: 'Marítimo',
        proveedorId: testProveedor.id,
        proveedorNombre: testProveedor.nombre,
        origen: 'Ningbo, China',
        puertoDestino: 'San Antonio',
        navieraAgencia: 'Maersk',
        fechaEmbarque: new Date().toISOString(),
        fechaEta: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        costoFlete: 2500,
        costoSeguro: 300,
        costoAduana: 500,
        items: [
          {
            productoId: testProducto.id,
            codigoInterno: testProducto.codigoInterno,
            nombre: testProducto.nombre,
            cantidadEsperada: 50,
            costoUnitario: 8000,
          },
        ],
      },
    })

    expect(resCreate.statusCode).toBe(201)
    const created = JSON.parse(resCreate.body)
    expect(created.id).toBeDefined()
    expect(created.numeroContenedor).toBe(contenedorNum)
    expect(created.estado).toBe('En tránsito')
    expect(created.items.length).toBe(1)
    expect(created.totalCif).toBe(50 * 8000 + 2500 + 300 + 500)

    // Listar importaciones y verificar KPIs
    const resList = await app.inject({
      method: 'GET',
      url: '/api/importaciones?search=' + contenedorNum,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(resList.statusCode).toBe(200)
    const listData = JSON.parse(resList.body)
    expect(listData.items.some(i => i.id === created.id)).toBe(true)
    expect(listData.kpis.contenedoresActivos).toBeGreaterThanOrEqual(1)

    // Consultar resumen de tránsito
    const resResumen = await app.inject({
      method: 'GET',
      url: '/api/importaciones/resumen-transito',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(resResumen.statusCode).toBe(200)
    const resumenData = JSON.parse(resResumen.body)
    const prodResumen = resumenData.items.find(i => i.productoId === testProducto.id)
    expect(prodResumen).toBeDefined()
    expect(prodResumen.totalEnTransito).toBe(50)

    // Ejecutar acción SUMAR AL STOCK
    const stockPrevio = (await prisma.producto.findUnique({ where: { id: testProducto.id } })).stock
    expect(stockPrevio).toBe(10)

    const resSumar = await app.inject({
      method: 'POST',
      url: `/api/importaciones/${created.id}/sumar-stock`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })

    expect(resSumar.statusCode).toBe(200)
    const sumarBody = JSON.parse(resSumar.body)
    expect(sumarBody.ok).toBe(true)
    expect(sumarBody.data.importacion.estado).toBe('Recepcionado')

    // Verificar que el stock físico en la BD aumentó en 50 unidades
    const prodUpdated = await prisma.producto.findUnique({ where: { id: testProducto.id } })
    expect(prodUpdated.stock).toBe(60)

    // Verificar que se creó el registro de auditoría en MovimientoBodega
    const mov = await prisma.movimientoBodega.findFirst({
      where: {
        productoId: testProducto.id,
        origenTipo: 'importacion',
        origenId: created.id,
      },
    })
    expect(mov).toBeDefined()
    expect(mov.tipo).toBe('INGRESO')
    expect(mov.cantidad).toBe(50)

    // Bloquear segundo intento de sumar al stock
    const resReintento = await app.inject({
      method: 'POST',
      url: `/api/importaciones/${created.id}/sumar-stock`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })
    expect(resReintento.statusCode).toBe(400)
  })

  it('auto-crea el producto en catálogo si el ítem de importación no matchea ninguno existente', async () => {
    const contenedorNum = 'MSKU-' + Math.floor(100000 + Math.random() * 900000)
    const codigoNuevo = testCode('AUTO-NEW')

    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/importaciones',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        numeroContenedor: contenedorNum,
        tipoTransporte: 'Marítimo',
        proveedorId: testProveedor.id,
        proveedorNombre: testProveedor.nombre,
        origen: 'Ningbo, China',
        puertoDestino: 'San Antonio',
        navieraAgencia: 'Maersk',
        fechaEmbarque: new Date().toISOString(),
        fechaEta: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        items: [
          {
            // Sin productoId: código interno que NO existe todavía en el catálogo
            codigoInterno: codigoNuevo,
            nombre: 'Producto Nuevo Nunca Antes Creado',
            cantidadEsperada: 25,
            costoUnitario: 4000,
          },
        ],
      },
    })
    expect(resCreate.statusCode).toBe(201)
    const created = JSON.parse(resCreate.body)

    const resSumar = await app.inject({
      method: 'POST',
      url: `/api/importaciones/${created.id}/sumar-stock`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })
    expect(resSumar.statusCode).toBe(200)
    const sumarBody = JSON.parse(resSumar.body)
    expect(sumarBody.data.itemsIngresados[0].productoCreado).toBe(true)

    const nuevoProducto = await prisma.producto.findUnique({ where: { codigoInterno: codigoNuevo } })
    expect(nuevoProducto).toBeDefined()
    expect(nuevoProducto.stock).toBe(25)
    expect(nuevoProducto.nombre).toBe('Producto Nuevo Nunca Antes Creado')
    expect(nuevoProducto.precioLista).toBe(4000)

    // El ítem de importación queda enlazado al producto recién creado
    const itemActualizado = await prisma.importacionItem.findFirst({ where: { importacionId: created.id } })
    expect(itemActualizado.productoId).toBe(nuevoProducto.id)

    // Limpieza
    await prisma.movimientoBodega.deleteMany({ where: { productoId: nuevoProducto.id } })
    await prisma.productoProveedor.deleteMany({ where: { productoId: nuevoProducto.id } })
    await prisma.importacionItem.deleteMany({ where: { productoId: nuevoProducto.id } })
    await prisma.importacion.delete({ where: { id: created.id } }).catch(() => {})
    await prisma.producto.delete({ where: { id: nuevoProducto.id } })
  })
})
