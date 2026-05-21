// Ingreso de mercaderia: aplicar detalle factura proveedor a stock de productos.
// Reutiliza PagoProveedor + DetalleFacturaProveedor; aqui solo el endpoint de aplicacion.
import { validateAndApplyStockIngreso } from './apply.js'

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

      const userId = request.user?.id || 1
      const applied = await validateAndApplyStockIngreso({ tx, detalles, pago, userId })
      if (applied.error) return { status: 400, payload: applied }
      const aplicados = applied.aplicados

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
      fastify.prisma.pagoProveedor.findMany({
        where,
        orderBy: { fechaDoc: 'desc' },
        take: LIMIT,
        skip,
        include: { detallesFactura: true },
      }),
      fastify.prisma.pagoProveedor.count({ where }),
    ])
    return { items, total, limit: LIMIT }
  })
}
