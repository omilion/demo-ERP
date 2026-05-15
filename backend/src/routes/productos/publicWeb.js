export default async function publicWebRoute(fastify) {
  fastify.get('/web/catalogo', async (request) => {
    const { search, destacado, limit, offset } = request.query
    const where = { activo: true, visibleWeb: true }
    if (destacado === 'true') where.destacadoWeb = true
    if (search) where.OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { descripcionWeb: { contains: search, mode: 'insensitive' } },
    ]
    const LIMIT = Math.min(parseInt(limit, 10) || 60, 200)
    const OFFSET = parseInt(offset, 10) || 0
    const [items, total] = await Promise.all([
      fastify.prisma.producto.findMany({
        where,
        orderBy: [{ destacadoWeb: 'desc' }, { ordenWeb: 'asc' }, { nombre: 'asc' }],
        skip: OFFSET,
        take: LIMIT,
        select: {
          id: true,
          codigoInterno: true,
          nombre: true,
          descripcionWeb: true,
          fotoUrl: true,
          fotoUrlGrande: true,
          precioWeb: true,
          precioLista: true,
          destacadoWeb: true,
          stock: true,
        },
      }),
      fastify.prisma.producto.count({ where }),
    ])
    return {
      items: items.map(p => ({
        ...p,
        precio: p.precioWeb ?? p.precioLista,
        disponible: p.stock > 0,
      })),
      total,
    }
  })

  fastify.get('/web/catalogo/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const p = await fastify.prisma.producto.findFirst({
      where: { id, activo: true, visibleWeb: true },
      select: {
        id: true,
        codigoInterno: true,
        nombre: true,
        descripcionWeb: true,
        descripcion: true,
        fotoUrl: true,
        fotoUrlGrande: true,
        precioWeb: true,
        precioLista: true,
        stock: true,
        categoria: true,
      },
    })
    if (!p) return reply.code(404).send({ error: 'Producto no disponible' })
    return { ...p, precio: p.precioWeb ?? p.precioLista, disponible: p.stock > 0 }
  })
}
