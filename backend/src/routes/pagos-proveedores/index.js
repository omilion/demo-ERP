export default async function pagosProveedoresRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'read')],
  }, async (request) => {
    const { search, estado, proveedorId, page = '1' } = request.query
    const LIMIT = 100
    const offset = (parseInt(page) - 1) * LIMIT

    const where = {}
    if (estado) where.estado = estado
    if (proveedorId) where.proveedorId = parseInt(proveedorId, 10)
    if (search) {
      const isNum = /^\d+$/.test(search.trim())
      where.OR = [
        { nDoc: { contains: search, mode: 'insensitive' } },
        { documento: { contains: search, mode: 'insensitive' } },
        { obs: { contains: search, mode: 'insensitive' } },
        ...(isNum ? [{ codigoProveedor: parseInt(search, 10) }] : []),
      ]
    }

    const [items, total] = await Promise.all([
      fastify.prisma.pagoProveedor.findMany({
        where,
        orderBy: [{ fechaDoc: 'desc' }, { id: 'desc' }],
        take: LIMIT,
        skip: offset,
      }),
      fastify.prisma.pagoProveedor.count({ where }),
    ])

    // attach proveedores
    const provIds = [...new Set(items.map(p => p.proveedorId).filter(Boolean))]
    let provMap = {}
    if (provIds.length) {
      const provs = await fastify.prisma.proveedor.findMany({
        where: { id: { in: provIds } },
        select: { id: true, nombre: true, rut: true },
      })
      provMap = Object.fromEntries(provs.map(p => [p.id, p]))
    }
    const enriched = items.map(p => ({ ...p, proveedor: p.proveedorId ? provMap[p.proveedorId] || null : null }))
    return { items: enriched, total, limit: LIMIT }
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const pago = await fastify.prisma.pagoProveedor.findUnique({ where: { id } })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    const detalles = await fastify.prisma.detalleFacturaProveedor.findMany({ where: { pagoId: id } })
    let proveedor = null
    if (pago.proveedorId) {
      proveedor = await fastify.prisma.proveedor.findUnique({
        where: { id: pago.proveedorId },
        select: { id: true, nombre: true, rut: true, email: true, telefono: true },
      })
    }
    return { ...pago, proveedor, detalles }
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })
    const body = request.body || {}
    const data = {}
    for (const f of ['estado', 'documento', 'nDoc', 'usuario', 'bodega', 'obs', 'ncNumero']) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    if (body.fechaDoc !== undefined) data.fechaDoc = body.fechaDoc ? new Date(body.fechaDoc) : null
    if (body.fechaPago !== undefined) data.fechaPago = body.fechaPago ? new Date(body.fechaPago) : null
    if (body.fechaVencimiento !== undefined) data.fechaVencimiento = body.fechaVencimiento ? new Date(body.fechaVencimiento) : null
    if (body.total !== undefined) data.total = parseFloat(body.total) || 0
    if (body.nc !== undefined) data.nc = !!body.nc
    if (body.ncMonto !== undefined) data.ncMonto = body.ncMonto === null ? null : parseFloat(body.ncMonto)
    try {
      return await fastify.prisma.pagoProveedor.update({ where: { id }, data })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Pago no encontrado' })
      throw e
    }
  })
}
