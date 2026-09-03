import { GRAFIAS_VENTA_DIRECTA, TIPO_VENTA_VALUES, normalizeTipoVenta } from '../ventas/estados-normalize.js'

const TIPO_VENTA_TODOS = 'Todos'
const TIPOS_VENTA = TIPO_VENTA_VALUES
const MODALIDADES = ['FIJA', 'ESCALA_MONTO']
const BASES = ['VENDIDO', 'COBRADO']

function aliasKey(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function parseOptionalId(value, field) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const id = parseId(value)
  if (!id) return { error: `${field} invalido` }
  return id
}

function parseOptionalDate(value, field) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { error: `${field} invalida` }
  return date
}

function parseOptionalBoolean(value, field) {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  const normalized = aliasKey(value)
  if (['true', '1', 'si', 's'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return { error: `${field} invalido` }
}

function parsePercent(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    return required ? { error: `${field} requerido` } : null
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return { error: `${field} debe estar entre 0 y 100` }
  }
  return parsed
}

function parseTipoVenta(value, { partial = false } = {}) {
  if (value === undefined) return partial ? undefined : null
  if (value === null) return null

  const raw = String(value).trim()
  if (!raw || aliasKey(raw) === aliasKey(TIPO_VENTA_TODOS)) return null
  // Venta directa es una grafía legacy de la venta de mostrador. Las reglas se
  // guardan en el tipo canónico Venta Sala para que una sola regla cubra ambas.
  const tipoVenta = normalizeTipoVenta(raw)
    || (GRAFIAS_VENTA_DIRECTA.some(item => aliasKey(item) === aliasKey(raw)) ? 'Venta Sala' : null)
  if (!tipoVenta) return { error: 'tipoVenta invalido' }
  return tipoVenta
}

function parseEnum(value, allowed, field, { partial = false, defaultValue } = {}) {
  if (value === undefined) return partial ? undefined : defaultValue
  const normalized = String(value || '').trim().toUpperCase()
  if (!allowed.includes(normalized)) return { error: `${field} invalida` }
  return normalized
}

function parseTramos(value, { required = false } = {}) {
  if (value === undefined) return required ? { error: 'tramos requeridos' } : undefined
  if (value === null) return required ? { error: 'tramos requeridos' } : []
  if (!Array.isArray(value)) return { error: 'tramos debe ser un arreglo' }
  if (required && value.length === 0) return { error: 'tramos requeridos' }

  const tramos = value.map((tramo, index) => {
    const montoDesde = Number(tramo?.montoDesde)
    const montoHasta = tramo?.montoHasta === undefined || tramo?.montoHasta === null || tramo?.montoHasta === ''
      ? null
      : Number(tramo.montoHasta)
    const porcentaje = parsePercent(tramo?.porcentaje, `tramos[${index}].porcentaje`, { required: true })

    if (!Number.isFinite(montoDesde) || montoDesde < 0) return { error: `tramos[${index}].montoDesde invalido` }
    if (montoHasta !== null && (!Number.isFinite(montoHasta) || montoHasta <= montoDesde)) {
      return { error: `tramos[${index}].montoHasta invalido` }
    }
    if (porcentaje?.error) return porcentaje
    return { montoDesde, montoHasta, porcentaje }
  })

  const invalid = tramos.find(tramo => tramo.error)
  if (invalid) return invalid

  tramos.sort((a, b) => a.montoDesde - b.montoDesde)
  if (tramos[0]?.montoDesde !== 0) return { error: 'el primer tramo debe comenzar en 0' }
  for (let i = 1; i < tramos.length; i += 1) {
    const previous = tramos[i - 1]
    const current = tramos[i]
    if (previous.montoHasta === null || current.montoDesde < previous.montoHasta) {
      return { error: 'tramos no pueden traslaparse' }
    }
    if (current.montoDesde > previous.montoHasta) return { error: 'tramos deben ser continuos, sin montos sin comisión' }
  }
  if (tramos.at(-1)?.montoHasta !== null) return { error: 'el último tramo debe quedar sin límite superior' }
  return tramos
}

function parseRuleBody(body = {}, { partial = false } = {}) {
  const data = {}

  if (!partial || body.nombre !== undefined) {
    const nombre = String(body.nombre || '').trim()
    if (!nombre) return { error: 'nombre requerido' }
    data.nombre = nombre
  }

  if (!partial || body.descripcion !== undefined) {
    data.descripcion = body.descripcion === undefined ? undefined : (String(body.descripcion || '').trim() || null)
  }

  if (!partial || body.tipoVenta !== undefined) {
    const tipoVenta = parseTipoVenta(body.tipoVenta, { partial })
    if (tipoVenta?.error) return tipoVenta
    data.tipoVenta = tipoVenta
  }

  if (!partial || body.vendedorId !== undefined) {
    const vendedorId = parseOptionalId(body.vendedorId, 'vendedorId')
    if (vendedorId?.error) return vendedorId
    data.vendedorId = vendedorId
  }

  if (!partial || body.modalidad !== undefined) {
    const modalidad = parseEnum(body.modalidad, MODALIDADES, 'modalidad', { partial, defaultValue: 'FIJA' })
    if (modalidad?.error) return modalidad
    data.modalidad = modalidad
  }

  if (!partial || body.base !== undefined) {
    const base = parseEnum(body.base, BASES, 'base', { partial, defaultValue: 'VENDIDO' })
    if (base?.error) return base
    data.base = base
  }

  if (!partial || body.porcentaje !== undefined) {
    const porcentaje = parsePercent(body.porcentaje, 'porcentaje')
    if (porcentaje?.error) return porcentaje
    data.porcentaje = porcentaje
  }

  if (!partial || body.prioridad !== undefined) {
    const prioridad = Number(body.prioridad ?? 100)
    if (!Number.isInteger(prioridad)) return { error: 'prioridad invalida' }
    data.prioridad = prioridad
  }

  for (const field of ['vigenteDesde', 'vigenteHasta']) {
    if (!partial || body[field] !== undefined) {
      const parsed = parseOptionalDate(body[field], field)
      if (parsed?.error) return parsed
      data[field] = parsed
    }
  }

  if (!partial || body.activo !== undefined) {
    const activo = parseOptionalBoolean(body.activo ?? true, 'activo')
    if (activo?.error) return activo
    data.activo = activo
  }

  if (!partial || body.tramos !== undefined) {
    const modalidad = data.modalidad ?? body.modalidad
    const tramos = parseTramos(body.tramos, { required: modalidad === 'ESCALA_MONTO' })
    if (tramos?.error) return tramos
    data.tramos = tramos
  }

  const modalidad = data.modalidad ?? body.modalidad
  if (!partial && modalidad === 'FIJA' && data.porcentaje === null) {
    return { error: 'porcentaje requerido para modalidad FIJA' }
  }
  if (!partial && modalidad === 'ESCALA_MONTO' && (!data.tramos || data.tramos.length === 0)) {
    return { error: 'tramos requeridos para modalidad ESCALA_MONTO' }
  }

  const desde = data.vigenteDesde ?? (partial ? undefined : null)
  const hasta = data.vigenteHasta ?? (partial ? undefined : null)
  if (desde && hasta && hasta < desde) return { error: 'vigenteHasta no puede ser anterior a vigenteDesde' }

  Object.keys(data).forEach(key => data[key] === undefined && delete data[key])
  return { data }
}

function ruleInclude() {
  return {
    vendedor: {
      select: {
        id: true,
        nombre: true,
        email: true,
        codigoVendedor: true,
      },
    },
    tramos: {
      orderBy: [
        { montoDesde: 'asc' },
        { id: 'asc' },
      ],
    },
  }
}

function mapTramo(tramo) {
  return {
    id: tramo.id,
    reglaId: tramo.reglaId,
    montoDesde: tramo.montoDesde,
    montoHasta: tramo.montoHasta,
    porcentaje: tramo.porcentaje,
  }
}

function mapRule(rule) {
  return {
    id: rule.id,
    nombre: rule.nombre,
    descripcion: rule.descripcion,
    tipoVenta: rule.tipoVenta,
    tipoVentaLabel: rule.tipoVenta ?? TIPO_VENTA_TODOS,
    vendedorId: rule.vendedorId,
    vendedorNombre: rule.vendedor?.nombre ?? null,
    vendedor: rule.vendedor ?? null,
    modalidad: rule.modalidad,
    base: rule.base,
    porcentaje: rule.porcentaje,
    prioridad: rule.prioridad,
    vigenteDesde: rule.vigenteDesde,
    vigenteHasta: rule.vigenteHasta,
    activo: rule.activo,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    tramos: (rule.tramos || []).map(mapTramo),
  }
}

function tramosForWrite(tramos) {
  return tramos.map(tramo => ({
    montoDesde: tramo.montoDesde,
    montoHasta: tramo.montoHasta,
    porcentaje: tramo.porcentaje,
  }))
}

async function getRule(prisma, id) {
  const rule = await prisma.comisionRegla.findUnique({
    where: { id },
    include: ruleInclude(),
  })
  return rule ? mapRule(rule) : null
}

async function assertVendedorExists(prisma, vendedorId) {
  if (!vendedorId) return true
  const user = await prisma.user.findFirst({
    where: {
      id: vendedorId,
      role: 'vendedor',
      activo: true,
    },
    select: { id: true },
  })
  return Boolean(user)
}

function datesOverlap(left, right) {
  const leftStart = left.vigenteDesde ? new Date(left.vigenteDesde).getTime() : Number.NEGATIVE_INFINITY
  const leftEnd = left.vigenteHasta ? new Date(left.vigenteHasta).getTime() : Number.POSITIVE_INFINITY
  const rightStart = right.vigenteDesde ? new Date(right.vigenteDesde).getTime() : Number.NEGATIVE_INFINITY
  const rightEnd = right.vigenteHasta ? new Date(right.vigenteHasta).getTime() : Number.POSITIVE_INFINITY
  return leftStart <= rightEnd && rightStart <= leftEnd
}

// La prioridad resuelve reglas de distinto alcance (por ejemplo, global vs.
// vendedor). Dos reglas con exactamente el mismo alcance, prioridad y vigencia
// antes se resolvían por ID de creación sin que el administrador lo viera.
async function findAmbiguousRule(prisma, candidate, excludeId = null) {
  if (!candidate.activo) return null
  const rules = await prisma.comisionRegla.findMany({
    where: {
      activo: true,
      vendedorId: candidate.vendedorId ?? null,
      tipoVenta: candidate.tipoVenta ?? null,
      prioridad: candidate.prioridad,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, nombre: true, vigenteDesde: true, vigenteHasta: true },
  })
  return rules.find(rule => datesOverlap(candidate, rule)) || null
}

export default async function comisionesAdminRoutes(fastify) {
  const adminRead = fastify.rbac('admin', 'read', { allowExtra: false })
  const adminWrite = fastify.rbac('admin', 'write', { allowExtra: false })
  const adminDelete = fastify.rbac('admin', 'delete', { allowExtra: false })

  fastify.get('/meta', { preHandler: [fastify.authenticate, adminRead] }, async () => ({
    tiposVenta: [TIPO_VENTA_TODOS, ...TIPOS_VENTA],
    modalidades: MODALIDADES,
    bases: BASES,
  }))

  fastify.get('/reglas', { preHandler: [fastify.authenticate, adminRead] }, async (request, reply) => {
    const where = {}

    if (request.query.tipoVenta !== undefined) {
      const tipoVenta = parseTipoVenta(request.query.tipoVenta)
      if (tipoVenta?.error) return reply.code(400).send({ error: tipoVenta.error })
      where.tipoVenta = tipoVenta
    }

    if (request.query.vendedorId !== undefined) {
      const vendedorId = parseOptionalId(request.query.vendedorId, 'vendedorId')
      if (vendedorId?.error) return reply.code(400).send({ error: vendedorId.error })
      where.vendedorId = vendedorId
    }

    if (request.query.activo !== undefined) {
      const activo = parseOptionalBoolean(request.query.activo, 'activo')
      if (activo?.error) return reply.code(400).send({ error: activo.error })
      where.activo = activo
    }

    const rules = await fastify.prisma.comisionRegla.findMany({
      where,
      include: ruleInclude(),
      orderBy: [
        { activo: 'desc' },
        { prioridad: 'desc' },
        { id: 'asc' },
      ],
    })

    return rules.map(mapRule)
  })

  fastify.get('/reglas/:id', { preHandler: [fastify.authenticate, adminRead] }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })

    const rule = await getRule(fastify.prisma, id)
    if (!rule) return reply.code(404).send({ error: 'Regla no encontrada' })
    return rule
  })

  fastify.post('/reglas', { preHandler: [fastify.authenticate, adminWrite] }, async (request, reply) => {
    const parsed = parseRuleBody(request.body)
    if (parsed.error) return reply.code(400).send({ error: parsed.error })

    if (!await assertVendedorExists(fastify.prisma, parsed.data.vendedorId)) {
      return reply.code(400).send({ error: 'vendedorId no corresponde a vendedor activo' })
    }
    const ambiguous = await findAmbiguousRule(fastify.prisma, parsed.data)
    if (ambiguous) return reply.code(409).send({ error: `Existe una regla activa con el mismo alcance, prioridad y vigencia: ${ambiguous.nombre} (#${ambiguous.id})` })

    const rule = await fastify.prisma.comisionRegla.create({
      data: {
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion ?? null,
        tipoVenta: parsed.data.tipoVenta ?? null,
        vendedorId: parsed.data.vendedorId ?? null,
        modalidad: parsed.data.modalidad,
        base: parsed.data.base,
        porcentaje: parsed.data.modalidad === 'FIJA' ? parsed.data.porcentaje : null,
        prioridad: parsed.data.prioridad ?? 100,
        vigenteDesde: parsed.data.vigenteDesde ?? null,
        vigenteHasta: parsed.data.vigenteHasta ?? null,
        activo: parsed.data.activo ?? true,
        tramos: parsed.data.modalidad === 'ESCALA_MONTO'
          ? { create: tramosForWrite(parsed.data.tramos) }
          : undefined,
      },
      include: ruleInclude(),
    })

    return reply.code(201).send(mapRule(rule))
  })

  fastify.put('/reglas/:id', { preHandler: [fastify.authenticate, adminWrite] }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })

    const current = await fastify.prisma.comisionRegla.findUnique({
      where: { id },
      include: ruleInclude(),
    })
    if (!current) return reply.code(404).send({ error: 'Regla no encontrada' })

    const parsed = parseRuleBody(request.body, { partial: true })
    if (parsed.error) return reply.code(400).send({ error: parsed.error })

    const next = {
      nombre: parsed.data.nombre ?? current.nombre,
      descripcion: Object.hasOwn(parsed.data, 'descripcion') ? parsed.data.descripcion : current.descripcion,
      tipoVenta: Object.hasOwn(parsed.data, 'tipoVenta') ? parsed.data.tipoVenta : current.tipoVenta,
      vendedorId: Object.hasOwn(parsed.data, 'vendedorId') ? parsed.data.vendedorId : current.vendedorId,
      modalidad: parsed.data.modalidad ?? current.modalidad,
      base: parsed.data.base ?? current.base,
      porcentaje: Object.hasOwn(parsed.data, 'porcentaje') ? parsed.data.porcentaje : current.porcentaje,
      prioridad: parsed.data.prioridad ?? current.prioridad,
      vigenteDesde: Object.hasOwn(parsed.data, 'vigenteDesde') ? parsed.data.vigenteDesde : current.vigenteDesde,
      vigenteHasta: Object.hasOwn(parsed.data, 'vigenteHasta') ? parsed.data.vigenteHasta : current.vigenteHasta,
      activo: Object.hasOwn(parsed.data, 'activo') ? parsed.data.activo : current.activo,
    }

    const nextTramosRaw = Object.hasOwn(parsed.data, 'tramos')
      ? parsed.data.tramos
      : current.tramos.map(mapTramo)
    const nextTramos = next.modalidad === 'ESCALA_MONTO'
      ? parseTramos(nextTramosRaw, { required: true })
      : []
    if (nextTramos?.error) return reply.code(400).send({ error: nextTramos.error })

    if (next.vigenteDesde && next.vigenteHasta && new Date(next.vigenteHasta) < new Date(next.vigenteDesde)) {
      return reply.code(400).send({ error: 'vigenteHasta no puede ser anterior a vigenteDesde' })
    }
    if (next.modalidad === 'FIJA' && (next.porcentaje === null || next.porcentaje === undefined)) {
      return reply.code(400).send({ error: 'porcentaje requerido para modalidad FIJA' })
    }
    if (next.modalidad === 'ESCALA_MONTO' && (!nextTramos || nextTramos.length === 0)) {
      return reply.code(400).send({ error: 'tramos requeridos para modalidad ESCALA_MONTO' })
    }
    if (!await assertVendedorExists(fastify.prisma, next.vendedorId)) {
      return reply.code(400).send({ error: 'vendedorId no corresponde a vendedor activo' })
    }
    const ambiguous = await findAmbiguousRule(fastify.prisma, next, id)
    if (ambiguous) return reply.code(409).send({ error: `Existe una regla activa con el mismo alcance, prioridad y vigencia: ${ambiguous.nombre} (#${ambiguous.id})` })

    const updated = await fastify.prisma.$transaction(async (tx) => {
      await tx.comisionRegla.update({
        where: { id },
        data: {
          nombre: next.nombre,
          descripcion: next.descripcion,
          tipoVenta: next.tipoVenta,
          vendedorId: next.vendedorId,
          modalidad: next.modalidad,
          base: next.base,
          porcentaje: next.modalidad === 'FIJA' ? next.porcentaje : null,
          prioridad: next.prioridad,
          vigenteDesde: next.vigenteDesde,
          vigenteHasta: next.vigenteHasta,
          activo: next.activo,
        },
      })

      await tx.comisionReglaTramo.deleteMany({ where: { reglaId: id } })
      if (next.modalidad === 'ESCALA_MONTO') {
        await tx.comisionReglaTramo.createMany({
          data: tramosForWrite(nextTramos).map(tramo => ({ ...tramo, reglaId: id })),
        })
      }

      return tx.comisionRegla.findUnique({
        where: { id },
        include: ruleInclude(),
      })
    })

    return mapRule(updated)
  })

  fastify.delete('/reglas/:id', { preHandler: [fastify.authenticate, adminDelete] }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })

    const updated = await fastify.prisma.comisionRegla.updateMany({
      where: { id, activo: true },
      data: {
        activo: false,
        updatedAt: new Date(),
      },
    })
    if (updated.count === 0) return reply.code(404).send({ error: 'Regla no encontrada' })
    return reply.code(204).send()
  })
}
