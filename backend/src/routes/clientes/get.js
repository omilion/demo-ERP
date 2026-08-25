import { computeSaldo, computeVentasResumen } from './helpers.js'
import { can } from '../../middleware/rbac.js'
import { computeTotal } from '../ventas/helpers.js'

export default async function getCliente(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID inválido' })

    const includeInactivos = request.query?.includeInactivos === 'true'
    const canReadVentas = can(request.user?.role, 'ventas', 'read', request.user?.permisosExtra)
    const canReadTaller = can(request.user?.role, 'taller', 'read', request.user?.permisosExtra)
    const [c, saldo, ventas, ventasResumen] = await Promise.all([
      fastify.prisma.cliente.findFirst({ where: { id, ...(includeInactivos ? {} : { activo: true }) } }),
      computeSaldo(fastify.prisma, id),
      canReadVentas ? fastify.prisma.orden.findMany({
        where: { clienteId: id },
        include: { items: true, cargos: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }) : Promise.resolve([]),
      canReadVentas ? computeVentasResumen(fastify.prisma, id) : Promise.resolve({ total: 0, noPagadas: 0, montoTotal: 0 }),
    ])
    if (!c) return reply.code(404).send({ error: 'Cliente no encontrado' })

    const sucursales = await fastify.prisma.clienteSucursal.findMany({
      where: { clienteId: id, activo: true },
      orderBy: [{ isPrincipal: 'desc' }, { nombre: 'asc' }],
    })

    // Enrich ventas with computed total
    const ventasEnriched = ventas.map(o => ({
      id: o.id, tipo: o.tipo, estado: o.estado,
      estadoPago: o.estadoPago, estadoEntrega: o.estadoEntrega,
      licitacion: o.licitacion, createdAt: o.createdAt,
      creadorNombre: o.creadorNombre, abono: o.abono,
      total: computeTotal(o.items, o.descuentoPct, o.cargos, o.descuentoMonto),
    }))

    const ordenIds = canReadTaller
      ? (await fastify.prisma.orden.findMany({ where: { clienteId: id }, select: { id: true } })).map(o => o.id)
      : []
    const [odts, odtsTotal] = ordenIds.length > 0
      ? await Promise.all([
          fastify.prisma.odt.findMany({
            where: { ordenId: { in: ordenIds } },
            orderBy: { createdAt: 'desc' },
            take: 30,
          }),
          fastify.prisma.odt.count({ where: { ordenId: { in: ordenIds } } }),
        ])
      : [[], 0]

    // Consultar bitácora de modificaciones de la tabla auth.audit_log
    let bitacora = []
    try {
      bitacora = await fastify.prisma.$queryRaw`
        SELECT id, user_id AS "userId", user_email AS "userEmail", user_nombre AS "userNombre", role, method, path, status, payload, created_at AS "createdAt"
        FROM auth.audit_log
        WHERE entity = 'clientes' AND entity_id = ${String(id)}
        ORDER BY created_at DESC
        LIMIT 50
      `
    } catch {
      bitacora = []
    }

    return { ...c, saldo, sucursales, ventas: ventasEnriched, ventasResumen, odts, odtsTotal, bitacora }
  })
}
