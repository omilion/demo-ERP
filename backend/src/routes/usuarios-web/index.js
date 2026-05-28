import bcrypt from 'bcrypt'
import { createWebAccessTokenPayload } from '../../plugins/jwt.js'

const registerAttempts = new Map()
const REGISTER_WINDOW_MS = 10 * 60 * 1000
const REGISTER_MAX_ATTEMPTS = 20

const onlyAdmin = async (req, reply) => {
  if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
}

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

function cleanText(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ')
  return text || null
}

function validatePassword(value) {
  const password = String(value || '')
  if (password.length < 8) return { error: 'password debe tener al menos 8 caracteres' }
  return { password }
}

function checkRegisterThrottle(request, email) {
  const now = Date.now()
  const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown'
  const key = `${ip}:${email}`
  const attempts = (registerAttempts.get(key) || []).filter(ts => now - ts < REGISTER_WINDOW_MS)
  attempts.push(now)
  registerAttempts.set(key, attempts)
  return attempts.length <= REGISTER_MAX_ATTEMPTS
}

export default async function usuariosWebRoutes(fastify) {
  fastify.post('/register', async (request, reply) => {
    const b = request.body || {}
    const email = cleanEmail(b.email)
    const nombre = cleanText(b.nombre)
    const parsedPassword = validatePassword(b.password)
    if (!email || !nombre || parsedPassword.error) {
      return reply.code(400).send({ error: parsedPassword.error || 'email, password, nombre requeridos' })
    }
    if (!checkRegisterThrottle(request, email)) return reply.code(429).send({ error: 'Demasiados intentos de registro' })

    const passwordHash = await bcrypt.hash(parsedPassword.password, 10)
    try {
      const u = await fastify.prisma.usuarioWeb.create({
        data: {
          email,
          passwordHash,
          nombre,
          rut: cleanText(b.rut),
          telefono: cleanText(b.telefono),
          direccion: cleanText(b.direccion),
          comuna: cleanText(b.comuna),
          region: cleanText(b.region),
        },
      })
      return reply.code(201).send({ id: u.id, email: u.email, nombre: u.nombre })
    } catch (e) {
      if (e.code === 'P2002') return reply.code(409).send({ error: 'email ya registrado' })
      throw e
    }
  })

  fastify.post('/login', async (request, reply) => {
    const email = cleanEmail(request.body?.email)
    const { password } = request.body || {}
    if (!email || !password) return reply.code(400).send({ error: 'email y password requeridos' })
    const u = await fastify.prisma.usuarioWeb.findUnique({ where: { email } })
    if (!u || !u.activo) return reply.code(401).send({ error: 'credenciales invalidas' })
    const ok = await bcrypt.compare(password, u.passwordHash)
    if (!ok) return reply.code(401).send({ error: 'credenciales invalidas' })
    const token = fastify.jwt.sign(createWebAccessTokenPayload(u))
    return { token, user: { id: u.id, email: u.email, nombre: u.nombre } }
  })

  fastify.get('/', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async (request) => {
    const search = cleanText(request.query.search)
    const where = search ? {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { nombre: { contains: search, mode: 'insensitive' } },
        { rut: { contains: search, mode: 'insensitive' } },
      ],
    } : {}
    return fastify.prisma.usuarioWeb.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, nombre: true, rut: true, telefono: true,
        direccion: true, comuna: true, region: true, activo: true, createdAt: true,
      },
    })
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10)
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID invalido' })
    const b = request.body || {}
    const data = {}
    if (b.nombre !== undefined) {
      const nombre = cleanText(b.nombre)
      if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
      data.nombre = nombre
    }
    for (const f of ['rut', 'telefono', 'direccion', 'comuna', 'region']) {
      if (b[f] !== undefined) data[f] = cleanText(b[f])
    }
    if (b.activo !== undefined) data.activo = Boolean(b.activo)
    if (b.password) {
      const parsedPassword = validatePassword(b.password)
      if (parsedPassword.error) return reply.code(400).send({ error: parsedPassword.error })
      data.passwordHash = await bcrypt.hash(parsedPassword.password, 10)
    }
    try {
      return await fastify.prisma.usuarioWeb.update({ where: { id }, data })
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
      await fastify.prisma.usuarioWeb.update({ where: { id }, data: { activo: false } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' })
      throw e
    }
  })
}
