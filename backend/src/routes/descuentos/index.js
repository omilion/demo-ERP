import { canApplyDescuento } from '../ventas/descuentos-permissions.js'

function parseId(value) {
  const id = parseInt(value, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

function parseValor(body, { integerOnly = false } = {}) {
  const raw = body?.valor
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { error: 'valor requerido' }
  }
  const valor = Number(raw)
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
    return { error: 'valor debe estar entre 0 y 100' }
  }
  if (integerOnly && !Number.isInteger(valor)) {
    return { error: 'valor debe ser entero entre 0 y 100' }
  }
  return { valor }
}

export default async function descuentosRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async () => {
    const [normales, marco] = await Promise.all([
      fastify.prisma.descuentoPorc.findMany({ where: { activo: true }, orderBy: { valor: 'asc' } }),
      fastify.prisma.descuentoPorcMarco.findMany({ where: { activo: true }, orderBy: { valor: 'asc' } }),
    ])
    return { normales, marco }
  })

  for (const [path, model, integerOnly] of [['normales', 'descuentoPorc', true], ['marco', 'descuentoPorcMarco', false]]) {
    fastify.post(`/${path}`, {
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      if (!canApplyDescuento(request.user)) return reply.code(403).send({ error: 'No tiene permiso para administrar descuentos' })
      const parsed = parseValor(request.body, { integerOnly })
      if (parsed.error) return reply.code(400).send({ error: parsed.error })
      const exists = await fastify.prisma[model].findFirst({
        where: { valor: parsed.valor, activo: true },
        select: { id: true },
      })
      if (exists) return reply.code(409).send({ error: 'Valor de descuento ya existe' })
      const item = await fastify.prisma[model].create({ data: { valor: parsed.valor } })
      return reply.code(201).send(item)
    })

    fastify.put(`/${path}/:id`, {
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      if (!canApplyDescuento(request.user)) return reply.code(403).send({ error: 'No tiene permiso para administrar descuentos' })
      const id = parseId(request.params.id)
      if (!id) return reply.code(400).send({ error: 'ID invalido' })
      const parsed = parseValor(request.body, { integerOnly })
      if (parsed.error) return reply.code(400).send({ error: parsed.error })
      const exists = await fastify.prisma[model].findFirst({
        where: { valor: parsed.valor, activo: true, id: { not: id } },
        select: { id: true },
      })
      if (exists) return reply.code(409).send({ error: 'Valor de descuento ya existe' })

      const updated = await fastify.prisma[model].updateMany({
        where: { id, activo: true },
        data: { valor: parsed.valor },
      })
      if (updated.count === 0) return reply.code(404).send({ error: 'No encontrado' })
      return fastify.prisma[model].findUnique({ where: { id } })
    })

    fastify.delete(`/${path}/:id`, {
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      if (!canApplyDescuento(request.user)) return reply.code(403).send({ error: 'No tiene permiso para administrar descuentos' })
      const id = parseId(request.params.id)
      if (!id) return reply.code(400).send({ error: 'ID invalido' })
      try {
        await fastify.prisma[model].update({ where: { id }, data: { activo: false } })
        return reply.code(204).send()
      } catch (e) {
        if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
        throw e
      }
    })
  }
}
