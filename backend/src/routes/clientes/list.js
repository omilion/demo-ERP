import { parsePagination } from '../operational-utils.js'

export default async function listClientes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'read')],
  }, async (request, reply) => {
    const { search, tipo, region, email, segmento, conDeuda, estado, activo } = request.query
    const pagination = parsePagination(request.query, { defaultLimit: 500, maxLimit: 500 })
    if (!pagination) return reply.code(400).send({ error: 'Paginacion invalida' })

    const where = {}
    if (estado === 'inactivo') where.activo = false
    else if (estado === 'todos') {}
    else if (activo !== undefined) where.activo = activo === 'true'
    else where.activo = true
    if (tipo) where.tipo = tipo
    if (region) where.region = { contains: region, mode: 'insensitive' }
    if (email) where.email = { contains: email, mode: 'insensitive' }
    if (segmento) where.segmento = segmento
    if (search) {
      const cleanSearch = search.trim()
      const cleanRut = cleanSearch.replace(/[^a-zA-Z0-9]/g, '')
      const orConditions = [
        { nombre: { contains: cleanSearch, mode: 'insensitive' } },
        { razonSocial: { contains: cleanSearch, mode: 'insensitive' } },
        { rut: { contains: cleanSearch, mode: 'insensitive' } },
        { email: { contains: cleanSearch, mode: 'insensitive' } },
        { telefono: { contains: cleanSearch, mode: 'insensitive' } },
        { direccion: { contains: cleanSearch, mode: 'insensitive' } },
        { region: { contains: cleanSearch, mode: 'insensitive' } },
        { comuna: { contains: cleanSearch, mode: 'insensitive' } },
        { giro: { contains: cleanSearch, mode: 'insensitive' } },
      ]
      if (cleanRut && cleanRut !== cleanSearch && cleanRut.length >= 3) {
        orConditions.push({ rut: { contains: cleanRut, mode: 'insensitive' } })
      }
      where.OR = orConditions
    }

    // Compute all saldos in one SQL query
    const saldos = await fastify.prisma.$queryRaw`
      SELECT o.cliente_id,
        COALESCE(SUM(
          COALESCE(t.subtotal, 0) + COALESCE(c.cargos, 0) - ROUND((COALESCE(t.subtotal, 0) + COALESCE(c.cargos, 0)) * COALESCE(o.descuento_pct, 0) / 100.0) - o.abono
        ), 0)::float AS saldo
      FROM ventas.ordenes o
      LEFT JOIN (
        SELECT orden_id, SUM(cantidad * precio_unitario) AS subtotal
        FROM ventas.orden_items
        GROUP BY orden_id
      ) t ON t.orden_id = o.id
      LEFT JOIN (
        SELECT orden_id, SUM(valor) AS cargos
        FROM ventas.orden_cargos
        GROUP BY orden_id
      ) c ON c.orden_id = o.id
      WHERE o.estado_pago != 'Pagada' AND o.cliente_id IS NOT NULL
      GROUP BY o.cliente_id
    `
    const saldoMap = {}
    for (const row of saldos) saldoMap[Number(row.cliente_id)] = Number(row.saldo)

    const deudorIds = Object.entries(saldoMap)
      .filter(([, saldo]) => saldo > 0)
      .map(([id]) => Number(id))
    const totalDeudaSum = Object.values(saldoMap)
      .filter(saldo => saldo > 0)
      .reduce((sum, s) => sum + s, 0)

    if (conDeuda === 'true') {
      if (deudorIds.length === 0) {
        return {
          items: [],
          total: 0,
          limit: pagination.limit,
          page: pagination.page,
          stats: { totalDeudores: 0, totalDeuda: 0 },
        }
      }
      where.id = { in: deudorIds }
    }

    const [clientes, total] = await Promise.all([
      fastify.prisma.cliente.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      fastify.prisma.cliente.count({ where }),
    ])

    const items = clientes.map(c => ({ ...c, saldo: saldoMap[c.id] ?? 0 }))
    return {
      items,
      total,
      limit: pagination.limit,
      page: pagination.page,
      stats: {
        totalDeudores: deudorIds.length,
        totalDeuda: totalDeudaSum,
      },
    }
  })
}
