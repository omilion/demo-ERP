import { applyDateRange, parsePagination, parsePositiveInt } from '../operational-utils.js'
import { getUserSucursalId } from '../caja/scope.js'
import { ODT_ESTADOS, attachOdtMetrics, attachOperarios, attachOrdenes, attachTalleres, normalizeOdtFechaField, tipoTallerFilter } from './operations.js'
import { attachOdtCosteos } from './costeo.js'

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

export const ESTADO_ORDER = {
  Prioritaria: 0,
  'En proceso': 1,
  Asignada: 2,
  Pendiente: 3,
  'Control calidad': 4,
  Terminada: 5,
  Entregada: 6,
  Anulada: 7,
}

function parseEstados(value) {
  if (!value) return null
  const estados = String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  if (!estados.length) return null
  const allowed = new Set(ODT_ESTADOS)
  if (estados.some(estado => !allowed.has(estado))) return { error: 'Estado invalido' }
  return { estados: [...new Set(estados)] }
}

export function sortOdtsOperativas(odts = []) {
  odts.sort((a, b) => {
    const oa = ESTADO_ORDER[a.estado] ?? 99
    const ob = ESTADO_ORDER[b.estado] ?? 99
    if (oa !== ob) return oa - ob
    return new Date(b.createdAt) - new Date(a.createdAt)
  })
  return odts
}

export async function buildOdtListWhere(fastify, query = {}, user, { defaultEstados } = {}) {
  const { tipo, estado, estados, operarioId, search, nInterno, fechaDesde, fechaHasta, fechaCampo, includeEliminados } = query
  const where = {}
  const sucursalId = getUserSucursalId(user)
  if (sucursalId) where.AND = [{ OR: [{ sucursalId }, { sucursalId: null }] }]
  if (includeEliminados !== 'true') where.eliminado = false
  if (tipo) addAnd(where, tipoTallerFilter(tipo))
  if (estado) {
    where.estado = estado
  } else {
    const parsedEstados = parseEstados(estados)
    if (parsedEstados?.error) return { error: parsedEstados.error }
    if (parsedEstados?.estados?.length) where.estado = { in: parsedEstados.estados }
    else if (defaultEstados?.length) where.estado = { in: defaultEstados }
  }
  if (operarioId) {
    if (!/^\d+$/.test(String(operarioId))) return { error: 'Operario invalido' }
    const parsedOperarioId = parseInt(operarioId, 10)
    where.operarioId = parsedOperarioId
  }
  const dateField = normalizeOdtFechaField(fechaCampo)
  if (!dateField) return { error: 'Campo de fecha invalido' }
  if (!applyDateRange(where, dateField, fechaDesde, fechaHasta)) return { error: 'Rango de fechas invalido' }
  if (nInterno) {
    const parsedNInterno = parsePositiveInt(nInterno)
    if (!parsedNInterno) return { error: 'nInterno invalido' }
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
  return { where }
}

export default async function listOdts(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const pagination = parsePagination(request.query, { defaultLimit: 100, maxLimit: 500 })
    if (!pagination) return reply.code(400).send({ error: 'Paginacion invalida' })

    const { where, error } = await buildOdtListWhere(fastify, request.query, request.user)
    if (error) return reply.code(400).send({ error })

    const [odts, total, byEstado] = await Promise.all([
      fastify.prisma.odt.findMany({
        where,
        include: { items: { where: { eliminado: false } } },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      fastify.prisma.odt.count({ where }),
      fastify.prisma.odt.groupBy({ by: ['estado'], where, _count: { _all: true } }),
    ])

    sortOdtsOperativas(odts)

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
    const withTalleres = await attachTalleres(fastify.prisma, withOrdenes)

    const withOperarios = await attachOperarios(fastify.prisma, withTalleres)
    const withMetrics = attachOdtMetrics(withOperarios)
    const withCosteo = await attachOdtCosteos(fastify.prisma, withMetrics)
    return {
      items: withCosteo,
      total,
      limit: pagination.limit,
      page: pagination.page,
      pages: Math.max(1, Math.ceil(total / pagination.limit)),
      stats,
    }
  })
}
