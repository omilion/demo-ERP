import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

const MAX_SCREENSHOT_BYTES = 2_500_000
const MAX_REPORTS_PER_HOUR = 12
const CATEGORIES = ['error_funcional', 'ux', 'datos', 'permisos', 'integracion', 'rendimiento', 'capacitacion']
const SEVERITIES = ['baja', 'media', 'alta', 'critica']
const STATUSES = ['nuevo', 'clasificado', 'en_progreso', 'validacion_usuario', 'resuelto', 'descartado']
const PRIORITIES = ['baja', 'normal', 'alta', 'urgente']

function pilotFeedbackEnabled() {
  const configured = String(process.env.PILOT_FEEDBACK_ENABLED || '').trim().toLowerCase()
  if (configured) return ['1', 'true', 'yes', 'on'].includes(configured)
  // Nunca queda encendido por accidente en producción: debe ser habilitado por
  // variable de entorno. Desarrollo y certificación lo tienen disponible.
  return process.env.NODE_ENV !== 'production'
}

function feedbackRoot() {
  // No usar UPLOADS_DIR: /uploads es una ruta pública de recursos operativos.
  return path.resolve(process.env.FEEDBACK_STORAGE_DIR || path.join(process.cwd(), 'private-feedback'))
}

function parseDataUri(dataUri) {
  if (typeof dataUri !== 'string') return null
  const match = /^data:(image\/(?:png|jpeg));base64,([a-zA-Z0-9+/=]+)$/.exec(dataUri)
  if (!match) return null
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > MAX_SCREENSHOT_BYTES) return null
  return { buffer, mime: match[1], ext: match[1] === 'image/png' ? 'png' : 'jpg' }
}

function asOptionalText(value, max = 240) {
  if (typeof value !== 'string') return null
  const text = value.trim().slice(0, max)
  return text || null
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, '$1[REDACTADO]')
    .replace(/(password|contrase(?:ñ|n)a|token|api[_ -]?key)\s*[:=]\s*\S+/gi, '$1=[REDACTADO]')
    .trim()
}

function sanitizeErrorContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const endpoint = asOptionalText(value.endpoint, 180)
  const status = Number(value.status)
  const durationMs = Number(value.durationMs)
  if (!endpoint && !Number.isFinite(status) && !Number.isFinite(durationMs)) return null
  return {
    endpoint: endpoint?.replace(/[?&](token|key|password)=[^&]+/gi, '$1=[REDACTADO]') || null,
    status: Number.isFinite(status) ? Math.max(0, Math.min(status, 999)) : null,
    durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.min(Math.round(durationMs), 300_000)) : null,
  }
}

const createSchema = z.object({
  module: z.string().trim().min(1).max(80),
  submodule: z.string().trim().max(100).optional().nullable(),
  route: z.string().trim().min(1).max(500),
  entityType: z.string().trim().max(80).optional().nullable(),
  entityId: z.union([z.string(), z.number()]).optional().nullable(),
  relatedEntities: z.array(z.object({ type: z.string().trim().max(80), id: z.union([z.string(), z.number()]) })).max(20).optional(),
  workflowState: z.string().trim().max(100).optional().nullable(),
  flowOrigin: z.string().trim().max(80).optional().nullable(),
  externalApi: z.boolean().optional(),
  category: z.enum(CATEGORIES),
  severity: z.enum(SEVERITIES),
  note: z.string().trim().min(5, 'Describe el hallazgo con al menos 5 caracteres.').max(4000),
  expected: z.string().trim().max(2000).optional().nullable(),
  browser: z.string().trim().max(300).optional().nullable(),
  viewport: z.string().trim().max(60).optional().nullable(),
  appVersion: z.string().trim().max(120).optional().nullable(),
  annotation: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) }).optional().nullable(),
  screenshot: z.string().max(MAX_SCREENSHOT_BYTES * 1.38 + 100).optional().nullable(),
  sanitizedError: z.record(z.string(), z.unknown()).optional().nullable(),
})

const updateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  resolutionReference: z.string().trim().max(240).nullable().optional(),
  resolutionNote: z.string().trim().max(3000).nullable().optional(),
}).refine(value => Object.keys(value).length > 0, 'Indica al menos un cambio.')

function isAdmin(request) {
  return request.user?.role === 'admin'
}

function forbidden(reply) {
  return reply.code(403).send({ error: 'Solo administración puede revisar los reportes de marcha blanca.' })
}

function publicItem(item) {
  return {
    ...item,
    hasScreenshot: Boolean(item.screenshotPath),
    screenshotPath: undefined,
    screenshotMime: undefined,
    screenshotSha256: undefined,
  }
}

