import { sendExport } from '../../utils/export.js'
import { getUserSucursalId } from '../caja/scope.js'
import { parseDate, parsePagination, parsePositiveInt } from '../operational-utils.js'
import { resolveOdtForWrite } from '../relation-guards.js'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const EXPORT_LIMIT = 50000

function cleanString(value) {
  return value == null ? '' : String(value).trim()
}

async function isCorteEntry(prisma, id) {
  const entry = await prisma.bitacoraTaller.findUnique({
    where: { id },
    select: {
      odt: {
        select: { items: { select: { talleres: { select: { taller: { select: { nombre: true } } } } } } },
      },
    },
  })
  return Boolean(entry?.odt?.items?.some(item => item.talleres?.some(rel => /corte/i.test(rel.taller?.nombre || ''))))
}

function auditUsuario(user) {
  return cleanString(user?.nombre) || cleanString(user?.email) || cleanString(user?.username) || 'Sistema'
}

function combineWhere(clauses) {
  const active = clauses.filter(clause => clause && Object.keys(clause).length > 0)
  if (active.length === 0) return {}
  if (active.length === 1) return active[0]
  return { AND: active }
}

function sucursalScope(user) {
  const sucursalId = getUserSucursalId(user)
  if (!sucursalId) return {}
  return {
    OR: [
      { sucursalId },
      { sucursalId: null, odt: { sucursalId } },
    ],
  }
}

function parseDateRange(query, reply) {
  const desde = parseDate(query.desde)
  const hasta = parseDate(query.hasta, true)
  if ((query.desde && !desde) || (query.hasta && !hasta)) {
    reply.code(400)
    return { error: 'Rango de fechas invalido' }
  }
  if (!desde && !hasta) return null
  const range = {}
  if (desde) range.gte = desde
  if (hasta) range.lte = hasta
  return range
}

function buildFilters(query, reply) {
  const clauses = []
  const operario = cleanString(query.operario)
  const search = cleanString(query.search)
  const taller = cleanString(query.taller)
  const estadoOdt = cleanString(query.estadoOdt)

  if (operario) clauses.push({ usuario: { equals: operario, mode: 'insensitive' } })

  if (query.odtId) {
    const odtId = parsePositiveInt(query.odtId)
    if (!odtId) {
      reply.code(400)
      return { error: 'odtId invalido' }
    }
    clauses.push({ odtId })
  }

  const odtFilter = {}
  if (taller) odtFilter.tipo = taller
  if (estadoOdt) odtFilter.estado = estadoOdt
  if (Object.keys(odtFilter).length) clauses.push({ odt: odtFilter })

  if (search) {
    clauses.push({
      OR: [
        { texto: { contains: search, mode: 'insensitive' } },
        { usuario: { contains: search, mode: 'insensitive' } },
        { usuarioReporta: { contains: search, mode: 'insensitive' } },
      ],
    })
  }

  const fechaRange = parseDateRange(query, reply)
  if (fechaRange?.error) return fechaRange
  if (fechaRange) {
    clauses.push({
      OR: [
        { fecha: fechaRange },
        { fecha: null, createdAt: fechaRange },
      ],
    })
  }

  return combineWhere(clauses)
}

async function attachSucursalNames(prisma, items) {
  const ids = [...new Set(items
    .map(item => item.sucursalId ?? item.odt?.sucursalId)
    .filter(id => Number.isInteger(id) && id > 0))]
  const sucursales = ids.length
    ? await prisma.sucursal.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })
    : []
  const names = new Map(sucursales.map(s => [s.id, s.nombre]))
  const usuarioLabels = await buildUsuarioLabels(prisma, items.map(item => item.usuario))
  return items.map(item => {
    const sucursalId = item.sucursalId ?? item.odt?.sucursalId ?? null
    return {
      ...item,
      fechaReporte: item.fecha ?? item.createdAt,
      sucursalNombre: sucursalId ? (names.get(sucursalId) || `Sucursal #${sucursalId}`) : null,
      usuarioLabel: usuarioLabels.get(normalizeKey(item.usuario)) || item.usuario,
    }
  })
}

function formatDateOnly(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })
}

