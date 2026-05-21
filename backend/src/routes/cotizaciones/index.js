export default async function cotizacionesRoutes(fastify) {
  // ── List ──────────────────────────────────────────────────────────────────
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request) => {
    const { search, estado, rutCliente, idLicitacion, fechaDesde, fechaHasta, page = '1' } = request.query
    const LIMIT = 100
    const offset = (parseInt(page) - 1) * LIMIT

    const where = {}
    if (estado) where.estado = estado
    if (rutCliente) where.rutCliente = rutCliente
    if (idLicitacion) where.idLicitacion = idLicitacion
    if (fechaDesde || fechaHasta) {
      where.fechaCreacion = {}
      if (fechaDesde) where.fechaCreacion.gte = new Date(fechaDesde)
      if (fechaHasta) where.fechaCreacion.lte = new Date(fechaHasta + 'T23:59:59')
    }
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

  // ── Reportes (agregados por estado/cliente/mes) ──────────────────────────
  fastify.get('/reportes', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request) => {
    const { fechaDesde, fechaHasta, rutCliente } = request.query
    const where = {}
    if (rutCliente) where.rutCliente = rutCliente
    if (fechaDesde || fechaHasta) {
      where.fechaCreacion = {}
      if (fechaDesde) where.fechaCreacion.gte = new Date(fechaDesde)
      if (fechaHasta) where.fechaCreacion.lte = new Date(fechaHasta + 'T23:59:59')
    }
    // Agregaciones en SQL — evita cargar 17k cotizaciones + items a memoria
    const cond = []
    const params = []
    if (rutCliente) { params.push(rutCliente); cond.push(`c.rut_cliente = $${params.length}`) }
    if (fechaDesde) { params.push(new Date(fechaDesde)); cond.push(`c.fecha_creacion >= $${params.length}`) }
    if (fechaHasta) { params.push(new Date(fechaHasta + 'T23:59:59')); cond.push(`c.fecha_creacion <= $${params.length}`) }
    const whereSql = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
    const [byEstado, byCliente, totalsRows, items] = await Promise.all([
      fastify.prisma.cotizacionLicitacion.groupBy({
        by: ['estado'], where, _count: { _all: true },
      }),
      fastify.prisma.cotizacionLicitacion.groupBy({
        by: ['rutCliente'], where, _count: { _all: true },
      }),
      fastify.prisma.$queryRawUnsafe(`
        SELECT
          COALESCE(SUM(i.cantidad * i.precio), 0)::float AS "totalCotizado",
          COALESCE(SUM(i.cant_adjudicados * i.precio), 0)::float AS "totalAdjudicado"
        FROM ventas.cotizacion_licitacion c
        LEFT JOIN ventas.cotizacion_licitacion_items i ON i.cotizacion_id = c.id
        ${whereSql}
      `, ...params),
      fastify.prisma.cotizacionLicitacion.findMany({
        where,
        select: {
          id: true, idLicitacion: true, fecha: true, fechaCreacion: true, rutCliente: true,
          estado: true, obs: true, plazo: true, ordenCompra: true, referencia: true, ordenId: true,
          _count: { select: { items: true } },
        },
        orderBy: { fechaCreacion: 'desc' },
        take: 500,
      }),
    ])
    const totals = totalsRows[0] || { totalCotizado: 0, totalAdjudicado: 0 }
    const porEstado = Object.fromEntries(byEstado.map(g => [g.estado, g._count._all]))
    const porCliente = Object.fromEntries(byCliente.filter(g => g.rutCliente).map(g => [g.rutCliente, g._count._all]))
    return {
      items: items.map(({ _count, ...c }) => ({ ...c, nItems: _count.items })),
      total: items.length,
      stats: { porEstado, porCliente, totalCotizado: totals.totalCotizado, totalAdjudicado: totals.totalAdjudicado },
    }
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

    // Attach orden vinculada + ODTs + despachos + guías (vista 360°)
    let orden = null, odts = [], despachos = [], guias = []
    if (c.ordenId) {
      orden = await fastify.prisma.orden.findUnique({
        where: { id: c.ordenId },
        include: { items: true },
      })
      if (orden) {
        const total = (orden.items || []).reduce((s, i) => s + (i.cantidad || 0) * (i.precioUnitario || 0), 0) * (1 - (orden.descuentoPct || 0) / 100)
        orden = { ...orden, total }
        ;[odts, despachos, guias] = await Promise.all([
          fastify.prisma.odt.findMany({ where: { ordenId: c.ordenId }, orderBy: { createdAt: 'desc' } }),
          fastify.prisma.despacho.findMany({ where: { ordenId: c.ordenId }, orderBy: { fechaEntrega: 'desc' } }),
          fastify.prisma.guiaDespacho.findMany({ where: { ordenId: c.ordenId }, orderBy: { fechaGuia: 'desc' } }),
        ])
      }
    }
    return { ...c, cliente, orden, odts, despachos, guias }
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

  fastify.put('/:id/items/:itemId', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const itemId = parseInt(request.params.itemId, 10)
    if (isNaN(itemId)) return reply.code(400).send({ error: 'ID inválido' })
    const body = request.body || {}
    const data = {}
    if (body.codigoInterno !== undefined) data.codigoInterno = body.codigoInterno
    if (body.nombre !== undefined) data.nombre = body.nombre
    if (body.descripcion !== undefined) data.descripcion = body.descripcion
    if (body.cantidad !== undefined) data.cantidad = parseInt(body.cantidad, 10) || 0
    if (body.cantAdjudicados !== undefined) data.cantAdjudicados = parseInt(body.cantAdjudicados, 10) || 0
    if (body.precio !== undefined) data.precio = parseFloat(body.precio) || 0
    try {
      const item = await fastify.prisma.cotizacionLicitacionItem.update({ where: { id: itemId }, data })
      return item
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Item no encontrado' })
      throw e
    }
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

  // Crear venta desde licitación adjudicada
  fastify.post('/:id/crear-venta', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const cot = await fastify.prisma.cotizacionLicitacion.findUnique({
      where: { id }, include: { items: true },
    })
    if (!cot) return reply.code(404).send({ error: 'Licitación no encontrada' })
    if (cot.ordenId) return reply.code(409).send({ error: 'La licitacion ya tiene una venta vinculada', ordenId: cot.ordenId })
    const adjItems = cot.items.filter(i => (i.cantAdjudicados || 0) > 0)
    if (adjItems.length === 0) return reply.code(400).send({ error: 'No hay items adjudicados' })

    let clienteId = null
    if (cot.rutCliente) {
      const cliente = await fastify.prisma.cliente.findUnique({ where: { rut: cot.rutCliente } })
      clienteId = cliente?.id ?? null
    }
    if (!clienteId) return reply.code(400).send({ error: 'Cliente canonico requerido para crear venta' })

    const codigos = adjItems.map(i => i.codigoInterno).filter(Boolean)
    const productos = await fastify.prisma.producto.findMany({
      where: { codigoInterno: { in: codigos } },
      select: { id: true, codigoInterno: true, nombre: true, descripcion: true },
    })
    const prodMap = Object.fromEntries(productos.map(p => [p.codigoInterno, p]))

    const ordenItems = []
    const faltantes = []
    for (const it of adjItems) {
      const prod = prodMap[it.codigoInterno]
      if (!prod) { faltantes.push(it.codigoInterno || it.nombre); continue }
      ordenItems.push({
        productoId: prod.id,
        codigoInterno: it.codigoInterno,
        nombre: it.nombre || prod.nombre,
        descripcion: it.descripcion || prod.descripcion,
        cantidad: it.cantAdjudicados,
        precioUnitario: it.precio || 0,
      })
    }
    if (ordenItems.length === 0) {
      return reply.code(400).send({ error: `Ningún producto encontrado en catálogo (faltan: ${faltantes.join(', ')})` })
    }

    const orden = await fastify.prisma.orden.create({
      data: {
        tipo: 'Licitación',
        clienteId,
        rutCliente: cot.rutCliente,
        licitacion: cot.idLicitacion,
        observaciones: cot.obs || null,
        userId: request.user.id,
        creadorNombre: request.user.nombre || request.user.email || 'Sistema',
        sucursalId: cot.sucursalId,
        items: { create: ordenItems },
      },
      include: { items: true },
    })
    await fastify.prisma.cotizacionLicitacion.update({
      where: { id }, data: { ordenId: orden.id },
    })
    return reply.code(201).send({ orden, faltantes })
  })
}
