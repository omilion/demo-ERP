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
  const base = crm.ultimaGestionAt || crm.fechaCotizacion || crm.fecha || crm.createdAt
  const diasSinGestion = base ? businessDaysBetween(base, now) : 0
  const semaforo = diasSinGestion > 10 ? 'VENCIDO' : diasSinGestion === 10 ? 'ROJO' : diasSinGestion >= 5 ? 'AMARILLO' : 'NORMAL'
  return { semaforo, diasSinGestion }
}

function validationError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
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
      data.ventaAprobadaAt = current.ventaAprobadaAt || now
      data.confirmacionTipo = String(payload.confirmacionTipo).toUpperCase()
      data.confirmacionReferencia = String(payload.confirmacionReferencia || '').trim() || null
    }
    if (validation.targetStage === CRM_ETAPAS.CERRADO) {
      data.resultadoCierre = validation.resultado
      data.cerradoAt = now
      data.motivoPerdida = validation.resultado === CRM_RESULTADOS.PERDIDO ? String(payload.motivoPerdida).toUpperCase() : null
      data.motivoPerdidaDetalle = validation.resultado === CRM_RESULTADOS.PERDIDO ? validation.detalle || null : null
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
