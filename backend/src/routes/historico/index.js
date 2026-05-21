import { buildCorteResumen, buildOrdenScopeWhere, mergeWhere } from './corte.js'
import { parsePositiveInt } from '../operational-utils.js'

export default async function historicoRoutes(fastify) {
  const onlyAdmin = async (req, reply) => {
    if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
  }

  fastify.get('/corte', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async () => buildCorteResumen(fastify.prisma))

  fastify.get('/ordenes', {
    preHandler: [fastify.authenticate, onlyAdmin],
  }, async (request, reply) => {
    const { search, rut, nInterno, desde, hasta, page = '1' } = request.query
    const LIMIT = 100
    const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1)
    const skip = (parsedPage - 1) * LIMIT
    const parsedNInterno = nInterno ? parsePositiveInt(nInterno) : null
    if (nInterno && !parsedNInterno) return reply.code(400).send({ error: 'nInterno invalido' })

    const createdAt = {}
    if (desde) {
      const d = new Date(`${desde}T00:00:00.000`)
      if (Number.isNaN(d.getTime())) return reply.code(400).send({ error: 'desde invalido' })
      createdAt.gte = d
    }
    if (hasta) {
      const h = new Date(`${hasta}T23:59:59.999`)
      if (Number.isNaN(h.getTime())) return reply.code(400).send({ error: 'hasta invalido' })
      createdAt.lte = h
    }

    const resumen = await buildCorteResumen(fastify.prisma)
    const base = { eliminada: false }
    if (Object.keys(createdAt).length) base.createdAt = createdAt
    if (rut) base.rutCliente = { contains: rut, mode: 'insensitive' }
    if (parsedNInterno) base.nInterno = parsedNInterno
    if (search) {
      const trimmed = search.trim()
      const isNum = /^\d+$/.test(trimmed)
      base.OR = [
        { rutCliente: { contains: trimmed, mode: 'insensitive' } },
        { creadorNombre: { contains: trimmed, mode: 'insensitive' } },
        { licitacion: { contains: trimmed, mode: 'insensitive' } },
        { observaciones: { contains: trimmed, mode: 'insensitive' } },
        ...(isNum ? [{ id: Number.parseInt(trimmed, 10) }, { nInterno: Number.parseInt(trimmed, 10) }] : []),
      ]
    }

    const where = mergeWhere(base, buildOrdenScopeWhere('historico', resumen.corte))
    const [items, total] = await Promise.all([
      fastify.prisma.orden.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: LIMIT,
        skip,
        select: {
          id: true,
          nInterno: true,
          tipo: true,
          estado: true,
          estadoPago: true,
          estadoEntrega: true,
          rutCliente: true,
          clienteId: true,
          licitacion: true,
          creadorNombre: true,
          createdAt: true,
          _count: { select: { items: true, despachos: true, guiasDespacho: true, movimientosCaja: true } },
        },
      }),
      fastify.prisma.orden.count({ where }),
    ])

    return {
      items,
      total,
      limit: LIMIT,
      page: parsedPage,
      corte: resumen.corte,
    }
  })
}
