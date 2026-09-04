// Crea una única venta de demostración, persistente y revisable, en
// plastimar_test. Nunca debe ejecutarse con una DATABASE_URL de producción.
import { buildApp } from '../src/app.js'

const databaseUrl = process.env.DATABASE_URL || ''
if (!/plastimar_test/i.test(databaseUrl)) {
  throw new Error('Este script sólo puede ejecutarse contra plastimar_test')
}

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const marker = `E2E-TRAZA-${stamp}`
const app = buildApp({ logger: false })
await app.ready()

function fail(step, response) {
  const body = response?.body || ''
  throw new Error(`${step}: HTTP ${response?.statusCode} ${body}`)
}
function expectStatus(step, response, expected) {
  if (!expected.includes(response.statusCode)) fail(step, response)
  return response.json()
}

try {
  const sucursal = await app.prisma.sucursal.create({
    data: { nombre: `${marker} Sucursal`, direccion: 'Av. Prueba 123', comuna: 'Santiago', region: 'Metropolitana', activo: true },
  })
  const caja = await app.prisma.caja.create({ data: { nombre: `${marker} Caja`, sucursalId: sucursal.id, activa: true } })
  const talleres = await app.prisma.taller.findMany({ where: { activo: true }, take: 1, select: { id: true, nombre: true } })
  const taller = talleres[0] || await app.prisma.taller.create({ data: { nombre: `${marker} Taller`, activo: true } })

  const roles = [
    ['vendedor', 'Vendedora'],
    ['coordinador_comercial', 'Coordinador Comercial'],
    ['taller', 'Jefe de Taller'],
    ['taller_operario', 'Operario Taller'],
    ['bodeguero', 'Bodeguero'],
    ['cajero', 'Cajero'],
    ['bodeguero', 'Facturación'],
    ['admin', 'Gerencia'],
  ]
  const users = {}
  for (const [role, label] of roles) {
    const email = `${marker.toLowerCase()}-${label.toLowerCase().replaceAll(' ', '-') }@plastimar.test`
    users[label] = await app.prisma.user.create({
      data: {
        email,
        passwordHash: 'solo-trazabilidad-plastimar-test',
        role,
        nombre: `${marker} · ${label}`,
        sucursalId: sucursal.id,
        activo: true,
        permisosExtra: label === 'Facturación'
          ? { facturacion: ['read'], 'facturacion.emitir': ['read', 'write'] }
          : null,
      },
    })
  }

  const token = label => {
    const user = users[label]
    return app.jwt.sign({
      id: user.id, role: user.role, nombre: user.nombre, email: user.email,
      permisosExtra: user.permisosExtra, sucursalId: user.sucursalId,
      authVersion: user.authVersion, scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
  }
  const auth = label => ({ authorization: `Bearer ${token(label)}` })

  const cliente = await app.prisma.cliente.create({
    data: {
      rut: `${marker}-CLIENTE`, nombre: `Cliente ${marker}`, razonSocial: `Cliente ${marker}`,
      email: `cliente-${stamp}@plastimar.test`, telefono: '+56900000000', activo: true,
    },
  })
  const inventariado = await app.prisma.producto.create({
    data: {
      codigoInterno: `${marker}-INV`, codigoBarra: `779${stamp.slice(-10)}`,
      nombre: `Producto inventariado ${marker}`, estadoInventario: 'Inventariado',
      stock: 20, stockCritico: 2, precioLista: 1000, activo: true,
    },
  })
  const transitorio = await app.prisma.producto.create({
    data: {
      codigoInterno: `${marker}-TR`, nombre: `Producto transitorio ${marker}`,
      estadoInventario: 'Transitorio', tallerId: taller.id, precioLista: 1000, activo: true,
    },
  })

  const venta = expectStatus('Crear venta', await app.inject({
    method: 'POST', url: '/api/ventas', headers: auth('Vendedora'),
    payload: {
      tipo: 'Normal', clienteId: cliente.id,
      observaciones: `${marker}: venta demostrativa; no emitir al SII`,
      emailContactoDespacho: cliente.email,
      direccionDespacho: 'Av. Prueba 123', regionDespacho: 'Metropolitana', comunaDespacho: 'Santiago', ciudadDespacho: 'Santiago',
      items: [
        { productoId: inventariado.id, cantidad: 2, precioUnitario: 1000 },
        { productoId: transitorio.id, cantidad: 1, precioUnitario: 1000 },
      ],
    },
  }), [201])
  const orden = venta.data || venta

  expectStatus('Revisión coordinación', await app.inject({
    method: 'GET', url: `/api/ventas/${orden.id}`, headers: auth('Coordinador Comercial'),
  }), [200])

  const odt = await app.prisma.odt.findFirst({ where: { ordenId: orden.id }, include: { items: { include: { talleres: true } } } })
  if (!odt) throw new Error('La venta no creó la ODT automática')
  const odtItem = odt.items.find(item => item.productoId === transitorio.id)
  const etapa = odtItem?.talleres?.[0]
  if (!etapa) throw new Error('La ODT no contiene la etapa del producto transitorio')

  expectStatus('Asignar operario', await app.inject({
    method: 'PUT', url: `/api/odts/${odt.id}/items/${odtItem.id}/talleres/${etapa.id}/estado`, headers: auth('Jefe de Taller'),
    payload: { operarioResponsableId: users['Operario Taller'].id, estado: 'en_proceso', obs: `${marker}: asignación y comienzo` },
  }), [200])
  expectStatus('Terminar taller', await app.inject({
    method: 'PUT', url: `/api/odts/${odt.id}/items/${odtItem.id}/talleres/${etapa.id}/estado`, headers: auth('Operario Taller'),
    payload: { estado: 'listo', obs: `${marker}: terminado por operario` },
  }), [200])

  const orderWithItems = await app.prisma.orden.findUnique({ where: { id: orden.id }, include: { items: { where: { eliminado: false } } } })
  const despacho = expectStatus('Crear despacho', await app.inject({
    method: 'POST', url: '/api/despachos', headers: auth('Bodeguero'),
    payload: {
      ordenId: orden.id, tipoDespacho: 'Despacho cliente', transporte: 'Vehículo de prueba',
      numeroSeguimiento: marker, contacto: 'Recepción de prueba', direccion: 'Av. Prueba 123', region: 'Metropolitana', comuna: 'Santiago', ciudad: 'Santiago',
    },
  }), [200])
  expectStatus('Confirmar picking', await app.inject({
    method: 'PUT', url: `/api/despachos/ordenes/${orden.id}/picking`, headers: auth('Bodeguero'),
    payload: { items: orderWithItems.items.map(item => ({ itemId: item.id, confirmado: true, observacion: `${marker}: picking conforme` })) },
  }), [200])
  expectStatus('Registrar packing', await app.inject({
    method: 'PUT', url: `/api/despachos/ordenes/${orden.id}/packing`, headers: auth('Bodeguero'),
    payload: {
      despachoId: despacho.id, bultoNumero: `${marker}-B1`, bultoPeso: 3.5,
      bultoObservacion: `${marker}: bulto cerrado`,
      items: orderWithItems.items.map(item => ({ itemId: item.id, nEntregados: item.cantidad })),
    },
  }), [200])
  const guia = expectStatus('Preparar guía DTE 52', await app.inject({
    method: 'POST', url: '/api/despachos/guias', headers: auth('Bodeguero'),
    payload: { ordenId: orden.id, despachoId: despacho.id, borrador: true, indTraslado: 1, tipoDespacho: 2 },
  }), [200])
  for (const estado of ['Patio', 'Didáctico', 'Reparto', 'Entregado']) {
    expectStatus(`Tracking ${estado}`, await app.inject({
      method: 'POST', url: `/api/despachos/${despacho.id}/tracking`, headers: auth('Bodeguero'),
      payload: { estado, ubicacion: `${marker}: ${estado}`, observacion: `${marker}: hito de seguimiento` },
    }), [200])
  }

  const turno = expectStatus('Abrir turno caja', await app.inject({
    method: 'POST', url: '/api/caja/turno', headers: auth('Cajero'), payload: { cajaId: caja.id },
  }), [201])
  const nDoc = `TEST-${stamp}`
  expectStatus('Registrar documento de cobro', await app.inject({
    method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/documento`, headers: auth('Cajero'),
    payload: { monto: 3000, documento: 'Boleta prueba', nDoc, tipoDocumento: 'Boleta' },
  }), [201])
  expectStatus('Registrar pago', await app.inject({
    method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`, headers: auth('Cajero'),
    payload: { monto: 3000, medioPago: 'Efectivo', documento: 'Boleta prueba', nDoc, tipoDocumento: 'Boleta' },
  }), [201])
  expectStatus('Cerrar turno caja', await app.inject({
    method: 'POST', url: `/api/caja/turno/${turno.id}/cerrar`, headers: auth('Cajero'),
    payload: { obs: `${marker}: cierre de prueba`, conteo: { efectivo: 3000 } },
  }), [200])

  // Facturación revisa el expediente, pero se omite la emisión: este registro
  // es una prueba interna y no debe consumir folio ni llamar al SII.
  expectStatus('Revisión facturación', await app.inject({
    method: 'GET', url: '/api/facturacion/documentos?limit=10', headers: auth('Facturación'),
  }), [200])
  const seguimiento = expectStatus('Revisión gerencia', await app.inject({
    method: 'GET', url: `/api/despachos/${despacho.id}/tracking`, headers: auth('Gerencia'),
  }), [200])
  const finalOrden = await app.prisma.orden.findUnique({ where: { id: orden.id } })
  const movimientoStock = await app.prisma.movimientoBodega.findFirst({ where: { ordenId: orden.id }, orderBy: { id: 'asc' } })
  const movimientoCaja = await app.prisma.movimientoCaja.findFirst({ where: { ordenId: orden.id, medioPago: 'Efectivo' }, orderBy: { id: 'desc' } })
  const dteBorrador = await app.prisma.factDocumento.findFirst({
    where: { guiaDespachoId: guia.guia?.id ?? -1 },
    select: { id: true, estado: true, folio: true, trackId: true },
  })

  const summary = {
    marker,
    database: 'plastimar_test',
    orden: { id: orden.id, nInterno: orden.nInterno, estadoPago: finalOrden.estadoPago, estadoEntrega: finalOrden.estadoEntrega, estadoFlujoFormal: finalOrden.estadoFlujoFormal },
    ids: { cliente: cliente.id, productoInventariado: inventariado.id, productoTransitorio: transitorio.id, odt: odt.id, despacho: despacho.id, guiaBorrador: guia.guia?.id ?? null, dteBorrador: dteBorrador?.id ?? null, turnoCaja: turno.id, movimientoStock: movimientoStock?.id ?? null, movimientoCaja: movimientoCaja?.id ?? null },
    usuarios: Object.fromEntries(Object.entries(users).map(([rol, user]) => [rol, { id: user.id, email: user.email, role: user.role }])),
    tracking: seguimiento.eventos.map(evento => ({ id: evento.id, estado: evento.estado, usuario: evento.usuario, fecha: evento.fechaEvento })),
    nota: `DTE 52 ${dteBorrador?.id ?? 'sin registro'} quedó en borrador, sin folio ni trackId. No se llamó al SII.`,
  }
  const audit = await app.prisma.auditLog.create({
    data: {
      userId: users.Gerencia.id, userEmail: users.Gerencia.email, userNombre: users.Gerencia.nombre, role: 'admin',
      method: 'SIMULATION', path: `/trazabilidad/${orden.id}`, status: 201, entity: 'e2e_trace', entityId: String(orden.id), payload: summary,
    },
  })
  console.log(JSON.stringify({ ...summary, auditLogId: audit.id }, null, 2))
} finally {
  await app.close()
}
