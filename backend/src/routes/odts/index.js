import listRoute from './list.js'
import kanbanRoute from './kanban.js'
import createRoute from './create.js'
import getRoute from './get.js'
import updateRoute from './update.js'
import bitacoraRoute from './bitacora.js'
import itemWorkflowRoute from './item-workflow.js'
import consumosRoute from './consumos.js'
import { parseDate, parsePositiveInt } from '../operational-utils.js'
import { attachOdtCosteos, buildProductividadOperarios } from './costeo.js'
import { ODT_ESTADOS, ODT_ESTADOS_ABIERTOS, attachOdtMetrics, attachOperarios, buildOperarioCargaItems, isPrismaMissingTable, tipoTallerFilter } from './operations.js'

function defaultProductividadDesde(now = new Date()) {
  const desde = new Date(now)
  desde.setDate(desde.getDate() - 90)
  desde.setHours(0, 0, 0, 0)
  return desde
}

export default async function odtsRoutes(fastify) {
  fastify.register(listRoute)
  fastify.register(kanbanRoute)
  fastify.register(createRoute)
  fastify.register(getRoute)
  fastify.register(updateRoute)
  fastify.register(bitacoraRoute)
  fastify.register(itemWorkflowRoute)
  fastify.register(consumosRoute)
  fastify.get('/meta/operarios', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request) => {
    const { search, empresa, cargo } = request.query || {}
    const where = { estado: true }
    if (empresa) where.empresa = empresa
    if (cargo) where.cargo = { contains: cargo, mode: 'insensitive' }
    if (search) {
      where.OR = [
        { nombres: { contains: search, mode: 'insensitive' } },
        { apellidoPaterno: { contains: search, mode: 'insensitive' } },
        { apellidoMaterno: { contains: search, mode: 'insensitive' } },
        { rut: { contains: search, mode: 'insensitive' } },
        { cargo: { contains: search, mode: 'insensitive' } },
      ]
    }
    let items = []
    try {
      items = await fastify.prisma.trabajador.findMany({
        where,
        orderBy: [{ apellidoPaterno: 'asc' }, { nombres: 'asc' }],
        take: 200,
        select: { id: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true, cargo: true, empresa: true },
      })
    } catch (error) {
      if (!isPrismaMissingTable(error)) throw error
    }
    return { items, estados: ODT_ESTADOS }
  })
  fastify.get('/meta/carga-operarios', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async () => {
    const groups = await fastify.prisma.odt.groupBy({
      by: ['operarioId', 'estado'],
      where: {
        operarioId: { not: null },
        eliminado: false,
        estado: { in: ODT_ESTADOS_ABIERTOS },
      },
      _count: { _all: true },
    })
    const operarioIds = [...new Set(groups.map(g => g.operarioId).filter(Boolean))]
    let trabajadores = []
    if (operarioIds.length) {
      try {
        trabajadores = await fastify.prisma.trabajador.findMany({
          where: { id: { in: operarioIds } },
          select: { id: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true, cargo: true, empresa: true, estado: true },
        })
      } catch (error) {
        if (!isPrismaMissingTable(error)) throw error
      }
    }
    return { items: buildOperarioCargaItems(groups, trabajadores), estados: ODT_ESTADOS_ABIERTOS }
  })
  fastify.get('/meta/productividad', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const now = new Date()
    const desde = request.query?.fechaDesde ? parseDate(request.query.fechaDesde) : defaultProductividadDesde(now)
    const hasta = request.query?.fechaHasta ? parseDate(request.query.fechaHasta, true) : now
    if (!desde || !hasta || hasta < desde) return reply.code(400).send({ error: 'Rango de fechas invalido' })

    const where = {
      eliminado: false,
      estado: { in: ['Terminada', 'Entregada'] },
      fechaTermino: { gte: desde, lte: hasta },
    }
    if (request.query?.tipo) {
      where.AND = [tipoTallerFilter(request.query.tipo)]
    }
    if (request.query?.operarioId) {
      const operarioId = parsePositiveInt(request.query.operarioId)
      if (!operarioId) return reply.code(400).send({ error: 'Operario invalido' })
      where.operarioId = operarioId
    }

    const odts = await fastify.prisma.odt.findMany({
      where,
      orderBy: { fechaTermino: 'desc' },
      take: 500,
      select: {
        id: true,
        ordenId: true,
        tipo: true,
        estado: true,
        operarioId: true,
        fechaInicio: true,
        fechaTermino: true,
        createdAt: true,
      },
    })
    const withOperarios = await attachOperarios(fastify.prisma, odts)
    const withMetrics = attachOdtMetrics(withOperarios, now)
    const withCosteo = await attachOdtCosteos(fastify.prisma, withMetrics, now)
    const items = buildProductividadOperarios(withCosteo)
    return {
      items,
      totalOdts: withCosteo.length,
      fechaDesde: desde,
      fechaHasta: hasta,
      limit: 500,
      truncated: withCosteo.length >= 500,
    }
  })
}
