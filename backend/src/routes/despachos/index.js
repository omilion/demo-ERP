// Gestion de despachos y guias.
import { z } from 'zod'
import { applyDateRange, parseDate, parseOptionalInt, parsePage, parsePositiveInt } from '../operational-utils.js'
import { resolveOdtForWrite, resolveOrdenForWrite } from '../relation-guards.js'

const optionalId = z.union([z.number().int(), z.string()]).optional().nullable()

const DespachoCreate = z.object({
  ordenId: optionalId,
  odtId: optionalId,
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
  origenTipo: z.string().optional().nullable(),
  origenId: optionalId,
})

const GuiaCreate = z.object({
  ordenId: optionalId,
  odtId: optionalId,
  nInterno: optionalId,
  nGuia: z.string().min(1),
  fechaGuia: z.string().optional().nullable(),
  origen: z.string().optional().nullable(),
  origenTipo: z.string().optional().nullable(),
  origenId: optionalId,
})

function hasValue(value) {
  return value !== undefined && value !== null && value !== ''
}

function cleanText(value) {
  if (!hasValue(value)) return null
  const text = String(value).trim()
  return text || null
}

function parseOptionalPositiveId(value, field) {
  if (!hasValue(value)) return { value: null }
  const parsed = parsePositiveInt(value)
  if (!parsed) return { error: `${field} invalido` }
  return { value: parsed }
}

function rejectInvalidOrigenTipo(origenTipo) {
  if (origenTipo && !['orden', 'odt'].includes(origenTipo)) {
    return { status: 400, error: 'origenTipo debe ser orden u odt' }
  }
  return null
}

export async function resolveDispatchTraceability(prisma, input = {}) {
  const odtInput = parseOptionalPositiveId(input.odtId, 'odtId')
  if (odtInput.error) return { status: 400, error: odtInput.error }
  const origenInput = parseOptionalPositiveId(input.origenId, 'origenId')
  if (origenInput.error) return { status: 400, error: origenInput.error }
  const explicitOrigenTipo = cleanText(input.origenTipo)
  const origenTipoError = rejectInvalidOrigenTipo(explicitOrigenTipo)
  if (origenTipoError) return origenTipoError

  let odt = null
  if (odtInput.value) {
    const resolvedOdt = await resolveOdtForWrite(prisma, odtInput.value)
    if (resolvedOdt.error) return resolvedOdt
    odt = resolvedOdt.odt
  }

  const orderLookup = odt && !hasValue(input.ordenId) && !hasValue(input.nInterno)
    ? { ordenId: odt.ordenId }
    : { ordenId: input.ordenId, nInterno: input.nInterno }
  const resolvedOrden = await resolveOrdenForWrite(prisma, orderLookup)
  if (resolvedOrden.error) return resolvedOrden

  if (odt && odt.ordenId !== resolvedOrden.orden.id) {
    return { status: 409, error: 'ODT no pertenece a la orden indicada' }
  }

  const parsedNInterno = hasValue(input.nInterno) ? parsePositiveInt(input.nInterno) : null
  if (hasValue(input.nInterno) && !parsedNInterno) {
    return { status: 400, error: 'nInterno invalido' }
  }
  if (parsedNInterno && resolvedOrden.orden.nInterno && parsedNInterno !== resolvedOrden.orden.nInterno) {
    return { status: 409, error: 'nInterno no coincide con la orden indicada' }
  }

  const expectedOrigenTipo = odt ? 'odt' : 'orden'
  const expectedOrigenId = odt ? odt.id : resolvedOrden.orden.id
  if (explicitOrigenTipo && explicitOrigenTipo !== expectedOrigenTipo) {
    return {
      status: 409,
      error: odt ? 'origenTipo debe ser odt cuando se informa odtId' : 'origenTipo debe ser orden sin odtId',
    }
  }
  const origenId = origenInput.value ?? expectedOrigenId
  if (expectedOrigenTipo === 'odt' && origenId !== odt.id) {
    return { status: 409, error: 'origenId no coincide con odtId' }
  }
  if (expectedOrigenTipo === 'orden' && origenId !== resolvedOrden.orden.id) {
    return { status: 409, error: 'origenId no coincide con ordenId' }
  }

  return {
    orden: resolvedOrden.orden,
    odt,
    nInterno: parsedNInterno ?? resolvedOrden.orden.nInterno ?? null,
    origenTipo: expectedOrigenTipo,
    origenId,
  }
}

