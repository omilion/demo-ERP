export default async function listClientes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'read')],
  }, async (request, reply) => {
    const { search, tipo, region, ciudad, segmento, conDeuda } = request.query
    const LIMIT = 500

    const where = { activo: true }
    if (tipo) where.tipo = tipo
    if (region) where.region = { contains: region, mode: 'insensitive' }
    if (ciudad) where.ciudad = { contains: ciudad, mode: 'insensitive' }
    if (segmento) where.segmento = segmento
    if (search) where.OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { rut: { contains: search } },
      { ciudad: { contains: search, mode: 'insensitive' } },
    ]

    const [clientes, total] = await Promise.all([
      fastify.prisma.cliente.findMany({ where, orderBy: { nombre: 'asc' }, take: LIMIT }),
      fastify.prisma.cliente.count({ where }),
    ])

    // Compute all saldos in one SQL query
    const saldos = await fastify.prisma.$queryRaw`
      SELECT o.cliente_id,
        COALESCE(SUM(
          COALESCE(t.subtotal, 0) * (1 - o.descuento_pct / 100.0) - o.abono
        ), 0)::float AS saldo
      FROM ventas.ordenes o
      LEFT JOIN (
        SELECT orden_id, SUM(cantidad * precio_unitario) AS subtotal
        FROM ventas.orden_items
        GROUP BY orden_id
      ) t ON t.orden_id = o.id
      WHERE o.estado_pago != 'Pagada' AND o.cliente_id IS NOT NULL
      GROUP BY o.cliente_id
    `
    const saldoMap = {}
    for (const row of saldos) saldoMap[Number(row.cliente_id)] = Number(row.saldo)

    let items = clientes.map(c => ({ ...c, saldo: saldoMap[c.id] ?? 0 }))
    if (conDeuda === 'true') items = items.filter(c => c.saldo > 0)
    return {
      items,
      total: conDeuda === 'true' ? items.length : total,
      limit: LIMIT,
    }
  })
}
