import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX_BANNER_IMAGE_BYTES = 3 * 1024 * 1024
const BANNER_MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
}

function uploadsRoot() {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'))
}

async function onlyAdmin(req, reply) {
  if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
}

function cleanText(value) {
  if (value === null) return null
  if (value === undefined) return undefined
  const text = String(value).trim()
  return text || null
}

function validPublicUrl(value, { allowInternal = true } = {}) {
  if (!value) return true
  if (allowInternal && value.startsWith('/') && !value.startsWith('//')) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function parseDateOrNull(value, field) {
  if (value === undefined) return { omitted: true }
  if (!value) return { value: null }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { error: `${field} invalida` }
  return { value: date }
}

function buildBannerData(body = {}, { partial = false } = {}) {
  const data = {}
  if (!partial || body.titulo !== undefined) {
    const titulo = cleanText(body.titulo)
    if (!titulo) return { error: 'titulo requerido' }
    data.titulo = titulo
  }
  for (const field of ['subtitulo', 'imagenUrl', 'link']) {
    if (!partial || body[field] !== undefined) data[field] = cleanText(body[field])
  }
  if (data.imagenUrl && !validPublicUrl(data.imagenUrl)) return { error: 'imagenUrl debe ser http(s) o ruta interna /uploads' }
  if (data.link && !validPublicUrl(data.link)) return { error: 'link debe ser http(s) o ruta interna' }
  if (!partial || body.orden !== undefined) {
    const orden = body.orden == null || body.orden === '' ? 0 : Number.parseInt(body.orden, 10)
    if (!Number.isInteger(orden)) return { error: 'orden invalido' }
    data.orden = orden
  }
  if (!partial || body.activo !== undefined) data.activo = body.activo !== false
  for (const field of ['desde', 'hasta']) {
    if (!partial || body[field] !== undefined) {
      const parsed = parseDateOrNull(body[field], field)
      if (parsed.error) return parsed
      if (!parsed.omitted) data[field] = parsed.value
    }
  }
  return { data }
}

function parseBannerImageUpload(body = {}) {
  const raw = String(body.data || '')
  const match = raw.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return { error: 'Imagen debe venir como data URL PNG o JPG' }
  const [, mime, base64] = match
  const bytes = Buffer.from(base64, 'base64')
  if (!bytes.length) return { error: 'Imagen vacia' }
  if (bytes.length > MAX_BANNER_IMAGE_BYTES) return { error: 'Imagen supera maximo 3 MB' }
  return { bytes, ext: BANNER_MIME_EXT[mime] }
}

export default async function bannersRoutes(fastify) {
  fastify.get('/public', async () => {
    const now = new Date()
    return fastify.prisma.banner.findMany({
      where: {
        activo: true,
        AND: [
          { OR: [{ desde: null }, { desde: { lte: now } }] },
          { OR: [{ hasta: null }, { hasta: { gte: now } }] },
        ],
      },
      orderBy: { orden: 'asc' },
    })
  })

  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async () => {
    return fastify.prisma.banner.findMany({ orderBy: { orden: 'asc' } })
  })

  fastify.post('/upload', {
    preHandler: [fastify.authenticate, onlyAdmin],
    bodyLimit: 5 * 1024 * 1024,
  }, async (request, reply) => {
    const parsed = parseBannerImageUpload(request.body || {})
    if (parsed.error) return reply.code(400).send({ error: parsed.error })
    const dir = path.join(uploadsRoot(), 'banners')
    await mkdir(dir, { recursive: true })
    const filename = `${randomUUID()}${parsed.ext}`
    await writeFile(path.join(dir, filename), parsed.bytes)
    return reply.code(201).send({ url: `/uploads/banners/${filename}` })
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async (request, reply) => {
    const built = buildBannerData(request.body || {})
    if (built.error) return reply.code(400).send({ error: built.error })
    const banner = await fastify.prisma.banner.create({ data: built.data })
    return reply.code(201).send(banner)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10)
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID invalido' })
    const built = buildBannerData(request.body || {}, { partial: true })
    if (built.error) return reply.code(400).send({ error: built.error })
    try {
      return await fastify.prisma.banner.update({ where: { id }, data: built.data })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' })
      throw e
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10)
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID invalido' })
    try {
      return await fastify.prisma.banner.delete({ where: { id } })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' })
      throw e
    }
  })
}
