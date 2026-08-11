const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MARKETPLACE_CANALES = ['París', 'Mercado Libre', 'Falabella']

const MARKETPLACE_CANALES_NORMALIZADOS = new Map(
  MARKETPLACE_CANALES.map(canal => [
    canal.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    canal,
  ])
)

export function sanitizeCommercialIdentifier(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
    .slice(0, 80)
}

export function isValidContactEmail(value) {
  return EMAIL_RE.test(String(value || '').trim())
}

export function calculateDeliveryDate({ startDate = new Date(), days, type = 'corridos' } = {}) {
  const amount = Number(days)
  if (!Number.isInteger(amount) || amount < 0 || amount > 3650) return null
  const date = new Date(startDate)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(12, 0, 0, 0)
  if (type === 'corridos') {
    date.setDate(date.getDate() + amount)
    return date
  }
  if (type !== 'habiles') return null
  let remaining = amount
  while (remaining > 0) {
    date.setDate(date.getDate() + 1)
    const weekday = date.getDay()
    if (weekday !== 0 && weekday !== 6) remaining -= 1
  }
  return date
}

export function normalizeMarketplace({ tipo, canal, comisionPct, comisionMonto, total = 0 } = {}) {
  if (String(tipo || '') !== 'Marketplace') {
    return { marketplaceCanal: null, marketplaceComisionPct: null, marketplaceComisionMonto: null }
  }
  const canalNormalizado = String(canal || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const marketplaceCanal = MARKETPLACE_CANALES_NORMALIZADOS.get(canalNormalizado)
  if (!marketplaceCanal) return { error: `Selecciona un canal Marketplace válido: ${MARKETPLACE_CANALES.join(', ')}.` }
  const pct = comisionPct === null || comisionPct === undefined || comisionPct === '' ? null : Number(comisionPct)
  const monto = comisionMonto === null || comisionMonto === undefined || comisionMonto === '' ? null : Number(comisionMonto)
  if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) return { error: 'La comisión Marketplace debe estar entre 0 y 100%.' }
  if (monto !== null && (!Number.isFinite(monto) || monto < 0)) return { error: 'El monto de comisión Marketplace no puede ser negativo.' }
  const marketplaceComisionMonto = monto ?? Math.round(Number(total || 0) * Number(pct || 0) / 100)
  if (marketplaceComisionMonto > Number(total || 0)) return { error: 'La comisión Marketplace no puede superar el total de la venta.' }
  return { marketplaceCanal, marketplaceComisionPct: pct, marketplaceComisionMonto }
}
