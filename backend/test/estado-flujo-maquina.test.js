// La maquina de estados formal, enganchada al trabajo real.
//
// El motor -transiciones validadas, historial con autor, alertas- ya existia, pero
// nada lo movia: las 16.368 ordenes de produccion estaban en CREADA y el historial
// vacio. Solo lo invocaban el endpoint manual y los eventos de tracking, que casi
// ninguna venta genera. Esto cubre que el estado sea consecuencia del trabajo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { avanzarEstadoFlujo, cerrarSiCorresponde } from '../src/routes/ventas/estado-flujo-formal.js'
import { TRANSICIONES_ESTADO_FLUJO_FORMAL } from '../src/routes/ventas/estados-normalize.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function hasUsableDatabaseUrl() {
  try {
    const url = new URL(process.env.DATABASE_URL || '')
    return Boolean(url.hostname && url.username && url.password)
  } catch { return false }
}
const describeDb = hasUsableDatabaseUrl() ? describe : describe.skip

describeDb('la maquina de estados sigue al trabajo real', () => {
  let app, user, cliente, producto

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    user = await app.prisma.user.findFirst({ where: { activo: true } })
    cliente = await app.prisma.cliente.findFirst({ where: { activo: true } })
    // La prueba cubre la máquina de estados, no la salida sin stock. Con la
    // copia actual de producción el primer producto activo puede estar agotado,
    // lo que legítimamente rechaza la venta antes de llegar al flujo.
    producto = await app.prisma.producto.findFirst({ where: { activo: true, stock: { gte: 1 } } })
    if (!producto) throw new Error('Se requiere un producto activo con stock para probar el flujo de venta')
  })
  afterAll(async () => { await app.close() })

  const token = (role, extra = null) => app.jwt.sign({
    id: user.id, role, nombre: 'maquina', permisosExtra: extra,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })

  async function nuevaVenta() {
    const res = await app.inject({
      method: 'POST', url: '/api/ventas',
      headers: { authorization: `Bearer ${token('vendedor', { ventas: ['read', 'write'] })}` },
      payload: {
        tipo: 'Normal', clienteId: cliente.id,
        items: [{ productoId: producto.id, cantidad: 1, precioUnitario: 5000 }],
        emailContactoDespacho: 'maquina@plastimar.cl',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    return body?.data ?? body
  }

  const estadoDe = async id => (await app.prisma.orden.findUnique({
    where: { id }, select: { estadoFlujoFormal: true },
  }))?.estadoFlujoFormal

  it('la venta nace en CREADA', async () => {
    const orden = await nuevaVenta()
    expect(await estadoDe(orden.id)).toBe('CREADA')
  })

  it('marcar la entrega la lleva hasta ENTREGADA y deja el rastro de como llego', async () => {
    const orden = await nuevaVenta()
    const item = await app.prisma.ordenItem.findFirst({ where: { ordenId: orden.id } })
    const res = await app.inject({
      method: 'PUT', url: `/api/ventas/items/${item.id}/entregados`,
      headers: { authorization: `Bearer ${token('bodeguero', { 'ventas.entregas': ['write'] })}` },
      payload: { nEntregados: item.cantidad },
    })
    expect(res.statusCode).toBe(200)
    expect(await estadoDe(orden.id)).toBe('ENTREGADA')

    // Una venta de mostrador llega entregada sin que nadie anote la preparacion. Se
    // pasa por PREPARACION porque es cierto -se preparo, no se anoto-, pero NO se
    // inventan patio ni reparto, que serian historia falsa.
    const historial = await app.prisma.ordenEstadoFlujoHistorial.findMany({
      where: { ordenId: orden.id }, orderBy: { id: 'asc' },
    })
    expect(historial.map(h => h.estadoNuevo)).toEqual(['PREPARACION', 'ENTREGADA'])
    expect(historial.every(h => h.usuarioId === user.id)).toBe(true)
  })

  it('cierra sola cuando se juntan pagada y entregada', async () => {
    const orden = await nuevaVenta()
    const item = await app.prisma.ordenItem.findFirst({ where: { ordenId: orden.id } })
    await app.inject({
      method: 'PUT', url: `/api/ventas/items/${item.id}/entregados`,
      headers: { authorization: `Bearer ${token('bodeguero', { 'ventas.entregas': ['write'] })}` },
      payload: { nEntregados: item.cantidad },
    })
    await app.prisma.orden.update({ where: { id: orden.id }, data: { estadoPago: 'Pagada' } })
    await cerrarSiCorresponde(app.prisma, orden.id, user)
    expect(await estadoDe(orden.id)).toBe('CERRADA')
  })

  it('no cierra una venta entregada que aun no esta pagada', async () => {
    const orden = await nuevaVenta()
    await avanzarEstadoFlujo(app.prisma, orden.id, 'ENTREGADA', user, 'test')
    await cerrarSiCorresponde(app.prisma, orden.id, user)
    expect(await estadoDe(orden.id)).toBe('ENTREGADA')
  })

  it('avanzar nunca revienta la operacion cuando la transicion no aplica', async () => {
    const orden = await nuevaVenta()
    await avanzarEstadoFlujo(app.prisma, orden.id, 'ENTREGADA', user, 'test')
    // Marcar una entrega no puede fallar porque el estado formal no calce: si la
    // transicion no aplica se ignora en silencio.
    await expect(avanzarEstadoFlujo(app.prisma, orden.id, 'PATIO', user, 'test')).resolves.not.toThrow()
    expect(await estadoDe(orden.id)).toBe('ENTREGADA')
  })

  it('permite el salto directo de preparacion a entrega, que es como opera la mayoria', () => {
    // De 16.368 ventas solo 27 tienen despacho: Venta Sala, Web y Convenio Marco no
    // pasan por patio ni reparto. Sin este salto quedarian todas atascadas.
    expect(TRANSICIONES_ESTADO_FLUJO_FORMAL.PREPARACION).toContain('ENTREGADA')
    expect(TRANSICIONES_ESTADO_FLUJO_FORMAL.PREPARACION).toContain('PATIO')
  })

  it('el recorrido completo por la API deja la venta cerrada', async () => {
    const orden = await nuevaVenta()
    const item = await app.prisma.ordenItem.findFirst({ where: { ordenId: orden.id } })
    await app.inject({
      method: 'PUT',
      url: `/api/ventas/items/${item.id}/entregados`,
      headers: { authorization: `Bearer ${token('bodeguero', { 'ventas.entregas': ['write'] })}` },
      payload: { nEntregados: item.cantidad },
    })

    const tCaja = token('cajero', { caja: ['read', 'write'], cobranza: ['read', 'write'] })
    await app.inject({
      method: 'POST',
      url: '/api/caja/turno',
      headers: { authorization: `Bearer ${tCaja}` },
      payload: { montoInicial: 0 },
    })
    const nDoc = String(Date.now()).slice(-7)
    const doc = await app.inject({
      method: 'POST',
      url: `/api/caja/cobranza/orden/${orden.id}/documento`,
      headers: { authorization: `Bearer ${tCaja}` },
      payload: { monto: 5000, documento: 'Boleta', nDoc },
    })
    expect(doc.statusCode).toBe(201)

    // Donde se registra la plata es la caja del turno, pero a que venta pertenece un
    // documento no depende de en que caja este sentado el cajero. Al buscarlos con la
    // sucursal del turno, el cajero recibia un 404 por la boleta que acababa de emitir
    // para esa misma venta, y la venta no podia cerrarse nunca.
    const pago = await app.inject({
      method: 'POST',
      url: `/api/caja/cobranza/orden/${orden.id}/pago`,
      headers: { authorization: `Bearer ${tCaja}` },
      payload: { monto: 5000, medioPago: 'Efectivo', documento: 'Boleta', nDoc },
    })
    expect(pago.statusCode).toBe(201)
    expect(await estadoDe(orden.id)).toBe('CERRADA')
  })
})
