function parseOptionalPositiveInt(value) {
  if (value === undefined) return { provided: false, value: undefined }
  if (value === null || value === '') return { provided: true, value: null }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return { provided: true, error: 'ID invalido' }
  return { provided: true, value: parsed }
}

function parseOptionalNumber(value, field) {
  if (value === undefined) return { provided: false, value: undefined }
  if (value === null || value === '') return { provided: true, value: 0 }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return { provided: true, error: `${field} invalido` }
  return { provided: true, value: parsed }
}

async function validateClasificacionTaller(prisma, { categoriaId, subcategoriaId }) {
  if (subcategoriaId && !categoriaId) return { status: 400, error: 'categoria requerida para subcategoria' }

  if (categoriaId) {
    const categoria = await prisma.categoriaBodegaTaller.findFirst({ where: { id: categoriaId, activo: true } })
    if (!categoria) return { status: 404, error: 'Categoria no encontrada' }
  }

  if (subcategoriaId) {
    const subcategoria = await prisma.subcategoriaBodegaTaller.findFirst({ where: { id: subcategoriaId, activo: true } })
    if (!subcategoria) return { status: 404, error: 'Subcategoria no encontrada' }
    if (subcategoria.categoriaId !== categoriaId) {
      return { status: 400, error: 'Subcategoria no pertenece a la categoria' }
    }
  }

  return null
}

export default async function bodegaTallerRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request) => {
    const { search, stockCritico, categoriaId, subcategoriaId, page = '1' } = request.query
    const LIMIT = 200
    const offset = (parseInt(page) - 1) * LIMIT

    const where = { activo: true }
    if (search) {
      where.OR = [
        { codigoInterno: { contains: search, mode: 'insensitive' } },
        { nombre: { contains: search, mode: 'insensitive' } },
        { codigoBarra: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (categoriaId) where.categoriaId = parseInt(categoriaId, 10)
    if (subcategoriaId) where.subcategoriaId = parseInt(subcategoriaId, 10)

    const [items, total] = await Promise.all([
      fastify.prisma.bodegaTaller.findMany({ where, orderBy: { nombre: 'asc' }, take: LIMIT, skip: offset }),
      fastify.prisma.bodegaTaller.count({ where }),
    ])
    let filtered = items
    if (stockCritico === 'true') filtered = items.filter(i => i.stock <= i.stockCritico)
    return { items: filtered, total, limit: LIMIT }
  })

  // Autocomplete para búsqueda rápida (G7)
  fastify.get('/autocomplete', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request) => {
    const q = (request.query.q || '').trim()
    if (q.length < 2) return []
    const items = await fastify.prisma.bodegaTaller.findMany({
      where: {
        activo: true,
        OR: [
          { codigoInterno: { contains: q, mode: 'insensitive' } },
          { nombre: { contains: q, mode: 'insensitive' } },
          { codigoBarra: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, codigoInterno: true, nombre: true, unidadMedida: true, stock: true, precio: true },
      orderBy: { nombre: 'asc' },
      take: 20,
    })
    return items
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const item = await fastify.prisma.bodegaTaller.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Material no encontrado' })
    return item
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const { codigoInterno, codigoBarra, nombre, unidadMedida, stock, stockCritico, precio, categoriaId, subcategoriaId } = request.body || {}
    if (!codigoInterno || !nombre) return reply.code(400).send({ error: 'codigoInterno y nombre requeridos' })
    const parsedCategoria = parseOptionalPositiveInt(categoriaId)
    const parsedSubcategoria = parseOptionalPositiveInt(subcategoriaId)
    if (parsedCategoria.error) return reply.code(400).send({ error: 'categoriaId invalido' })
    if (parsedSubcategoria.error) return reply.code(400).send({ error: 'subcategoriaId invalido' })
    const parsedStock = parseOptionalNumber(stock, 'stock')
    const parsedStockCritico = parseOptionalNumber(stockCritico, 'stockCritico')
    const parsedPrecio = parseOptionalNumber(precio, 'precio')
    if (parsedStock.error) return reply.code(400).send({ error: parsedStock.error })
    if (parsedStockCritico.error) return reply.code(400).send({ error: parsedStockCritico.error })
    if (parsedPrecio.error) return reply.code(400).send({ error: parsedPrecio.error })
    const categoriaFinal = parsedCategoria.value ?? null
    const subcategoriaFinal = parsedSubcategoria.value ?? null
    const clasificacionError = await validateClasificacionTaller(fastify.prisma, {
      categoriaId: categoriaFinal,
      subcategoriaId: subcategoriaFinal,
    })
    if (clasificacionError) return reply.code(clasificacionError.status).send({ error: clasificacionError.error })
    const item = await fastify.prisma.bodegaTaller.create({
      data: {
        codigoInterno, codigoBarra, nombre, unidadMedida,
        categoriaId: categoriaFinal,
        subcategoriaId: subcategoriaFinal,
        stock: parsedStock.value ?? 0,
        stockCritico: parsedStockCritico.value ?? 0,
        precio: parsedPrecio.value ?? 0,
      },
    })
    return reply.code(201).send(item)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const body = request.body || {}
    const current = await fastify.prisma.bodegaTaller.findUnique({
      where: { id },
      select: { id: true, categoriaId: true, subcategoriaId: true },
    })
    if (!current) return reply.code(404).send({ error: 'No encontrado' })
    const data = {}
    for (const f of ['codigoBarra', 'nombre', 'unidadMedida', 'activo']) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    for (const f of ['stockCritico', 'stock', 'precio']) {
      if (body[f] !== undefined) {
        const parsed = parseOptionalNumber(body[f], f)
        if (parsed.error) return reply.code(400).send({ error: parsed.error })
        data[f] = parsed.value
      }
    }
    const parsedCategoria = parseOptionalPositiveInt(body.categoriaId)
    const parsedSubcategoria = parseOptionalPositiveInt(body.subcategoriaId)
    if (parsedCategoria.error) return reply.code(400).send({ error: 'categoriaId invalido' })
    if (parsedSubcategoria.error) return reply.code(400).send({ error: 'subcategoriaId invalido' })
    const nextCategoriaId = parsedCategoria.provided ? parsedCategoria.value : current.categoriaId
    const nextSubcategoriaId = parsedSubcategoria.provided ? parsedSubcategoria.value : current.subcategoriaId
    const clasificacionError = await validateClasificacionTaller(fastify.prisma, {
      categoriaId: nextCategoriaId,
      subcategoriaId: nextSubcategoriaId,
    })
    if (clasificacionError) return reply.code(clasificacionError.status).send({ error: clasificacionError.error })
    if (parsedCategoria.provided) data.categoriaId = parsedCategoria.value
    if (parsedSubcategoria.provided) data.subcategoriaId = parsedSubcategoria.value
    try {
      const item = await fastify.prisma.bodegaTaller.update({ where: { id }, data })
      return item
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
      throw e
    }
  })
}
