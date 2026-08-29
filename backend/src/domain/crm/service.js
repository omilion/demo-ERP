import {
  CRM_CONFIRMACIONES,
  CRM_ETAPAS,
  CRM_MOTIVOS_PERDIDA,
  CRM_RESULTADOS,
  CRM_TIPOS_GESTION,
  CRM_TRANSICIONES,
  legacyEstadoForEtapa,
  normalizeEtapa,
  normalizeResultado,
} from './constants.js'
import { applyVentaStockDeltas, buildStockDeltasFromItems, isVentaDirectaStockTipo } from '../../routes/ventas/stock.js'
import { autoNotifyTaller } from '../../routes/pasar-taller/service.js'

const DAY_MS = 24 * 60 * 60 * 1000

export function businessDaysBetween(fromValue, toValue = new Date()) {
  const from = new Date(fromValue)
  const to = new Date(toValue)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return 0
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)
  let days = 0
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1)
    const weekday = cursor.getDay()
    if (weekday !== 0 && weekday !== 6 && cursor <= end) days++
  }
  return days
}

export function semaforoForCrm(crm, now = new Date()) {
  // El semáforo es una herramienta de gestión, no una etiqueta para datos
  // importados. Solo corre en oportunidades activas con responsable vigente.
  if (crm.esHistorico || crm.etapaComercial === CRM_ETAPAS.CERRADO || crm.estado === '3' || !crm.vendedorId) {
    return { semaforo: null, diasSinGestion: null }
  }
  const base = crm.ultimaGestionAt || crm.fechaCotizacion || crm.fecha || crm.createdAt
  const diasSinGestion = base ? businessDaysBetween(base, now) : 0
  const semaforo = diasSinGestion >= 10 ? 'ROJO' : diasSinGestion >= 5 ? 'AMARILLO' : 'NORMAL'
  return { semaforo, diasSinGestion }
}

function validationError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

// CU-03: la venta se crea por lo ADJUDICADO, no por lo cotizado.
//
//   null -> no se registro adjudicacion: se vende la cantidad cotizada
//   0    -> la linea no fue adjudicada: no pasa a la venta
//   N    -> se vende N
//
// El legacy ya lo modelaba (cotizacion_licitacion_items.cantAdjudicados) y el
// CRM que lo reemplaza no, de modo que aprobar una adjudicacion parcial creaba
// la venta por el total cotizado. Hay 221 lineas parciales en 64 cotizaciones.
//
// Se distingue null de 0 -a diferencia del default 0 del legacy- porque "todavia
// no registro la adjudicacion" y "no me adjudicaron nada" llevan a ventas
// distintas: la primera se vende completa, la segunda no se vende.
export function resolverItemsAdjudicados(items = []) {
  return items
    .filter(item => item.cantAdjudicados === null || item.cantAdjudicados === undefined || item.cantAdjudicados > 0)
    .map(item => ({ ...item, cantidad: item.cantAdjudicados ?? item.cantidad }))
}

// Faltaban COMPRA_AGIL y PROSPECCION_DIRECTA, que son canales validos del CRM
// (ver CRM_CANALES). Al no estar mapeados caian al 'Normal' del fallback, con
// lo que una compra agil ganada quedaba indistinguible de una venta comun y
// ademas se contaba como venta de mostrador en los reportes, que agrupan
// 'Normal' dentro de TIPOS_VENTA_MOSTRADOR.
//
// El defecto es latente, no historico: al 28-08-2026 el CRM no tiene ninguna
// oportunidad con estos canales ni ninguna cerrada como GANADO, porque todo lo
// cargado viene de la migracion (WEB y LICITACION). Habria aparecido la primera
// vez que se ganara una compra agil, que es justo lo que esta por empezar.
const CANAL_TO_TIPO_ORDEN = {
  WEB: 'Venta Web',
  SALA: 'Venta Sala',
  LICITACION: 'Licitación',
  COMPRA_AGIL: 'Compra Ágil',
  // La prospeccion directa termina en una venta comun: lo que la distingue es
  // el origen de la oportunidad, que queda registrado en el CRM, no el tipo.
  PROSPECCION_DIRECTA: 'Normal',
}

