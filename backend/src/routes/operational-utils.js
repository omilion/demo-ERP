export function parsePage(value) {
  if (value == null || value === '') return 1
  const page = parseOptionalInt(value)
  return page && page > 0 ? page : 1
}

export function parseOptionalInt(value) {
  if (value == null || value === '') return null
  const text = String(value).trim()
  if (!text) return null
  if (!/^-?\d+$/.test(text)) return null
  const parsed = Number(text)
  return Number.isInteger(parsed) ? parsed : null
}

export function parsePositiveInt(value) {
  const parsed = parseOptionalInt(value)
  return parsed && parsed > 0 ? parsed : null
}

export function parseDate(value, endOfDay = false) {
  if (value == null || value === '') return null
  const text = String(value).trim()
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number)
    const date = endOfDay
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day)
    if (
      date.getFullYear() !== year ||
      date.getMonth() + 1 !== month ||
      date.getDate() !== day
    ) return null
    return date
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

export function applyDateRange(where, field, desde, hasta) {
  const gte = parseDate(desde)
  const lte = parseDate(hasta, true)
  if ((desde && !gte) || (hasta && !lte)) return false
  if (gte || lte) {
    where[field] = {}
    if (gte) where[field].gte = gte
    if (lte) where[field].lte = lte
  }
  return true
}

export function normalizeTipoMovimiento(value) {
  if (!value) return null
  const text = String(value).trim().toLowerCase()
  if (text === 'ingreso') return 'Ingreso'
  if (text === 'egreso') return 'Egreso'
  return null
}
