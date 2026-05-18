// Gestión de despachos y guías
import { z } from 'zod'

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
  }, async (request) => {
    const { desde, hasta, ordenId, tipo, contacto, transporte, region, comuna, parcial, tieneMulta, search, page = '1' } = request.query
    const LIMIT = 100
    const skip = (parseInt(page, 10) - 1) * LIMIT
    const where = {}
    if (ordenId) where.ordenId = parseInt(ordenId, 10)
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
    if (desde || hasta) {
      where.fechaEntrega = {}
      if (desde) where.fechaEntrega.gte = new Date(desde)
      if (hasta) where.fechaEntrega.lte = new Date(hasta + 'T23:59:59')
    }
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
    return fastify.prisma.despacho.create({
      data: {
        ordenId: b.ordenId ? parseInt(b.ordenId, 10) : null,
        interno: b.interno || null,
        plazoEntrega: b.plazoEntrega || null,
        fechaInterno: b.fechaInterno ? new Date(b.fechaInterno) : null,
        fechaEntrega: b.fechaEntrega ? new Date(b.fechaEntrega) : null,
        tipoDespacho: b.tipoDespacho || null,
        transporte: b.transporte || null,
        montoEnvio: b.montoEnvio ? parseInt(b.montoEnvio, 10) : null,
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
    const parsed = DespachoCreate.partial().safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const b = parsed.data
    const data = {}
    for (const f of ['interno', 'plazoEntrega', 'tipoDespacho', 'transporte', 'direccion', 'contacto', 'region', 'comuna', 'usuario']) {
      if (b[f] !== undefined) data[f] = b[f]
    }
    if (b.ordenId !== undefined) data.ordenId = b.ordenId ? parseInt(b.ordenId, 10) : null
    if (b.fechaInterno !== undefined) data.fechaInterno = b.fechaInterno ? new Date(b.fechaInterno) : null
    if (b.fechaEntrega !== undefined) data.fechaEntrega = b.fechaEntrega ? new Date(b.fechaEntrega) : null
    if (b.montoEnvio !== undefined) data.montoEnvio = b.montoEnvio ? parseInt(b.montoEnvio, 10) : null
    if (b.parcial !== undefined) data.parcial = !!b.parcial
    if (b.tieneMulta !== undefined) data.tieneMulta = !!b.tieneMulta
    try { return await fastify.prisma.despacho.update({ where: { id }, data }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    try { return await fastify.prisma.despacho.delete({ where: { id } }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })

  // Guías
  fastify.get('/guias/list', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request) => {
    const { desde, hasta, nGuia, ordenId, page = '1' } = request.query
    const LIMIT = 100
    const skip = (parseInt(page, 10) - 1) * LIMIT
    const where = {}
    if (nGuia) where.nGuia = { contains: nGuia, mode: 'insensitive' }
    if (ordenId) where.ordenId = parseInt(ordenId, 10)
    if (desde || hasta) {
      where.fechaGuia = {}
      if (desde) where.fechaGuia.gte = new Date(desde)
      if (hasta) where.fechaGuia.lte = new Date(hasta + 'T23:59:59')
    }
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
    return fastify.prisma.guiaDespacho.create({
      data: {
        ordenId: ordenId ? parseInt(ordenId, 10) : null,
        nInterno: nInterno ? parseInt(nInterno, 10) : null,
        nGuia,
        fechaGuia: fechaGuia ? new Date(fechaGuia) : new Date(),
        origen: origen || null,
      },
    })
  })

  fastify.delete('/guias/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    try { return await fastify.prisma.guiaDespacho.delete({ where: { id } }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrada' }); throw e }
  })
}
