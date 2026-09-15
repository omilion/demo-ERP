import path from 'node:path'

export const MAX_EVIDENCIA_IMAGE_BYTES = 5 * 1024 * 1024

const IMAGE_EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

export function uploadsRoot() {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'))
}

export function parseImageDataUrl(value) {
  const raw = String(value || '')
  const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) return { error: 'La evidencia debe ser una imagen JPG, PNG o WEBP' }
  const mimeType = match[1].toLowerCase()
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length) return { error: 'La imagen esta vacia' }
  if (bytes.length > MAX_EVIDENCIA_IMAGE_BYTES) return { error: 'La imagen supera el maximo de 5 MB' }
  return { bytes, mimeType, ext: IMAGE_EXT_BY_MIME[mimeType] }
}