function tipoOrdenForCanal(canalVenta) {
  return CANAL_TO_TIPO_ORDEN[String(canalVenta || '').toUpperCase()] || 'Normal'
}

// Reutilizado por POST /:id/convertir-cliente y por el cierre GANADO: mismo
// criterio de match (RUT exacto, case-insensitive) y de creacion.
export async function resolveOrCreateClienteForCrm(tx, crm) {
  const cleanRut = String(crm.rut || '').trim()
  if (!cleanRut) throw validationError('La venta requiere el RUT del cliente antes de poder cerrarse como ganada')
  const existing = await tx.cliente.findFirst({ where: { rut: { equals: cleanRut, mode: 'insensitive' } } })
  if (existing) return existing.id
  const clientName = String(crm.rsocial || crm.nombre || '').trim()
  if (!clientName) throw validationError('La venta requiere nombre o razón social del cliente antes de poder cerrarse como ganada')
  const created = await tx.cliente.create({
    data: {
      rut: cleanRut,
      nombre: clientName,
      email: crm.email ? String(crm.email).trim() : null,
      telefono: crm.telefono ? String(crm.telefono).trim() : null,
      activo: true,
    },
  })
  return created.id
}

// Garantiza que una oportunidad GANADA quede conectada a una Orden real del ERP.
// Nunca crea una orden vacia: la orden debe nacer desde su flujo comercial.
export async function ensureOrdenForGanado(tx, crm, actor = {}, now = new Date()) {
  if (crm.ordenId) return { ordenId: crm.ordenId, clienteId: crm.clienteId ?? null }

  const folio = String(crm.ncotizacion || '').trim()
  if (/^\d{1,9}$/.test(folio)) {
    const matched = await tx.orden.findFirst({ where: { nInterno: parseInt(folio, 10) }, select: { id: true, clienteId: true } })
    if (matched) return { ordenId: matched.id, clienteId: matched.clienteId ?? crm.clienteId ?? null }
  }

  throw validationError('No se puede cerrar como GANADA sin una orden ERP vinculada. Crea o vincula la venta desde el flujo correspondiente antes de cerrar la oportunidad.', 409)

}

