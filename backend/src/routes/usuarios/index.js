import bcrypt from 'bcrypt'

const onlyAdmin = async (req, reply) => {
  if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
}

export default async function usuariosRoutes(fastify) {
  // GET /api/usuarios
  fastify.get('/', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async () => {
    return fastify.prisma.user.findMany({
      orderBy: { nombre: 'asc' },
      select: {
        id: true, email: true, role: true, nombre: true, rut: true,
        codigoVendedor: true, permisoDescuentos: true, permisosExtra: true,
        sucursalId: true, activo: true, createdAt: true,
      },
    })
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    const u = await fastify.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, role: true, nombre: true, rut: true,
        codigoVendedor: true, permisoDescuentos: true, permisosExtra: true,
        sucursalId: true, activo: true, createdAt: true,
      },
    })
    if (!u) return reply.code(404).send({ error: 'no encontrado' })
    return u
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async (request, reply) => {
    const b = request.body || {}
    if (!b.email || !b.password || !b.role || !b.nombre)
      return reply.code(400).send({ error: 'email, password, role, nombre requeridos' })
    const passwordHash = await bcrypt.hash(b.password, 10)
    try {
      const u = await fastify.prisma.user.create({
        data: {
          email: b.email,
          passwordHash,
          role: b.role,
          nombre: b.nombre,
          rut: b.rut || null,
          codigoVendedor: b.codigoVendedor || null,
          permisoDescuentos: !!b.permisoDescuentos,
          permisosExtra: b.permisosExtra || null,
          sucursalId: b.sucursalId ? parseInt(b.sucursalId, 10) : null,
          activo: b.activo !== false,
        },
      })
      return reply.code(201).send({ id: u.id, email: u.email, role: u.role, nombre: u.nombre })
    } catch (e) {
      if (e.code === 'P2002') return reply.code(409).send({ error: 'email ya existe' })
      throw e
    }
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    const b = request.body || {}
    const data = {}
    for (const f of ['nombre', 'role', 'rut', 'codigoVendedor', 'permisoDescuentos', 'permisosExtra', 'activo']) {
      if (b[f] !== undefined) data[f] = b[f]
    }
    if (b.sucursalId !== undefined) data.sucursalId = b.sucursalId ? parseInt(b.sucursalId, 10) : null
    if (b.password) data.passwordHash = await bcrypt.hash(b.password, 10)
    try {
      const u = await fastify.prisma.user.update({
        where: { id }, data,
        select: { id: true, email: true, role: true, nombre: true, permisosExtra: true, activo: true },
      })
      return u
    } catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })

  // PUT /api/usuarios/:id/permisos — bulk update permisosExtra
  fastify.put('/:id/permisos', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    const { permisosExtra } = request.body || {}
    try {
      const u = await fastify.prisma.user.update({
        where: { id }, data: { permisosExtra: permisosExtra || null },
        select: { id: true, permisosExtra: true },
      })
      return u
    } catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })
}
