// Gestión de despachos y guías
import { z } from 'zod'
import { applyDateRange, parseDate, parseOptionalInt, parsePage, parsePositiveInt } from '../operational-utils.js'

const DespachoCreate = z.object({
  ordenId: z.union([z.number().int(), z.string()]).optional().nullable(),
  interno: z.string().optional().nullable(),
  plazoEntrega: z.string().optional().nullable(),
  fechaInterno: z.string().optional().nullable(),
  fechaEntrega: z.string().optional().nullable(),
  tipoDespacho: z.string().optional().nullable(),
  transporte: z.string().optional().nullable(),
  montoEnvio: z.union([z.number(), z.string()]).optional().nullable(),
  direccion: z.string().optional().nullable(),
  contacto: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  comuna: z.string().optional().nullable(),
  parcial: z.boolean().optional(),
  tieneMulta: z.boolean().optional(),
})

const GuiaCreate = z.object({
  ordenId: z.union([z.number().int(), z.string()]).optional().nullable(),
  nInterno: z.union([z.number().int(), z.string()]).optional().nullable(),
  nGuia: z.string().min(1),
  fechaGuia: z.string().optional().nullable(),
  origen: z.string().optional().nullable(),
})

export default async function despachosRoutes(fastify) {
  // GET /api/despachos?desde=&hasta=&ordenId=&tipo=&page=1
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const { desde, hasta, ordenId, tipo, contacto, transporte, region, comuna, parcial, tieneMulta, search, page = '1' } = request.query
    const LIMIT = 100
    const skip = (parsePage(page) - 1) * LIMIT
    const where = {}
    if (ordenId) {
      const parsedOrdenId = parsePositiveInt(ordenId)
      if (!parsedOrdenId) return reply.code(400).send({ error: 'ordenId invalido' })
      where.ordenId = parsedOrdenId
    }
    if (tipo) where.tipoDespacho = { contains: tipo, mode: 'insensitive' }
    if (contacto) where.contacto = { contains: contacto, mode: 'insensitive' }
    if (transporte) where.transporte = { contains: transporte, mode: 'insensitive' }
    if (region) where.region = { contains: region, mode: 'insensitive' }
    if (comuna) where.comuna = { contains: comuna, mode: 'insensitive' }
    if (parcial === 'true') where.parcial = true
    if (tieneMulta === 'true') where.tieneMulta = true
    if (search) {
      const isNum = /^\d+$/.test(search.trim())
      where.OR = [
        { contacto: { contains: search, mode: 'insensitive' } },
        { direccion: { contains: search, mode: 'insensitive' } },
        { transporte: { contains: search, mode: 'insensitive' } },
        { interno: { contains: search, mode: 'insensitive' } },
        ...(isNum ? [{ ordenId: parseInt(search, 10) }] : []),
      ]
    }
    if (!applyDateRange(where, 'fechaEntrega', desde, hasta)) return reply.code(400).send({ error: 'Rango de fechas invalido' })
    const [items, total, parciales, multas] = await Promise.all([
      fastify.prisma.despacho.findMany({
        where, orderBy: { fechaEntrega: 'desc' }, take: LIMIT, skip,
      }),
      fastify.prisma.despacho.count({ where }),
      fastify.prisma.despacho.count({ where: { ...where, parcial: true } }),
      fastify.prisma.despacho.count({ where: { ...where, tieneMulta: true } }),
    ])
    return { items, total, limit: LIMIT, stats: { parciales, multas } }
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const d = await fastify.prisma.despacho.findUnique({ where: { id } })
    if (!d) return reply.code(404).send({ error: 'no encontrado' })
    const guias = d.ordenId
      ? await fastify.prisma.guiaDespacho.findMany({ where: { ordenId: d.ordenId } })
      : []
    return { ...d, guias }
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const parsed = DespachoCreate.safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const b = parsed.data
    const ordenId = b.ordenId ? parsePositiveInt(b.ordenId) : null
    const fechaInterno = b.fechaInterno ? parseDate(b.fechaInterno) : null
    const fechaEntrega = b.fechaEntrega ? parseDate(b.fechaEntrega) : null
    const montoEnvio = b.montoEnvio ? parseOptionalInt(b.montoEnvio) : null
    if (b.ordenId && !ordenId) return reply.code(400).send({ error: 'ordenId invalido' })
    if (b.fechaInterno && !fechaInterno) return reply.code(400).send({ error: 'fechaInterno invalida' })
    if (b.fechaEntrega && !fechaEntrega) return reply.code(400).send({ error: 'fechaEntrega invalida' })
    if (b.montoEnvio && (montoEnvio == null || montoEnvio < 0)) return reply.code(400).send({ error: 'montoEnvio invalido' })
    return fastify.prisma.despacho.create({
      data: {
        ordenId,
        interno: b.interno || null,
        plazoEntrega: b.plazoEntrega || null,
        fechaInterno,
        fechaEntrega,
        tipoDespacho: b.tipoDespacho || null,
        transporte: b.transporte || null,
        montoEnvio,
        direccion: b.direccion || null,
        contacto: b.contacto || null,
        region: b.region || null,
        comuna: b.comuna || null,
        parcial: !!b.parcial,
        tieneMulta: !!b.tieneMulta,
        usuario: request.user?.nombre || request.user?.username || null,
      },
    })
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const parsed = DespachoCreate.partial().safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const b = parsed.data
    const data = {}
    for (const f of ['interno', 'plazoEntrega', 'tipoDespacho', 'transporte', 'direccion', 'contacto', 'region', 'comuna', 'usuario']) {
      if (b[f] !== undefined) data[f] = b[f]
    }
    if (b.ordenId !== undefined) {
      const ordenId = b.ordenId ? parsePositiveInt(b.ordenId) : null
      if (b.ordenId && !ordenId) return reply.code(400).send({ error: 'ordenId invalido' })
      data.ordenId = ordenId
    }
    if (b.fechaInterno !== undefined) {
      const fechaInterno = b.fechaInterno ? parseDate(b.fechaInterno) : null
      if (b.fechaInterno && !fechaInterno) return reply.code(400).send({ error: 'fechaInterno invalida' })
      data.fechaInterno = fechaInterno
    }
    if (b.fechaEntrega !== undefined) {
      const fechaEntrega = b.fechaEntrega ? parseDate(b.fechaEntrega) : null
      if (b.fechaEntrega && !fechaEntrega) return reply.code(400).send({ error: 'fechaEntrega invalida' })
      data.fechaEntrega = fechaEntrega
    }
    if (b.montoEnvio !== undefined) {
      const montoEnvio = b.montoEnvio ? parseOptionalInt(b.montoEnvio) : null
      if (b.montoEnvio && (montoEnvio == null || montoEnvio < 0)) return reply.code(400).send({ error: 'montoEnvio invalido' })
      data.montoEnvio = montoEnvio
    }
    if (b.parcial !== undefined) data.parcial = !!b.parcial
    if (b.tieneMulta !== undefined) data.tieneMulta = !!b.tieneMulta
    try { return await fastify.prisma.despacho.update({ where: { id }, data }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    try { return await fastify.prisma.despacho.delete({ where: { id } }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })

  // Guías
  fastify.get('/guias/list', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const { desde, hasta, nGuia, ordenId, page = '1' } = request.query
    const LIMIT = 100
    const skip = (parsePage(page) - 1) * LIMIT
    const where = {}
    if (nGuia) where.nGuia = { contains: nGuia, mode: 'insensitive' }
    if (ordenId) {
      const parsedOrdenId = parsePositiveInt(ordenId)
      if (!parsedOrdenId) return reply.code(400).send({ error: 'ordenId invalido' })
      where.ordenId = parsedOrdenId
    }
    if (!applyDateRange(where, 'fechaGuia', desde, hasta)) return reply.code(400).send({ error: 'Rango de fechas invalido' })
    const [items, total] = await Promise.all([
      fastify.prisma.guiaDespacho.findMany({
        where, orderBy: { fechaGuia: 'desc' }, take: LIMIT, skip,
      }),
      fastify.prisma.guiaDespacho.count({ where }),
    ])
    return { items, total, limit: LIMIT }
  })

  fastify.post('/guias', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const parsed = GuiaCreate.safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const { ordenId, nInterno, nGuia, fechaGuia, origen } = parsed.data
    const parsedOrdenId = ordenId ? parsePositiveInt(ordenId) : null
    const parsedNInterno = nInterno ? parsePositiveInt(nInterno) : null
    const parsedFechaGuia = fechaGuia ? parseDate(fechaGuia) : new Date()
    if (ordenId && !parsedOrdenId) return reply.code(400).send({ error: 'ordenId invalido' })
    if (nInterno && !parsedNInterno) return reply.code(400).send({ error: 'nInterno invalido' })
    if (fechaGuia && !parsedFechaGuia) return reply.code(400).send({ error: 'fechaGuia invalida' })
    return fastify.prisma.guiaDespacho.create({
      data: {
        ordenId: parsedOrdenId,
        nInterno: parsedNInterno,
        nGuia,
        fechaGuia: parsedFechaGuia,
        origen: origen || null,
      },
    })
  })

  fastify.delete('/guias/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    try { return await fastify.prisma.guiaDespacho.delete({ where: { id } }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrada' }); throw e }
  })
}
