// Ingreso de mercaderia: aplicar detalle factura proveedor a stock de productos.
// Reutiliza PagoProveedor + DetalleFacturaProveedor; aqui solo el endpoint de aplicacion.

export default async function stockIngresosRoutes(fastify) {
  // POST /api/stock-ingresos/aplicar/:pagoId -> suma stock por cada detalle, registra movimientos
  fastify.post('/aplicar/:pagoId', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const pagoId = parseInt(request.params.pagoId, 10)
    if (isNaN(pagoId) || pagoId <= 0) return reply.code(400).send({ error: 'pagoId invalido' })

    const result = await fastify.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stock-ingreso:${pagoId}`})::bigint)`

      const pago = await tx.pagoProveedor.findUnique({ where: { id: pagoId } })
      if (!pago) return { status: 404, payload: { error: 'Pago no encontrado' } }
      if (pago.stockAplicadoAt) {
        return {
          status: 200,
          payload: {
            ok: true,
            idempotent: true,
            pagoId,
            stockAplicadoAt: pago.stockAplicadoAt,
            aplicados: [],
          },
        }
      }

      const detalles = await tx.detalleFacturaProveedor.findMany({ where: { pagoId } })
      if (detalles.length === 0) return { status: 400, payload: { error: 'No hay detalles para aplicar' } }

      const invalidDetail = detalles.find(d => !Number.isInteger(Number(d.cantidad)) || Number(d.cantidad) <= 0)
      if (invalidDetail) {
        return {
          status: 400,
          payload: {
            error: 'cantidad debe ser entera y mayor que cero para ingresar stock de productos',
            codigoInterno: invalidDetail.codigoInterno,
          },
        }
      }

      const codigos = [...new Set(detalles.map(d => d.codigoInterno).filter(Boolean))]
      const productos = await tx.producto.findMany({
        where: { codigoInterno: { in: codigos } },
        select: { id: true, codigoInterno: true },
      })
      const productosByCodigo = new Map(productos.map(p => [p.codigoInterno, p]))
      const codigosFaltantes = codigos.filter(codigo => !productosByCodigo.has(codigo))
      if (codigosFaltantes.length > 0) {
        return {
          status: 400,
          payload: {
            error: 'productos no encontrados para ingresar stock',
            codigos: codigosFaltantes,
          },
        }
      }

      const userId = request.user?.id || 1
      const motivo = `Ingreso factura ${pago.documento || ''} ${pago.nDoc || ''}`.trim()
      const aplicados = []

      for (const d of detalles) {
        const prod = productosByCodigo.get(d.codigoInterno)
        const qty = Number(d.cantidad)
        await tx.producto.update({ where: { id: prod.id }, data: { stock: { increment: qty } } })
        await tx.movimientoBodega.create({
          data: {
            productoId: prod.id,
            tipo: 'ingreso',
            cantidad: qty,
            motivo,
            userId,
            pagoProveedorId: pago.id,
            origenTipo: 'pago_proveedor',
            origenId: pago.id,
          },
        })
        aplicados.push({ codigoInterno: d.codigoInterno, ok: true, cantidad: qty })
      }

      if (aplicados.some(item => item.ok)) {
        await tx.pagoProveedor.update({
          where: { id: pago.id },
          data: { stockAplicadoAt: new Date() },
        })
      }

      return { status: 200, payload: { ok: true, aplicados } }
    })

    return reply.code(result.status).send(result.payload)
  })

  // GET /api/stock-ingresos?desde=&hasta=&proveedor=&page= - facturas con detalle
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