export default async function pilotFeedbackRoutes(fastify) {
  fastify.get('/config', { preHandler: [fastify.authenticate] }, async () => ({
    enabled: pilotFeedbackEnabled(),
    environment: process.env.NODE_ENV || 'development',
    retentionDays: Number(process.env.PILOT_FEEDBACK_RETENTION_DAYS || 90),
  }))

  fastify.post('/', { preHandler: [fastify.authenticate], bodyLimit: 3_500_000 }, async (request, reply) => {
    if (!pilotFeedbackEnabled()) return reply.code(404).send({ error: 'El feedback de marcha blanca no está habilitado en este ambiente.' })
    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Reporte inválido.' })

    const since = new Date(Date.now() - 60 * 60 * 1000)
    const [reportsLastHour, reporterProfile] = await Promise.all([
      fastify.prisma.pilotFeedback.count({ where: { userId: Number(request.user.id), createdAt: { gte: since } } }),
      // El access token no porta correo; lo recuperamos desde la cuenta vigente
      // para que el triage no dependa de datos que entregue el navegador.
      fastify.prisma.user.findUnique({ where: { id: Number(request.user.id) }, select: { nombre: true, email: true, role: true } }),
    ])
    if (reportsLastHour >= MAX_REPORTS_PER_HOUR) {
      return reply.code(429).send({ error: 'Alcanzaste el límite de 12 reportes por hora. Agrupa los hallazgos relacionados en un reporte.' })
    }

    const data = parsed.data
    const shot = data.screenshot ? parseDataUri(data.screenshot) : null
    if (data.screenshot && !shot) return reply.code(400).send({ error: 'La captura debe ser PNG/JPEG y pesar menos de 2,5 MB.' })

    const id = randomUUID()
    let screenshotPath = null
    let screenshotMime = null
    let screenshotSha256 = null
    if (shot) {
      const dir = feedbackRoot()
      await mkdir(dir, { recursive: true })
      const filename = `${id}.${shot.ext}`
      await writeFile(path.join(dir, filename), shot.buffer, { mode: 0o600 })
      screenshotPath = filename
      screenshotMime = shot.mime
      screenshotSha256 = createHash('sha256').update(shot.buffer).digest('hex')
    }

    const retentionDays = Math.max(7, Math.min(Number(process.env.PILOT_FEEDBACK_RETENTION_DAYS || 90), 365))
    const retentionUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000)
    const item = await fastify.prisma.pilotFeedback.create({
      data: {
        id,
        userId: Number(request.user.id),
        reporterName: asOptionalText(reporterProfile?.nombre || request.user.nombre, 160),
        reporterEmail: asOptionalText(reporterProfile?.email, 240),
        reporterRole: asOptionalText(reporterProfile?.role || request.user.role, 80),
        module: data.module,
        submodule: asOptionalText(data.submodule, 100),
        route: data.route,
        entityType: asOptionalText(data.entityType, 80),
        entityId: data.entityId == null ? null : String(data.entityId).slice(0, 120),
        relatedEntities: data.relatedEntities?.map(entity => ({ type: entity.type, id: String(entity.id) })) || undefined,
        workflowState: asOptionalText(data.workflowState, 100),
        flowOrigin: asOptionalText(data.flowOrigin, 80),
        externalApi: Boolean(data.externalApi),
        category: data.category,
        severity: data.severity,
        note: sanitizeText(data.note),
        expected: data.expected ? sanitizeText(data.expected) : null,
        browser: asOptionalText(data.browser, 300),
        viewport: asOptionalText(data.viewport, 60),
        appVersion: asOptionalText(data.appVersion, 120),
        annotation: data.annotation || undefined,
        screenshotPath,
        screenshotMime,
        screenshotSha256,
        redactionVersion: shot ? 'v1' : null,
        sanitizedError: sanitizeErrorContext(data.sanitizedError) || undefined,
        retentionUntil,
      },
      include: { reporter: { select: { id: true, nombre: true, email: true, role: true } } },
    })
    return reply.code(201).send({ item: publicItem(item) })
  })

  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isAdmin(request)) return forbidden(reply)
    const limit = Math.max(1, Math.min(Number(request.query?.limit) || 100, 250))
    const where = {
      ...(request.query?.status ? { status: String(request.query.status) } : {}),
      ...(request.query?.module ? { module: String(request.query.module) } : {}),
      ...(request.query?.severity ? { severity: String(request.query.severity) } : {}),
      ...(request.query?.category ? { category: String(request.query.category) } : {}),
    }
    const [items, total] = await Promise.all([
      fastify.prisma.pilotFeedback.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: limit,
        include: { reporter: { select: { id: true, nombre: true, email: true, role: true } } },
      }),
      fastify.prisma.pilotFeedback.count({ where }),
    ])
    return { items: items.map(publicItem), total }
  })

  fastify.patch('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isAdmin(request)) return forbidden(reply)
    const parsed = updateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Actualización inválida.' })
    try {
      const item = await fastify.prisma.pilotFeedback.update({
        where: { id: String(request.params.id) },
        data: {
          ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
          ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
          ...(parsed.data.assigneeId !== undefined ? { assigneeId: parsed.data.assigneeId } : {}),
          ...(parsed.data.resolutionReference !== undefined ? { resolutionReference: parsed.data.resolutionReference } : {}),
          ...(parsed.data.resolutionNote !== undefined ? { resolutionNote: sanitizeText(parsed.data.resolutionNote) } : {}),
        },
        include: { reporter: { select: { id: true, nombre: true, email: true, role: true } } },
      })
      return { item: publicItem(item) }
    } catch (error) {
      if (error?.code === 'P2025') return reply.code(404).send({ error: 'Reporte no encontrado.' })
      throw error
    }
  })

  fastify.get('/:id/captura', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isAdmin(request)) return forbidden(reply)
    const item = await fastify.prisma.pilotFeedback.findUnique({
      where: { id: String(request.params.id) },
      select: { screenshotPath: true, screenshotMime: true },
    })
    if (!item?.screenshotPath) return reply.code(404).send({ error: 'Este reporte no tiene captura.' })
    const target = path.resolve(feedbackRoot(), item.screenshotPath)
    if (!target.startsWith(feedbackRoot() + path.sep)) return reply.code(403).send({ error: 'Ruta de evidencia inválida.' })
    try {
      const info = await stat(target)
      if (!info.isFile()) throw new Error('not-file')
    } catch {
      return reply.code(404).send({ error: 'La evidencia ya no está disponible.' })
    }
    reply.header('Cache-Control', 'private, no-store')
    reply.header('X-Content-Type-Options', 'nosniff')
    return reply.type(item.screenshotMime || 'image/png').send(createReadStream(target))
  })
}