function operarioNombre(trabajador) {
  return [trabajador.nombres, trabajador.apellidoPaterno, trabajador.apellidoMaterno]
    .filter(Boolean)
    .join(' ')
    .trim()
}

function normalizeKey(value) {
  return cleanString(value).toLowerCase()
}

async function buildUsuarioLabels(prisma, usuarios = []) {
  const rawValues = [...new Set(usuarios.map(cleanString).filter(Boolean))]
  const keys = rawValues.map(normalizeKey)
  if (!keys.length) return new Map()

  const [users, trabajadores] = await Promise.all([
    prisma.user.findMany({
      select: { email: true, nombre: true },
      take: 1000,
    }),
    findActiveTrabajadores(prisma, { select: { nombres: true, apellidoPaterno: true, apellidoMaterno: true }, take: 500 }),
  ])

  const labels = new Map()
  for (const user of users) {
    const label = cleanString(user.nombre)
    if (!label) continue
    const email = normalizeKey(user.email)
    if (email) {
      labels.set(email, label)
      const local = email.split('@')[0]
      if (local) labels.set(local, label)
    }
    labels.set(normalizeKey(label), label)
  }
  for (const trabajador of trabajadores) {
    const label = operarioNombre(trabajador)
    if (label) labels.set(normalizeKey(label), label)
  }
  return labels
}

async function findActiveTrabajadores(prisma, options = {}) {
  try {
    return await prisma.trabajador.findMany({
      where: { estado: true, ...(options.where || {}) },
      ...(options.orderBy ? { orderBy: options.orderBy } : {}),
      ...(options.select ? { select: options.select } : {}),
      ...(options.take ? { take: options.take } : {}),
    })
  } catch (error) {
    if (error.code === 'P2021') return []
    throw error
  }
}

