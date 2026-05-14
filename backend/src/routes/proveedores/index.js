export default async function proveedoresRoutes(fastify) {
  fastify.register(async function (f) {
    // ── Proveedores CRUD ──────────────────────────────────────────────────
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

      // Attach pagos
      const pagos = await f.prisma.pagoProveedor.findMany({
        where: { proveedorId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return { ...p, pagos }
    })

    // ── Pagos de Proveedor ────────────────────────────────────────────────
    f.get('/:id/pagos', {
      preHandler: [f.authenticate, f.rbac('catalogo', 'read')],
    }, async (request, reply) => {
      const proveedorId = parseInt(request.params.id)
      if (isNaN(proveedorId)) return reply.code(400).send({ error: 'ID inválido' })
      const { estado } = request.query
      const where = { proveedorId }
      if (estado) where.estado = estado
      const pagos = await f.prisma.pagoProveedor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return pagos
    })

    f.post('/:id/pagos', {
      preHandler: [f.authenticate, f.rbac('catalogo', 'write')],
    }, async (request, reply) => {
      const proveedorId = parseInt(request.params.id)
      if (isNaN(proveedorId)) return reply.code(400).send({ error: 'ID inválido' })
      const { documento, nDoc, fechaDoc, fechaPago, fechaVencimiento, estado, total, bodega, nc, ncMonto, obs } = request.body || {}
      const usuario = request.user?.nombre || request.user?.email || 'Sistema'
      const pago = await f.prisma.pagoProveedor.create({
        data: {
          proveedorId,
          documento,
          nDoc,
          fechaDoc: fechaDoc ? new Date(fechaDoc) : null,
          fechaPago: fechaPago ? new Date(fechaPago) : null,
          fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
          estado: estado || 'Pendiente',
          total: parseFloat(total) || 0,
          usuario,
          bodega,
          nc: !!nc,
          ncMonto: ncMonto ? parseFloat(ncMonto) : null,
          obs,
        },
      })
      return reply.code(201).send(pago)
    })

    f.put('/:id/pagos/:pagoId', {
      preHandler: [f.authenticate, f.rbac('catalogo', 'write')],
    }, async (request, reply) => {
      const pagoId = parseInt(request.params.pagoId)
      if (isNaN(pagoId)) return reply.code(400).send({ error: 'ID inválido' })
      const { documento, nDoc, fechaDoc, fechaPago, fechaVencimiento, estado, total, bodega, nc, ncMonto, obs } = request.body || {}
      try {
        const pago = await f.prisma.pagoProveedor.update({
          where: { id: pagoId },
          data: {
            documento,
            nDoc,
            fechaDoc: fechaDoc ? new Date(fechaDoc) : undefined,
            fechaPago: fechaPago ? new Date(fechaPago) : undefined,
            fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : undefined,
            estado,
            total: total !== undefined ? parseFloat(total) : undefined,
            bodega,
            nc: nc !== undefined ? !!nc : undefined,
            ncMonto: ncMonto !== undefined ? parseFloat(ncMonto) : undefined,
            obs,
          },
        })
        return pago
      } catch (e) {
        if (e.code === 'P2025') return reply.code(404).send({ error: 'Pago no encontrado' })
        throw e
      }
    })

    f.delete('/:id/pagos/:pagoId', {
      preHandler: [f.authenticate, f.rbac('catalogo', 'write')],
    }, async (request, reply) => {
      const pagoId = parseInt(request.params.pagoId)
      if (isNaN(pagoId)) return reply.code(400).send({ error: 'ID inválido' })
      try {
        await f.prisma.pagoProveedor.delete({ where: { id: pagoId } })
        return reply.code(204).send()
      } catch (e) {
        if (e.code === 'P2025') return reply.code(404).send({ error: 'Pago no encontrado' })
        throw e
      }
    })
  })
}
