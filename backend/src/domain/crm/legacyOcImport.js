import { CRM_ETAPAS, CRM_RESULTADOS, normalizeEtapa } from './constants.js'

export const LEGACY_OC_ORIGIN = 'OC_ONLINE_LEGACY'
export const CRM_CARTERA_CUTOFF = new Date('2025-01-01T00:00:00.000Z')

export const LEGACY_SELLER_NAMES = Object.freeze({
  '1092': 'Cinthia Palacios',
  '1058': 'Anny Torrealba',
  '1211': 'Ana Milena Cruz',
  '1199': 'PAULINA CHINCHON',
  '1203': 'Tanya Peña Munizaga',
  '1212': 'Katherine Polanco Puente',
})

export function normalizeLegacySellerCode(value) {
  const code = String(value ?? '').trim()
  return code && code !== '0' ? code : null
}

export function legacySellerName(value) {
  return LEGACY_SELLER_NAMES[normalizeLegacySellerCode(value)] || null
}

export function mapLegacyOcStatus(status) {
  const normalized = String(status || '').trim().toLocaleLowerCase('es-CL')
  if (normalized === 'aceptada') {
    return { etapaComercial: CRM_ETAPAS.CERRADO, estado: '3', resultadoCierre: CRM_RESULTADOS.GANADO }
  }
  if (normalized === 'no aceptada') {
    return { etapaComercial: CRM_ETAPAS.CERRADO, estado: '3', resultadoCierre: CRM_RESULTADOS.PERDIDO }
  }
  if (normalized === 'cotizada') {
    return { etapaComercial: CRM_ETAPAS.COTIZACION_ENVIADA, estado: '0', resultadoCierre: null }
  }
  return { etapaComercial: CRM_ETAPAS.PENDIENTE_CLASIFICACION, estado: '0', resultadoCierre: null }
}

export function buildLegacyOcCrmData(oc, existing = null) {
  const mapped = mapLegacyOcStatus(oc.estadoCompra)
  const decisive = mapped.resultadoCierre === CRM_RESULTADOS.GANADO || mapped.resultadoCierre === CRM_RESULTADOS.PERDIDO
  const fecha = new Date(oc.fechaHora)
  const sellerCode = normalizeLegacySellerCode(oc.codigoVendedor)
  const sellerName = legacySellerName(sellerCode)
  const existingStage = existing
    ? normalizeEtapa(existing.etapaComercial, existing.estado, existing.ncotizacion)
    : null

  const data = {
    ncotizacion: String(oc.nCompra).trim(),
    ordenCompraOnlineId: oc.id,
    origenDato: LEGACY_OC_ORIGIN,
    codigoVendedorLegacy: sellerCode,
    // Cartera vigente: desde el corte acordado inclusive. Histórico: anterior.
    esHistorico: fecha < CRM_CARTERA_CUTOFF,
    ejecutiva: existing?.ejecutiva || sellerName,
    canalVenta: existing?.canalVenta || 'WEB',
    tipoVenta: existing?.tipoVenta || 'OTRA',
    resultado: existing?.resultado || oc.estadoCompra || null,
    accion: existing?.accion || oc.estadoCompra || null,
    etapaComercial: decisive ? mapped.etapaComercial : (existingStage || mapped.etapaComercial),
    estado: decisive ? mapped.estado : (existing?.estado ?? mapped.estado),
    resultadoCierre: decisive ? mapped.resultadoCierre : (existing?.resultadoCierre || null),
    ultimaGestionAt: existing?.ultimaGestionAt || existing?.fechaCotizacion || existing?.fecha || fecha,
    estadoCambiadoAt: existing?.estadoCambiadoAt || existing?.updatedAt || fecha,
  }

  if (decisive) {
    data.cerradoAt = existing?.cerradoAt || fecha
    if (mapped.resultadoCierre === CRM_RESULTADOS.GANADO) {
      data.ventaAprobadaAt = existing?.ventaAprobadaAt || fecha
      data.confirmacionTipo = existing?.confirmacionTipo || 'OTRO'
      data.confirmacionReferencia = existing?.confirmacionReferencia || String(oc.nCompra).trim()
      data.motivoPerdida = null
      data.motivoPerdidaDetalle = null
    } else {
      data.motivoPerdida = existing?.motivoPerdida || 'OTRO'
      data.motivoPerdidaDetalle = existing?.motivoPerdidaDetalle || 'Estado histórico OC Online: No aceptada'
    }
  }

  if (!existing) {
    data.fecha = fecha
    data.fechaCotizacion = oc.fechaCotizacion || fecha
    data.email = oc.emailComprador || null
    data.comentarios = oc.obsCliente || null
    data.createdAt = fecha
  }

  return data
}
