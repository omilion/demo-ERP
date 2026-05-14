export default async function telasRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request) => {
    const { search, tipo, ubicacion } = request.query
    const where = { activo: true }
    if (tipo) where.tipo = tipo
    if (ubicacion) where.ubicacion = ubicacion
    if (search) {
      where.OR = [
        { codigo: { contains: search, mode: 'insensitive' } },
        { nombre: { contains: search, mode: 'insensitive' } },
        { tipo: { contains: search, mode: 'insensitive' } },
      ]
    }
    const items = await fastify.prisma.tela.findMany({
      where,
      orderBy: { codigo: 'asc' },
    })
    return { items, total: items.length }
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const tela = await fastify.prisma.tela.findUnique({
      where: { id },
      include: { movimientos: { orderBy: { fecha: 'desc' }, take: 200 } },
    })
    if (!tela) return reply.code(404).send({ error: 'Tela no encontrada' })
    return tela
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const { codigo, nombre, tipo, color, ancho, gramaje, ubicacion, proveedor, precio, stockMin } = request.body || {}
    if (!codigo || !nombre) return reply.code(400).send({ error: 'codigo y nombre requeridos' })
    const tela = await fastify.prisma.tela.create({
      data: {
        codigo, nombre, tipo, color, ubicacion, proveedor,
        ancho: ancho ? parseFloat(ancho) : null,
        gramaje: gramaje ? parseFloat(gramaje) : null,
        precio: precio ? parseFloat(precio) : null,
        stockMin: stockMin ? parseFloat(stockMin) : 0,
        stock: 0,
      },
    })
    return reply.code(201).send(tela)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const body = request.body || {}
    const data = {}
    for (const f of ['codigo', 'nombre', 'tipo', 'color', 'ubicacion', 'proveedor', 'activo']) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    for (const f of ['ancho', 'gramaje', 'precio', 'stockMin']) {
      if (body[f] !== undefined) data[f] = body[f] === null || body[f] === '' ? null : parseFloat(body[f])
    }
    try {
      return await fastify.prisma.tela.update({ where: { id }, data })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Tela no encontrada' })
      throw e
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    try {
      await fastify.prisma.tela.update({ where: { id }, data: { activo: false } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Tela no encontrada' })
      throw e
    }
  })

  fastify.post('/:id/movimientos', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const telaId = parseInt(request.params.id, 10)
    if (isNaN(telaId)) return reply.code(400).send({ error: 'ID inválido' })
    const { tipo, cantidad, factura, cortador, ubicacion } = request.body || {}
    if (!tipo || !cantidad) return reply.code(400).send({ error: 'tipo y cantidad requeridos' })
    const usuario = request.user?.nombre || request.user?.email || 'Sistema'

    const result = await fastify.prisma.$transaction(async (tx) => {
      const mov = await tx.telaMovimiento.create({
        data: { telaId, tipo, cantidad: parseFloat(cantidad), factura, cortador, ubicacion, usuario },
      })
      const delta = tipo === 'ingreso' ? parseFloat(cantidad) : -parseFloat(cantidad)
      await tx.tela.update({
        where: { id: telaId },
        data: { stock: { increment: delta } },
      })
      return mov
    })
    return reply.code(201).send(result)
  })
}
