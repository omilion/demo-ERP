export const CRM_ETAPAS = Object.freeze({
  PENDIENTE_CLASIFICACION: 'PENDIENTE_CLASIFICACION',
  COTIZACION_ENVIADA: 'COTIZACION_ENVIADA',
  SEGUIMIENTO: 'SEGUIMIENTO',
  VENTA_APROBADA: 'VENTA_APROBADA',
  CERRADO: 'CERRADO',
})

export const CRM_RESULTADOS = Object.freeze({
  GANADO: 'GANADO',
  PERDIDO: 'PERDIDO',
  SIN_CLASIFICAR: 'SIN_CLASIFICAR',
})

export const CRM_CANALES = Object.freeze(['WEB', 'SALA', 'LICITACION', 'OTRO'])
export const CRM_TIPOS_VENTA = Object.freeze(['COMPRA_AGIL', 'PUBLICA', 'PRIVADA', 'OTRA'])
export const CRM_MOTIVOS_PERDIDA = Object.freeze(['PRECIO', 'TIEMPO', 'COMPETENCIA', 'SIN_RESPUESTA', 'PROYECTO_CANCELADO', 'OTRO'])
export const CRM_CONFIRMACIONES = Object.freeze(['OC', 'PAGO', 'WEBPAY', 'OTRO'])
export const CRM_TIPOS_GESTION = Object.freeze(['LLAMADA', 'CORREO', 'REUNION', 'VISITA', 'COTIZACION', 'NOTA', 'OTRO'])

export const CRM_ETAPAS_LIST = Object.freeze([
  { id: CRM_ETAPAS.PENDIENTE_CLASIFICACION, label: 'Por clasificar', color: '#64748b', legacyEstado: '0' },
  { id: CRM_ETAPAS.COTIZACION_ENVIADA, label: 'Cotización enviada', color: '#f59e0b', legacyEstado: '0' },
  { id: CRM_ETAPAS.SEGUIMIENTO, label: 'Seguimiento', color: '#3b82f6', legacyEstado: '1' },
  { id: CRM_ETAPAS.VENTA_APROBADA, label: 'Venta aprobada', color: '#8b5cf6', legacyEstado: '2' },
  { id: CRM_ETAPAS.CERRADO, label: 'Cerrado', color: '#16a34a', legacyEstado: '3' },
])

export const CRM_TRANSICIONES = Object.freeze({
  [CRM_ETAPAS.PENDIENTE_CLASIFICACION]: [CRM_ETAPAS.COTIZACION_ENVIADA, CRM_ETAPAS.SEGUIMIENTO, CRM_ETAPAS.VENTA_APROBADA, CRM_ETAPAS.CERRADO],
  [CRM_ETAPAS.COTIZACION_ENVIADA]: [CRM_ETAPAS.SEGUIMIENTO, CRM_ETAPAS.VENTA_APROBADA, CRM_ETAPAS.CERRADO],
  [CRM_ETAPAS.SEGUIMIENTO]: [CRM_ETAPAS.COTIZACION_ENVIADA, CRM_ETAPAS.VENTA_APROBADA, CRM_ETAPAS.CERRADO],
  [CRM_ETAPAS.VENTA_APROBADA]: [CRM_ETAPAS.SEGUIMIENTO, CRM_ETAPAS.CERRADO],
  [CRM_ETAPAS.CERRADO]: [CRM_ETAPAS.COTIZACION_ENVIADA, CRM_ETAPAS.SEGUIMIENTO, CRM_ETAPAS.VENTA_APROBADA],
})

const ETAPA_SET = new Set(Object.values(CRM_ETAPAS))
const RESULTADO_SET = new Set(Object.values(CRM_RESULTADOS))

export function normalizeEtapa(value, legacyEstado = null, ncotizacion = null) {
  if (value && ETAPA_SET.has(String(value).toUpperCase())) return String(value).toUpperCase()
  const estado = value != null && /^[0-3]$/.test(String(value)) ? String(value) : String(legacyEstado ?? '')
  if (estado === '3') return CRM_ETAPAS.CERRADO
  if (estado === '2' || estado === '1') return CRM_ETAPAS.SEGUIMIENTO
  if (estado === '0' && String(ncotizacion || '').trim()) return CRM_ETAPAS.COTIZACION_ENVIADA
  return CRM_ETAPAS.PENDIENTE_CLASIFICACION
}

export function normalizeResultado(value) {
  if (!value) return null
  const normalized = String(value).toUpperCase()
  return RESULTADO_SET.has(normalized) ? normalized : undefined
}

export function legacyEstadoForEtapa(etapa) {
  return CRM_ETAPAS_LIST.find(item => item.id === etapa)?.legacyEstado || '0'
}

export function crmCatalogos() {
  return {
    etapas: CRM_ETAPAS_LIST,
    resultados: Object.values(CRM_RESULTADOS),
    canales: CRM_CANALES,
    tiposVenta: CRM_TIPOS_VENTA,
    motivosPerdida: CRM_MOTIVOS_PERDIDA,
    confirmaciones: CRM_CONFIRMACIONES,
    tiposGestion: CRM_TIPOS_GESTION,
  }
}
