export default async function cotizacionesRoutes(fastify) {
  // ── List ──────────────────────────────────────────────────────────────────
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request) => {
    const { search, estado, rutCliente, page = '1' } = request.query
    const LIMIT = 100
    const offset = (parseInt(page) - 1) * LIMIT

    const where = {}
    if (estado) where.estado = estado
    if (rutCliente) where.rutCliente = rutCliente
    if (search) {
      where.OR = [
        { idLicitacion: { contains: search, mode: 'insensitive' } },
        { referencia: { contains: search, mode: 'insensitive' } },
        { ordenCompra: { contains: search, mode: 'insensitive' } },
        { obs: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await Promise.all([
      fastify.prisma.cotizacionLicitacion.findMany({
        where,
        orderBy: { fechaCreacion: 'desc' },
        take: LIMIT,
        skip: offset,
      }),
      fastify.prisma.cotizacionLicitacion.count({ where }),
    ])
    return { items, total, limit: LIMIT }
  })

  // ── Get by id ─────────────────────────────────────────────────────────────
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const c = await fastify.prisma.cotizacionLicitacion.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!c) return reply.code(404).send({ error: 'Cotización no encontrada' })

    // Attach cliente if rutCliente exists
    let cliente = null
    if (c.rutCliente) {
      cliente = await fastify.prisma.cliente.findUnique({
        where: { rut: c.rutCliente },
        select: { id: true, nombre: true, rut: true, email: true, telefono: true, razonSocial: true },
      })
    }
    return { ...c, cliente }
  })

  // ── Create ────────────────────────────────────────────────────────────────
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const { idLicitacion, fecha, rutCliente, estado, obs, plazo, ordenCompra, sucursalId, referencia, items = [] } = request.body || {}
    if (!idLicitacion) return reply.code(400).send({ error: 'idLicitacion requerido' })
    const usuario = request.user?.nombre || request.user?.email || 'Sistema'

    const c = await fastify.prisma.cotizacionLicitacion.create({
      data: {
        idLicitacion,
        fecha: fecha ? new Date(fecha) : null,
        rutCliente,
        estado: estado || 'Pendiente',
        obs,
        plazo,
        ordenCompra,
        sucursalId: sucursalId ? parseInt(sucursalId, 10) : null,
        referencia,
        usuario,
        items: items.length > 0 ? {
          create: items.map(i => ({
            codigoInterno: i.codigoInterno,
            nombre: i.nombre,
            descripcion: i.descripcion,
            cantidad: parseInt(i.cantidad, 10) || 0,
            cantAdjudicados: parseInt(i.cantAdjudicados, 10) || 0,
            precio: parseFloat(i.precio) || 0,
          })),
        } : undefined,
      },
      include: { items: true },
    })
    return reply.code(201).send(c)
  })

  // ── Update ────────────────────────────────────────────────────────────────
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const body = request.body || {}
    const data = {}
    if (body.estado !== undefined) data.estado = body.estado
    if (body.obs !== undefined) data.obs = body.obs
    if (body.plazo !== undefined) data.plazo = body.plazo
    if (body.ordenCompra !== undefined) data.ordenCompra = body.ordenCompra
    if (body.referencia !== undefined) data.referencia = body.referencia
    if (body.fecha !== undefined) data.fecha = body.fecha ? new Date(body.fecha) : null
    try {
      const c = await fastify.prisma.cotizacionLicitacion.update({ where: { id }, data })
      return c
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Cotización no encontrada' })
      throw e
    }
  })

  // ── Delete ────────────────────────────────────────────────────────────────
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      await fastify.prisma.cotizacionLicitacion.delete({ where: { id } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Cotización no encontrada' })
      throw e
    }
  })

  // ── Items (add/remove) ────────────────────────────────────────────────────
  fastify.post('/:id/items', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const cotizacionId = parseInt(request.params.id, 10)
    if (isNaN(cotizacionId)) return reply.code(400).send({ error: 'ID inválido' })
    const { codigoInterno, nombre, descripcion, cantidad, cantAdjudicados, precio } = request.body || {}
    const item = await fastify.prisma.cotizacionLicitacionItem.create({
      data: {
        cotizacionId,
        codigoInterno,
        nombre,
        descripcion,
        cantidad: parseInt(cantidad, 10) || 0,
        cantAdjudicados: parseInt(cantAdjudicados, 10) || 0,
        precio: parseFloat(precio) || 0,
      },
    })
    return reply.code(201).send(item)
  })

  fastify.delete('/:id/items/:itemId', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const itemId = parseInt(request.params.itemId, 10)
    if (isNaN(itemId)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      await fastify.prisma.cotizacionLicitacionItem.delete({ where: { id: itemId } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Item no encontrado' })
      throw e
    }
  })
}
