import { buildExport, sendExport } from '../../utils/export.js'
import { getUserSucursalId } from '../caja/scope.js'
import { isOpenOdtEstado } from '../odts/operations.js'
import { parseDate, parsePagination, parsePositiveInt } from '../operational-utils.js'
import { resolveOdtForWrite } from '../relation-guards.js'

const DEFAULT_LIMIT = 100
const MAX_EXPORT_ROWS = 20000

function addAnd(where, clause) {
  where.AND = [...(where.AND || []), clause]
}

function scopedWhere(user) {
  const sucursalId = getUserSucursalId(user)
  return sucursalId ? { AND: [{ OR: [{ sucursalId }, { sucursalId: null }] }] } : {}
}

function parseDateRange(desde, hasta) {
  const gte = parseDate(desde)
  const lte = parseDate(hasta, true)
  if ((desde && !gte) || (hasta && !lte)) return { error: 'Rango de fechas invalido' }
  return { gte, lte }
}

function applyMovimientoFilter(where, value) {
  const tipo = String(value || '').trim().toLowerCase()
  if (!tipo) return null
  if (tipo === 'egreso') {
    where.egreso = { gt: 0 }
    return null
  }
  if (tipo === 'ingreso') {
    where.ingreso = { gt: 0 }
    return null
  }
  return 'tipoMovimiento invalido'
}

function buildHistorialWhere(query = {}, user = null) {
  const {
    desde,
    hasta,
    operario,
    taller,
    codigoInterno,
    codigo,
    nombre,
    producto,
    odtId,
    tipoMovimiento,
  } = query
  const where = scopedWhere(user)
  if (operario) where.usuario = { contains: operario, mode: 'insensitive' }
  if (taller) where.taller = { contains: taller, mode: 'insensitive' }
  const codigoFilter = codigoInterno || codigo
  if (codigoFilter) where.codigoInterno = { contains: codigoFilter, mode: 'insensitive' }
  const nombreFilter = nombre || producto
  if (nombreFilter) where.nombre = { contains: nombreFilter, mode: 'insensitive' }
  if (odtId) {
    const parsedOdtId = parsePositiveInt(odtId)
    if (!parsedOdtId) return { error: 'odtId invalido' }
    where.odtId = parsedOdtId
  }
  if (desde || hasta) {
    const range = parseDateRange(desde, hasta)
    if (range.error) return range
    where.fecha = {}
    if (range.gte) where.fecha.gte = range.gte
    if (range.lte) where.fecha.lte = range.lte
  }
  const movimientoError = applyMovimientoFilter(where, tipoMovimiento)
  if (movimientoError) return { error: movimientoError }
  return { where }
}

async function attachUbicaciones(prisma, rows) {
  const codigos = [...new Set(rows.map(r => r.codigoInterno).filter(Boolean))]
  if (!codigos.length) return rows.map(r => ({ ...r, ubicacion: null }))
  const [productos, telas] = await Promise.all([
    prisma.producto.findMany({
      where: { codigoInterno: { in: codigos } },
      select: { codigoInterno: true, ubicacion: true },
    }),
    prisma.tela.findMany({
      where: { codigo: { in: codigos } },
      select: { codigo: true, ubicacion: true },
    }),
  ])
  const map = new Map()
  for (const p of productos) if (p.codigoInterno && p.ubicacion) map.set(p.codigoInterno, p.ubicacion)
  for (const t of telas) if (t.codigo && t.ubicacion && !map.has(t.codigo)) map.set(t.codigo, t.ubicacion)
  return rows.map(r => ({ ...r, ubicacion: map.get(r.codigoInterno) || null }))
}

async function findScopedHistorial(prisma, id, user) {
  const where = scopedWhere(user)
  where.id = id
  return prisma.tallerHistorialMaterial.findFirst({ where })
}

export { buildHistorialWhere }

