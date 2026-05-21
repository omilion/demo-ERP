export default async function configRoutes(fastify) {
  // ── Empresa ────────────────────────────────────────────────────────
  fastify.get('/empresa', { preHandler: [fastify.authenticate] }, async () => {
    return fastify.prisma.empresaConfig.findFirst()
  })

  fastify.put('/empresa', { preHandler: [fastify.authenticate, fastify.rbac('config', 'write', { allowExtra: false })] }, async (request, reply) => {
    const body = request.body || {}
    const data = {}
    for (const f of ['nombre', 'rut', 'razonSocial', 'giro', 'email', 'telefono', 'direccion', 'region', 'comuna', 'logoUrl', 'textoPie']) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    const existing = await fastify.prisma.empresaConfig.findFirst()
    if (existing) {
      return fastify.prisma.empresaConfig.update({ where: { id: existing.id }, data })
    }
    if (!data.nombre || !data.rut) return reply.code(400).send({ error: 'nombre y rut requeridos' })
    return fastify.prisma.empresaConfig.create({ data })
  })

  // ── Firmas Email ───────────────────────────────────────────────────
  fastify.get('/firmas', { preHandler: [fastify.authenticate] }, async () => {
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
  fastify.get('/bloqueos', { preHandler: [fastify.authenticate] }, async () => {
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
