import { getUserSucursalId } from '../caja/scope.js'
import { computeTotal } from '../ventas/helpers.js'
import { attachOdtMetrics, attachOperarios } from './operations.js'
import { attachOdtCosteos } from './costeo.js'

export default async function getOdt(fastify) {
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const sucursalId = getUserSucursalId(request.user)
    const o = await fastify.prisma.odt.findFirst({
      where: { id, eliminado: false, ...(sucursalId ? { OR: [{ sucursalId }, { sucursalId: null }] } : {}) },
      include: {
        items: { where: { eliminado: false }, include: { talleres: { include: { taller: true } } } },
        bitacora: { orderBy: [{ fecha: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }] },
      },
    })
    if (!o) return reply.code(404).send({ error: 'ODT no encontrada' })

    let orden = null
    if (o.ordenId) {
      orden = await fastify.prisma.orden.findUnique({
        where: { id: o.ordenId },
        select: {
          id: true, nInterno: true, tipo: true, estado: true, estadoPago: true, estadoEntrega: true,
          clienteId: true, createdAt: true, descuentoPct: true,
          items: { select: { cantidad: true, precioUnitario: true } },
        },
      })
      if (orden) {
        orden = { ...orden, total: computeTotal(orden.items || [], orden.descuentoPct) }
      }
      if (orden?.clienteId) {
        const cliente = await fastify.prisma.cliente.findUnique({
          where: { id: orden.clienteId },
          select: { id: true, nombre: true, rut: true },
        })
        orden = { ...orden, cliente }
      }
    }
    const withOperario = await attachOperarios(fastify.prisma, o)
    const withMetrics = attachOdtMetrics(withOperario)
    const withCosteo = await attachOdtCosteos(fastify.prisma, withMetrics)
    return { ...withCosteo, orden }
  })
}
