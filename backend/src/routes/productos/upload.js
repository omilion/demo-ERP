import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX_PRODUCT_IMAGE_BYTES = 4 * 1024 * 1024
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

function uploadsRoot() {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'))
}

function parseImageDataUrl(body = {}) {
  const raw = String(body.data || '')
  const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return { error: 'Imagen debe venir como data URL JPG, PNG o WEBP' }
  const [, mime, base64] = match
  const bytes = Buffer.from(base64, 'base64')
  if (!bytes.length) return { error: 'Imagen vacia' }
  if (bytes.length > MAX_PRODUCT_IMAGE_BYTES) return { error: 'Imagen supera maximo 4 MB' }
  return { bytes, ext: MIME_EXT[mime] }
}

export default async function uploadProductoRoute(fastify) {
  fastify.post('/upload-imagen', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'write')],
    bodyLimit: 6 * 1024 * 1024,
  }, async (request, reply) => {
    const parsed = parseImageDataUrl(request.body || {})
    if (parsed.error) return reply.code(400).send({ error: parsed.error })

    const size = request.body?.size === 'grande' ? 'grandes' : 'chicas'
    const dir = path.join(uploadsRoot(), 'productos', size)
    await mkdir(dir, { recursive: true })
    const filename = `${randomUUID()}${parsed.ext}`
    await writeFile(path.join(dir, filename), parsed.bytes)
    return reply.code(201).send({ url: `/uploads/productos/${size}/${filename}` })
  })
}
