import fp from 'fastify-plugin'

const TRACKED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const SKIP_PATHS = [/^\/api\/health/, /^\/api\/auth\/login/, /^\/api\/auth\/refresh/, /^\/api\/dashboard\//]
const REDACT_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'authorization',
  'cookie',
  'apikey',
  'api_key',
])
const SENSITIVE_ENTITIES = new Set([
  'admin',
  'caja',
  'clientes',
  'config',
  'despachos',
  'odts',
  'pagos-proveedores',
  'productos',
  'stock-ingresos',
  'usuarios',
  'ventas',
])

const ACTION_BY_METHOD = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
}

function isRedactedKey(key) {
  return REDACT_KEYS.has(String(key).toLowerCase())
}

export function sanitizePath(rawPath) {
  let url
  try {
    url = new URL(rawPath, 'http://audit.local')
  } catch {
    return String(rawPath).split('?')[0]
  }

  for (const key of [...url.searchParams.keys()]) {
    if (isRedactedKey(key)) url.searchParams.set(key, '***')
  }

  const query = url.searchParams.toString()
  return `${url.pathname}${query ? `?${query}` : ''}`
}

export function auditContextFromPath(path, method) {
  const pathname = sanitizePath(path).split('?')[0]
  const parts = pathname.split('/').filter(Boolean)
  const apiIndex = parts[0] === 'api' ? 0 : -1
  const entity = apiIndex >= 0 ? parts[apiIndex + 1] ?? null : null
  const rest = apiIndex >= 0 ? parts.slice(apiIndex + 2) : []
  const entityId = rest.find(part => /^\d+$/.test(part)) ?? null
  const nested = rest.filter(part => !/^\d+$/.test(part))
  const defaultAction = ACTION_BY_METHOD[method] ?? method.toLowerCase()
  const action = entity
    ? [entity, ...nested, defaultAction].join('.')
    : defaultAction

  return {
    entity,
    entityId,
    action,
    sensitive: entity ? SENSITIVE_ENTITIES.has(entity) : false,
  }
}

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(redact)
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (isRedactedKey(k)) out[k] = '***'
    else if (v && typeof v === 'object') out[k] = redact(v)
    else out[k] = v
  }
  return out
}

function buildPayload(request, context) {
  const route = request.routeOptions?.url ?? null
  const params = request.params && Object.keys(request.params).length ? redact(request.params) : null
  const audit = {
    action: context.action,
    sensitive: context.sensitive,
    route,
    ...(params ? { params } : {}),
  }

  if (!request.body || typeof request.body !== 'object') return { _audit: audit }
  return { ...redact(request.body), _audit: audit }
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
      const path = sanitizePath(request.url)
      const { entity, entityId, ...context } = auditContextFromPath(path, request.method)
      const payload = buildPayload(request, { entity, entityId, ...context })
      const ip = request.headers['x-real-ip'] || request.ip
      const ua = request.headers['user-agent']?.slice(0, 240) ?? null

      await persistAudit(app.prisma, {
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        user_nombre: user?.nombre ?? null,
        role: user?.role ?? null,
        method: request.method,
        path: path.slice(0, 500),
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
