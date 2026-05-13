export default async function proveedoresRoutes(fastify) {
  fastify.register(async function (f) {
    f.get('/', {
      preHandler: [f.authenticate, f.rbac('catalogo', 'read')],
    }, async (request) => {
      const { search, page = '1' } = request.query
      const LIMIT = 100
      const offset = (parseInt(page) - 1) * LIMIT

      const where = { activo: true }
      if (search) {
        where.OR = [
          { nombre: { contains: search, mode: 'insensitive' } },
          { rut: { contains: search, mode: 'insensitive' } },
          { razonSocial: { contains: search, mode: 'insensitive' } },
        ]
      }

      const [items, total] = await Promise.all([
        f.prisma.proveedor.findMany({ where, orderBy: { nombre: 'asc' }, take: LIMIT, skip: offset }),
        f.prisma.proveedor.count({ where }),
      ])
      return { items, total, limit: LIMIT }
    })

    f.get('/:id', {
      preHandler: [f.authenticate, f.rbac('catalogo', 'read')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id)
      if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
      const p = await f.prisma.proveedor.findUnique({ where: { id } })
      if (!p) return reply.code(404).send({ error: 'No encontrado' })
      return p
    })
  })
}
