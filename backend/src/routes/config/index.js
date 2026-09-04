const EMPRESA_FIELDS = [
  'nombre',
  'rut',
  'razonSocial',
  'giro',
  'email',
  'telefono',
  'direccion',
  'region',
  'comuna',
  'codigoEmpresa',
  'logoUrl',
  'textoPie',
  'escaneoCodigoBarrasObligatorio',
]

function cleanString(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function cleanEmpresaPayload(body = {}) {
  const data = {}
  for (const field of EMPRESA_FIELDS) {
    if (body[field] === undefined) continue
    if (field === 'codigoEmpresa') {
      const parsed = Number(body[field])
      data.codigoEmpresa = Number.isInteger(parsed) && parsed > 0 ? parsed : null
    } else if (field === 'escaneoCodigoBarrasObligatorio') {
      data.escaneoCodigoBarrasObligatorio = body[field] === true || body[field] === 'true'
    } else {
      data[field] = cleanString(body[field])
    }
  }
  return data
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('es-CL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeRut(value) {
  return String(value || '').replace(/\./g, '').replace(/-/g, '').trim().toUpperCase()
}

export function isValidRut(value) {
  const rut = normalizeRut(value)
  if (!/^\d{1,8}[0-9K]$/.test(rut)) return false
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

function validateEmpresaPayload(data, { partial = false } = {}) {
  if (!partial || data.nombre !== undefined) {
    if (!data.nombre || data.nombre.length < 4) return 'nombre debe tener al menos 4 caracteres'
  }
  if (!partial || data.rut !== undefined) {
    if (!data.rut) return 'rut requerido'
    if (!isValidRut(data.rut)) return 'rut invalido'
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'email invalido'
  if (data.codigoEmpresa !== undefined && data.codigoEmpresa !== null && (!Number.isInteger(data.codigoEmpresa) || data.codigoEmpresa <= 0)) {
    return 'codigoEmpresa debe ser un entero mayor a 0'
  }
  return null
}

function empresaOrderBy() {
  return [{ codigoEmpresa: { sort: 'asc', nulls: 'last' } }, { nombre: 'asc' }]
}

async function nextCodigoEmpresa(prisma) {
  const latest = await prisma.empresaConfig.findFirst({
    where: { codigoEmpresa: { not: null } },
    orderBy: { codigoEmpresa: 'desc' },
    select: { codigoEmpresa: true },
  })
  return Number(latest?.codigoEmpresa || 0) + 1
}

async function ensureEmpresaUnique(prisma, data, id = null) {
  const clauses = []
  if (data.nombre) clauses.push({ nombre: { equals: data.nombre, mode: 'insensitive' } })
  if (data.codigoEmpresa) clauses.push({ codigoEmpresa: data.codigoEmpresa })
  if (!clauses.length) return null
  const existing = await prisma.empresaConfig.findFirst({
    where: {
      OR: clauses,
      ...(id ? { NOT: { id } } : {}),
    },
    select: { id: true, nombre: true, codigoEmpresa: true },
  })
  if (!existing) return null
  if (data.nombre && normalizeText(existing.nombre) === normalizeText(data.nombre)) return 'nombre ya existe'
  if (data.codigoEmpresa && existing.codigoEmpresa === data.codigoEmpresa) return 'codigoEmpresa ya existe'
  return 'empresa ya existe'
}

async function createEmpresa(prisma, body = {}) {
  const data = cleanEmpresaPayload(body)
  if (data.codigoEmpresa == null) data.codigoEmpresa = await nextCodigoEmpresa(prisma)
  const validation = validateEmpresaPayload(data)
  if (validation) return { status: 400, error: validation }
  const duplicate = await ensureEmpresaUnique(prisma, data)
  if (duplicate) return { status: 409, error: duplicate }
  return { empresa: await prisma.empresaConfig.create({ data }) }
}

export default async function configRoutes(fastify) {
  // ── Empresa ────────────────────────────────────────────────────────
  fastify.get('/empresa', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'read', { allowExtra: false })],
  }, async () => {
    return fastify.prisma.empresaConfig.findFirst({ orderBy: empresaOrderBy() })
  })

  fastify.put('/empresa', { preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })] }, async (request, reply) => {
    const data = cleanEmpresaPayload(request.body || {})
    const validation = validateEmpresaPayload(data, { partial: true })
    if (validation) return reply.code(400).send({ error: validation })
    const existing = await fastify.prisma.empresaConfig.findFirst({ orderBy: empresaOrderBy() })
    if (existing) {
      const duplicate = await ensureEmpresaUnique(fastify.prisma, data, existing.id)
      if (duplicate) return reply.code(409).send({ error: duplicate })
      return fastify.prisma.empresaConfig.update({ where: { id: existing.id }, data })
    }
    const created = await createEmpresa(fastify.prisma, request.body || {})
    if (created.error) return reply.code(created.status).send({ error: created.error })
    return created.empresa
  })

  fastify.get('/empresas', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'read', { allowExtra: false })],
  }, async () => {
    return fastify.prisma.empresaConfig.findMany({ orderBy: empresaOrderBy() })
  })

  fastify.get('/empresas/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'read', { allowExtra: false })],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const empresa = await fastify.prisma.empresaConfig.findUnique({ where: { id } })
    if (!empresa) return reply.code(404).send({ error: 'Empresa no encontrada' })
    return empresa
  })

  fastify.post('/empresas', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const created = await createEmpresa(fastify.prisma, request.body || {})
    if (created.error) return reply.code(created.status).send({ error: created.error })
    return reply.code(201).send(created.empresa)
  })

  fastify.put('/empresas/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const data = cleanEmpresaPayload(request.body || {})
    const validation = validateEmpresaPayload(data, { partial: true })
    if (validation) return reply.code(400).send({ error: validation })
    const duplicate = await ensureEmpresaUnique(fastify.prisma, data, id)
    if (duplicate) return reply.code(409).send({ error: duplicate })
    try {
      return await fastify.prisma.empresaConfig.update({ where: { id }, data })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Empresa no encontrada' })
      throw e
    }
  })

  fastify.delete('/empresas/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('config', 'delete', { allowExtra: false })],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    try {
      await fastify.prisma.empresaConfig.delete({ where: { id } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Empresa no encontrada' })
      throw e
    }
  })

  // ── Firmas Email ───────────────────────────────────────────────────
  fastify.get('/firmas', { preHandler: [fastify.authenticate, fastify.rbac('config', 'read', { allowExtra: false })] }, async () => {
    return fastify.prisma.firmaEmail.findMany({ where: { activo: true }, orderBy: { alias: 'asc' } })
  })

  fastify.post('/firmas', { preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })] }, async (request, reply) => {
    const { alias, email, firma, fotoUrl } = request.body || {}
    if (!alias || !email || !firma) return reply.code(400).send({ error: 'alias, email, firma requeridos' })
    return fastify.prisma.firmaEmail.create({ data: { alias, email, firma, fotoUrl } })
  })

  fastify.put('/firmas/:id', { preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })] }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const body = request.body || {}
    const data = {}
    for (const f of ['alias', 'email', 'firma', 'fotoUrl', 'activo']) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    try { return await fastify.prisma.firmaEmail.update({ where: { id }, data }) }
    catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrada' })
      throw e
    }
  })

  fastify.delete('/firmas/:id', { preHandler: [fastify.authenticate, fastify.rbac('config', 'delete', { allowExtra: false })] }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      await fastify.prisma.firmaEmail.update({ where: { id }, data: { activo: false } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrada' })
      throw e
    }
  })

  // ── Bloqueo Página ─────────────────────────────────────────────────
  fastify.get('/bloqueos', { preHandler: [fastify.authenticate, fastify.rbac('config', 'read', { allowExtra: false })] }, async () => {
    return fastify.prisma.bloqueoPagina.findMany({ orderBy: { modulo: 'asc' } })
  })

  fastify.put('/bloqueos/:modulo', { preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })] }, async (request) => {
    const modulo = request.params.modulo
    const { estado, texto } = request.body || {}
    return fastify.prisma.bloqueoPagina.upsert({
      where: { modulo },
      create: { modulo, estado: estado || 'BLOQUEADA', texto: texto || null },
      update: { estado, texto },
    })
  })
}
