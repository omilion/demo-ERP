import { applyDateRange, parsePagination, parsePositiveInt } from '../operational-utils.js'
import { getUserSucursalId } from '../caja/scope.js'
import { attachOperarios, attachOrdenes, normalizeOdtFechaField, tipoTallerFilter } from './operations.js'

function addAnd(where, clause) {
  where.AND = [...(where.AND || []), clause]
}

async function buildNumericOdtSearchConditions(prisma, value) {
  const parsed = parsePositiveInt(value)
  if (!parsed) return [{ id: -1 }]
  const ordenes = await prisma.orden.findMany({
    where: { nInterno: parsed },
    select: { id: true },
    take: 200,
  })
  const ordenIds = ordenes.map(o => o.id)
  return [
    { id: parsed },
    { ordenId: parsed },
    ...(ordenIds.length ? [{ ordenId: { in: ordenIds } }] : []),
  ]
}

export default async function listOdts(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const { tipo, estado, operarioId, search, nInterno, fechaDesde, fechaHasta, fechaCampo, includeEliminados } = request.query
    const pagination = parsePagination(request.query, { defaultLimit: 100, maxLimit: 500 })
    if (!pagination) return reply.code(400).send({ error: 'Paginacion invalida' })

    const where = {}
    const sucursalId = getUserSucursalId(request.user)
    if (sucursalId) where.AND = [{ OR: [{ sucursalId }, { sucursalId: null }] }]
    if (includeEliminados !== 'true') where.eliminado = false
    if (tipo) addAnd(where, tipoTallerFilter(tipo))
    if (estado) where.estado = estado
    if (operarioId) {
      if (!/^\d+$/.test(String(operarioId))) return reply.code(400).send({ error: 'Operario invalido' })
      const parsedOperarioId = parseInt(operarioId, 10)
      where.operarioId = parsedOperarioId
    }
    const dateField = normalizeOdtFechaField(fechaCampo)
    if (!dateField) return reply.code(400).send({ error: 'Campo de fecha invalido' })
    if (!applyDateRange(where, dateField, fechaDesde, fechaHasta)) return reply.code(400).send({ error: 'Rango de fechas invalido' })
    if (nInterno) {
      const parsedNInterno = parsePositiveInt(nInterno)
      if (!parsedNInterno) return reply.code(400).send({ error: 'nInterno invalido' })
      const ordenes = await fastify.prisma.orden.findMany({
        where: { nInterno: parsedNInterno },
        select: { id: true },
        take: 200,
      })
      const ordenIds = ordenes.map(o => o.id)
      addAnd(where, {
        OR: [
          { ordenId: parsedNInterno },
          ...(ordenIds.length ? [{ ordenId: { in: ordenIds } }] : []),
        ],
      })
    }
    if (search) {
      const isNum = /^\d+$/.test(search.trim())
      addAnd(where, {
        OR: isNum
          ? await buildNumericOdtSearchConditions(fastify.prisma, search)
          : [
              { clienteNombre: { contains: search, mode: 'insensitive' } },
              { descripcion: { contains: search, mode: 'insensitive' } },
            ],
      })
    }

    const ESTADO_ORDER = {
      Prioritaria: 0,
      'En proceso': 1,
      Asignada: 2,
      Pendiente: 3,
      'Control calidad': 4,
      Terminada: 5,
      Entregada: 6,
      Anulada: 7,
    }

    const [odts, total, byEstado] = await Promise.all([
      fastify.prisma.odt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      fastify.prisma.odt.count({ where }),
      fastify.prisma.odt.groupBy({ by: ['estado'], where, _count: { _all: true } }),
    ])

    odts.sort((a, b) => {
      const oa = ESTADO_ORDER[a.estado] ?? 99
      const ob = ESTADO_ORDER[b.estado] ?? 99
      if (oa !== ob) return oa - ob
      return new Date(b.createdAt) - new Date(a.createdAt)
    })

    const stats = {
      Prioritaria: 0,
      'En proceso': 0,
      Asignada: 0,
      Pendiente: 0,
      'Control calidad': 0,
      Terminada: 0,
      Entregada: 0,
      Anulada: 0,
    }
    for (const g of byEstado) stats[g.estado] = g._count._all
    const withOrdenes = await attachOrdenes(fastify.prisma, odts)

    return {
      items: await attachOperarios(fastify.prisma, withOrdenes),
      total,
      limit: pagination.limit,
      page: pagination.page,
      pages: Math.max(1, Math.ceil(total / pagination.limit)),
      stats,
    }
  })
}