// Convierte una cotizacion CRM en Orden solo al aprobarla. La cotizacion y sus
// items existen antes, pero la Matriz de Ventas solo ve la Orden resultante.
async function createOrdenFromCrmCotizacion(tx, crm, actor = {}) {
  const cotizacion = await tx.crmCotizacion.findUnique({ where: { crmId: crm.id }, include: { items: true } })
  if (!cotizacion) return null
  if (crm.ordenId) return { id: crm.ordenId, clienteId: crm.clienteId }
  if (!crm.clienteId) throw validationError('La cotizacion CRM no tiene cliente vinculado')
  if (!cotizacion.items.length) throw validationError('La cotizacion CRM no tiene productos')
  const cliente = await tx.cliente.findUnique({ where: { id: crm.clienteId }, select: { id: true, activo: true, rut: true } })
  if (!cliente?.activo) throw validationError('El cliente debe estar activo para aprobar la venta', 409)
  const productIds = cotizacion.items.map(item => item.productoId)
  const productos = await tx.producto.findMany({ where: { id: { in: productIds } }, select: { id: true, activo: true, codigoInterno: true, nombre: true, descripcion: true } })
  if (productos.length !== productIds.length || productos.some(producto => !producto.activo)) throw validationError('La cotizacion contiene productos inexistentes o inactivos')
  const productById = new Map(productos.map(producto => [producto.id, producto]))
  const items = resolverItemsAdjudicados(cotizacion.items).map(item => ({
    productoId: item.productoId,
    codigoInterno: item.codigoInterno || productById.get(item.productoId).codigoInterno,
    nombre: item.nombre || productById.get(item.productoId).nombre,
    descripcion: item.descripcion || productById.get(item.productoId).descripcion,
    cantidad: item.cantidad,
    precioUnitario: item.precioUnitario,
  }))
  if (!items.length) throw validationError('Ninguna linea de la cotizacion fue adjudicada: no hay venta que crear')
  const tipo = cotizacion.tipo
  if (!['Licitación', 'Venta Directa'].includes(tipo)) throw validationError('Tipo de cotizacion CRM no soportado')
  if (tipo === 'Licitación' && (!cotizacion.licitacion || !cotizacion.licitacionFecha)) throw validationError('La licitacion requiere ID y fecha para aprobarla')

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ventas.orden.n_interno'))`
  const max = await tx.orden.aggregate({ _max: { nInterno: true } })
  const vendedorId = cotizacion.vendedorId || crm.vendedorId || Number(actor.id)
  if (!vendedorId) throw validationError('La cotizacion requiere un ejecutivo asignado')
  const orden = await tx.orden.create({
    data: {
      nInterno: (max._max.nInterno || 0) + 1,
      tipo,
      clienteId: cliente.id,
      clienteSucursalId: cotizacion.clienteSucursalId,
      rutCliente: cliente.rut || crm.rut || null,
      userId: vendedorId,
      sucursalId: actor.sucursalId || null,
      creadorNombre: actor.nombre || actor.email || crm.ejecutiva || 'CRM',
      licitacion: cotizacion.licitacion || null,
      observaciones: cotizacion.observaciones || null,
      descuentoPct: cotizacion.descuentoPct || 0,
      enviosParciales: cotizacion.enviosParciales,
      montoDespacho: cotizacion.montoDespacho || 0,
      fechaPlazo: cotizacion.fechaPlazo,
      plazoEntregaDias: cotizacion.plazoEntregaDias,
      plazoEntregaTipo: cotizacion.plazoEntregaTipo,
      direccionDespacho: cotizacion.direccionDespacho,
      direccionDespachoExtra: cotizacion.direccionDespachoExtra,
      contactoDespacho: cotizacion.contactoDespacho,
      telefonoContactoDespacho: cotizacion.telefonoContactoDespacho,
      emailContactoDespacho: cotizacion.emailContactoDespacho,
      regionDespacho: cotizacion.regionDespacho,
      comunaDespacho: cotizacion.comunaDespacho,
      items: { create: items },
    },
  })
  // Al aprobar una cotización simple se convierte en Venta Directa y debe
  // ejecutar los mismos efectos operacionales de una venta creada en Nueva Venta.
  await autoNotifyTaller(tx, orden.id, actor)
  const stock = await applyVentaStockDeltas(tx, {
    deltas: isVentaDirectaStockTipo(orden.tipo) ? buildStockDeltasFromItems(items, 1) : new Map(),
    ordenId: orden.id,
    nInterno: orden.nInterno,
    tipo: orden.tipo,
    userId: actor.id,
    user: actor,
    motivo: `Venta directa ${orden.nInterno || orden.id}`,
  })
  if (stock.error) throw validationError(stock.error, stock.status || 400)
  if (tipo === 'Licitación') {
    const existing = await tx.cotizacionLicitacion.findFirst({ where: { idLicitacion: cotizacion.licitacion } })
    const data = {
      fecha: cotizacion.licitacionFecha,
      rutCliente: cliente.rut || crm.rut || '', estado: 'Pendiente',
      plazo: cotizacion.licitacionPlazo || '', referencia: cotizacion.licitacionReferencia || '', ordenCompra: cotizacion.licitacionOC || '',
      ordenId: orden.id, sucursalId: cotizacion.clienteSucursalId || null, usuario: actor.nombre || actor.email || 'CRM',
      fechaPlazo: cotizacion.fechaPlazo, plazoEntregaDias: cotizacion.plazoEntregaDias, plazoEntregaTipo: cotizacion.plazoEntregaTipo,
      enviosParciales: cotizacion.enviosParciales, montoDespacho: cotizacion.montoDespacho || 0,
    }
    // El espejo legacy conserva las dos cifras -cotizada y adjudicada-, asi que
    // se arma desde los items originales de la cotizacion: en `items` la
    // cantidad ya es la adjudicada y la parcialidad se perderia.
    const itemsEspejoLegacy = cotizacion.items.map(item => ({
      codigoInterno: item.codigoInterno || productById.get(item.productoId)?.codigoInterno || null,
      nombre: item.nombre || productById.get(item.productoId)?.nombre || null,
      descripcion: item.descripcion || productById.get(item.productoId)?.descripcion || null,
      cantidad: item.cantidad,
      precio: item.precioUnitario,
      cantAdjudicados: item.cantAdjudicados ?? item.cantidad,
    }))
    if (existing) {
      await tx.cotizacionLicitacionItem.deleteMany({ where: { cotizacionId: existing.id } })
      await tx.cotizacionLicitacion.update({ where: { id: existing.id }, data: { ...data, items: { create: itemsEspejoLegacy } } })
    } else {
      await tx.cotizacionLicitacion.create({ data: { idLicitacion: cotizacion.licitacion, ...data, items: { create: itemsEspejoLegacy } } })
    }
  }
  return orden
}