export async function validateDispatchFilterCoherence(prisma, input = {}) {
  const ordenInput = parseOptionalPositiveId(input.ordenId, 'ordenId')
  if (ordenInput.error) return { status: 400, error: ordenInput.error }
  const odtInput = parseOptionalPositiveId(input.odtId, 'odtId')
  if (odtInput.error) return { status: 400, error: odtInput.error }
  const nInternoInput = parseOptionalPositiveId(input.nInterno, 'nInterno')
  if (nInternoInput.error) return { status: 400, error: nInternoInput.error }
  const origenInput = parseOptionalPositiveId(input.origenId, 'origenId')
  if (origenInput.error) return { status: 400, error: origenInput.error }
  const origenTipo = cleanText(input.origenTipo)
  const origenTipoError = rejectInvalidOrigenTipo(origenTipo)
  if (origenTipoError) return origenTipoError

  const filters = {
    ordenId: ordenInput.value,
    odtId: odtInput.value,
    nInterno: nInternoInput.value,
    origenTipo,
    origenId: origenInput.value,
  }

  if (origenTipo === 'orden' && filters.origenId && filters.ordenId && filters.origenId !== filters.ordenId) {
    return { status: 409, error: 'origenId no coincide con ordenId' }
  }
  if (origenTipo === 'odt' && filters.origenId && filters.odtId && filters.origenId !== filters.odtId) {
    return { status: 409, error: 'origenId no coincide con odtId' }
  }

  let orden = null
  if (filters.ordenId || filters.nInterno) {
    orden = await prisma.orden.findUnique({
      where: filters.ordenId ? { id: filters.ordenId } : { nInterno: filters.nInterno },
      select: { id: true, nInterno: true },
    })
  }
  if (orden && filters.ordenId && filters.nInterno && orden.nInterno && orden.nInterno !== filters.nInterno) {
    return { status: 409, error: 'nInterno no coincide con la orden indicada' }
  }

  const effectiveOdtId = filters.odtId ?? (origenTipo === 'odt' ? filters.origenId : null)
  const effectiveOrdenId = filters.ordenId ?? (origenTipo === 'orden' ? filters.origenId : null)

  if (effectiveOdtId && (effectiveOrdenId || filters.nInterno)) {
    const odt = await prisma.odt.findUnique({
      where: { id: effectiveOdtId },
      select: { id: true, ordenId: true },
    })
    const expectedOrdenId = effectiveOrdenId ?? orden?.id ?? null
    if (odt?.ordenId && expectedOrdenId && odt.ordenId !== expectedOrdenId) {
      return { status: 409, error: 'ODT no pertenece a la orden indicada' }
    }
  }

  return { filters }
}

export function buildGuideWhereForDespacho(despacho) {
  if (despacho.odtId) {
    return {
      ordenId: despacho.ordenId,
      OR: [
        { odtId: despacho.odtId },
        { origenTipo: 'odt', origenId: despacho.odtId },
      ],
    }
  }
  if (despacho.ordenId) {
    return {
      ordenId: despacho.ordenId,
      OR: [
        { odtId: null },
        { origenTipo: 'orden', origenId: despacho.ordenId },
        { origenTipo: null, origenId: null },
      ],
    }
  }
  return { id: -1 }
}