export default async function bitacoraTallerRoutes(fastify) {
  fastify.get('/operarios', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request) => {
    const where = combineWhere([sucursalScope(request.user)])
    const [trabajadores, historicos] = await Promise.all([
      findActiveTrabajadores(fastify.prisma, {
        orderBy: [{ apellidoPaterno: 'asc' }, { nombres: 'asc' }],
        take: 200,
        select: { id: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true, cargo: true, empresa: true },
      }),
      fastify.prisma.bitacoraTaller.findMany({
        where,
        distinct: ['usuario'],
        orderBy: { usuario: 'asc' },
        take: 200,
        select: { usuario: true },
      }),
    ])

    const byValue = new Map()
    const historicalLabels = await buildUsuarioLabels(fastify.prisma, historicos.map(row => row.usuario))
    for (const row of historicos) {
      const value = cleanString(row.usuario)
      if (value) byValue.set(value, { value, label: historicalLabels.get(normalizeKey(value)) || value, source: 'historico' })
    }
    for (const trabajador of trabajadores) {
      const value = operarioNombre(trabajador)
      if (value && !byValue.has(value)) {
        byValue.set(value, {
          value,
          label: trabajador.cargo ? `${value} - ${trabajador.cargo}` : value,
          source: 'rrhh',
        })
      }
    }
    return { items: [...byValue.values()] }
  })

  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const pagination = parsePagination(request.query, { defaultLimit: DEFAULT_LIMIT, maxLimit: MAX_LIMIT })
    if (!pagination) return reply.code(400).send({ error: 'Paginacion invalida' })
    const filters = buildFilters(request.query, reply)
    if (filters.error) return reply.send({ error: filters.error })
    const where = combineWhere([sucursalScope(request.user), filters])

    const [items, total] = await Promise.all([
      fastify.prisma.bitacoraTaller.findMany({
        where,
        include: { odt: { select: { id: true, descripcion: true, tipo: true, estado: true, sucursalId: true } } },
        orderBy: [{ fecha: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
        take: pagination.limit,
        skip: pagination.skip,
      }),
      fastify.prisma.bitacoraTaller.count({ where }),
    ])
    const enriched = await attachSucursalNames(fastify.prisma, items)
    return { items: enriched, total, limit: pagination.limit, page: pagination.page, pages: Math.max(1, Math.ceil(total / pagination.limit)) }
  })

  fastify.get('/export', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const filters = buildFilters(request.query, reply)
    if (filters.error) return reply.send({ error: filters.error })
    const where = combineWhere([sucursalScope(request.user), filters])
    const items = await fastify.prisma.bitacoraTaller.findMany({
      where,
      include: { odt: { select: { id: true, sucursalId: true } } },
      orderBy: [{ fecha: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
      take: EXPORT_LIMIT,
    })
    const rows = await attachSucursalNames(fastify.prisma, items)
    return sendExport(reply, {
      archivo: request.query?.archivo,
      nombre: `bitacora_actividades_${new Date().toISOString().slice(0, 10)}`,
      rows: rows,
      columns: [
      { key: 'usuarioLabel', label: 'Operario' },
      { key: 'fechaReporte', label: 'Fecha reporte', format: formatDateOnly },
      { key: 'texto', label: 'Detalle Actividades' },
      { key: 'usuarioReporta', label: 'Reporta Encargado' },
      { key: 'sucursalNombre', label: 'Sucursal' },
    ],
    })
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const { odtId, texto, fecha, usuario } = request.body || {}
    const textoTrim = cleanString(texto)
    const usuarioTrim = cleanString(usuario)
    if (!usuarioTrim || !textoTrim) return reply.code(400).send({ error: 'usuario y texto requeridos' })

    const fechaParsed = fecha ? parseDate(fecha) : new Date()
    if (!fechaParsed) return reply.code(400).send({ error: 'fecha invalida' })

    let resolvedOdtId = null
    let sucursalId = getUserSucursalId(request.user)
    if (odtId !== undefined && odtId !== null && odtId !== '') {
      const resolved = await resolveOdtForWrite(fastify.prisma, odtId, { user: request.user, includeSucursal: true, allowWithoutOrden: true })
      if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
      resolvedOdtId = resolved.odt.id
      sucursalId = resolved.odt.sucursalId ?? sucursalId
    }

      const entry = await fastify.prisma.bitacoraTaller.create({
      data: {
        odtId: resolvedOdtId,
        usuario: usuarioTrim,
        usuarioReporta: auditUsuario(request.user),
        ipEquipo: request.ip,
        sucursalId,
        fecha: fechaParsed,
        texto: textoTrim,
      },
    })
    return reply.code(201).send(entry)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    if (await isCorteEntry(fastify.prisma, id)) {
      return reply.code(409).send({ error: 'La bitacora de Taller de Corte es append-only y no se puede editar' })
    }

    const current = await fastify.prisma.bitacoraTaller.findFirst({
      where: combineWhere([sucursalScope(request.user), { id }]),
      select: { id: true },
    })
    if (!current) return reply.code(404).send({ error: 'no encontrada' })

    const data = {}
    if (request.body?.usuario !== undefined) {
      const usuario = cleanString(request.body.usuario)
      if (!usuario) return reply.code(400).send({ error: 'usuario requerido' })
      data.usuario = usuario
    }
    if (request.body?.texto !== undefined) {
      const texto = cleanString(request.body.texto)
      if (!texto) return reply.code(400).send({ error: 'texto requerido' })
      data.texto = texto
    }
    if (request.body?.fecha !== undefined) {
      const parsed = request.body.fecha ? parseDate(request.body.fecha) : null
      if (request.body.fecha && !parsed) return reply.code(400).send({ error: 'fecha invalida' })
      data.fecha = parsed
    }
    if (Object.keys(data).length === 0) return reply.code(400).send({ error: 'sin cambios' })
    return fastify.prisma.bitacoraTaller.update({ where: { id }, data })
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'delete')],
  }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    if (await isCorteEntry(fastify.prisma, id)) {
      return reply.code(409).send({ error: 'La bitacora de Taller de Corte es append-only y no se puede borrar' })
    }
    const current = await fastify.prisma.bitacoraTaller.findFirst({
      where: combineWhere([sucursalScope(request.user), { id }]),
      select: { id: true },
    })
    if (!current) return reply.code(404).send({ error: 'no encontrada' })
    return fastify.prisma.bitacoraTaller.delete({ where: { id } })
  })
}
