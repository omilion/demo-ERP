import { applyDateRange, parsePagination } from '../operational-utils.js'
import { getUserSucursalId } from '../caja/scope.js'
import { attachOperarios } from './operations.js'

function tipoTallerFilter(tipo) {
  const text = String(tipo || '').toLowerCase()
  const names = []
  if (text.includes('espuma')) names.push('espuma')
  else if (text.includes('confe')) names.push('confe')
  else if (text.includes('madera')) names.push('madera', 'externo')
  else if (text.includes('externo')) names.push('externo', 'madera')
  if (!names.length) return { tipo }
  return {
    OR: [
      { tipo },
      ...names.map(name => ({
        items: {
          some: {
            eliminado: false,
            talleres: {
              some: { taller: { is: { nombre: { contains: name, mode: 'insensitive' } } } },
            },
          },
        },
      })),
    ],
  }
}

export default async function listOdts(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const { tipo, estado, operarioId, search, fechaDesde, fechaHasta, includeEliminados } = request.query
    const pagination = parsePagination(request.query, { defaultLimit: 100, maxLimit: 500 })
    if (!pagination) return reply.code(400).send({ error: 'Paginacion invalida' })

    const where = {}
    const sucursalId = getUserSucursalId(request.user)
    if (sucursalId) where.AND = [{ OR: [{ sucursalId }, { sucursalId: null }] }]
    if (includeEliminados !== 'true') where.eliminado = false
    if (tipo) where.AND = [...(where.AND || []), tipoTallerFilter(tipo)]
    if (estado) where.estado = estado
    if (operarioId) {
      if (!/^\d+$/.test(String(operarioId))) return reply.code(400).send({ error: 'Operario invalido' })
      const parsedOperarioId = parseInt(operarioId, 10)
      where.operarioId = parsedOperarioId
    }
    if (!applyDateRange(where, 'createdAt', fechaDesde, fechaHasta)) return reply.code(400).send({ error: 'Rango de fechas invalido' })
    if (search) {
      const isNum = /^\d+$/.test(search.trim())
      where.AND = [...(where.AND || []), {
        OR: isNum
          ? [{ id: parseInt(search, 10) }]
          : [
              { clienteNombre: { contains: search, mode: 'insensitive' } },
              { descripcion: { contains: search, mode: 'insensitive' } },
            ],
      }]
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

    return {
      items: await attachOperarios(fastify.prisma, odts),
      total,
      limit: pagination.limit,
      page: pagination.page,
      stats,
    }
  })
}
