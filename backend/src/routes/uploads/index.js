import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'

const MIME_TYPES = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function uploadsRoot() {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'))
}

function resolveUploadPath(root, relPath) {
  const clean = String(relPath || '').replace(/^[/\\]+/, '')
  if (!clean || clean.includes('\0')) return null
  const target = path.resolve(root, clean)
  if (target !== root && !target.startsWith(root + path.sep)) return null
  return target
}

export default async function uploadsRoutes(fastify) {
  fastify.get('/*', async (request, reply) => {
    const root = uploadsRoot()
    const target = resolveUploadPath(root, request.params['*'])
    if (!target) return reply.code(403).send({ error: 'Ruta invalida' })

    let info
    try {
      info = await stat(target)
    } catch {
      return reply.code(404).send({ error: 'Archivo no encontrado' })
    }
    if (!info.isFile()) return reply.code(404).send({ error: 'Archivo no encontrado' })

    const type = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream'
    reply.header('Cache-Control', 'public, max-age=86400')
    return reply.type(type).send(createReadStream(target))
  })
}
