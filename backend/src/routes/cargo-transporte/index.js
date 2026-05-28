import { rowsToCsv, sendCsv } from '../../utils/csv.js'

function parseId(value) {
  const id = Number.parseInt(value, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

function cleanNombre(value) {
  const nombre = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!nombre) return { error: 'nombre requerido' }
  if (nombre.length < 2) return { error: 'nombre debe tener al menos 2 caracteres' }
  return { nombre }
}

function cleanValor(value) {
  if (value === null || value === undefined || String(value).trim() === '') return { error: 'valor requerido' }
  const valor = Number(value)
  if (!Number.isFinite(valor)) return { error: 'valor debe ser numerico' }
  if (valor < 0 || valor > 100) return { error: 'valor debe estar entre 0 y 100' }
  return { valor }
}

async function findDuplicate(prisma, nombre, excludeId = null) {
  return prisma.cargoTransporte.findFirst({
    where: {
      nombre: { equals: nombre, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  })
}

export default async function cargoTransporteRoutes(fastify) {
  const adminOnly = async (request, reply) => {
    if (request.user?.role !== 'admin') return reply.code(403).send({ error: 'Solo admin' })
  }

  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async () => {
    return fastify.prisma.cargoTransporte.findMany({ orderBy: { nombre: 'asc' } })
  })

  fastify.get('/export', {
    preHandler: [fastify.authenticate, adminOnly],
  }, async (_request, reply) => {
    const cargos = await fastify.prisma.cargoTransporte.findMany({ orderBy: { nombre: 'asc' } })
    const rows = cargos.map((c, idx) => ({
      numero: idx + 1,
      nombre: c.nombre,
      valor: c.valor,
      activo: c.activo ? 'Si' : 'No',
    }))
    const csv = rowsToCsv(rows, [
      { key: 'numero', label: '#' },
      { key: 'nombre', label: 'Nombre Zona' },
      { key: 'valor', label: 'Valor en % aplicado a la Venta' },
      { key: 'activo', label: 'Activo' },
    ])
    return sendCsv(reply, `cargo_transporte_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, adminOnly],
  }, async (request, reply) => {
    const { nombre, valor, activo = true } = request.body || {}
    const parsedNombre = cleanNombre(nombre)
    if (parsedNombre.error) return reply.code(400).send({ error: parsedNombre.error })
    const parsedValor = cleanValor(valor)
    if (parsedValor.error) return reply.code(400).send({ error: parsedValor.error })
    const duplicate = await findDuplicate(fastify.prisma, parsedNombre.nombre)
    if (duplicate) return reply.code(409).send({ error: 'El nombre de cargo transporte ya existe' })
    try {
      const created = await fastify.prisma.cargoTransporte.create({
        data: { nombre: parsedNombre.nombre, valor: parsedValor.valor, activo: Boolean(activo) },
      })
      return reply.code(201).send(created)
    } catch (e) {
      if (e.code === 'P2002') return reply.code(409).send({ error: 'El nombre de cargo transporte ya existe' })
      throw e
    }
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, adminOnly],
  }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const { nombre, valor, activo } = request.body || {}
    const data = {}
    if (nombre !== undefined) {
      const parsedNombre = cleanNombre(nombre)
      if (parsedNombre.error) return reply.code(400).send({ error: parsedNombre.error })
      const duplicate = await findDuplicate(fastify.prisma, parsedNombre.nombre, id)
      if (duplicate) return reply.code(409).send({ error: 'El nombre de cargo transporte ya existe' })
      data.nombre = parsedNombre.nombre
    }
    if (valor !== undefined) {
      const parsedValor = cleanValor(valor)
      if (parsedValor.error) return reply.code(400).send({ error: parsedValor.error })
      data.valor = parsedValor.valor
    }
    if (activo !== undefined) data.activo = Boolean(activo)
    try { return await fastify.prisma.cargoTransporte.update({ where: { id }, data }) }
    catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' })
      if (e.code === 'P2002') return reply.code(409).send({ error: 'El nombre de cargo transporte ya existe' })
      throw e
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, adminOnly],
  }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    try { return await fastify.prisma.cargoTransporte.update({ where: { id }, data: { activo: false } }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })
}
