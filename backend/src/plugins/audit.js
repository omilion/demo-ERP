import fp from 'fastify-plugin'

const TRACKED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const SKIP_PATHS = [/^\/api\/health/, /^\/api\/auth\/login/, /^\/api\/auth\/refresh/, /^\/api\/dashboard\//]
const REDACT_KEYS = ['password', 'passwordHash', 'token', 'refreshToken', 'secret']

function entityFromPath(path) {
  const m = path.match(/^\/api\/([a-z0-9-]+)(?:\/([0-9]+))?/i)
  if (!m) return { entity: null, entityId: null }
  return { entity: m[1], entityId: m[2] ?? null }
}

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(redact)
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_KEYS.includes(k)) out[k] = '***'
    else if (v && typeof v === 'object') out[k] = redact(v)
    else out[k] = v
  }
  return out
}

async function persistAudit(prisma, row) {
  try {
    await prisma.$executeRaw`
      INSERT INTO auth.audit_log
        (user_id, user_email, user_nombre, role, method, path, status, entity, entity_id, payload, ip, user_agent)
      VALUES
        (${row.user_id}, ${row.user_email}, ${row.user_nombre}, ${row.role}, ${row.method}, ${row.path}, ${row.status},
         ${row.entity}, ${row.entity_id}, ${row.payload ? JSON.stringify(row.payload) : null}::jsonb, ${row.ip}, ${row.user_agent})
    `
  } catch (e) {
    // Never let audit failures break the request
  }
}

export default fp(async function auditPlugin(app) {
  app.addHook('onResponse', async (request, reply) => {
    try {
      if (!TRACKED_METHODS.has(request.method)) return
      if (SKIP_PATHS.some(re => re.test(request.url))) return
      const user = request.user ?? null
      const { entity, entityId } = entityFromPath(request.url)
      const payload = request.body ? redact(request.body) : null
      const ip = request.headers['x-real-ip'] || request.ip
      const ua = request.headers['user-agent']?.slice(0, 240) ?? null

      await persistAudit(app.prisma, {
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        user_nombre: user?.nombre ?? null,
        role: user?.role ?? null,
        method: request.method,
        path: request.url.slice(0, 500),
        status: reply.statusCode,
        entity,
        entity_id: entityId,
        payload,
        ip,
        user_agent: ua,
      })
    } catch {
      // silenciar errores audit
    }
  })
})
