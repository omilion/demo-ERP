// Constantes y funciones puras compartidas entre DespachosPage.jsx (listas) y
// las paginas de formulario de despachos/guias. Componentes JSX compartidos
// viven en shared-ui.jsx (fast-refresh exige no mezclar ambos en un archivo).
import { toast } from '../../store/notif'

export const emptyDespacho = {
  ordenId: '',
  odtId: '',
  interno: '',
  plazoEntrega: '',
  fechaInterno: '',
  fechaEntrega: '',
  tipoDespacho: '',
  transporte: '',
  numeroSeguimiento: '',
  montoEnvio: '',
  direccion: '',
  contacto: '',
  region: '',
  comuna: '',
  parcial: false,
  tieneMulta: false,
}

export const DESPACHO_MODO_OPTS = [
  ['ninguno', 'Sin despacho todavía (queda pendiente)'],
  ['existente', 'Usar despacho existente'],
  ['nuevo', 'Crear despacho nuevo'],
]

export const TRACKING_ESTADOS = ['Preparado', 'En ruta', 'Entregado', 'Incidencia', 'Reprogramado', 'Retenido', 'Devuelto']
export const INCIDENT_TYPES = ['Retraso', 'Cliente ausente', 'Direccion incorrecta', 'Producto faltante', 'Producto danado', 'Transporte', 'Documentacion', 'Otro']

export function trackingTone(estado) {
  if (estado === 'Entregado') return 'green'
  if (estado === 'Incidencia' || estado === 'Devuelto') return 'red'
  if (estado === 'En ruta' || estado === 'Preparado') return 'blue'
  if (estado === 'Reprogramado' || estado === 'Retenido') return 'amber'
  return 'gray'
}

export function packingResumen(row) {
  if (row?.packing) return row.packing
  const items = row?.itemsDetalle || []
  const total = items.reduce((sum, item) => sum + Number(item.cantidad || 0), 0)
  const entregados = items.reduce((sum, item) => sum + Number(item.entregados || 0), 0)
  const pendientes = Math.max(0, total - entregados)
  const pct = total > 0 ? Math.round((entregados / total) * 100) : 0
  const estado = total === 0 || entregados === 0
    ? 'Pendiente'
    : entregados >= total ? 'Completo' : 'Parcial'
  return { total, entregados, pendientes, pct, estado }
}

export function formatDays(value) {
  if (value == null) return '-'
  return `${Number(value).toLocaleString('es-CL', { maximumFractionDigits: 1 })} d`
}

export function showError(error) {
  toast.error(error.response?.data?.error || 'Error')
}

export function linkButton(color, fontWeight = 500) {
  return { background: 'transparent', border: 'none', color, cursor: 'pointer', fontSize: 12, fontWeight }
}

export const btnSm = (color) => ({ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color, fontWeight: 500 })
export const input = { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit' }
export const grid = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }
export const checkLabel = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }
export const cardStyle = { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, maxWidth: 900 }