export function validateTransition(current, payload, { isAdmin = false } = {}) {
  const currentStage = normalizeEtapa(current.etapaComercial, current.estado, current.ncotizacion)
  const targetStage = normalizeEtapa(payload.etapa)
  if (!payload.etapa || targetStage === CRM_ETAPAS.PENDIENTE_CLASIFICACION && String(payload.etapa).toUpperCase() !== CRM_ETAPAS.PENDIENTE_CLASIFICACION) {
    throw validationError('Etapa CRM inválida')
  }
  const classification = currentStage === targetStage && targetStage === CRM_ETAPAS.CERRADO && payload.resultadoCierre && normalizeResultado(payload.resultadoCierre) !== current.resultadoCierre
  if (currentStage === targetStage && !classification) return { currentStage, targetStage, noChange: true }
  if (!classification && !CRM_TRANSICIONES[currentStage]?.includes(targetStage)) throw validationError(`Transición no permitida: ${currentStage} → ${targetStage}`)

  const motivo = String(payload.motivo || '').trim()
  const detalle = String(payload.detalle || '').trim()
  const resultado = normalizeResultado(payload.resultadoCierre)

  if (currentStage === CRM_ETAPAS.CERRADO) {
    if (!isAdmin) throw validationError('Solo una jefatura puede reabrir un caso cerrado', 403)
    if (motivo.length < 5) throw validationError('La reapertura requiere un motivo de al menos 5 caracteres')
  }

  if (targetStage === CRM_ETAPAS.VENTA_APROBADA) {
    const confirmation = String(payload.confirmacionTipo || '').toUpperCase()
    if (!CRM_CONFIRMACIONES.includes(confirmation)) throw validationError('La venta aprobada requiere un tipo de confirmación válido')
  }

  if (targetStage === CRM_ETAPAS.CERRADO) {
    if (!resultado || resultado === CRM_RESULTADOS.SIN_CLASIFICAR) throw validationError('El cierre requiere resultado GANADO o PERDIDO')
    if (resultado === CRM_RESULTADOS.GANADO && currentStage !== CRM_ETAPAS.VENTA_APROBADA && !classification) throw validationError('Una venta debe estar aprobada antes de cerrarse como ganada')
    if (resultado === CRM_RESULTADOS.PERDIDO) {
      const lossReason = String(payload.motivoPerdida || '').toUpperCase()
      if (!CRM_MOTIVOS_PERDIDA.includes(lossReason)) throw validationError('Selecciona un motivo de pérdida válido')
      if (lossReason === 'OTRO' && detalle.length < 3) throw validationError('Detalla el motivo de pérdida')
    }
  } else if (payload.resultadoCierre) {
    throw validationError('El resultado de cierre solo se registra al cerrar')
  }

  return { currentStage, targetStage, resultado, motivo, detalle, classification }
}