export default async function despachosRoutes(fastify) {
  // GET /api/despachos?desde=&hasta=&ordenId=&odtId=&tipo=&page=1
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const { desde, hasta, ordenId, odtId, nInterno, interno, origenTipo, origenId, tipo, contacto, transporte, region, comuna, parcial, tieneMulta, search, page = '1' } = request.query
    const LIMIT = 100
    const skip = (parsePage(page) - 1) * LIMIT
    const where = {}
    const traceFilters = await validateDispatchFilterCoherence(fastify.prisma, {
      ordenId,
      odtId,
      nInterno: nInterno ?? interno,
      origenTipo,
      origenId,
    })
    if (traceFilters.error) return reply.code(traceFilters.status).send({ error: traceFilters.error })
    if (traceFilters.filters.ordenId) where.ordenId = traceFilters.filters.ordenId
    if (traceFilters.filters.odtId) where.odtId = traceFilters.filters.odtId
    if (traceFilters.filters.nInterno) where.interno = String(traceFilters.filters.nInterno)
    if (traceFilters.filters.origenTipo) where.origenTipo = traceFilters.filters.origenTipo
    if (traceFilters.filters.origenId) where.origenId = traceFilters.filters.origenId
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
        ...(isNum ? [{ ordenId: parseInt(search, 10) }, { odtId: parseInt(search, 10) }] : []),
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
    const guias = await fastify.prisma.guiaDespacho.findMany({ where: buildGuideWhereForDespacho(d) })
    return { ...d, guias }
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const parsed = DespachoCreate.safeParse(request.body || {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })
    const b = parsed.data
    const resolved = await resolveDispatchTraceability(fastify.prisma, {
      ordenId: b.ordenId,
      odtId: b.odtId,
      nInterno: b.interno,
      origenTipo: b.origenTipo,
      origenId: b.origenId,
    })
    const fechaInterno = b.fechaInterno ? parseDate(b.fechaInterno) : null
    const fechaEntrega = b.fechaEntrega ? parseDate(b.fechaEntrega) : null
    const montoEnvio = b.montoEnvio ? parseOptionalInt(b.montoEnvio) : null
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
    if (b.fechaInterno && !fechaInterno) return reply.code(400).send({ error: 'fechaInterno invalida' })
    if (b.fechaEntrega && !fechaEntrega) return reply.code(400).send({ error: 'fechaEntrega invalida' })
    if (b.montoEnvio && (montoEnvio == null || montoEnvio < 0)) return reply.code(400).send({ error: 'montoEnvio invalido' })
    return fastify.prisma.despacho.create({
      data: {
        ordenId: resolved.orden.id,
        odtId: resolved.odt?.id ?? null,
        interno: resolved.nInterno ? String(resolved.nInterno) : null,
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
        origenTipo: resolved.origenTipo,
        origenId: resolved.origenId,
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
    const existing = await fastify.prisma.despacho.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'no encontrado' })

    const data = {}
    const traceTouched = ['ordenId', 'odtId', 'interno', 'origenTipo', 'origenId'].some(field => b[field] !== undefined)
    if (traceTouched) {
      const relationTouched = ['ordenId', 'odtId'].some(field => b[field] !== undefined)
      const origenTouched = ['origenTipo', 'origenId'].some(field => b[field] !== undefined)
      const resolved = await resolveDispatchTraceability(fastify.prisma, {
        ordenId: b.ordenId !== undefined ? b.ordenId : existing.ordenId,
        odtId: b.odtId !== undefined ? b.odtId : existing.odtId,
        nInterno: b.interno !== undefined ? b.interno : existing.interno,
        origenTipo: origenTouched || !relationTouched ? (b.origenTipo !== undefined ? b.origenTipo : existing.origenTipo) : undefined,
        origenId: origenTouched || !relationTouched ? (b.origenId !== undefined ? b.origenId : existing.origenId) : undefined,
      })
      if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
      data.ordenId = resolved.orden.id
      data.odtId = resolved.odt?.id ?? null
      data.interno = resolved.nInterno ? String(resolved.nInterno) : null
      data.origenTipo = resolved.origenTipo
      data.origenId = resolved.origenId
    }

    for (const f of ['plazoEntrega', 'tipoDespacho', 'transporte', 'direccion', 'contacto', 'region', 'comuna', 'usuario']) {
      if (b[f] !== undefined) data[f] = b[f]
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
    return fastify.prisma.despacho.update({ where: { id }, data })
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    try { return await fastify.prisma.despacho.delete({ where: { id } }) }
    catch (e) { if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' }); throw e }
  })

  // Guias
  fastify.get('/guias/list', {
    preHandler: [fastify.authenticate, fastify.rbac('despacho', 'read')],
  }, async (request, reply) => {
    const { desde, hasta, nGuia, ordenId, odtId, nInterno, origenTipo, origenId, search, page = '1' } = request.query
    const LIMIT = 100
    const skip = (parsePage(page) - 1) * LIMIT
    const where = {}
    if (nGuia) where.nGuia = { contains: nGuia, mode: 'insensitive' }
    const traceFilters = await validateDispatchFilterCoherence(fastify.prisma, { ordenId, odtId, nInterno, origenTipo, origenId })
    if (traceFilters.error) return reply.code(traceFilters.status).send({ error: traceFilters.error })
    if (traceFilters.filters.ordenId) where.ordenId = traceFilters.filters.ordenId
    if (traceFilters.filters.odtId) where.odtId = traceFilters.filters.odtId
    if (traceFilters.filters.nInterno) where.nInterno = traceFilters.filters.nInterno
    if (traceFilters.filters.origenTipo) where.origenTipo = traceFilters.filters.origenTipo
    if (traceFilters.filters.origenId) where.origenId = traceFilters.filters.origenId
    if (search) {
      const trimmed = search.trim()
      const isNum = /^\d+$/.test(trimmed)
      where.OR = [
        { nGuia: { contains: trimmed, mode: 'insensitive' } },
        { origen: { contains: trimmed, mode: 'insensitive' } },
        ...(isNum ? [{ nInterno: parseInt(trimmed, 10) }, { ordenId: parseInt(trimmed, 10) }, { odtId: parseInt(trimmed, 10) }] : []),
      ]
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
    const { ordenId, odtId, nInterno, nGuia, fechaGuia, origen, origenTipo, origenId } = parsed.data
    const resolved = await resolveDispatchTraceability(fastify.prisma, {
      ordenId,
      odtId,
      nInterno,
      origenTipo,
      origenId,
    })
    const parsedFechaGuia = fechaGuia ? parseDate(fechaGuia) : new Date()
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
    if (fechaGuia && !parsedFechaGuia) return reply.code(400).send({ error: 'fechaGuia invalida' })
    return fastify.prisma.guiaDespacho.create({
      data: {
        ordenId: resolved.orden.id,
        odtId: resolved.odt?.id ?? null,
        nInterno: resolved.nInterno,
        nGuia,
        fechaGuia: parsedFechaGuia,
        origen: origen || null,
        origenTipo: resolved.origenTipo,
        origenId: resolved.origenId,
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
