// Ejecuta una matriz persistente de ventas sobre plastimar_test. Crea los ocho
// tipos comerciales, recorre pago + entrega hasta el cierre y deja una Venta
// Sala anulada seguida por su reintento. No llama a SII ni puede ejecutarse
// contra otra base de datos.
import { buildApp } from '../src/app.js'
import { TIPO_VENTA_VALUES } from '../src/routes/ventas/estados-normalize.js'

const databaseUrl = process.env.DATABASE_URL || ''
if (!/plastimar_test/i.test(databaseUrl)) {
  throw new Error('Este script solo puede ejecutarse contra plastimar_test')
}

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const marker = `E2E-VENTAS-${stamp}`
const app = buildApp({ logger: false })
await app.ready()

function fail(step, response) {
  throw new Error(`${step}: HTTP ${response?.statusCode} ${response?.body || ''}`)
}

function expectStatus(step, response, expected) {
  if (!expected.includes(response.statusCode)) fail(step, response)
  return response.statusCode === 204 ? null : response.json()
}

function ventaFrom(response) {
  return response?.data || response
}

function totalOrden(orden) {
  const subtotal = (orden.items || []).reduce((sum, item) => sum + Number(item.cantidad) * Number(item.precioUnitario), 0)
  const cargos = (orden.cargos || []).reduce((sum, cargo) => sum + Number(cargo.valor), 0)
  return subtotal + cargos
}

