const MAX_PLAZO_DIAS = 3650

export function sanitizeOrdenCompra(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[^A-Za-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
    .slice(0, 80)
}

export function sanitizePlazoDias(value) {
  const raw = String(value ?? '').trim()
  if (!/^\d+$/.test(raw)) return ''
  return String(Math.min(Number(raw.slice(0, 4)), MAX_PLAZO_DIAS))
}

export function plazoDiasFromLicitacion(data = {}) {
  const legacyDays = String(data.plazo ?? '').match(/\d+/)?.[0]
  return legacyDays ? sanitizePlazoDias(legacyDays) : ''
}

export function plazoLabel(data = {}) {
  const days = plazoDiasFromLicitacion(data)
  if (!days) return data.plazo || '—'
  return `${days} día${days === '1' ? '' : 's'}`
}

export function licitacionPlazoPayload(plazo) {
  return { plazo: sanitizePlazoDias(plazo) }
}
