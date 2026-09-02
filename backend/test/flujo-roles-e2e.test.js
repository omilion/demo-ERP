// Recorrido operativo completo con los roles que intervienen en una venta mixta.
// Cada relevo llama el endpoint real y deja evidencia en plastimar_test; no es
// una prueba de guardias con cuerpos vacíos.
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

describeDb('flujo E2E con relevos por rol', () => {
  let app
  let user
  let cliente
  let inventariado
  let transitorio
  let taller
  let ordenId
  let despachoId
  let guiaId
  let turnoId
  let caja
  const marker = `ROLE-E2E-${Date.now()}`

  const token = (role, permisosExtra = null) => app.jwt.sign({
    id: user.id,
    role,
    nombre: `Simulación ${role}`,
    permisosExtra,
    sucursalId: 98761,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
  const auth = (role, permisosExtra = null) => ({ authorization: `Bearer ${token(role, permisosExtra)}` })

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    user = await app.prisma.user.findFirst({ where: { activo: true }, select: { id: true } })
    if (!user) throw new Error('Se requiere un usuario activo en plastimar_test')

    // La caja de la prueba queda en una sucursal exclusiva. No cerramos ni
    // reutilizamos un turno abierto que pertenezca a otra operación de prueba.
    caja = await app.prisma.caja.create({ data: { nombre: `${marker} Caja`, sucursalId: 98761, activa: true } })

    taller = await app.prisma.taller.findFirst({ where: { activo: true }, select: { id: true, nombre: true } })
    if (!taller) {
      taller = await app.prisma.taller.create({ data: { nombre: `${marker} Taller`, activo: true } })
    }
    cliente = await app.prisma.cliente.create({
      data: { rut: `${marker}-CLI`, nombre: `Cliente ${marker}`, razonSocial: `Cliente ${marker}`, email: 'roles-e2e@plastimar.test', activo: true },
    })
    inventariado = await app.prisma.producto.create({
      data: {
        codigoInterno: `${marker}-INV`, codigoBarra: `779${Date.now()}`,
        nombre: `Inventariado ${marker}`, estadoInventario: 'Inventariado',
        stock: 20, stockCritico: 1, precioLista: 1000, activo: true,
      },
    })
    transitorio = await app.prisma.producto.create({
      data: {
        codigoInterno: `${marker}-TR`, nombre: `Transitorio ${marker}`,
        estadoInventario: 'Transitorio', tallerId: taller.id, precioLista: 1000, activo: true,
      },
    })
  })

  afterAll(async () => {
    if (ordenId) {
      const odts = await app.prisma.odt.findMany({ where: { ordenId }, select: { id: true } })
      const odtIds = odts.map(row => row.id)
      const odtItems = odtIds.length
        ? await app.prisma.odtItem.findMany({ where: { odtId: { in: odtIds } }, select: { id: true } })
        : []
      const odtItemIds = odtItems.map(row => row.id)
      if (guiaId) await app.prisma.factDocumento.deleteMany({ where: { guiaDespachoId: guiaId } }).catch(() => {})
      await app.prisma.movimientoCaja.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.movimientoBodega.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.packingEvento.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.packingBulto.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.despachoTrackingEvento.deleteMany({ where: { despacho: { ordenId } } }).catch(() => {})
      await app.prisma.guiaDespacho.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.despacho.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.ordenEstadoFlujoHistorial.deleteMany({ where: { ordenId } }).catch(() => {})
      if (odtItemIds.length) await app.prisma.odtEtapaRecepcion.deleteMany({ where: { odtItemTaller: { odtItemId: { in: odtItemIds } } } }).catch(() => {})
      if (odtItemIds.length) await app.prisma.odtItemTaller.deleteMany({ where: { odtItemId: { in: odtItemIds } } }).catch(() => {})
      if (odtIds.length) await app.prisma.bitacoraTaller.deleteMany({ where: { odtId: { in: odtIds } } }).catch(() => {})
      if (odtIds.length) await app.prisma.odtItem.deleteMany({ where: { odtId: { in: odtIds } } }).catch(() => {})
      if (odtIds.length) await app.prisma.odt.deleteMany({ where: { id: { in: odtIds } } }).catch(() => {})
      await app.prisma.ordenItem.deleteMany({ where: { ordenId } }).catch(() => {})
      await app.prisma.orden.delete({ where: { id: ordenId } }).catch(() => {})
    }
    if (turnoId) await app.prisma.turno.delete({ where: { id: turnoId } }).catch(() => {})
    if (caja) await app.prisma.caja.delete({ where: { id: caja.id } }).catch(() => {})
    if (inventariado) await app.prisma.producto.delete({ where: { id: inventariado.id } }).catch(() => {})
    if (transitorio) await app.prisma.producto.delete({ where: { id: transitorio.id } }).catch(() => {})
    if (cliente) await app.prisma.cliente.delete({ where: { id: cliente.id } }).catch(() => {})
    await app.close()
  })

  it('encadena vendedor, coordinación, taller, bodega, caja, facturación y gerencia', async () => {
    const venta = await app.inject({
      method: 'POST', url: '/api/ventas', headers: auth('vendedor'),
      payload: {
        tipo: 'Normal', clienteId: cliente.id,
        emailContactoDespacho: 'roles-e2e@plastimar.test',
        direccionDespacho: 'Av. Simulada 123', regionDespacho: 'Metropolitana', comunaDespacho: 'Santiago', ciudadDespacho: 'Santiago',
        items: [
          { productoId: inventariado.id, cantidad: 2, precioUnitario: 1000 },
          { productoId: transitorio.id, cantidad: 1, precioUnitario: 1000 },
        ],
      },
    })
    expect(venta.statusCode).toBe(201)
    ordenId = (venta.json().data || venta.json()).id

    const coordinacion = await app.inject({ method: 'GET', url: `/api/ventas/${ordenId}`, headers: auth('coordinador_comercial') })
    expect(coordinacion.statusCode).toBe(200)

    const odt = await app.prisma.odt.findFirst({
      where: { ordenId }, include: { items: { include: { talleres: true } } },
    })
    expect(odt).toBeTruthy()
    const odtItem = odt.items.find(item => item.productoId === transitorio.id)
    const etapa = odtItem.talleres[0]
    expect(etapa).toBeTruthy()

    const asignacion = await app.inject({
      method: 'PUT', url: `/api/odts/${odt.id}/items/${odtItem.id}/talleres/${etapa.id}/estado`,
      headers: auth('taller'), payload: { operarioResponsableId: user.id, estado: 'en_proceso' },
    })
    expect(asignacion.statusCode).toBe(200)
    const avance = await app.inject({
      method: 'PUT', url: `/api/odts/${odt.id}/items/${odtItem.id}/talleres/${etapa.id}/estado`,
      headers: auth('taller_operario'), payload: { estado: 'listo', obs: 'Producto terminado por operario' },
    })
    expect(avance.statusCode).toBe(200)

    const orden = await app.prisma.orden.findUnique({ where: { id: ordenId }, include: { items: true } })
    const despacho = await app.inject({
      method: 'POST', url: '/api/despachos', headers: auth('bodeguero'),
      payload: { ordenId, tipoDespacho: 'Despacho cliente', transporte: 'Propio', contacto: 'Recepción', direccion: 'Av. Simulada 123', region: 'Metropolitana', comuna: 'Santiago', ciudad: 'Santiago' },
    })
    expect(despacho.statusCode).toBe(200)
    despachoId = despacho.json().id

    const picking = await app.inject({
      method: 'PUT', url: `/api/despachos/ordenes/${ordenId}/picking`, headers: auth('bodeguero'),
      payload: { items: orden.items.map(item => ({ itemId: item.id, confirmado: true })) },
    })
    expect(picking.statusCode).toBe(200)
    const packing = await app.inject({
      method: 'PUT', url: `/api/despachos/ordenes/${ordenId}/packing`, headers: auth('bodeguero'),
      payload: {
        despachoId,
        bultoNumero: `${marker}-B1`, bultoPeso: 3.5,
        items: orden.items.map(item => ({ itemId: item.id, nEntregados: item.cantidad })),
      },
    })
    expect(packing.statusCode).toBe(200)

    const guia = await app.inject({
      method: 'POST', url: '/api/despachos/guias', headers: auth('bodeguero'),
      payload: { ordenId, despachoId, borrador: true, indTraslado: 1, tipoDespacho: 2 },
    })
    // La ruta prepara/reutiliza el borrador asociado al despacho: su contrato
    // responde 200 tanto al crear como al completar ese borrador.
    expect(guia.statusCode).toBe(200)
    guiaId = guia.json().guia.id

    for (const estado of ['Patio', 'Didáctico', 'Reparto', 'Entregado']) {
      const tracking = await app.inject({
        method: 'POST', url: `/api/despachos/${despachoId}/tracking`, headers: auth('bodeguero'),
        payload: { estado, ubicacion: `Hito ${estado}` },
      })
      expect(tracking.statusCode, estado).toBe(200)
    }

    const apertura = await app.inject({ method: 'POST', url: '/api/caja/turno', headers: auth('cajero'), payload: { cajaId: caja.id } })
    expect(apertura.statusCode).toBe(201)
    turnoId = apertura.json().id
    const nDoc = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9)
    const documento = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${ordenId}/documento`, headers: auth('cajero'),
      payload: { monto: 3000, documento: 'Boleta', nDoc },
    })
    expect(documento.statusCode).toBe(201)
    const pago = await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${ordenId}/pago`, headers: auth('cajero'),
      payload: { monto: 3000, medioPago: 'Efectivo', documento: 'Boleta', nDoc },
    })
    expect(pago.statusCode).toBe(201)

    // Facturación es una responsabilidad granular, no un rol estándar: se
    // verifica que la encargada tenga la autorización de emisión sin disparar
    // una llamada real al SII durante la suite.
    const emitir = await app.inject({
      method: 'POST', url: '/api/facturacion/documentos/999999999/emitir',
      headers: auth('bodeguero', { 'facturacion.emitir': ['read', 'write'] }),
    })
    expect(emitir.statusCode).not.toBe(403)
    expect(emitir.statusCode).toBe(422)

    const seguimientoGerencia = await app.inject({ method: 'GET', url: `/api/despachos/${despachoId}/tracking`, headers: auth('admin') })
    expect(seguimientoGerencia.statusCode).toBe(200)
    expect(seguimientoGerencia.json().latest.estado).toBe('Entregado')
  })

  it('mantiene fuera del flujo operativo a lectura y RRHH', async () => {
    const lectura = await app.inject({ method: 'GET', url: `/api/despachos/${despachoId}/tracking`, headers: auth('solo_lectura') })
    expect(lectura.statusCode).toBe(200)
    const mutacionLectura = await app.inject({
      method: 'POST', url: `/api/despachos/${despachoId}/tracking`, headers: auth('solo_lectura'), payload: { estado: 'Patio' },
    })
    expect(mutacionLectura.statusCode).toBe(403)
    const rrhh = await app.inject({ method: 'GET', url: '/api/despachos/cola-operativa', headers: auth('rrhh') })
    expect(rrhh.statusCode).toBe(403)
  })
})
