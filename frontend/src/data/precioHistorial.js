const KEY = 'plastimar_precio_historial'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}
function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

// Returns array of entries for a product code, newest first
export function getHistorial(cod) {
  return (load()[cod] || [])
}

// Adds a new price change entry
export function addCambio(cod, { precioAnterior, precioNuevo, usuario }) {
  const all = load()
  const entry = {
    fecha: new Date().toISOString(),
    precioAnterior,
    precioNuevo,
    usuario,
    pct: (((precioNuevo - precioAnterior) / precioAnterior) * 100).toFixed(1),
  }
  all[cod] = [entry, ...(all[cod] || [])]
  save(all)
  return entry
}

function seedIfEmpty() {
  const existing = load()
  if (Object.keys(existing).length > 0) return
  const seed = {
    'ESP-001': [
      { fecha: '2026-04-15T10:30:00.000Z', precioAnterior: 42500, precioNuevo: 48990, usuario: 'admin@plastimar.cl', pct: '15.3' },
      { fecha: '2026-02-01T09:00:00.000Z', precioAnterior: 39900, precioNuevo: 42500, usuario: 'admin@plastimar.cl', pct: '6.5' },
    ],
    'VIS-001': [
      { fecha: '2026-03-20T14:15:00.000Z', precioAnterior: 84900, precioNuevo: 89900, usuario: 'vendedor@plastimar.cl', pct: '5.9' },
    ],
    'COL-001': [
      { fecha: '2026-04-01T11:00:00.000Z', precioAnterior: 199900, precioNuevo: 189900, usuario: 'admin@plastimar.cl', pct: '-5.0' },
      { fecha: '2026-01-10T08:30:00.000Z', precioAnterior: 179900, precioNuevo: 199900, usuario: 'admin@plastimar.cl', pct: '11.1' },
    ],
    'LAT-001': [
      { fecha: '2026-05-01T16:45:00.000Z', precioAnterior: 114900, precioNuevo: 124900, usuario: 'admin@plastimar.cl', pct: '8.7' },
    ],
  }
  save(seed)
}
seedIfEmpty()
