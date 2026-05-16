export default async function crmRoutes(fastify) {
  fastify.register(async function (f) {
    // GET /api/crm?ejecutiva=...&estado=...&prioridad=...&search=...&page=1
    f.get('/', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const { ejecutiva, estado, prioridad, search, page = '1', fechaDesde, fechaHasta } = request.query
      const LIMIT = 500
      const offset = (parseInt(page) - 1) * LIMIT

      const where = {}
      if (ejecutiva) where.ejecutiva = { contains: ejecutiva, mode: 'insensitive' }
      if (prioridad) where.prioridad = prioridad
      if (estado !== undefined && estado !== '') where.estado = parseInt(estado)
      if (fechaDesde || fechaHasta) {
        where.fecha = {}
        if (fechaDesde) where.fecha.gte = new Date(fechaDesde)
        if (fechaHasta) where.fecha.lte = new Date(fechaHasta + 'T23:59:59')
      }
      if (search) {
        where.OR = [
          { nombre: { contains: search, mode: 'insensitive' } },
          { rsocial: { contains: search, mode: 'insensitive' } },
          { rut: { contains: search, mode: 'insensitive' } },
          { ncotizacion: { contains: search, mode: 'insensitive' } },
        ]
      }

      const [items, total] = await Promise.all([
        f.prisma.crmRegistro.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: LIMIT,
          skip: offset,
        }),
        f.prisma.crmRegistro.count({ where }),
      ])

      return { items, total, limit: LIMIT }
    })

    // PATCH /api/crm/:id — update editable fields
    f.patch('/:id', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request, reply) => {
      const { id } = request.params
      const b = request.body ?? {}
      const data = {}
      if (b.estado !== undefined) data.estado = b.estado === null ? null : parseInt(b.estado)
      if (b.prioridad !== undefined) data.prioridad = b.prioridad || null
      if (b.fechaProximo !== undefined) data.fechaProximo = b.fechaProximo ? new Date(b.fechaProximo) : null
      if (b.fecha !== undefined) data.fecha = b.fecha ? new Date(b.fecha) : null
      if (b.fechaCotizacion !== undefined) data.fechaCotizacion = b.fechaCotizacion ? new Date(b.fechaCotizacion) : null
      if (b.resultado !== undefined) data.resultado = b.resultado || null
      if (b.comentarios !== undefined) data.comentarios = b.comentarios || null
      if (b.accion !== undefined) data.accion = b.accion || null
      if (b.ejecutiva !== undefined) data.ejecutiva = b.ejecutiva || null
      if (b.nombre !== undefined) data.nombre = b.nombre || null
      if (b.rsocial !== undefined) data.rsocial = b.rsocial || null
      if (b.email !== undefined) data.email = b.email || null
      if (b.telefono !== undefined) data.telefono = b.telefono || null
      if (b.ncotizacion !== undefined) data.ncotizacion = b.ncotizacion || null
      if (Object.keys(data).length === 0) return reply.status(400).send({ error: 'Nothing to update' })
      const updated = await f.prisma.crmRegistro.update({ where: { id: parseInt(id) }, data })
      return updated
    })

    // GET /api/crm/:id/orden — buscar orden v2 por nInterno = ncotizacion
    f.get('/:id/orden', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async (request) => {
      const id = parseInt(request.params.id)
      const c = await f.prisma.crmRegistro.findUnique({ where: { id }, select: { ncotizacion: true } })
      if (!c?.ncotizacion) return { orden: null }
      const raw = String(c.ncotizacion).trim()
      // ncotizacion legacy a veces es timestamp YYYYMMDDHHmmss (14 dígitos) — fuera de int4
      if (!/^\d{1,9}$/.test(raw)) return { orden: null }
      const ni = parseInt(raw, 10)
      const orden = await f.prisma.orden.findFirst({
        where: { nInterno: ni },
        select: { id: true, nInterno: true, tipo: true, estado: true, estadoPago: true, estadoEntrega: true, createdAt: true, clienteId: true },
      })
      return { orden }
    })

    // GET /api/crm/ejecutivas — unique list
    f.get('/ejecutivas', {
      preHandler: [f.authenticate, f.rbac('ventas', 'read')],
    }, async () => {
      const rows = await f.prisma.$queryRaw`
        SELECT ejecutiva, COUNT(*)::int AS total
        FROM ventas.crm_registros
        WHERE ejecutiva IS NOT NULL
        GROUP BY ejecutiva
        ORDER BY total DESC
      `
      return rows
    })
  })
}