export async function transitionCrm(prisma, crmId, payload, actor = {}, options = {}) {
  return prisma.$transaction(async tx => {
    const current = await tx.crmRegistro.findUnique({ where: { id: crmId } })
    if (!current) throw validationError('Registro CRM no encontrado', 404)
    const validation = validateTransition(current, payload, options)
    if (validation.noChange) return current

    const now = options.now || new Date()
    const reopening = validation.currentStage === CRM_ETAPAS.CERRADO
    const data = {
      etapaComercial: validation.targetStage,
      estado: legacyEstadoForEtapa(validation.targetStage),
      estadoCambiadoAt: now,
    }
    if (validation.targetStage === CRM_ETAPAS.VENTA_APROBADA) {
      const orden = await createOrdenFromCrmCotizacion(tx, current, actor)
      if (orden) {
        data.ordenId = orden.id
        data.clienteId = orden.clienteId
      }
      data.ventaAprobadaAt = current.ventaAprobadaAt || now
      data.confirmacionTipo = String(payload.confirmacionTipo).toUpperCase()
      data.confirmacionReferencia = String(payload.confirmacionReferencia || '').trim() || null
    }
    if (validation.targetStage === CRM_ETAPAS.CERRADO) {
      data.resultadoCierre = validation.resultado
      data.cerradoAt = now
      data.motivoPerdida = validation.resultado === CRM_RESULTADOS.PERDIDO ? String(payload.motivoPerdida).toUpperCase() : null
      data.motivoPerdidaDetalle = validation.resultado === CRM_RESULTADOS.PERDIDO ? validation.detalle || null : null
      // Los registros historicos (import legacy) ya reflejan un desenlace pasado:
      // clasificarlos como GANADO no debe generar una Orden nueva en el ERP vivo.
      if (validation.resultado === CRM_RESULTADOS.GANADO && !current.esHistorico) {
        const linked = await ensureOrdenForGanado(tx, current, actor, now)
        data.ordenId = linked.ordenId
        if (linked.clienteId) data.clienteId = linked.clienteId
      }
    } else if (reopening) {
      // El resultado vigente se limpia; el cierre anterior permanece en CrmEstadoHistorial.
      data.resultadoCierre = null
      data.motivoPerdida = null
      data.motivoPerdidaDetalle = null
      data.cerradoAt = null
    }

    const updated = await tx.crmRegistro.update({ where: { id: crmId }, data })
    await tx.crmEstadoHistorial.create({
      data: {
        crmId,
        estadoAnterior: validation.currentStage,
        estadoNuevo: validation.targetStage,
        resultadoCierre: validation.targetStage === CRM_ETAPAS.CERRADO ? validation.resultado : null,
        motivo: validation.motivo || (validation.resultado === CRM_RESULTADOS.PERDIDO ? String(payload.motivoPerdida).toUpperCase() : null),
        detalle: validation.detalle || null,
        actorId: Number(actor.id) || null,
        actorNombre: actor.nombre || actor.email || 'Sistema',
        origen: options.origen || 'manual',
      },
    })
    return updated
  })
}

export async function createCrmGestion(prisma, crmId, payload, actor = {}, options = {}) {
  const tipo = String(payload.tipo || '').toUpperCase()
  if (!CRM_TIPOS_GESTION.includes(tipo)) throw validationError('Tipo de gestión inválido')
  const resultado = String(payload.resultado || '').trim()
  if (!resultado) throw validationError('Indica el resultado de la gestión')
  const realizadaAt = payload.realizadaAt ? new Date(payload.realizadaAt) : new Date()
  if (Number.isNaN(realizadaAt.getTime())) throw validationError('Fecha de gestión inválida')
  const fechaProximo = payload.fechaProximo ? new Date(payload.fechaProximo) : null
  if (fechaProximo && Number.isNaN(fechaProximo.getTime())) throw validationError('Fecha de próximo contacto inválida')

  return prisma.$transaction(async tx => {
    const crm = await tx.crmRegistro.findUnique({ where: { id: crmId }, select: { id: true, vendedorId: true } })
    if (!crm) throw validationError('Registro CRM no encontrado', 404)
    const gestion = await tx.crmGestion.create({
      data: {
        crmId,
        tipo,
        realizadaAt,
        resultado,
        siguienteAccion: String(payload.siguienteAccion || '').trim() || null,
        fechaProximo,
        responsableId: Number(payload.responsableId) || crm.vendedorId || null,
        creadoPorId: Number(actor.id) || null,
        creadoPorNombre: actor.nombre || actor.email || 'Sistema',
        origen: options.origen || 'manual',
      },
    })
    await tx.crmRegistro.update({
      where: { id: crmId },
      data: {
        ultimaGestionAt: realizadaAt,
        fechaProximo,
        accion: String(payload.siguienteAccion || '').trim() || null,
        resultado,
      },
    })
    return gestion
  })
}

