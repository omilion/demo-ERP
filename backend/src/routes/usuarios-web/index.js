import bcrypt from 'bcrypt'

const onlyAdmin = async (req, reply) => {
  if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
}

export default async function usuariosWebRoutes(fastify) {
  // Endpoint público de registro (web tienda)
  fastify.post('/register', async (request, reply) => {
    const b = request.body || {}
    if (!b.email || !b.password || !b.nombre)
      return reply.code(400).send({ error: 'email, password, nombre requeridos' })
    const passwordHash = await bcrypt.hash(b.password, 10)
    try {
      const u = await fastify.prisma.usuarioWeb.create({
        data: {
          email: b.email, passwordHash, nombre: b.nombre,
          rut: b.rut || null, telefono: b.telefono || null,
          direccion: b.direccion || null, comuna: b.comuna || null, region: b.region || null,
        },
      })
      return reply.code(201).send({ id: u.id, email: u.email, nombre: u.nombre })
    } catch (e) {
      if (e.code === 'P2002') return reply.code(409).send({ error: 'email ya registrado' })
      throw e
    }
  })

  // Login web público (devuelve token simple)
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body || {}
    if (!email || !password) return reply.code(400).send({ error: 'email y password requeridos' })
    const u = await fastify.prisma.usuarioWeb.findUnique({ where: { email } })
    if (!u || !u.activo) return reply.code(401).send({ error: 'credenciales inválidas' })
    const ok = await bcrypt.compare(password, u.passwordHash)
    if (!ok) return reply.code(401).send({ error: 'credenciales inválidas' })
    const token = fastify.jwt.sign({ id: u.id, email: u.email, scope: 'web' })
    return { token, user: { id: u.id, email: u.email, nombre: u.nombre } }
  })

  // Admin: listar y gestionar
  fastify.get('/', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async (request) => {
    const { search } = request.query
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
    const id = parseInt(request.params.id, 10)
    const b = request.body || {}
    const data = {}
    for (const f of ['nombre', 'rut', 'telefono', 'direccion', 'comuna', 'region', 'activo']) {
      if (b[f] !== undefined) data[f] = b[f]
    }
    if (b.password) data.passwordHash = await bcrypt.hash(b.password, 10)
    try { return await fastify.prisma.usuarioWeb.update({ where: { id }, data }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    try {
      await fastify.prisma.usuarioWeb.update({ where: { id }, data: { activo: false } })
      return reply.code(204).send()
    } catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })
}
