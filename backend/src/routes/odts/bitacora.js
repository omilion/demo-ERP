import { getUserSucursalId } from '../caja/scope.js'
import { resolveOdtForWrite } from '../relation-guards.js'

function auditUsuario(user) {
  return String(user?.nombre || user?.email || '').trim() || 'Sistema'
}

async function isCorteOdt(prisma, odtId) {
  const odt = await prisma.odt.findUnique({
    where: { id: odtId },
    select: { items: { select: { talleres: { select: { taller: { select: { nombre: true } } } } } } },
  })
  return Boolean(odt?.items?.some(item => item.talleres?.some(rel => /corte/i.test(rel.taller?.nombre || ''))))
}

export default async function bitacoraRoutes(fastify) {
  // GET /odts/:id/bitacora
  fastify.get('/:id/bitacora', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const odtId = parseInt(request.params.id, 10)
    if (isNaN(odtId)) return reply.code(400).send({ error: 'ID invalido' })
    const sucursalId = getUserSucursalId(request.user)
    const odt = await fastify.prisma.odt.findFirst({
      where: { id: odtId, ...(sucursalId ? { OR: [{ sucursalId }, { sucursalId: null }] } : {}) },
      select: { id: true },
    })
    if (!odt) return reply.code(404).send({ error: 'ODT no encontrada' })
    const entries = await fastify.prisma.bitacoraTaller.findMany({
      where: { odtId },
      orderBy: [{ fecha: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    })
    return entries
  })

  // POST /odts/:id/bitacora
  fastify.post('/:id/bitacora', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const odtId = parseInt(request.params.id, 10)
    if (isNaN(odtId)) return reply.code(400).send({ error: 'ID invalido' })
    const { texto } = request.body || {}
    if (!texto?.trim()) return reply.code(400).send({ error: 'texto requerido' })
    const resolved = await resolveOdtForWrite(fastify.prisma, odtId, { user: request.user, includeSucursal: true, allowWithoutOrden: true })
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
    const usuario = auditUsuario(request.user)
    const entry = await fastify.prisma.bitacoraTaller.create({
      data: {
        odtId,
        usuario,
        usuarioReporta: usuario,
        ipEquipo: request.ip,
        sucursalId: resolved.odt.sucursalId ?? getUserSucursalId(request.user),
        fecha: new Date(),
        texto: texto.trim(),
      },
    })
    return reply.code(201).send(entry)
  })

  // DELETE /odts/:id/bitacora/:entryId
  fastify.delete('/:id/bitacora/:entryId', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'delete')],
  }, async (request, reply) => {
    const entryId = parseInt(request.params.entryId, 10)
    if (isNaN(entryId)) return reply.code(400).send({ error: 'ID invalido' })
    const odtId = parseInt(request.params.id, 10)
    if (isNaN(odtId)) return reply.code(400).send({ error: 'ID invalido' })
    if (await isCorteOdt(fastify.prisma, odtId)) {
      return reply.code(409).send({ error: 'La bitacora de Taller de Corte es append-only y no se puede borrar' })
    }
    const sucursalId = getUserSucursalId(request.user)
    try {
      if (sucursalId) {
        const odt = await fastify.prisma.odt.findFirst({ where: { id: odtId, OR: [{ sucursalId }, { sucursalId: null }] }, select: { id: true } })
        if (!odt) return reply.code(404).send({ error: 'ODT no encontrada' })
      }
      const entry = await fastify.prisma.bitacoraTaller.findFirst({
        where: { id: entryId, odtId },
      })
      if (!entry) return reply.code(404).send({ error: 'Entrada no encontrada' })
      await fastify.prisma.bitacoraTaller.delete({ where: { id: entryId } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Entrada no encontrada' })
      throw e
    }
  })
}
