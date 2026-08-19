import { CRM_ETAPAS, CRM_RESULTADOS } from './constants.js'

export const LEGACY_LICITACION_ORIGIN = 'LICITACION_LEGACY'
export const CRM_CARTERA_CUTOFF = new Date('2025-01-01T00:00:00.000Z')

export function normalizeRut(value) {
  return String(value || '').replace(/[^0-9kK]/g, '').toUpperCase() || null
}

export function isLicitacionInCartera(licitacion, now = new Date()) {
  const fecha = licitacion?.fecha ? new Date(licitacion.fecha) : null
  return Boolean(fecha && !Number.isNaN(fecha.getTime()) && fecha >= CRM_CARTERA_CUTOFF && fecha <= now)
}

export function mapLegacyLicitacionStatus(status) {
  const normalized = String(status || '').trim().toLocaleLowerCase('es-CL')
  if (normalized === 'pendiente') return { etapaComercial: CRM_ETAPAS.COTIZACION_ENVIADA, estado: '0' }
  if (normalized === 'adjudicada') return { etapaComercial: CRM_ETAPAS.CERRADO, estado: '3', resultadoCierre: CRM_RESULTADOS.GANADO }
  if (normalized === 'no adjudicada') return { etapaComercial: CRM_ETAPAS.CERRADO, estado: '3', resultadoCierre: CRM_RESULTADOS.PERDIDO }
  return null
}

export function buildLegacyLicitacionCrmData(licitacion, cliente = null) {
  const mapped = mapLegacyLicitacionStatus(licitacion.estado)
  if (!mapped || !isLicitacionInCartera(licitacion)) return null
  const fecha = new Date(licitacion.fecha)
  const responsable = String(licitacion.usuario || '').trim() || null
  const isGanada = mapped.resultadoCierre === CRM_RESULTADOS.GANADO
  const isPerdida = mapped.resultadoCierre === CRM_RESULTADOS.PERDIDO

  return {
    ncotizacion: String(licitacion.idLicitacion || '').trim(),
    fecha,
    fechaCotizacion: fecha,
    estado: mapped.estado,
    etapaComercial: mapped.etapaComercial,
    resultadoCierre: mapped.resultadoCierre || null,
    cerradoAt: mapped.etapaComercial === CRM_ETAPAS.CERRADO ? fecha : null,
    ventaAprobadaAt: isGanada ? fecha : null,
    confirmacionTipo: isGanada ? (licitacion.ordenCompra ? 'OC' : 'OTRO') : null,
    confirmacionReferencia: isGanada ? String(licitacion.ordenCompra || licitacion.idLicitacion || '').trim() || null : null,
    motivoPerdida: isPerdida ? 'OTRO' : null,
    motivoPerdidaDetalle: isPerdida ? 'Resultado histórico de licitación: No adjudicada' : null,
    accion: licitacion.obs || null,
    comentarios: licitacion.obs || null,
    rut: licitacion.rutCliente || null,
    nombre: cliente?.nombre || null,
    rsocial: cliente?.razonSocial || cliente?.nombre || null,
    email: cliente?.email || null,
    telefono: cliente?.telefono || null,
    clienteId: cliente?.id || null,
    ordenId: licitacion.ordenId || null,
    cotizacionLicitacionId: licitacion.id,
    origenDato: LEGACY_LICITACION_ORIGIN,
    codigoVendedorLegacy: responsable,
    ejecutiva: responsable,
    canalVenta: 'LICITACION',
    tipoVenta: 'LICITACION',
    esHistorico: false,
    estadoCambiadoAt: fecha,
    ultimaGestionAt: null,
    createdAt: fecha,
  }
}
