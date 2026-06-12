import { parsePositiveInt } from '../operational-utils.js'
import { ODT_ESTADOS_ABIERTOS, attachOdtMetrics, attachOperarios, attachOrdenes, attachTalleres } from './operations.js'
import { buildOdtListWhere, sortOdtsOperativas } from './list.js'
import { attachOdtCosteos } from './costeo.js'

const KANBAN_DEFAULT_LIMIT = 1000
const KANBAN_MAX_LIMIT = 2000

const KANBAN_SELECT = {
  id: true,
  ordenId: true,
  tipo: true,
  clienteNombre: true,
  descripcion: true,
  estado: true,
  prioridad: true,
  operarioId: true,
  sucursalId: true,
  fechaIngreso: true,
  fechaInicio: true,
  fechaTermino: true,
  plazo: true,
  eliminado: true,
  createdAt: true,
}

function parseKanbanLimit(value) {
  if (value == null || value === '') return KANBAN_DEFAULT_LIMIT
  const parsed = parsePositiveInt(value)
  if (!parsed) return null
  return Math.min(parsed, KANBAN_MAX_LIMIT)
}

export default async function kanbanOdts(fastify) {
  fastify.get('/kanban', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const limit = parseKanbanLimit(request.query?.limit)
    if (!limit) return reply.code(400).send({ error: 'Limite invalido' })

    const { where, error } = await buildOdtListWhere(fastify, request.query, request.user, {
      defaultEstados: ODT_ESTADOS_ABIERTOS,
    })
    if (error) return reply.code(400).send({ error })

    const [odts, total, byEstado] = await Promise.all([
      fastify.prisma.odt.findMany({
        where,
        select: KANBAN_SELECT,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      fastify.prisma.odt.count({ where }),
      fastify.prisma.odt.groupBy({ by: ['estado'], where, _count: { _all: true } }),
    ])

    sortOdtsOperativas(odts)

    const stats = Object.fromEntries(ODT_ESTADOS_ABIERTOS.map(estado => [estado, 0]))
    for (const g of byEstado) stats[g.estado] = g._count._all
    const withOrdenes = await attachOrdenes(fastify.prisma, odts)
    const withTalleres = await attachTalleres(fastify.prisma, withOrdenes)
    const withOperarios = await attachOperarios(fastify.prisma, withTalleres)
    const withMetrics = attachOdtMetrics(withOperarios)
    const withCosteo = await attachOdtCosteos(fastify.prisma, withMetrics)

    return {
      items: withCosteo,
      total,
      limit,
      truncated: total > limit,
      stats,
      estados: ODT_ESTADOS_ABIERTOS,
    }
  })
}
