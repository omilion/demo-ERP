// Ingreso de mercadería: aplicar detalle factura proveedor a stock de productos
// Reutiliza PagoProveedor + DetalleFacturaProveedor; aquí solo el endpoint de aplicación

export default async function stockIngresosRoutes(fastify) {
  // POST /api/stock-ingresos/aplicar/:pagoId  → suma stock por cada detalle, registra movimientos
  fastify.post('/aplicar/:pagoId', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const pagoId = parseInt(request.params.pagoId, 10)
    const pago = await fastify.prisma.pagoProveedor.findUnique({ where: { id: pagoId } })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })

    const detalles = await fastify.prisma.detalleFacturaProveedor.findMany({ where: { pagoId } })
    if (detalles.length === 0) return reply.code(400).send({ error: 'No hay detalles para aplicar' })

    const userId = request.user?.id || 1
    const motivo = `Ingreso factura ${pago.documento || ''} ${pago.nDoc || ''}`.trim()
    const result = await fastify.prisma.$transaction(async (tx) => {
      const aplicados = []
      for (const d of detalles) {
        const prod = await tx.producto.findUnique({ where: { codigoInterno: d.codigoInterno } })
        if (!prod) { aplicados.push({ codigoInterno: d.codigoInterno, ok: false, motivo: 'producto no existe' }); continue }
        const qty = Math.round(d.cantidad)
        await tx.producto.update({ where: { id: prod.id }, data: { stock: { increment: qty } } })
        await tx.movimientoBodega.create({
          data: { productoId: prod.id, tipo: 'ingreso', cantidad: qty, motivo, userId },
        })
        aplicados.push({ codigoInterno: d.codigoInterno, ok: true, cantidad: qty })
      }
      return aplicados
    })
    return { ok: true, aplicados: result }
  })

  // GET /api/stock-ingresos?desde=&hasta=&proveedor=&page=  — facturas con detalle (ingresos mercadería)
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request) => {
    const { desde, hasta, proveedorId, nDoc, page = '1' } = request.query
    const LIMIT = 100
    const skip = (parseInt(page, 10) - 1) * LIMIT
    const where = {}
    if (proveedorId) where.proveedorId = parseInt(proveedorId, 10)
    if (nDoc) where.nDoc = { contains: nDoc, mode: 'insensitive' }
    if (desde || hasta) {
      where.fechaDoc = {}
      if (desde) where.fechaDoc.gte = new Date(desde)
      if (hasta) where.fechaDoc.lte = new Date(hasta + 'T23:59:59')
    }
    const [items, total] = await Promise.all([
      fastify.prisma.pagoProveedor.findMany({ where, orderBy: { fechaDoc: 'desc' }, take: LIMIT, skip }),
      fastify.prisma.pagoProveedor.count({ where }),
    ])
    return { items, total, limit: LIMIT }
  })
}
