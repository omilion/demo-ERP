// El total de ventas gerencial no cuenta dos veces el mismo negocio.
//
// Sale de la auditoria de Gerencia. El reporte suma tres fuentes -ordenes, pedidos web
// y licitaciones- sin mirar si se solapan. Una licitacion adjudicada se convierte en
// orden de venta y conserva el vinculo en `ordenId`, asi que ese negocio aparecia dos
// veces. En produccion son 2.390 licitaciones apuntando a 2.375 ordenes: el total
// mostrado no era ingreso.
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

describeDb('ventas gerenciales: un negocio se cuenta una vez', () => {
  let app, userId, cliente, producto
  const creado = { ordenes: [], licitaciones: [] }

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    userId = (await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })).id
    cliente = await app.prisma.cliente.findFirst({ where: { activo: true } })
    producto = await app.prisma.producto.findFirst({ where: { activo: true }, select: { id: true, codigoInterno: true } })
  })

  afterAll(async () => {
    for (const id of creado.licitaciones) {
      await app.prisma.cotizacionLicitacionItem.deleteMany({ where: { cotizacionId: id } }).catch(() => {})
      await app.prisma.cotizacionLicitacion.delete({ where: { id } }).catch(() => {})
    }
    for (const id of creado.ordenes) {
      await app.prisma.ordenEstadoFlujoHistorial.deleteMany({ where: { ordenId: id } }).catch(() => {})
      await app.prisma.ordenItem.deleteMany({ where: { ordenId: id } }).catch(() => {})
      await app.prisma.orden.delete({ where: { id } }).catch(() => {})
    }
    await app.close()
  })

  const token = () => app.jwt.sign({
    id: userId, role: 'admin', nombre: 'gerencia', permisosExtra: null,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })

  // Un negocio adjudicado: la orden de venta y la licitacion que la origino.
  //
  // La orden se crea por la API y no por Prisma: el reporte usa el ambito
  // "operacional", que exige nInterno, y ese numero lo asigna la ruta de venta. Una
  // orden insertada a mano queda invisible para el reporte.
  async function negocioAdjudicado(monto) {
    const marca = `DEDUP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const res = await app.inject({
      method: 'POST', url: '/api/ventas',
      headers: { authorization: `Bearer ${token()}` },
      payload: {
        tipo: 'Normal', clienteId: cliente.id, observaciones: marca,
        items: [{ productoId: producto.id, cantidad: 1, precioUnitario: monto }],
        emailContactoDespacho: 'dedup@plastimar.cl',
      },
    })
    expect(res.statusCode).toBe(201)
    const cuerpo = JSON.parse(res.body)
    const orden = cuerpo?.data ?? cuerpo
    creado.ordenes.push(orden.id)
    const lic = await app.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion: marca, fecha: new Date(), estado: 'Adjudicada',
        rutCliente: cliente.rut, ordenId: orden.id,
        items: { create: [{ nombre: marca, cantidad: 1, precio: monto, cantAdjudicados: 1 }] },
      },
    })
    creado.licitaciones.push(lic.id)
    return { orden, lic, monto, marca }
  }

  const pedirReporte = async () => {
    // Rango amplio a proposito: el corte por dia se interpreta en hora local, asi que
    // una venta creada cerca de medianoche UTC cae fuera de su propio dia. Este caso
    // no verifica el filtro de fechas.
    const dia = ms => new Date(Date.now() + ms).toISOString().slice(0, 10)
    const res = await app.inject({
      method: 'GET',
      url: `/api/reportes/gerencial/ventas?desde=${dia(-2 * 86400000)}&hasta=${dia(2 * 86400000)}`,
      headers: { authorization: `Bearer ${token()}` },
    })
    expect(res.statusCode).toBe(200)
    return JSON.parse(res.body)
  }

  it('la licitacion que ya es orden no se suma otra vez', async () => {
    const antes = await pedirReporte()
    const negocio = await negocioAdjudicado(1000000)
    const despues = await pedirReporte()

    // El negocio entra una sola vez: la orden. La licitacion se descarta por estar
    // vinculada a esa misma orden.
    expect(despues.total - antes.total).toBe(negocio.monto)
    expect(despues.count - antes.count).toBe(1)
  })

  it('informa cuantas licitaciones descarto por duplicado', async () => {
    await negocioAdjudicado(500000)
    const reporte = await pedirReporte()
    // Se informa en vez de ocultarse: si el numero es alto, el vinculo esta sano.
    expect(reporte.fuentes.licitaciones.duplicadasConOrden).toBeGreaterThan(0)
  })

  it('conserva la licitacion cuya orden quedo fuera del filtro', async () => {
    // Lo que se evita es contar dos veces, no perder el negocio: si la orden no esta
    // en este resultado, la licitacion debe seguir apareciendo.
    const marca = `SOLA-${Date.now()}`
    const lic = await app.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion: marca, fecha: new Date(), estado: 'Adjudicada',
        rutCliente: cliente.rut, ordenId: null,
        items: { create: [{ nombre: marca, cantidad: 1, precio: 777000, cantAdjudicados: 1 }] },
      },
    })
    creado.licitaciones.push(lic.id)
    const reporte = await pedirReporte()
    expect(reporte.fuentes.licitaciones.count).toBeGreaterThan(0)
  })

  it('advierte cuando suma licitaciones sin adjudicar', async () => {
    const marca = `PEND-${Date.now()}`
    const lic = await app.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion: marca, fecha: new Date(), estado: 'Pendiente',
        rutCliente: cliente.rut,
        items: { create: [{ nombre: marca, cantidad: 1, precio: 300000, cantAdjudicados: 1 }] },
      },
    })
    creado.licitaciones.push(lic.id)
    const reporte = await pedirReporte()
    // No se excluyen: si una cotizacion pendiente cuenta como venta es definicion de
    // Finanzas. Pero tampoco se esconde, que era lo que pasaba.
    const aviso = reporte.advertencias?.find(a => a.tipo === 'licitaciones_no_adjudicadas_incluidas')
    expect(aviso).toBeTruthy()
    expect(aviso.cantidad).toBeGreaterThan(0)
  })
})
