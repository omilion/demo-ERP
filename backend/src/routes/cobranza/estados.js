// Catálogo único para lecturas, importaciones y futuras escrituras de cobranza
// histórica. Los aliases son sólo variantes ortográficas; valores vacíos o
// semánticamente distintos no se adivinan como un estado de negocio.
export const ESTADOS_COBRANZA = Object.freeze(['CANCELADA', 'PENDIENTE', 'NULA'])

function key(value) {
  return String(value || '')
    .trim()
    .toLocaleUpperCase('es-CL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const ALIASES = new Map([
  ['CANCELADA', 'CANCELADA'],
  ['PENDIENTE', 'PENDIENTE'],
  ['NULA', 'NULA'],
])

export function normalizeEstadoCobranza(value) {
  return ALIASES.get(key(value)) || null
}

export function isEstadoCobranza(value) {
  return Boolean(normalizeEstadoCobranza(value))
}