export function addSemaforo(rows, now = new Date()) {
  return rows.map(row => ({ ...row, ...semaforoForCrm(row, now) }))
}

export async function approveCrmFromOrderPayment(prisma, ordenId, { medioPago, referencia, actor = {}, now = new Date() } = {}) {
  const rows = await prisma.crmRegistro.findMany({
    where: {
      ordenId,
      etapaComercial: { notIn: [CRM_ETAPAS.VENTA_APROBADA, CRM_ETAPAS.CERRADO] },
    },
    select: { id: true, etapaComercial: true },
  })
  const confirmation = String(medioPago || '').toLowerCase() === 'webpay' ? 'WEBPAY' : 'PAGO'
  for (const crm of rows) {
    await prisma.crmRegistro.update({
      where: { id: crm.id },
      data: {
        etapaComercial: CRM_ETAPAS.VENTA_APROBADA,
        estado: legacyEstadoForEtapa(CRM_ETAPAS.VENTA_APROBADA),
        estadoCambiadoAt: now,
        ventaAprobadaAt: now,
        confirmacionTipo: confirmation,
        confirmacionReferencia: String(referencia || '').trim() || null,
      },
    })
    await prisma.crmEstadoHistorial.create({
      data: {
        crmId: crm.id,
        estadoAnterior: crm.etapaComercial,
        estadoNuevo: CRM_ETAPAS.VENTA_APROBADA,
        motivo: `Pago confirmado${medioPago ? ` vía ${medioPago}` : ''}`,
        actorId: Number(actor.id) || null,
        actorNombre: actor.nombre || actor.email || 'Caja',
        origen: confirmation === 'WEBPAY' ? 'webpay' : 'pago_caja',
      },
    })
  }
  return rows.length
}

export async function linkCrmToOrder(prisma, orden) {
  if (!orden?.id || !orden?.nInterno) return 0
  const result = await prisma.crmRegistro.updateMany({
    where: { ncotizacion: String(orden.nInterno), ordenId: null },
    data: { ordenId: orden.id, clienteId: orden.clienteId || undefined },
  })
  return result.count
}

export async function approveCrmFromPurchaseOrder(prisma, orden, ocReference, actor = {}, now = new Date()) {
  const reference = String(ocReference || '').trim()
  if (!orden?.id || !reference) return 0
  const rows = await prisma.crmRegistro.findMany({
    where: {
      OR: [{ confirmacionReferencia: reference }, { ncotizacion: reference }],
      etapaComercial: { not: CRM_ETAPAS.CERRADO },
    },
    select: { id: true, etapaComercial: true },
  })
  for (const crm of rows) {
    await prisma.crmRegistro.update({
      where: { id: crm.id },
      data: {
        ordenId: orden.id,
        clienteId: orden.clienteId || undefined,
        etapaComercial: CRM_ETAPAS.VENTA_APROBADA,
        estado: legacyEstadoForEtapa(CRM_ETAPAS.VENTA_APROBADA),
        estadoCambiadoAt: now,
        ventaAprobadaAt: now,
        confirmacionTipo: 'OC',
        confirmacionReferencia: reference,
      },
    })
    if (crm.etapaComercial !== CRM_ETAPAS.VENTA_APROBADA) {
      await prisma.crmEstadoHistorial.create({ data: { crmId: crm.id, estadoAnterior: crm.etapaComercial, estadoNuevo: CRM_ETAPAS.VENTA_APROBADA, motivo: `OC ${reference} procesada`, actorId: Number(actor.id) || null, actorNombre: actor.nombre || actor.email || 'Ventas web', origen: 'orden_compra' } })
    }
  }
  return rows.length
}

export function elapsedDays(from, to = new Date()) {
  return Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / DAY_MS)
}
