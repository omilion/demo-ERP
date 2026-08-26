// Ciclo completo de las reglas de descuento, con cuatro casos que reflejan
// situaciones reales de Plastimar. De cada uno se verifica lo mismo:
//
//   crear    - la regla se guarda por el API y queda persistida
//   evaluar  - el motor la reconoce sobre un borrador de venta
//   aplicar  - la venta se guarda con el descuento, o se rechaza si no corresponde
//   registrar- queda rastro de por que se aplico (solicitud, snapshot, monto)
//
// Los cuatro casos son:
//   1. Por tipo de venta      - solo Venta Sala, hasta 10%
//   2. Por volumen            - exige un monto minimo antes de habilitarse
//   3. Con aprobacion         - sobre el auto-aprobado exige autorizacion
//   4. Por producto           - la base elegible es solo parte de la venta
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
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

const describeDb = hasUsableDatabaseUrl() ? describe : describe.skip

describeDb('Reglas de descuento: crear, evaluar, aplicar y registrar', () => {
  let app
  let adminToken
  let clienteId
  let userId
  const marca = `DCTO-${Date.now()}`
  const creado = { reglas: [], ordenes: [], productos: [], solicitudes: [] }
  const auth = () => ({ authorization: `Bearer ${adminToken}` })

  // Producto A es el "caro" y el que se usa para casos por producto.
  let productoA
  let productoB

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()

    const user = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true, nombre: true } })
    userId = user.id
    adminToken = app.jwt.sign({
      id: user.id, role: 'admin', nombre: user.nombre || 'Admin', permisosExtra: null,
      permisoDescuentos: true, scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })

    const cliente = await app.prisma.cliente.create({ data: { rut: `${marca}-9`, nombre: `${marca} Cliente`, activo: true } })
    clienteId = cliente.id

    productoA = await app.prisma.producto.create({ data: { codigoInterno: `${marca}-A`, nombre: `${marca} Producto A`, activo: true } })
    productoB = await app.prisma.producto.create({ data: { codigoInterno: `${marca}-B`, nombre: `${marca} Producto B`, activo: true } })
    creado.productos.push(productoA.id, productoB.id)
  })

  afterAll(async () => {
    for (const id of creado.ordenes) {
      await app.prisma.ordenItem.deleteMany({ where: { ordenId: id } }).catch(() => {})
      await app.prisma.orden.delete({ where: { id } }).catch(() => {})
    }
    for (const id of creado.solicitudes) await app.prisma.descuentoSolicitud.delete({ where: { id } }).catch(() => {})
    for (const id of creado.reglas) await app.prisma.descuentoRegla.delete({ where: { id } }).catch(() => {})
    await app.prisma.producto.deleteMany({ where: { id: { in: creado.productos } } }).catch(() => {})
    await app.prisma.cliente.delete({ where: { id: clienteId } }).catch(() => {})
    await app.close()
  })

  // ── helpers ────────────────────────────────────────────────────────────────

  async function crearRegla(body) {
    await soloEstaRegla()
    const res = await app.inject({ method: 'POST', url: '/api/descuentos/reglas', headers: auth(), payload: body })
    expect(res.statusCode, `crear regla: ${res.body}`).toBe(201)
    const regla = res.json()
    creado.reglas.push(regla.id)
    return regla
  }

  async function desactivarRegla(id) {
    await app.prisma.descuentoRegla.update({ where: { id }, data: { activo: false } })
  }

  // Cada caso monta su propia regla. Sin esto, la regla de un caso sigue
  // activa en el siguiente y lo hace pasar (o fallar) por el motivo equivocado.
  async function soloEstaRegla() {
    await app.prisma.descuentoRegla.updateMany({ where: { activo: true }, data: { activo: false } })
  }

  function borrador({ tipo = 'Venta Sala', items }) {
    // El hash del borrador incluye el codigo interno de cada item: la venta lo
    // resuelve desde el producto, asi que aca se manda igual para que ambos
    // lados calcen. Es lo que hace la pantalla real.
    const conCodigo = items.map(i => ({
      ...i,
      codigoInterno: i.productoId === productoA.id ? productoA.codigoInterno : productoB.codigoInterno,
    }))
    return { origen: 'venta', tipo, clienteId, items: conCodigo }
  }

  async function evaluar(payload) {
    const res = await app.inject({ method: 'POST', url: '/api/descuentos/evaluar', headers: auth(), payload })
    expect(res.statusCode).toBe(200)
    return res.json()
  }

  async function crearVenta({ tipo = 'Venta Sala', items, descuentoPct, descuentoAutorizacionId }) {
    const payload = {
      tipo,
      clienteId,
      estado: 'Activa',
      items: items.map(i => ({ productoId: i.productoId, cantidad: i.cantidad, precioUnitario: i.precioUnitario })),
    }
    if (descuentoPct !== undefined) payload.descuentoPct = descuentoPct
    if (descuentoAutorizacionId) payload.descuentoAutorizacionId = descuentoAutorizacionId
    const res = await app.inject({ method: 'POST', url: '/api/ventas', headers: auth(), payload })
    if (res.statusCode === 201) creado.ordenes.push(res.json().id)
    return res
  }

  // ── Caso 1: la regla depende del tipo de venta ─────────────────────────────

  it('caso 1 · por tipo de venta: aplica en Venta Sala y no en Licitacion', async () => {
    const regla = await crearRegla({
      nombre: `${marca} solo sala`,
      tiposVenta: ['Venta Sala'],
      porcentajeSugerido: 10,
      porcentajeAutoaprobado: 10,
      porcentajeMaximo: 10,
      prioridad: 900,
    })
    expect(regla.condiciones.tiposVenta).toEqual(['Venta Sala'])
    expect(regla.porcentajeMax).toBe(10)

    // Guardada de verdad, no solo devuelta por el POST.
    const persistida = await app.prisma.descuentoRegla.findUnique({ where: { id: regla.id } })
    expect(persistida.activo).toBe(true)

    const items = [{ productoId: productoA.id, cantidad: 2, precioUnitario: 10000 }]

    const enSala = await evaluar({ ...borrador({ items }), descuentoPct: 8 })
    const reglaEnSala = enSala.reglas.find(r => r.reglaId === regla.id)
    expect(reglaEnSala?.estado).toBe('AUTORIZADA')

    const enLicitacion = await evaluar({ ...borrador({ tipo: 'Licitación', items }), descuentoPct: 8 })
    expect(enLicitacion.reglas.find(r => r.reglaId === regla.id)).toBeUndefined()

    // Aplicar en Venta Sala: se guarda con el descuento.
    const venta = await crearVenta({ items, descuentoPct: 8 })
    expect(venta.statusCode, venta.body).toBe(201)
    const body = venta.json()
    expect(body.descuentoPct).toBe(8)
    expect(body.total).toBe(20000 - Math.round(20000 * 8 / 100))

    // Aplicar en Licitacion: ninguna regla lo respalda.
    const rechazada = await crearVenta({ tipo: 'Licitación', items, descuentoPct: 8 })
    expect(rechazada.statusCode).toBe(400)
    expect(rechazada.json().error).toMatch(/regla de descuento vigente/i)

    await desactivarRegla(regla.id)
  })

  // ── Caso 2: la regla exige un monto minimo ─────────────────────────────────

  it('caso 2 · por volumen: bajo el monto minimo la regla no habilita el descuento', async () => {
    const regla = await crearRegla({
      nombre: `${marca} volumen`,
      tiposVenta: ['Venta Sala'],
      montoMinimo: 500000,
      porcentajeSugerido: 5,
      porcentajeAutoaprobado: 5,
      porcentajeMaximo: 5,
      prioridad: 900,
    })
    expect(regla.condiciones.montoMinimo).toBe(500000)

    const chico = [{ productoId: productoA.id, cantidad: 1, precioUnitario: 100000 }]
    const grande = [{ productoId: productoA.id, cantidad: 10, precioUnitario: 100000 }]

    // Bajo el minimo la regla ni siquiera aparece.
    const evalChico = await evaluar({ ...borrador({ items: chico }), descuentoPct: 5 })
    expect(evalChico.reglas.find(r => r.reglaId === regla.id)).toBeUndefined()
    const ventaChica = await crearVenta({ items: chico, descuentoPct: 5 })
    expect(ventaChica.statusCode).toBe(400)

    // Sobre el minimo, se habilita y se aplica.
    const evalGrande = await evaluar({ ...borrador({ items: grande }), descuentoPct: 5 })
    const habilitada = evalGrande.reglas.find(r => r.reglaId === regla.id)
    expect(habilitada?.estado).toBe('AUTORIZADA')
    expect(habilitada.baseElegible).toBe(1000000)

    const ventaGrande = await crearVenta({ items: grande, descuentoPct: 5 })
    expect(ventaGrande.statusCode, ventaGrande.body).toBe(201)
    expect(ventaGrande.json().total).toBe(1000000 - 50000)

    await desactivarRegla(regla.id)
  })

  // ── Caso 3: sobre el auto-aprobado exige autorizacion ──────────────────────

  it('caso 3 · con aprobacion: el descuento sobre el auto-aprobado exige autorizacion y queda registrado', async () => {
    const regla = await crearRegla({
      nombre: `${marca} con aprobacion`,
      tiposVenta: ['Venta Sala'],
      porcentajeSugerido: 5,
      porcentajeAutoaprobado: 5,
      porcentajeMaximo: 20,
      requiereAprobacion: true,
      prioridad: 900,
    })
    expect(regla.requiereAprobacion).toBe(true)

    const items = [{ productoId: productoA.id, cantidad: 1, precioUnitario: 100000 }]

    // Dentro del auto-aprobado: pasa directo.
    const auto = await crearVenta({ items, descuentoPct: 5 })
    expect(auto.statusCode, auto.body).toBe(201)
    expect(auto.json().descuentoPct).toBe(5)

    // Sobre el auto-aprobado: el motor lo marca PENDIENTE y la venta se bloquea.
    const evaluacion = await evaluar({ ...borrador({ items }), descuentoPct: 15 })
    const pendiente = evaluacion.reglas.find(r => r.reglaId === regla.id)
    expect(pendiente?.estado).toBe('PENDIENTE')

    const bloqueada = await crearVenta({ items, descuentoPct: 15 })
    expect(bloqueada.statusCode).toBe(409)
    expect(bloqueada.json().error).toMatch(/requiere aprobacion/i)

    // Camino correcto: solicitar, aprobar y aplicar con la autorizacion.
    const solicitud = await app.inject({
      method: 'POST', url: '/api/descuentos/solicitudes', headers: auth(),
      payload: { ...borrador({ items }), reglaId: regla.id, descuentoPct: 15, origenTipo: 'venta' },
    })
    expect(solicitud.statusCode, solicitud.body).toBe(201)
    const solicitudId = solicitud.json().solicitud.id
    creado.solicitudes.push(solicitudId)

    const aprobacion = await app.inject({
      method: 'POST', url: `/api/descuentos/solicitudes/${solicitudId}/aprobar`, headers: auth(), payload: {},
    })
    expect(aprobacion.statusCode, aprobacion.body).toBe(200)

    const conAutorizacion = await crearVenta({ items, descuentoPct: 15, descuentoAutorizacionId: solicitudId })
    expect(conAutorizacion.statusCode, conAutorizacion.body).toBe(201)
    const venta = conAutorizacion.json()

    // El registro: la venta apunta a la solicitud y guarda el snapshot.
    const guardada = await app.prisma.orden.findUnique({
      where: { id: venta.id },
      select: { descuentoPct: true, descuentoMonto: true, descuentoSolicitudId: true, descuentoSnapshot: true },
    })
    expect(guardada.descuentoSolicitudId).toBe(solicitudId)
    expect(guardada.descuentoMonto).toBe(15000)
    expect(guardada.descuentoSnapshot).toMatchObject({ reglaId: regla.id, porcentaje: 15 })

    // Y la solicitud queda marcada como aplicada, no reutilizable.
    const solicitudFinal = await app.prisma.descuentoSolicitud.findUnique({ where: { id: solicitudId } })
    expect(String(solicitudFinal.estado).toUpperCase()).toBe('APLICADA')

    await desactivarRegla(regla.id)
  })

  // ── Caso 4: la regla solo cubre algunos productos ──────────────────────────

  it('caso 4 · por producto: el descuento se calcula solo sobre los items que cubre la regla', async () => {
    const regla = await crearRegla({
      nombre: `${marca} solo producto A`,
      tiposVenta: ['Venta Sala'],
      productoIds: [productoA.id],
      porcentajeSugerido: 10,
      porcentajeAutoaprobado: 10,
      porcentajeMaximo: 10,
      prioridad: 900,
    })
    expect(regla.condiciones.productoIds).toEqual([productoA.id])

    // La venta lleva los dos productos, pero la regla solo cubre A.
    const items = [
      { productoId: productoA.id, cantidad: 1, precioUnitario: 100000 },
      { productoId: productoB.id, cantidad: 1, precioUnitario: 400000 },
    ]

    const evaluacion = await evaluar({ ...borrador({ items }), descuentoPct: 10 })
    const cubierta = evaluacion.reglas.find(r => r.reglaId === regla.id)
    expect(cubierta?.estado).toBe('AUTORIZADA')
    // La base elegible es solo el producto A, no los 500.000 de la venta.
    expect(cubierta.baseElegible).toBe(100000)
    expect(cubierta.montoDescuento).toBe(10000)
    expect(cubierta.itemsElegibles).toHaveLength(1)
    expect(cubierta.itemsElegibles[0].productoId).toBe(productoA.id)

    // Una venta que solo lleva el producto no cubierto no encuentra respaldo.
    const soloB = await crearVenta({ items: [items[1]], descuentoPct: 10 })
    expect(soloB.statusCode).toBe(400)
    expect(soloB.json().error).toMatch(/regla de descuento vigente/i)

    await desactivarRegla(regla.id)
  })

  // ── Cierre: sin reglas vigentes no hay descuento ───────────────────────────

  it('con todas las reglas desactivadas, ningun descuento se puede aplicar', async () => {
    const items = [{ productoId: productoA.id, cantidad: 1, precioUnitario: 100000 }]
    const res = await crearVenta({ items, descuentoPct: 5 })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/regla de descuento vigente/i)

    // Sin descuento, la misma venta se guarda sin problema.
    const sinDescuento = await crearVenta({ items })
    expect(sinDescuento.statusCode, sinDescuento.body).toBe(201)
    expect(sinDescuento.json().descuentoPct).toBe(0)
  })
})