export default async function historialMaterialesRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const pagination = parsePagination(request.query, { defaultLimit: DEFAULT_LIMIT, maxLimit: 500 })
    if (!pagination) return reply.code(400).send({ error: 'Paginacion invalida' })
    const built = buildHistorialWhere(request.query, request.user)
    if (built.error) return reply.code(400).send({ error: built.error })
    const { where } = built

    const [itemsRaw, total, agg] = await Promise.all([
      fastify.prisma.tallerHistorialMaterial.findMany({
        where,
        orderBy: [{ fecha: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: pagination.limit,
        skip: pagination.skip,
      }),
      fastify.prisma.tallerHistorialMaterial.count({ where }),
      fastify.prisma.tallerHistorialMaterial.aggregate({
        where,
        _sum: { egreso: true, ingreso: true },
      }),
    ])
    const items = await attachUbicaciones(fastify.prisma, itemsRaw)
    return {
      items,
      total,
      limit: pagination.limit,
      page: pagination.page,
      pages: Math.max(1, Math.ceil(total / pagination.limit)),
      totalEgreso: agg._sum.egreso || 0,
      totalIngreso: agg._sum.ingreso || 0,
    }
  })

  fastify.get('/export', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const built = buildHistorialWhere(request.query, request.user)
    if (built.error) return reply.code(400).send({ error: built.error })
    const itemsRaw = await fastify.prisma.tallerHistorialMaterial.findMany({
      where: built.where,
      orderBy: [{ fecha: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: MAX_EXPORT_ROWS,
    })
    const items = await attachUbicaciones(fastify.prisma, itemsRaw)
    const datosExport = buildExport(items.map(row => ({
      ...row,
      saldo: Number(row.ingreso || 0) - Number(row.egreso || 0),
    })), [
      { key: 'fecha', label: 'Fecha' },
      { key: 'codigoInterno', label: 'Codigo' },
      { key: 'nombre', label: 'Material' },
      { key: 'ubicacion', label: 'Ubicacion' },
      { key: 'taller', label: 'Taller' },
      { key: 'usuario', label: 'Operario' },
      { key: 'odtId', label: 'ODT' },
      { key: 'egreso', label: 'Egreso' },
      { key: 'ingreso', label: 'Ingreso' },
      { key: 'saldo', label: 'Saldo' },
      { key: 'unidad', label: 'Unidad' },
      { key: 'id', label: 'ID Movimiento' },
    ])
    return sendExport(reply, { archivo: request.query?.archivo, nombre: `historial_materiales_${new Date().toISOString().slice(0, 10)}`, ...datosExport })
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'write')],
  }, async (request, reply) => {
    const { odtId, codigoInterno, nombre, egreso, ingreso, unidad, taller, fecha } = request.body || {}
    if (!odtId) return reply.code(400).send({ error: 'odtId requerido' })
    if (!codigoInterno) return reply.code(400).send({ error: 'codigoInterno requerido' })
    const parsedFecha = fecha ? parseDate(fecha) : new Date()
    if (!parsedFecha) return reply.code(400).send({ error: 'fecha invalida' })
    const resolved = await resolveOdtForWrite(fastify.prisma, odtId, {
      user: request.user,
      requireActive: true,
      includeSucursal: true,
    })
    if (resolved.error) return reply.code(resolved.status).send({ error: resolved.error })
    if (!isOpenOdtEstado(resolved.odt.estado)) {
      return reply.code(409).send({ error: 'ODT cerrada o anulada' })
    }
    return fastify.prisma.tallerHistorialMaterial.create({
      data: {
        odtId: resolved.odt.id,
        codigoInterno,
        nombre: nombre || null,
        egreso: Number.parseFloat(egreso) || 0,
        ingreso: Number.parseFloat(ingreso) || 0,
        unidad: unidad || null,
        taller: taller || null,
        usuario: request.user?.nombre || request.user?.username || request.user?.email || 'sistema',
        fecha: parsedFecha,
        sucursalId: resolved.odt.sucursalId ?? getUserSucursalId(request.user) ?? null,
      },
    })
  })

  fastify.delete('/bulk', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'delete')],
  }, async (request, reply) => {
    const ids = Array.isArray(request.body?.ids)
      ? request.body.ids.map(parsePositiveInt).filter(Boolean)
      : []
    if (!ids.length) return reply.code(400).send({ error: 'ids requerido' })
    const scope = scopedWhere(request.user)
    addAnd(scope, { id: { in: ids } })
    const existing = await fastify.prisma.tallerHistorialMaterial.findMany({
      where: scope,
      select: { id: true },
    })
    if (!existing.length) return reply.code(404).send({ error: 'no encontrado' })
    const result = await fastify.prisma.tallerHistorialMaterial.deleteMany({
      where: { id: { in: existing.map(row => row.id) } },
    })
    return { deleted: result.count }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'delete')],
  }, async (request, reply) => {
    const id = parsePositiveInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'id invalido' })
    const current = await findScopedHistorial(fastify.prisma, id, request.user)
    if (!current) return reply.code(404).send({ error: 'no encontrado' })
    return fastify.prisma.tallerHistorialMaterial.delete({ where: { id } })
  })
}
