import listRoute from './list.js'
import createRoute from './create.js'
import getRoute from './get.js'
import updateRoute from './update.js'
import bitacoraRoute from './bitacora.js'
import itemWorkflowRoute from './item-workflow.js'
import consumosRoute from './consumos.js'
import { ODT_ESTADOS, ODT_ESTADOS_ABIERTOS, buildOperarioCargaItems } from './operations.js'

export default async function odtsRoutes(fastify) {
  fastify.register(listRoute)
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
    const items = await fastify.prisma.trabajador.findMany({
      where,
      orderBy: [{ apellidoPaterno: 'asc' }, { nombres: 'asc' }],
      take: 200,
      select: { id: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true, cargo: true, empresa: true },
    })
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
    const trabajadores = operarioIds.length
      ? await fastify.prisma.trabajador.findMany({
        where: { id: { in: operarioIds } },
        select: { id: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true, cargo: true, empresa: true, estado: true },
      })
      : []
    return { items: buildOperarioCargaItems(groups, trabajadores), estados: ODT_ESTADOS_ABIERTOS }
  })
}
