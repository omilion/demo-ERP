// G12: CRUD de multas asociadas a ventas/licitaciones
import { syncOrdenFinancialState } from '../ventas/financial.js'

export default async function multasRoutes(fastify) {
  // GET /api/multas?ordenId=&desde=&hasta=
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request) => {
    const { ordenId, desde, hasta } = request.query
    const where = {}
    if (ordenId) where.ordenId = parseInt(ordenId, 10)
    if (desde || hasta) {
      where.fecha = {}
      if (desde) where.fecha.gte = new Date(desde)
      if (hasta) where.fecha.lte = new Date(hasta + 'T23:59:59')
    }
    const items = await fastify.prisma.multa.findMany({ where, orderBy: { fecha: 'desc' } })
    const total = items.reduce((s, m) => s + (m.monto || 0), 0)
    return { items, total }
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    const m = await fastify.prisma.multa.findUnique({ where: { id } })
    if (!m) return reply.code(404).send({ error: 'no encontrada' })
    return m
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const b = request.body || {}
    const monto = Number(b.monto)
    if (!Number.isInteger(monto) || monto <= 0) return reply.code(400).send({ error: 'monto requerido' })
    const usuario = request.user?.nombre || request.user?.username || null
    const m = await fastify.prisma.$transaction(async (tx) => {
      const multa = await tx.multa.create({
        data: {
          ordenId: b.ordenId ? parseInt(b.ordenId, 10) : null,
          interno: b.interno || null,
          monto,
          nDocumento: b.nDocumento || null,
          fecha: b.fecha ? new Date(b.fecha) : new Date(),
          numero: b.numero || null,
          usuario,
        },
      })
      if (multa.ordenId) await syncOrdenFinancialState(tx, multa.ordenId, { userMod: usuario, fecha: new Date() })
      return multa
    })
    return reply.code(201).send(m)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    const b = request.body || {}
    const data = {}
    if (b.monto !== undefined) {
      const monto = Number(b.monto)
      if (!Number.isInteger(monto) || monto <= 0) return reply.code(400).send({ error: 'monto invalido' })
      data.monto = monto
    }
    if (b.nDocumento !== undefined) data.nDocumento = b.nDocumento
    if (b.numero !== undefined) data.numero = b.numero
    if (b.interno !== undefined) data.interno = b.interno
    if (b.fecha !== undefined) data.fecha = b.fecha ? new Date(b.fecha) : null
    try {
      return await fastify.prisma.$transaction(async (tx) => {
        const multa = await tx.multa.update({ where: { id }, data })
        if (multa.ordenId) {
          await syncOrdenFinancialState(tx, multa.ordenId, {
            userMod: request.user?.nombre || request.user?.username || null,
            fecha: new Date(),
          })
        }
        return multa
      })
    }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrada' }); throw e }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    try {
      const m = await fastify.prisma.$transaction(async (tx) => {
        const multa = await tx.multa.delete({ where: { id } })
        if (multa.ordenId) {
          await syncOrdenFinancialState(tx, multa.ordenId, {
            userMod: request.user?.nombre || request.user?.username || null,
            fecha: new Date(),
          })
        }
        return multa
      })
      return m
    } catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrada' }); throw e }
  })
}
