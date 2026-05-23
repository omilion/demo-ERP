import { applyDateRange } from '../operational-utils.js'
import { attachOperarios } from './operations.js'

export default async function listOdts(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const { tipo, estado, operarioId, search, fechaDesde, fechaHasta } = request.query
    const LIMIT = 100

    const where = {}
    if (tipo) where.tipo = tipo
    if (estado) where.estado = estado
    if (operarioId) {
      if (!/^\d+$/.test(String(operarioId))) return reply.code(400).send({ error: 'Operario invalido' })
      const parsedOperarioId = parseInt(operarioId, 10)
      where.operarioId = parsedOperarioId
    }
    if (!applyDateRange(where, 'createdAt', fechaDesde, fechaHasta)) return reply.code(400).send({ error: 'Rango de fechas invalido' })
    if (search) {
      const isNum = /^\d+$/.test(search.trim())
      where.OR = [
        { clienteNombre: { contains: search, mode: 'insensitive' } },
        { descripcion: { contains: search, mode: 'insensitive' } },
        ...(isNum ? [{ id: parseInt(search, 10) }] : []),
      ]
    }

    const ESTADO_ORDER = {
      Prioritaria: 0,
      'En proceso': 1,
      Asignada: 2,
      Pendiente: 3,
      'Control calidad': 4,
      Terminada: 5,
      Entregada: 6,
    }

    const [odts, total, byEstado] = await Promise.all([
      fastify.prisma.odt.findMany({ where, orderBy: { createdAt: 'desc' }, take: LIMIT }),
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
    }
    for (const g of byEstado) stats[g.estado] = g._count._all

    return { items: await attachOperarios(fastify.prisma, odts), total, limit: LIMIT, stats }
  })
}
