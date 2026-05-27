import { rowsToCsv, sendCsv } from '../../utils/csv.js'

function parseId(value) {
  const id = parseInt(value, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

function cleanNombre(value) {
  const nombre = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!nombre) return { error: 'nombre requerido' }
  if (nombre.length < 2) return { error: 'nombre debe tener al menos 2 caracteres' }
  return { nombre }
}

async function findDuplicate(prisma, nombre, excludeId = null) {
  return prisma.gasto.findFirst({
    where: {
      nombre: { equals: nombre, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  })
}

export default async function gastosRoutes(fastify) {
  const adminOnly = async (request, reply) => {
    if (request.user?.role !== 'admin') return reply.code(403).send({ error: 'Solo admin' })
  }

  fastify.get('/', { preHandler: [fastify.authenticate] }, async () => {
    return fastify.prisma.gasto.findMany({ orderBy: { nombre: 'asc' } })
  })

  fastify.get('/export', { preHandler: [fastify.authenticate, adminOnly] }, async (_request, reply) => {
    const gastos = await fastify.prisma.gasto.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { movimientos: true } } },
    })
    const rows = gastos.map((g, idx) => ({
      numero: idx + 1,
      nombre: g.nombre,
      activo: g.activo ? 'Si' : 'No',
      movimientos: g._count.movimientos,
    }))
    const csv = rowsToCsv(rows, [
      { key: 'numero', label: '#' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'activo', label: 'Activo' },
      { key: 'movimientos', label: 'Movimientos caja' },
    ])
    return sendCsv(reply, `gastos_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.post('/', { preHandler: [fastify.authenticate, adminOnly] }, async (request, reply) => {
    const { activo = true } = request.body || {}
    const parsed = cleanNombre(request.body?.nombre)
    if (parsed.error) return reply.code(400).send({ error: parsed.error })
    const duplicate = await findDuplicate(fastify.prisma, parsed.nombre)
    if (duplicate) return reply.code(409).send({ error: 'El nombre de gasto ya existe' })
    try {
      const created = await fastify.prisma.gasto.create({ data: { nombre: parsed.nombre, activo: Boolean(activo) } })
      return reply.code(201).send(created)
    } catch (e) {
      if (e.code === 'P2002') return reply.code(409).send({ error: 'El nombre de gasto ya existe' })
      throw e
    }
  })

  fastify.put('/:id', { preHandler: [fastify.authenticate, adminOnly] }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const { nombre, activo } = request.body || {}
    const data = {}
    if (nombre !== undefined) {
      const parsed = cleanNombre(nombre)
      if (parsed.error) return reply.code(400).send({ error: parsed.error })
      const duplicate = await findDuplicate(fastify.prisma, parsed.nombre, id)
      if (duplicate) return reply.code(409).send({ error: 'El nombre de gasto ya existe' })
      data.nombre = parsed.nombre
    }
    if (activo !== undefined) data.activo = Boolean(activo)
    try {
      return await fastify.prisma.gasto.update({ where: { id }, data })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' })
      if (e.code === 'P2002') return reply.code(409).send({ error: 'El nombre de gasto ya existe' })
      throw e
    }
  })

  fastify.delete('/:id', { preHandler: [fastify.authenticate, adminOnly] }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const gasto = await fastify.prisma.gasto.findUnique({
      where: { id },
      include: { _count: { select: { movimientos: true } } },
    })
    if (!gasto) return reply.code(404).send({ error: 'no encontrado' })
    if (gasto._count.movimientos > 0) {
      const updated = await fastify.prisma.gasto.update({ where: { id }, data: { activo: false } })
      return reply.send({ ...updated, desactivadoPorUso: true })
    }
    await fastify.prisma.gasto.delete({ where: { id } })
    return reply.code(204).send()
  })
}
