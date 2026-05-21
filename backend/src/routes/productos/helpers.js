export function computeEstado(p) {
  if (p.stock === 0) return 'Sin stock'
  if (p.stock < p.stockCritico) return 'Crítico'
  return 'Normal'
}

const LEGACY_FOTO_PREFIXES = [
  ['/uploads/productos/chicas/', '/uploads/fotos_chicas/'],
  ['/uploads/productos/grandes/', '/uploads/fotos_grandes/'],
]

function rewriteLegacyFotoPath(path) {
  for (const [legacy, current] of LEGACY_FOTO_PREFIXES) {
    if (path.startsWith(legacy)) return current + path.slice(legacy.length)
  }
  return path
}

export function normalizeProductoFotoUrl(value) {
  if (typeof value !== 'string' || value === '') return value

  if (value.startsWith('/')) return rewriteLegacyFotoPath(value)

  try {
    const url = new URL(value)
    const pathname = rewriteLegacyFotoPath(url.pathname)
    if (pathname === url.pathname) return value
    url.pathname = pathname
    return url.toString()
  } catch {
    return value
  }
}

export function normalizeProductoFotos(producto) {
  if (!producto || typeof producto !== 'object') return producto
  return {
    ...producto,
    fotoUrl: normalizeProductoFotoUrl(producto.fotoUrl),
    fotoUrlGrande: normalizeProductoFotoUrl(producto.fotoUrlGrande),
    fotosGaleria: normalizeProductoGaleria(producto.fotosGaleria),
  }
}

export function normalizeProductoFotoFields(data) {
  if (!data || typeof data !== 'object') return data
  const out = { ...data }
  if (Object.prototype.hasOwnProperty.call(out, 'fotoUrl')) out.fotoUrl = normalizeProductoFotoUrl(out.fotoUrl)
  if (Object.prototype.hasOwnProperty.call(out, 'fotoUrlGrande')) out.fotoUrlGrande = normalizeProductoFotoUrl(out.fotoUrlGrande)
  if (Object.prototype.hasOwnProperty.call(out, 'fotosGaleria')) out.fotosGaleria = normalizeProductoGaleria(out.fotosGaleria)
  if (!out.fotoUrl && out.fotoUrlGrande) out.fotoUrl = deriveFotoPar(out.fotoUrlGrande, 'chicas')
  if (!out.fotoUrlGrande && out.fotoUrl) out.fotoUrlGrande = deriveFotoPar(out.fotoUrl, 'grandes')
  return out
}

export function isProductoFotoUrl(value) {
  if (typeof value !== 'string') return false
  if (value === '') return true
  if (/^\/uploads\/(?:productos\/(?:chicas|grandes)|fotos_(?:chicas|grandes))\/.+/.test(value)) return true
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export function normalizeProductoGaleria(value) {
  if (value == null) return value
  const arr = Array.isArray(value) ? value : []
  return arr
    .filter(v => typeof v === 'string' && v.trim())
    .map(v => normalizeProductoFotoUrl(v.trim()))
    .filter(isProductoFotoUrl)
}

function deriveFotoPar(value, target) {
  const normalized = normalizeProductoFotoUrl(value)
  if (typeof normalized !== 'string') return normalized
  const pairs = target === 'chicas'
    ? [['/fotos_grandes/', '/fotos_chicas/'], ['/productos/grandes/', '/productos/chicas/']]
    : [['/fotos_chicas/', '/fotos_grandes/'], ['/productos/chicas/', '/productos/grandes/']]
  for (const [from, to] of pairs) {
    if (normalized.includes(from)) return normalized.replace(from, to)
  }
  return normalized
}
