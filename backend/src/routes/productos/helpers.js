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
  }
}

export function normalizeProductoFotoFields(data) {
  if (!data || typeof data !== 'object') return data
  const out = { ...data }
  if (Object.prototype.hasOwnProperty.call(out, 'fotoUrl')) out.fotoUrl = normalizeProductoFotoUrl(out.fotoUrl)
  if (Object.prototype.hasOwnProperty.call(out, 'fotoUrlGrande')) out.fotoUrlGrande = normalizeProductoFotoUrl(out.fotoUrlGrande)
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
