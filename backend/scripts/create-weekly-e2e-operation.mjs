// Simula una semana operativa completa y deja todos sus rastros en plastimar_test.
// No se permite ejecutar con una base que no sea de pruebas y no emite al SII:
// verifica el bloqueo si falta el certificado sin consumir CAF ni folios.
import { buildApp } from '../src/app.js'

const databaseUrl = process.env.DATABASE_URL || ''
if (!/plastimar_test/i.test(databaseUrl)) {
  throw new Error('Este script solo puede ejecutarse contra plastimar_test')
}

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const marker = `E2E-SEMANA-${stamp}`
const app = buildApp({ logger: false })
await app.ready()

function fail(step, response) {
  throw new Error(`${step}: HTTP ${response?.statusCode} ${response?.body || ''}`)
}

function expectStatus(step, response, expected) {
  if (!expected.includes(response.statusCode)) fail(step, response)
  return response.statusCode === 204 ? null : response.json()
}

function bodyData(response) {
  return response?.data || response
}

function totalOrden(orden) {
  return (orden.items || []).reduce((sum, item) => sum + Number(item.cantidad) * Number(item.precioUnitario), 0)
    + (orden.cargos || []).reduce((sum, cargo) => sum + Number(cargo.valor), 0)
}

function rutDePrueba(seed) {
  const cuerpo = String(seed).replace(/\D/g, '').slice(-8).padStart(8, '7')
  let suma = 0
  let factor = 2
  for (const digit of [...cuerpo].reverse()) {
    suma += Number(digit) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const valor = 11 - (suma % 11)
  const dv = valor === 11 ? '0' : valor === 10 ? 'K' : String(valor)
  return `${cuerpo}-${dv}`
}

try {
  const sucursal = await app.prisma.sucursal.create({
    data: { nombre: `${marker} Sucursal`, direccion: 'Av. Trazabilidad 123', comuna: 'Santiago', region: 'Metropolitana', activo: true },
  })
  const caja = await app.prisma.caja.create({ data: { nombre: `${marker} Caja`, sucursalId: sucursal.id, activa: true } })

  const roleRows = [
    ['Vendedor', 'vendedor', null],
    ['Coordinador Comercial', 'coordinador_comercial', null],
    ['Jefe de Taller', 'taller', null],
    ['Operario Taller', 'taller_operario', null],
    ['Bodeguero', 'bodeguero', null],
    ['Cajero', 'cajero', null],
    ['Facturador', 'bodeguero', { ventas: ['read', 'write'], facturacion: ['read', 'write'], 'facturacion.emitir': ['read', 'write'] }],
    ['Gerencia', 'admin', null],
  ]
  const users = {}
  for (const [label, role, permisosExtra] of roleRows) {
    users[label] = await app.prisma.user.create({
      data: {
        email: `${marker.toLowerCase()}-${label.toLowerCase().replaceAll(' ', '-')}@plastimar.test`,
        passwordHash: 'solo-trazabilidad-plastimar-test',
        role,
        nombre: `${marker} · ${label}`,
        sucursalId: sucursal.id,
        activo: true,
        permisosExtra,
      },
    })
  }

  const taller = await app.prisma.taller.create({
    data: { nombre: `${marker} Taller`, activo: true, jefeId: users['Jefe de Taller'].id },
  })
  const token = label => {
    const user = users[label]
    return app.jwt.sign({
      id: user.id, role: user.role, nombre: user.nombre, email: user.email,
      permisosExtra: user.permisosExtra, sucursalId: user.sucursalId, authVersion: user.authVersion,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
  }
  const auth = label => ({ authorization: `Bearer ${token(label)}` })

  const cliente = await app.prisma.cliente.create({
    data: {
      rut: rutDePrueba(stamp), nombre: `Cliente ${marker}`, razonSocial: `Cliente ${marker}`,
      giro: 'Comercio de prueba', direccion: 'Av. Trazabilidad 123', comuna: 'Santiago', ciudad: 'Santiago',
      email: `${marker.toLowerCase()}@plastimar.test`, telefono: '+56900000000', activo: true,
    },
  })
  const inventariado = await app.prisma.producto.create({
    data: {
      codigoInterno: `${marker}-INV`, codigoBarra: `779${stamp.slice(-10)}`,
      nombre: `Producto inventariado ${marker}`, estadoInventario: 'Inventariado',
      stock: 30, stockCritico: 2, precioLista: 15000, activo: true,
    },
  })
  const transitorio = await app.prisma.producto.create({
    data: {
      codigoInterno: `${marker}-TALLER`, nombre: `Producto fabricado ${marker}`,
      estadoInventario: 'Transitorio', tallerId: taller.id, precioLista: 25000, activo: true,
    },
  })
  const espuma = await app.prisma.bodegaTaller.create({
    data: {
      codigoInterno: `${marker}-ESPUMA`, nombre: `Espuma trazable ${marker}`, unidadMedida: 'plancha',
      stock: 10, precio: 7000, densidadKgM3: 25, sucursalId: sucursal.id, tallerId: taller.id, activo: true,
    },
  })
  const loteEspuma = await app.prisma.bodegaTallerLote.create({
    data: {
      bodegaTallerId: espuma.id, codigo: `${marker}-L1`, cantidadInicial: 10, cantidadDisponible: 10,
      estadoCalidad: 'aprobado', observacion: `${marker}: lote apto para consumo`,
    },
  })

  // Día 1: vendedor crea cotización CRM. No hay venta hasta que se aprueba.
  const cotizacionResponse = expectStatus('Crear cotización CRM', await app.inject({
    method: 'POST', url: '/api/crm/cotizaciones', headers: auth('Vendedor'),
    payload: {
      crmQuoteMode: 'PROSPECCION_DIRECTA', tipo: 'Venta Directa', clienteId: cliente.id,
      vendedorId: users.Vendedor.id, prioridad: 'Alta',
      observaciones: `${marker}: Día 1, cotización mixta para semana operativa`,
      emailContactoDespacho: cliente.email, direccionDespacho: cliente.direccion,
      regionDespacho: 'Metropolitana', comunaDespacho: 'Santiago', ciudadDespacho: 'Santiago',
      items: [
        { productoId: inventariado.id, cantidad: 2, precioUnitario: 15000 },
        { productoId: transitorio.id, cantidad: 1, precioUnitario: 25000 },
      ],
    },
  }), [201])
  const crm = cotizacionResponse.lead

  expectStatus('Registrar gestión de llamada', await app.inject({
    method: 'POST', url: `/api/crm/${crm.id}/gestiones`, headers: auth('Vendedor'),
    payload: { tipo: 'LLAMADA', resultado: `${marker}: cliente solicita confirmación de plazo`, siguienteAccion: 'Enviar confirmación de fabricación', fechaProximo: new Date().toISOString() },
  }), [201])
  expectStatus('Pasar CRM a seguimiento', await app.inject({
    method: 'POST', url: `/api/crm/${crm.id}/transiciones`, headers: auth('Vendedor'),
    payload: { etapa: 'SEGUIMIENTO', motivo: `${marker}: seguimiento de propuesta` },
  }), [200])
  expectStatus('Registrar aceptación de cotización', await app.inject({
    method: 'POST', url: `/api/crm/${crm.id}/cotizacion/aceptacion`, headers: auth('Vendedor'),
    payload: { medio: 'CORREO', por: 'Cliente de prueba', referencia: `${marker}: aceptación por correo` },
  }), [200])

  // Día 2: aprobación crea la Orden ERP desde CRM y la ODT de la parte de taller.
  const crmAprobado = expectStatus('Aprobar CRM y crear venta', await app.inject({
    method: 'POST', url: `/api/crm/${crm.id}/transiciones`, headers: auth('Vendedor'),
    payload: { etapa: 'VENTA_APROBADA', confirmacionTipo: 'OC', confirmacionReferencia: `${marker}-OC-1`, motivo: `${marker}: OC confirmada` },
  }), [200])
  const orden = await app.prisma.orden.findUnique({
    where: { id: crmAprobado.ordenId }, include: { items: { where: { eliminado: false } }, cargos: true },
  })
  if (!orden) throw new Error('La aprobación CRM no creó la orden')
  expectStatus('Coordinación revisa venta', await app.inject({
    method: 'GET', url: `/api/ventas/${orden.id}`, headers: auth('Coordinador Comercial'),
  }), [200])

  const odt = await app.prisma.odt.findFirst({
    where: { ordenId: orden.id }, include: { items: { include: { talleres: true } } },
  })
  const odtItem = odt?.items.find(item => item.productoId === transitorio.id)
  const etapa = odtItem?.talleres?.[0]
  if (!odt || !odtItem || !etapa) throw new Error('La venta CRM no creó una etapa operable de ODT')

  // Día 3: jefe asigna; operario inicia, consume espuma con lote/merma y termina.
  expectStatus('Marcar ODT asignada', await app.inject({
    method: 'PUT', url: `/api/odts/${odt.id}`, headers: auth('Jefe de Taller'),
    payload: { estado: 'Asignada', obsGeneral: `${marker}: planificación semanal asignada` },
  }), [200])
  expectStatus('Iniciar ODT', await app.inject({
    method: 'PUT', url: `/api/odts/${odt.id}`, headers: auth('Jefe de Taller'),
    payload: { estado: 'En proceso' },
  }), [200])
  expectStatus('Asignar operario', await app.inject({
    method: 'PUT', url: `/api/odts/${odt.id}/items/${odtItem.id}/talleres/${etapa.id}/estado`, headers: auth('Jefe de Taller'),
    payload: { operarioResponsableId: users['Operario Taller'].id, estado: 'en_proceso', obs: `${marker}: asignación de producción` },
  }), [200])
  const consumo = expectStatus('Consumir espuma con lote y merma', await app.inject({
    method: 'POST', url: `/api/odts/${odt.id}/consumos`, headers: auth('Operario Taller'),
    payload: {
      tipo: 'material_taller', id: espuma.id, cantidad: 1.5, loteId: loteEspuma.id, calidad: 'aprobado',
      mermaCantidad: 0.25, mermaMotivo: `${marker}: recorte técnico`, motivo: `${marker}: consumo de fabricación`, taller: taller.nombre,
    },
  }), [201])
  expectStatus('Terminar etapa de taller', await app.inject({
    method: 'PUT', url: `/api/odts/${odt.id}/items/${odtItem.id}/talleres/${etapa.id}/estado`, headers: auth('Operario Taller'),
    payload: { estado: 'listo', obs: `${marker}: unidad terminada y disponible para bodega` },
  }), [200])
  expectStatus('Enviar ODT a control de calidad', await app.inject({
    method: 'PUT', url: `/api/odts/${odt.id}`, headers: auth('Jefe de Taller'),
    payload: { estado: 'Control calidad' },
  }), [200])
  expectStatus('Cerrar ODT con control de calidad', await app.inject({
    method: 'POST', url: `/api/odts/${odt.id}/cerrar`, headers: auth('Jefe de Taller'),
    payload: { estado: 'Terminada', razon: `${marker}: fabricación aprobada`, controlCalidad: { aprobada: true, observacion: `${marker}: medidas y terminaciones revisadas` } },
  }), [200])

  // Día 4: bodega toma la venta, confirma picking, arma packing y deja DTE 52 preparado.
  const despacho = bodyData(expectStatus('Crear despacho desde venta', await app.inject({
    method: 'POST', url: '/api/despachos', headers: auth('Bodeguero'),
    payload: {
      ordenId: orden.id, tipoDespacho: 'Despacho cliente', transporte: 'Vehículo E2E',
      numeroSeguimiento: `${marker}-TRACK-01`, montoEnvio: 4500, contacto: 'Recepción E2E',
      emailContacto: cliente.email, direccion: cliente.direccion, region: 'Metropolitana', comuna: 'Santiago', ciudad: 'Santiago',
      receptorRut: cliente.rut, receptorRazonSocial: cliente.razonSocial, receptorGiro: cliente.giro,
    },
  }), [200]))
  expectStatus('Confirmar picking', await app.inject({
    method: 'PUT', url: `/api/despachos/ordenes/${orden.id}/picking`, headers: auth('Bodeguero'),
    payload: { items: orden.items.map(item => ({ itemId: item.id, confirmado: true, observacion: `${marker}: picking validado` })) },
  }), [200])
  expectStatus('Registrar packing', await app.inject({
    method: 'PUT', url: `/api/despachos/ordenes/${orden.id}/packing`, headers: auth('Bodeguero'),
    payload: {
      despachoId: despacho.id, bultoNumero: `${marker}-B1`, bultoPeso: 4.25,
      bultoObservacion: `${marker}: embalaje validado`,
      items: orden.items.map(item => ({ itemId: item.id, nEntregados: item.cantidad })),
    },
  }), [200])
  const guia = expectStatus('Preparar guía DTE 52', await app.inject({
    method: 'POST', url: '/api/despachos/guias', headers: auth('Bodeguero'),
    payload: {
      ordenId: orden.id, despachoId: despacho.id, indTraslado: 1, tipoDespacho: 2, borrador: true,
      items: orden.items.map(item => ({ nombre: item.nombre, descripcion: item.descripcion, cantidad: item.cantidad, unidad: 'un', precio: item.precioUnitario })),
    },
  }), [200])
  for (const estado of ['Patio', 'Didáctico', 'Reparto', 'Entregado']) {
    expectStatus(`Tracking ${estado}`, await app.inject({
      method: 'POST', url: `/api/despachos/${despacho.id}/tracking`, headers: auth('Bodeguero'),
      payload: { estado, transporte: 'Vehículo E2E', ubicacion: `${marker}: ${estado}`, observacion: `${marker}: hito de seguimiento` },
    }), [200])
  }

  // El despacho aislado no altera ni inventa una venta; queda como expediente separado de bodega.
  const despachoAislado = bodyData(expectStatus('Crear despacho aislado', await app.inject({
    method: 'POST', url: '/api/despachos', headers: auth('Bodeguero'),
    payload: {
      origenTipo: 'manual', tipoDespacho: 'Traslado excepcional', transporte: 'Vehículo E2E',
      numeroSeguimiento: `${marker}-AISLADO`, motivoOperacion: `${marker}: retiro operativo sin venta`,
      contacto: 'Bodega destino', direccion: 'Av. Operaciones 99', region: 'Metropolitana', comuna: 'Santiago', ciudad: 'Santiago',
      items: [{ nombre: `Material operativo ${marker}`, cantidad: 1, unidad: 'un', precio: 0 }],
    },
  }), [200]))
  const guiaAislada = expectStatus('Preparar guía aislada', await app.inject({
    method: 'POST', url: '/api/despachos/guias', headers: auth('Bodeguero'),
    payload: {
      despachoId: despachoAislado.id, origenTipo: 'manual', indTraslado: 5, tipoDespacho: 2, borrador: true,
      receptor: { razonSocial: 'Traslado interno de prueba', direccion: 'Av. Operaciones 99', comuna: 'Santiago', ciudad: 'Santiago' },
      items: [{ nombre: `Material operativo ${marker}`, cantidad: 1, unidad: 'un', precio: 0 }],
    },
  }), [200])

  // Día 5: caja cobra y cierra. La venta CRM queda ganada solo después de estar aprobada y vinculada.
  const turno = expectStatus('Abrir turno de caja', await app.inject({
    method: 'POST', url: '/api/caja/turno', headers: auth('Cajero'), payload: { cajaId: caja.id },
  }), [201])
  const total = totalOrden(orden)
  const nDoc = `${marker}-PAGO-1`
  const documentoCaja = expectStatus('Registrar documento de cobro', await app.inject({
    method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/documento`, headers: auth('Cajero'),
    payload: { monto: total, documento: 'Boleta semana E2E', nDoc, tipoDocumento: 'Boleta' },
  }), [201])
  const pagoCaja = expectStatus('Registrar pago de caja', await app.inject({
    method: 'POST', url: `/api/caja/cobranza/orden/${orden.id}/pago`, headers: auth('Cajero'),
    payload: { monto: total, medioPago: 'Transferencia', documento: 'Boleta semana E2E', nDoc, tipoDocumento: 'Boleta' },
  }), [201])
  const cierre = expectStatus('Cerrar turno de caja', await app.inject({
    method: 'POST', url: `/api/caja/turno/${turno.id}/cerrar`, headers: auth('Cajero'),
    payload: { obs: `${marker}: cierre de semana`, conteo: { efectivo: 0, debito: 0, credito: 0, transferencia: total, chequeDia: 0, chequeFecha: 0, webpay: 0, transbank: 0, otros: 0 } },
  }), [200])
  const crmCerrado = expectStatus('Cerrar CRM como ganado', await app.inject({
    method: 'POST', url: `/api/crm/${crm.id}/transiciones`, headers: auth('Vendedor'),
    payload: { etapa: 'CERRADO', resultadoCierre: 'GANADO', motivo: `${marker}: pago y entrega confirmados` },
  }), [200])

  // Se valida la separación entre NC interna (sin DTE) y NC SII (referencia DTE emitido).
  const ventaNcInterna = bodyData(expectStatus('Crear venta para NC interna', await app.inject({
    method: 'POST', url: '/api/ventas', headers: auth('Vendedor'),
    payload: { tipo: 'Normal', clienteId: cliente.id, observaciones: `${marker}: devolución interna sin DTE`, items: [{ productoId: inventariado.id, cantidad: 1, precioUnitario: 15000 }] },
  }), [201]))
  const ordenNcInterna = await app.prisma.orden.findUnique({ where: { id: ventaNcInterna.id }, include: { items: { where: { eliminado: false } } } })
  const notaInterna = expectStatus('Crear nota de crédito interna', await app.inject({
    method: 'POST', url: '/api/notas-internas', headers: auth('Facturador'),
    payload: { ordenId: ordenNcInterna.id, motivo: `${marker}: devolución antes de emitir DTE`, items: [{ ordenItemId: ordenNcInterna.items[0].id, cantidad: 1 }] },
  }), [201])

  const dteReferencia = await app.prisma.factDocumento.findFirst({
    where: { tipoDte: { in: [33, 39] }, estado: { in: ['emitido', 'enviado', 'aceptado'] }, folio: { not: null } },
    orderBy: { id: 'desc' },
  })
  let notaCreditoSii = null
  if (dteReferencia) {
    notaCreditoSii = expectStatus('Crear borrador Nota de Crédito SII', await app.inject({
      method: 'POST', url: '/api/facturacion/documentos', headers: auth('Facturador'),
      payload: {
        clienteId: dteReferencia.clienteId, ordenId: dteReferencia.ordenId, tipoDte: 61,
        receptor: dteReferencia.receptor,
        items: [{ nombre: `${marker}: corrección parcial`, cantidad: 1, unidad: 'un', precio: 1 }],
        referencias: [{ docLocalId: dteReferencia.id, tipoDocRef: dteReferencia.tipoDte, folioRef: dteReferencia.folio, codRef: 3, razon: `${marker}: corrección de monto controlada` }],
      },
    }), [201])
    // Esta simulación comprueba la preparación y referencia de la NC, pero no
    // invoca emisión. Un entorno local puede contener un certificado/CAF de
    // certificación y llamar al endpoint consumiría un folio de prueba o
    // intentaría contactar al SII, contradiciendo el propósito del recorrido.
  }

  const guiaDte = await app.prisma.factDocumento.findFirst({ where: { guiaDespachoId: guia.guia.id }, select: { id: true, estado: true, folio: true, trackId: true } })
  if (!guiaDte || guiaDte.estado !== 'borrador' || guiaDte.folio !== null || guiaDte.trackId !== null) {
    throw new Error('La guía DTE 52 de la simulación debe quedar como borrador sin folio ni tracking SII')
  }

  // Pendiente intencional: oportunidad que sigue en seguimiento para la agenda semanal.
  const pendiente = expectStatus('Crear pendiente CRM semanal', await app.inject({
    method: 'POST', url: '/api/crm', headers: auth('Vendedor'),
    payload: {
      nombre: `Pendiente ${marker}`, rsocial: `Pendiente ${marker}`, rut: `${marker}-PEND`,
      email: `${marker.toLowerCase()}-pendiente@plastimar.test`, telefono: '+56900000001',
      canalVenta: 'PROSPECCION_DIRECTA', tipoVenta: 'COTIZACION_SIMPLE', prioridad: 'Media',
      accion: `${marker}: contactar próxima semana`, comentarios: 'Pendiente intencional de seguimiento', origen: 'simulacion_semanal',
    },
  }), [201])
  expectStatus('Gestión pendiente CRM', await app.inject({
    method: 'POST', url: `/api/crm/${pendiente.lead.id}/gestiones`, headers: auth('Gerencia'),
    payload: { tipo: 'NOTA', resultado: `${marker}: espera respuesta de cliente`, siguienteAccion: 'Llamar en próxima semana', fechaProximo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
  }), [201])

  // Gerencia comprueba los tableros y la trazabilidad que consume la UI.
  const [trackingResponse, productividadResponse, metricasCrmResponse, facturacionResponse, matrixResponse] = await Promise.all([
    app.inject({ method: 'GET', url: `/api/despachos/${despacho.id}/tracking`, headers: auth('Gerencia') }),
    app.inject({ method: 'GET', url: '/api/odts/meta/productividad', headers: auth('Gerencia') }),
    app.inject({ method: 'GET', url: '/api/crm/metricas', headers: auth('Gerencia') }),
    app.inject({ method: 'GET', url: '/api/facturacion/documentos', headers: auth('Facturador') }),
    app.inject({ method: 'GET', url: `/api/matriz-ventas?search=${orden.nInterno}`, headers: auth('Gerencia') }),
  ])
  const tracking = expectStatus('Gerencia revisa tracking', trackingResponse, [200])
  const productividad = expectStatus('Gerencia revisa productividad', productividadResponse, [200])
  const metricasCrm = expectStatus('Gerencia revisa métricas CRM', metricasCrmResponse, [200])
  const facturacion = expectStatus('Facturación revisa documentos', facturacionResponse, [200])
  const matrix = expectStatus('Gerencia revisa matriz', matrixResponse, [200])

  const [ordenFinal, odtFinal, historialMaterial, loteFinal, despachoFinal, guiaFinal, notaInternaFinal, cierreCaja] = await Promise.all([
    app.prisma.orden.findUnique({ where: { id: orden.id } }),
    app.prisma.odt.findUnique({ where: { id: odt.id } }),
    app.prisma.tallerHistorialMaterial.findMany({ where: { odtId: odt.id }, orderBy: { id: 'asc' } }),
    app.prisma.bodegaTallerLote.findUnique({ where: { id: loteEspuma.id } }),
    app.prisma.despacho.findUnique({ where: { id: despacho.id } }),
    app.prisma.guiaDespacho.findUnique({ where: { id: guia.guia.id } }),
    app.prisma.notaCreditoInterna.findUnique({ where: { id: notaInterna.nota.id } }),
    app.prisma.cierreCaja.findUnique({ where: { turnoId: turno.id } }),
  ])
  const summary = {
    marker,
    database: 'plastimar_test',
    simulacion: 'Eventos creados ahora y etiquetados como Día 1 a Día 5; no se retrofecharon transacciones.',
    orden: { id: orden.id, nInterno: orden.nInterno, estadoPago: ordenFinal.estadoPago, estadoEntrega: ordenFinal.estadoEntrega, estadoFlujoFormal: ordenFinal.estadoFlujoFormal },
    crm: { id: crm.id, etapa: crmCerrado.etapaComercial, resultado: crmCerrado.resultadoCierre, pendienteId: pendiente.lead.id },
    taller: { odtId: odt.id, estado: odtFinal.estado, materialHistorial: historialMaterial.map(row => ({ id: row.id, egreso: row.egreso, mermaCantidad: row.mermaCantidad, loteCodigo: row.loteCodigo, calidad: row.calidad })), loteDisponible: loteFinal.cantidadDisponible },
    bodega: { despachoId: despacho.id, numeroSeguimiento: despachoFinal.numeroSeguimiento, guiaId: guiaFinal.id, guiaNumero: guiaFinal.nGuia, guiaDte: guiaDte, despachoAisladoId: despachoAislado.id, guiaAisladaId: guiaAislada.guia.id, tracking: tracking.eventos.map(evento => evento.estado) },
    caja: { turnoId: turno.id, documentoId: documentoCaja.movimiento?.id ?? documentoCaja.id, pagoId: pagoCaja.movimiento?.id ?? pagoCaja.id, cierreId: cierreCaja?.id ?? null },
    notas: { internaId: notaInterna.nota.id, internaEstado: notaInternaFinal.estado, siiBorradorId: notaCreditoSii?.id ?? null, siiReferenciaId: dteReferencia?.id ?? null },
    sii: { ambiente: 'no invocado', emitido: false, razon: 'La simulación crea borradores DTE 52 y NC SII, pero no llama endpoints de emisión ni envío; no consume CAF ni contacta al SII.' },
    vistas: { productividadTotalOdts: productividad.totalOdts, crmTotal: metricasCrm.total, documentosVisibles: facturacion.documentos?.length ?? 0, matrizFilas: matrix.items?.length ?? matrix.rows?.length ?? null },
    usuarios: Object.fromEntries(Object.entries(users).map(([label, user]) => [label, { id: user.id, role: user.role }])),
  }
  const audit = await app.prisma.auditLog.create({
    data: {
      userId: users.Gerencia.id, userEmail: users.Gerencia.email, userNombre: users.Gerencia.nombre, role: 'admin',
      method: 'SIMULATION', path: `/trazabilidad/semanal/${orden.id}`, status: 201, entity: 'e2e_weekly_operation', entityId: String(orden.id), payload: summary,
    },
  })
  console.log(JSON.stringify({ ...summary, auditLogId: audit.id }, null, 2))
} finally {
  await app.close()
}
