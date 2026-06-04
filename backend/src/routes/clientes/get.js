import { computeSaldo } from './helpers.js'
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
    const [c, saldo, ventas] = await Promise.all([
      fastify.prisma.cliente.findFirst({ where: { id, ...(includeInactivos ? {} : { activo: true }) } }),
      computeSaldo(fastify.prisma, id),
      canReadVentas ? fastify.prisma.orden.findMany({
        where: { clienteId: id },
        include: { items: true, cargos: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }) : Promise.resolve([]),
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

    // Fetch ODTs linked to any of this client's ventas
    const ordenIds = canReadTaller
      ? (canReadVentas
          ? ventas.map(o => o.id)
          : (await fastify.prisma.orden.findMany({ where: { clienteId: id }, select: { id: true } })).map(o => o.id))
      : []
    const odts = canReadTaller && ordenIds.length > 0
      ? await fastify.prisma.odt.findMany({
          where: { ordenId: { in: ordenIds } },
          orderBy: { createdAt: 'desc' },
          take: 30,
        })
      : []

    return { ...c, saldo, sucursales, ventas: ventasEnriched, odts }
  })
}
