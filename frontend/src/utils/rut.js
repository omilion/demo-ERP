import { COMUNAS_POR_REGION } from '../data/geoLatam'

// Utilidades de validación y formateo de RUT chileno, nombres, direcciones y teléfonos.

export function normalizeRut(value) {
  return String(value || '').replace(/[.\-\s]/g, '').trim().toUpperCase()
}

export function formatRut(value) {
  const normalized = normalizeRut(value)
  if (!/^\d{6,8}[0-9K]$/.test(normalized)) return String(value || '').trim()
  const body = normalized.slice(0, -1)
  const dv = normalized.slice(-1)
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

export function isValidRut(value) {
  const rut = normalizeRut(value)
  if (!/^\d{6,8}[0-9K]$/.test(rut)) return false
  const body = rut.slice(0, -1)
  const dv = rut.slice(-1)
  if (/^0+$/.test(body)) return false

  let sum = 0
  let factor = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const expected = 11 - (sum % 11)
  const expectedDv = expected === 11 ? '0' : expected === 10 ? 'K' : String(expected)
  return expectedDv === dv
}

export function cleanLetters(value) {
  return String(value ?? '').replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]/g, '')
}

export function isValidName(value) {
  const text = String(value ?? '').trim()
  if (!text) return false
  return /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(text) && /[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/.test(text)
}

export function getRegionFromComuna(comuna) {
  if (!comuna) return ''
  const normalizada = String(comuna).trim().toLowerCase()
  for (const [region, comunas] of Object.entries(COMUNAS_POR_REGION)) {
    if (comunas.some(c => c.toLowerCase() === normalizada)) {
      return region
    }
  }
  return ''
}

export function parseDireccion(direccion) {
  if (!direccion) return { calle: '', depto: '' }
  const str = String(direccion).trim()
  const match = str.match(/^(.*?)(?:,\s*|\s+)(?:depto\.?|dpto\.?|departamento|oficina|of\.?|casa|block|n°|nro\.?)\s*(.+)$/i)
  if (match) {
    return {
      calle: match[1].trim(),
      depto: match[2].trim(),
    }
  }
  return { calle: str, depto: '' }
}

export function isValidPhone(value) {
  if (!value) return true
  const raw = String(value).trim()
  if (!raw) return true
  if (!/^\+?[\d\s\-()]+$/.test(raw)) return false
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

export function isValidEmail(value) {
  if (!value) return true
  const raw = String(value).trim()
  if (!raw) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
}

export function validateClienteData(data = {}) {
  const errors = {}

  if (!data.nombre?.trim()) {
    errors.nombre = 'El nombre es obligatorio'
  }

  if (!data.rut?.trim()) {
    errors.rut = 'El RUT es obligatorio'
  } else {
    const isChile = !data.pais || data.pais === 'Chile'
    if (isChile && !isValidRut(data.rut)) {
      errors.rut = 'RUT inválido (formato esperado: 12.345.678-K)'
    }
  }

  if (data.telefono && !isValidPhone(data.telefono)) {
    errors.telefono = 'Teléfono debe ser numérico (ej: +56 9 1234 5678)'
  }

  if (data.email) {
    const emails = String(data.email).split(/[,;]+/).map(e => e.trim()).filter(Boolean)
    const invalidEmail = emails.find(e => !isValidEmail(e))
    if (invalidEmail) {
      errors.email = `Email inválido: "${invalidEmail}"`
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