try {
  const sucursal = await app.prisma.sucursal.create({
    data: { nombre: `${marker} Sucursal`, direccion: 'Av. Certificación 123', comuna: 'Santiago', region: 'Metropolitana', activo: true },
  })
  const caja = await app.prisma.caja.create({ data: { nombre: `${marker} Caja`, sucursalId: sucursal.id, activa: true } })
  const [vendedor, bodeguero, cajero, admin] = await Promise.all([
    app.prisma.user.create({
      data: {
        email: `${marker.toLowerCase()}-vendedor@plastimar.test`, passwordHash: 'solo-plastimar-test', role: 'vendedor',
        nombre: `${marker} Vendedor`, sucursalId: sucursal.id, activo: true, tiposVentaPermitidos: TIPO_VENTA_VALUES,
      },
    }),
    app.prisma.user.create({
      data: {
        email: `${marker.toLowerCase()}-bodega@plastimar.test`, passwordHash: 'solo-plastimar-test', role: 'bodeguero',
        nombre: `${marker} Bodega`, sucursalId: sucursal.id, activo: true, permisosExtra: { 'ventas.entregas': ['write'] },
      },
    }),
    app.prisma.user.create({
      data: {
        email: `${marker.toLowerCase()}-caja@plastimar.test`, passwordHash: 'solo-plastimar-test', role: 'cajero',
        nombre: `${marker} Caja`, sucursalId: sucursal.id, activo: true,
      },
    }),
    app.prisma.user.create({
      data: {
        email: `${marker.toLowerCase()}-admin@plastimar.test`, passwordHash: 'solo-plastimar-test', role: 'admin',
        nombre: `${marker} Admin`, sucursalId: sucursal.id, activo: true,
      },
    }),
  ])

  const token = user => app.jwt.sign({
    id: user.id, role: user.role, nombre: user.nombre, email: user.email, permisosExtra: user.permisosExtra,
    tiposVentaPermitidos: user.tiposVentaPermitidos, sucursalId: user.sucursalId, authVersion: user.authVersion,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
  })
  const auth = user => ({ authorization: `Bearer ${token(user)}` })

  const cliente = await app.prisma.cliente.create({
    data: {
      rut: `${marker}-CLIENTE`, nombre: `Cliente ${marker}`, razonSocial: `Cliente ${marker}`,
      email: `${marker.toLowerCase()}@plastimar.test`, telefono: '+56900000000', activo: true,
    },
  })
  const producto = await app.prisma.producto.create({
    data: {
      codigoInterno: `${marker}-INV`, codigoBarra: `779${stamp.slice(-10)}`,
      nombre: `Producto matriz ventas ${marker}`, estadoInventario: 'Inventariado',
      stock: 100, stockCritico: 2, precioLista: 1000, activo: true,
    },
  })

  const basePayload = (tipo, { anonymous = false, quantity = 1 } = {}) => ({
    tipo,
    ...(anonymous ? {} : { clienteId: cliente.id }),
    observaciones: `${marker}: ${tipo}; prueba persistente sin emisión SII`,
    items: [{ productoId: producto.id, cantidad: quantity, precioUnitario: 1000 }],
  })
  const specialPayload = tipo => {
    if (tipo === 'Licitación') return {
      licitacion: `${marker}-LIC`, licitacionFecha: '2026-09-02', licitacionPlazo: '15',
      licitacionReferencia: `${marker}-REF-LIC`, licitacionOC: `${marker}-OC-LIC`, plazoEntregaDias: 15, plazoEntregaTipo: 'corridos',
    }
    if (tipo === 'Convenio Marco') return { licitacion: `${marker}-OC-CM` }
    if (tipo === 'Marketplace') return {
      marketplaceCanal: 'Mercado Libre', marketplaceReferencia: `${marker}-ML-1`, marketplaceComisionPct: 12,
      direccionDespacho: 'Av. Certificación 123', contactoDespacho: 'Recepción de certificación',
      emailContactoDespacho: cliente.email, regionDespacho: 'Metropolitana', comunaDespacho: 'Santiago', ciudadDespacho: 'Santiago',
      enviosParciales: true,
    }
    return {}
  }

  const ventas = new Map()
  for (const tipo of TIPO_VENTA_VALUES) {
    const anonymous = tipo === 'Venta Sala'
    const quantity = tipo === 'Venta Web' ? 2 : 1
    const response = expectStatus(`Crear ${tipo}`, await app.inject({
      method: 'POST', url: '/api/ventas', headers: auth(vendedor),
      payload: { ...basePayload(tipo, { anonymous, quantity }), ...specialPayload(tipo) },
    }), [201])
    const venta = ventaFrom(response)
    if (venta.tipo !== tipo) throw new Error(`${tipo}: el tipo persistido fue ${venta.tipo}`)
    ventas.set(tipo, venta)
  }

  // La edición y un cargo se realizan antes de que exista evidencia financiera.
  const normal = ventas.get('Normal')
  expectStatus('Editar observación Normal', await app.inject({
    method: 'PUT', url: `/api/ventas/${normal.id}`, headers: auth(vendedor),
    payload: { observaciones: `${marker}: Normal editada antes de cobrar` },
  }), [200])
  const cargo = expectStatus('Agregar cargo Normal', await app.inject({
    method: 'POST', url: `/api/ventas/${normal.id}/cargos`, headers: auth(vendedor),
    payload: { nombre: 'Embalaje de prueba', valor: 250 },
  }), [201])

  // La venta de sala se anula mediante el mismo endpoint auditado que usa la UI.
  const salaIntento = ventas.get('Venta Sala')
  const stockAntesAnular = Number((await app.prisma.producto.findUnique({ where: { id: producto.id }, select: { stock: true } })).stock)
  expectStatus('Anular Venta Sala', await app.inject({
    method: 'POST', url: `/api/ventas/${salaIntento.id}/anular`, headers: auth(admin),
  }), [200])
  const salaAnulada = await app.prisma.orden.findUnique({ where: { id: salaIntento.id } })
  const stockDespuesAnular = Number((await app.prisma.producto.findUnique({ where: { id: producto.id }, select: { stock: true } })).stock)
  if (!salaAnulada?.eliminada || salaAnulada.estado !== 'Nula' || salaAnulada.estadoFlujoFormal !== 'ANULADA') {
    throw new Error('La Venta Sala no quedó anulada en todas las dimensiones del flujo')
  }
  if (stockDespuesAnular !== stockAntesAnular + 1) throw new Error('La anulación no restituyó el stock de Venta Sala')

  const salaReintento = ventaFrom(expectStatus('Reintentar Venta Sala', await app.inject({
    method: 'POST', url: '/api/ventas', headers: auth(vendedor),
    payload: { ...basePayload('Venta Sala', { anonymous: true }), observaciones: `${marker}: reintento posterior a anulación` },
  }), [201]))
  ventas.set('Venta Sala', salaReintento)

  const turno = expectStatus('Abrir turno de caja', await app.inject({
    method: 'POST', url: '/api/caja/turno', headers: auth(cajero), payload: { cajaId: caja.id },
  }), [201])

  const resultados = []
  let totalEfectivo = 0
  for (const [tipo, venta] of ventas) {
    const orden = await app.prisma.orden.findUnique({ where: { id: venta.id }, include: { items: { where: { eliminado: false } }, cargos: true } })
    const total = totalOrden(orden)
    const nDoc = `${marker}-${venta.id}`
    expectStatus(`Documento ${tipo}`, await app.inject({
      method: 'POST', url: `/api/caja/cobranza/orden/${venta.id}/documento`, headers: auth(cajero),
      payload: { monto: total, documento: 'Boleta certificación', nDoc, tipoDocumento: 'Boleta' },
    }), [201])

    // Venta Web demuestra explícitamente abono y entrega parciales antes del cierre.
    if (tipo === 'Venta Web') {
      expectStatus('Abono parcial Venta Web', await app.inject({
        method: 'POST', url: `/api/caja/cobranza/orden/${venta.id}/pago`, headers: auth(cajero),
        payload: { monto: 1000, medioPago: 'Efectivo', documento: 'Boleta certificación', nDoc, tipoDocumento: 'Boleta' },
      }), [201])
      expectStatus('Entrega parcial Venta Web', await app.inject({
        method: 'PUT', url: `/api/ventas/items/${orden.items[0].id}/entregados`, headers: auth(bodeguero), payload: { nEntregados: 1 },
      }), [200])
      const parcial = await app.prisma.orden.findUnique({ where: { id: venta.id } })
      if (parcial.estadoPago !== 'Parcial' || parcial.estadoEntrega !== 'Parcial') throw new Error('Venta Web no conservó estados parciales')
      expectStatus('Saldo Venta Web', await app.inject({
        method: 'POST', url: `/api/caja/cobranza/orden/${venta.id}/pago`, headers: auth(cajero),
        payload: { monto: total - 1000, medioPago: 'Efectivo', documento: 'Boleta certificación', nDoc, tipoDocumento: 'Boleta' },
      }), [201])
      totalEfectivo += total
    } else {
      expectStatus(`Pago ${tipo}`, await app.inject({
        method: 'POST', url: `/api/caja/cobranza/orden/${venta.id}/pago`, headers: auth(cajero),
        payload: { monto: total, medioPago: 'Efectivo', documento: 'Boleta certificación', nDoc, tipoDocumento: 'Boleta' },
      }), [201])
      totalEfectivo += total
    }

    expectStatus(`Entrega final ${tipo}`, await app.inject({
      method: 'PUT', url: `/api/ventas/items/${orden.items[0].id}/entregados`, headers: auth(bodeguero), payload: { nEntregados: orden.items[0].cantidad },
    }), [200])
    const final = await app.prisma.orden.findUnique({ where: { id: venta.id } })
    if (final.estadoPago !== 'Pagada' || final.estadoEntrega !== 'Entregada' || final.estadoFlujoFormal !== 'CERRADA') {
      throw new Error(`${tipo}: no cerró correctamente (${final.estadoPago}/${final.estadoEntrega}/${final.estadoFlujoFormal})`)
    }
    const movimientos = await app.prisma.movimientoBodega.findMany({ where: { ordenId: venta.id }, select: { id: true, tipo: true, cantidad: true } })
    resultados.push({ tipo, ordenId: venta.id, nInterno: venta.nInterno, total, estadoPago: final.estadoPago, estadoEntrega: final.estadoEntrega, estadoFlujoFormal: final.estadoFlujoFormal, movimientosStock: movimientos })
  }

  expectStatus('Cerrar turno de caja', await app.inject({
    method: 'POST', url: `/api/caja/turno/${turno.id}/cerrar`, headers: auth(cajero),
    payload: { obs: `${marker}: cierre matriz de tipos de venta`, conteo: { efectivo: totalEfectivo } },
  }), [200])

  const [licitacion, convenio, marketplace, salaMovimientos, cotizacion] = await Promise.all([
    app.prisma.orden.findUnique({ where: { id: ventas.get('Licitación').id }, select: { licitacion: true } }),
    app.prisma.orden.findUnique({ where: { id: ventas.get('Convenio Marco').id }, select: { licitacion: true } }),
    app.prisma.orden.findUnique({ where: { id: ventas.get('Marketplace').id }, select: { marketplaceCanal: true, marketplaceReferencia: true, marketplaceComisionMonto: true } }),
    app.prisma.movimientoBodega.findMany({ where: { ordenId: salaIntento.id }, select: { tipo: true, cantidad: true }, orderBy: { id: 'asc' } }),
    app.prisma.cotizacionLicitacion.findFirst({ where: { ordenId: ventas.get('Licitación').id }, select: { id: true, idLicitacion: true, ordenCompra: true } }),
  ])
  if (!cotizacion || cotizacion.idLicitacion !== `${marker}-LIC`) throw new Error('Licitación no generó cotización vinculada')
  if (convenio.licitacion !== `${marker}-OC-CM`) throw new Error('Convenio Marco no persistió su OC')
  if (marketplace.marketplaceCanal !== 'Mercado Libre' || !marketplace.marketplaceReferencia || Number(marketplace.marketplaceComisionMonto) !== 120) {
    throw new Error('Marketplace no persistió su conciliación comercial')
  }
  if (salaMovimientos.length !== 2 || salaMovimientos[0].tipo !== 'egreso' || salaMovimientos[1].tipo !== 'ingreso') {
    throw new Error('La anulación no dejó el kardex completo de Venta Sala')
  }

  const summary = {
    marker,
    database: 'plastimar_test',
    alcance: 'Ocho tipos de venta creados; una Venta Sala anulada y reintentada; pagos, entrega y cierre comprobados.',
    usuarios: { vendedor: vendedor.id, bodega: bodeguero.id, caja: cajero.id, admin: admin.id },
    ids: { sucursal: sucursal.id, caja: caja.id, cliente: cliente.id, producto: producto.id, turno: turno.id, cargoNormal: cargo.id, salaAnulada: salaIntento.id, salaReintento: salaReintento.id, cotizacionLicitacion: cotizacion.id },
    anulacion: { ordenId: salaIntento.id, estado: salaAnulada.estado, estadoFlujoFormal: salaAnulada.estadoFlujoFormal, stockAntesAnular, stockDespuesAnular },
    especiales: { licitacion, convenioMarco: convenio, marketplace, kardexSalaAnulada: salaMovimientos },
    ventas: resultados,
    comportamientoStock: {
      conKardex: resultados.filter(row => row.movimientosStock.length > 0).map(row => row.tipo),
      sinKardex: resultados.filter(row => row.movimientosStock.length === 0).map(row => row.tipo),
      nota: 'Compra Ágil y Trato Directo no generan kardex por la política actual de isVentaDirectaStockTipo; se deja como evidencia, no como supuesto.',
    },
    sii: 'No se emitió ni timbró DTE. La matriz valida el ciclo ERP; la guía DTE 52 en borrador queda documentada en la traza previa E2E-TRAZA.',
  }
  const audit = await app.prisma.auditLog.create({
    data: {
      userId: admin.id, userEmail: admin.email, userNombre: admin.nombre, role: 'admin', method: 'SIMULATION',
      path: '/trazabilidad/matriz-tipos-venta', status: 201, entity: 'e2e_sales_lifecycle_matrix', entityId: marker, payload: summary,
    },
  })
  console.log(JSON.stringify({ ...summary, auditLogId: audit.id }, null, 2))
} finally {
  await app.close()
}
