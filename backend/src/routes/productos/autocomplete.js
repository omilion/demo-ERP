// G7: autocomplete productos para búsqueda rápida AJAX
export default async function autocompleteRoute(fastify) {
  fastify.get('/autocomplete', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const q = (request.query.q || '').trim()
    if (q.length < 2) return []
    const items = await fastify.prisma.producto.findMany({
      where: {
        activo: true,
        OR: [
          { codigo: { contains: q, mode: 'insensitive' } },
          { nombre: { contains: q, mode: 'insensitive' } },
          { codigoBarra: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, codigo: true, nombre: true, unidadMedida: true,
        stock: true, precioLista: true, bodegaId: true,
      },
      orderBy: { nombre: 'asc' },
      take: 20,
    })
    return items
  })
}
