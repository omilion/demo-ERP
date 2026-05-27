import { normalizePagoDocumento, normalizePagoEstado } from '../pagos-proveedores/index.js'
import { can } from '../../middleware/rbac.js'
import { getUserSucursalId } from '../caja/scope.js'
import {
  buildProveedorWhere,
  canReadProveedorSensitive,
  cleanProveedorPayload,
  ensureProveedorUnique,
  handleProveedorUniqueError,
  nextCodigoProveedor,
  proveedorOrderBy,
  sanitizeProveedor,
  validateProveedorPayload,
} from './helpers.js'

function cleanText(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

async function findPagoProveedorDuplicate(prisma, data, excludeId = null) {
  const providers = []
  if (data.proveedorId) providers.push({ proveedorId: data.proveedorId })
  if (data.codigoProveedor) providers.push({ codigoProveedor: data.codigoProveedor })
  if (!data.nDoc || providers.length === 0) return null
  return prisma.pagoProveedor.findFirst({
    where: {
      OR: providers,
      nDoc: { equals: data.nDoc, mode: 'insensitive' },
      ...(data.documento ? { documento: { equals: data.documento, mode: 'insensitive' } } : {}),
      sucursalId: data.sucursalId ?? null,
      eliminado: false,
      estado: { not: 'Anulado' },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    orderBy: { id: 'asc' },
  })
}

function scopedPagoWhere(user, where = {}) {
  const sucursalId = getUserSucursalId(user)
  return { ...where, ...(sucursalId ? { sucursalId } : {}) }
}

function proveedorPagoWhere(user, proveedor, where = {}) {
  const providers = [{ proveedorId: proveedor.id }]
  if (proveedor.codigoProveedor && proveedor.codigoProveedorUnico) providers.push({ proveedorId: null, codigoProveedor: proveedor.codigoProveedor })
  const providerWhere = providers.length > 1 ? { OR: providers } : providers[0]
  return scopedPagoWhere(user, { ...where, ...providerWhere })
}

async function withCodigoProveedorUnico(prisma, proveedor) {
  if (!proveedor?.codigoProveedor) return { ...proveedor, codigoProveedorUnico: false }
  const count = await prisma.proveedor.count({
    where: { activo: true, codigoProveedor: proveedor.codigoProveedor },
  })
  return { ...proveedor, codigoProveedorUnico: count === 1 }
}

function canReadPagosProveedor(user) {
  return can(user?.role, 'proveedores', 'read', user?.permisosExtra)
}

function canReadProveedorList(user) {
  return can(user?.role, 'proveedores', 'read', user?.permisosExtra)
    || can(user?.role, 'catalogo', 'read', user?.permisosExtra)
}

async function lockProveedorWrite(tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('proveedores-master-write')::bigint)`
}

async function lockPagoProveedorWrite(tx, { proveedorId, codigoProveedor, documento, nDoc, sucursalId }) {
  const provider = proveedorId ? `proveedor:${proveedorId}` : `codigo:${codigoProveedor}`
  const key = [provider, documento || '', nDoc || '', sucursalId || 'global'].join('|').toLowerCase()
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`
}

async function requireActiveProveedor(prisma, proveedorId, reply) {
  const proveedor = await prisma.proveedor.findFirst({
    where: { id: proveedorId, activo: true },
  })
  if (!proveedor) {
    reply.code(404).send({ error: 'Proveedor no encontrado' })
    return null
  }
  return withCodigoProveedorUnico(prisma, proveedor)
}

export default async function proveedoresRoutes(fastify) {
  fastify.register(async function (f) {
    f.get('/', {
      preHandler: [f.authenticate],
    }, async (request, reply) => {
      if (!canReadProveedorList(request.user)) return reply.code(403).send({ error: 'Forbidden' })
      const { page = '1' } = request.query
      const LIMIT = 100
      const offset = (parseInt(page, 10) - 1) * LIMIT
      const includeSensitive = canReadProveedorSensitive(request.user)
      const where = buildProveedorWhere(request.query)

      const [items, total] = await Promise.all([
        f.prisma.proveedor.findMany({ where, orderBy: proveedorOrderBy(), take: LIMIT, skip: offset }),
        f.prisma.proveedor.count({ where }),
      ])
      return { items: items.map(item => sanitizeProveedor(item, includeSensitive)), total, limit: LIMIT }
    })

    f.get('/:id', {
      preHandler: [f.authenticate, f.rbac('proveedores', 'read')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
      const p = await f.prisma.proveedor.findFirst({ where: { id, activo: true } })
      if (!p) return reply.code(404).send({ error: 'No encontrado' })
      const proveedorPagos = await withCodigoProveedorUnico(f.prisma, p)

      const pagos = canReadPagosProveedor(request.user)
        ? await f.prisma.pagoProveedor.findMany({
            where: proveedorPagoWhere(request.user, proveedorPagos, { eliminado: false }),
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        : []
      return { ...p, pagos }
    })

    f.post('/', {
      preHandler: [f.authenticate, f.rbac('proveedores', 'write')],
    }, async (request, reply) => {
      const { data, error } = cleanProveedorPayload(request.body || {})
      if (error) return reply.code(400).send({ error })
      try {
        const result = await f.prisma.$transaction(async (tx) => {
          await lockProveedorWrite(tx)
          const next = { ...data }
          if (next.codigoProveedor == null) next.codigoProveedor = await nextCodigoProveedor(tx)
          const validation = validateProveedorPayload(next)
          if (validation) return { status: 400, payload: { error: validation } }
          const duplicate = await ensureProveedorUnique(tx, next)
          if (duplicate) return { status: 409, payload: { error: duplicate } }
          const created = await tx.proveedor.create({ data: { ...next, activo: true } })
          return { status: 201, payload: created }
        })
        return reply.code(result.status).send(result.payload)
      } catch (e) {
        if (handleProveedorUniqueError(e, reply)) return reply
        throw e
      }
    })

    f.put('/:id', {
      preHandler: [f.authenticate, f.rbac('proveedores', 'write')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
      const { data, error } = cleanProveedorPayload(request.body || {}, { partial: true })
      if (error) return reply.code(400).send({ error })
      try {
        const result = await f.prisma.$transaction(async (tx) => {
          await lockProveedorWrite(tx)
          const current = await tx.proveedor.findFirst({ where: { id, activo: true } })
          if (!current) return { status: 404, payload: { error: 'No encontrado' } }
          if (data.codigoProveedor === null) return { status: 400, payload: { error: 'codigoProveedor requerido' } }
          const validation = validateProveedorPayload(data, { partial: true })
          if (validation) return { status: 400, payload: { error: validation } }
          const merged = { ...current, ...data }
          if (merged.codigoProveedor == null) return { status: 400, payload: { error: 'codigoProveedor requerido' } }
          const mergedValidation = validateProveedorPayload(merged)
          if (mergedValidation) return { status: 400, payload: { error: mergedValidation } }
          const duplicate = await ensureProveedorUnique(tx, data, id)
          if (duplicate) return { status: 409, payload: { error: duplicate } }
          const updated = await tx.proveedor.update({ where: { id }, data })
          return { status: 200, payload: updated }
        })
        return reply.code(result.status).send(result.payload)
      } catch (e) {
        if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
        if (handleProveedorUniqueError(e, reply)) return reply
        throw e
      }
    })

    f.delete('/:id', {
      preHandler: [f.authenticate, f.rbac('proveedores', 'delete')],
    }, async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
      try {
        const current = await f.prisma.proveedor.findFirst({ where: { id, activo: true }, select: { id: true } })
        if (!current) return reply.code(404).send({ error: 'No encontrado' })
        await f.prisma.proveedor.update({ where: { id }, data: { activo: false } })
        return reply.code(204).send()
      } catch (e) {
        if (e.code === 'P2025') return reply.code(404).send({ error: 'No encontrado' })
        throw e
      }
    })

    f.get('/:id/pagos', {
      preHandler: [f.authenticate, f.rbac('proveedores', 'read')],
    }, async (request, reply) => {
      const proveedorId = parseInt(request.params.id, 10)
      if (isNaN(proveedorId)) return reply.code(400).send({ error: 'ID invalido' })
      const proveedor = await requireActiveProveedor(f.prisma, proveedorId, reply)
      if (!proveedor) return reply
      const { estado } = request.query
      const where = proveedorPagoWhere(request.user, proveedor, { eliminado: false })
      if (estado) where.estado = normalizePagoEstado(estado) || estado
      const pagos = await f.prisma.pagoProveedor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return pagos
    })

    f.post('/:id/pagos', {
      preHandler: [f.authenticate, f.rbac('proveedores', 'write')],
    }, async (request, reply) => {
      const proveedorId = parseInt(request.params.id, 10)
      if (isNaN(proveedorId)) return reply.code(400).send({ error: 'ID invalido' })
      const { documento, nDoc, fechaDoc, fechaPago, fechaVencimiento, estado, total, bodega, nc, ncMonto, obs } = request.body || {}
      const normalizedDocumento = normalizePagoDocumento(documento)
      const normalizedNDoc = cleanText(nDoc)
      const sucursalId = getUserSucursalId(request.user)
      if (!normalizedDocumento) return reply.code(400).send({ error: 'documento requerido' })
      if (!normalizedNDoc) return reply.code(400).send({ error: 'nDoc requerido' })

      const usuario = request.user?.nombre || request.user?.email || 'Sistema'
      const result = await f.prisma.$transaction(async (tx) => {
        const proveedor = await tx.proveedor.findFirst({
          where: { id: proveedorId, activo: true },
          select: { id: true, codigoProveedor: true },
        })
        if (!proveedor) return { status: 404, payload: { error: 'Proveedor no encontrado' } }
        const codigoProveedor = proveedor.codigoProveedor
        await lockPagoProveedorWrite(tx, {
          proveedorId,
          codigoProveedor,
          documento: normalizedDocumento,
          nDoc: normalizedNDoc,
          sucursalId,
        })
        const duplicate = await findPagoProveedorDuplicate(tx, {
          proveedorId,
          codigoProveedor,
          documento: normalizedDocumento,
          nDoc: normalizedNDoc,
          sucursalId,
        })
        if (duplicate) return { status: 409, payload: { error: 'documento proveedor duplicado', duplicateId: duplicate.id } }
        const pago = await tx.pagoProveedor.create({
          data: {
            proveedorId,
            codigoProveedor,
            sucursalId,
            documento: normalizedDocumento,
            nDoc: normalizedNDoc,
            fechaDoc: fechaDoc ? new Date(fechaDoc) : null,
            fechaPago: fechaPago ? new Date(fechaPago) : null,
            fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
            estado: normalizePagoEstado(estado) || 'Pendiente',
            total: parseFloat(total) || 0,
            usuario,
            bodega,
            nc: !!nc || normalizedDocumento === 'Nota',
            ncMonto: ncMonto ? parseFloat(ncMonto) : null,
            obs,
          },
        })
        return { status: 201, payload: pago }
      })
      return reply.code(result.status).send(result.payload)
    })

    f.put('/:id/pagos/:pagoId', {
      preHandler: [f.authenticate, f.rbac('proveedores', 'write')],
    }, async (request, reply) => {
      const proveedorId = parseInt(request.params.id, 10)
      const pagoId = parseInt(request.params.pagoId, 10)
      if (isNaN(proveedorId) || isNaN(pagoId)) return reply.code(400).send({ error: 'ID invalido' })
      const { documento, nDoc, fechaDoc, fechaPago, fechaVencimiento, estado, total, bodega, nc, ncMonto, obs } = request.body || {}
      try {
        const result = await f.prisma.$transaction(async (tx) => {
          const proveedor = await tx.proveedor.findFirst({
            where: { id: proveedorId, activo: true },
            select: { id: true, codigoProveedor: true },
          })
          if (!proveedor) return { status: 404, payload: { error: 'Proveedor no encontrado' } }
          const proveedorPagos = await withCodigoProveedorUnico(tx, proveedor)
          const current = await tx.pagoProveedor.findFirst({
            where: proveedorPagoWhere(request.user, proveedorPagos, { id: pagoId, eliminado: false }),
          })
          if (!current) return { status: 404, payload: { error: 'Pago no encontrado' } }
          const normalizedEstado = estado !== undefined ? normalizePagoEstado(estado) : undefined
          if (normalizedEstado === 'Anulado') {
            return { status: 409, payload: { error: 'Use la accion Anular para reversar stock y conservar trazabilidad' } }
          }
          if (current.stockAplicadoAt && (documento !== undefined || nDoc !== undefined || total !== undefined || bodega !== undefined || fechaDoc !== undefined)) {
            return { status: 409, payload: { error: 'No se puede modificar documento, total o bodega con stock aplicado' } }
          }
          const normalizedDocumento = documento !== undefined ? normalizePagoDocumento(documento) : current.documento
          const normalizedNDoc = nDoc !== undefined ? cleanText(nDoc) : current.nDoc
          const codigoProveedor = proveedor.codigoProveedor || current.codigoProveedor
          await lockPagoProveedorWrite(tx, {
            proveedorId,
            codigoProveedor,
            documento: normalizedDocumento,
            nDoc: normalizedNDoc,
            sucursalId: current.sucursalId,
          })
          const duplicate = await findPagoProveedorDuplicate(tx, {
            proveedorId,
            codigoProveedor,
            documento: normalizedDocumento,
            nDoc: normalizedNDoc,
            sucursalId: current.sucursalId,
          }, pagoId)
          if (duplicate) return { status: 409, payload: { error: 'documento proveedor duplicado', duplicateId: duplicate.id } }

          const pago = await tx.pagoProveedor.update({
            where: { id: pagoId },
            data: {
              codigoProveedor,
              proveedorId,
              documento: normalizedDocumento,
              nDoc: normalizedNDoc,
              fechaDoc: fechaDoc ? new Date(fechaDoc) : undefined,
              fechaPago: fechaPago ? new Date(fechaPago) : undefined,
              fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : undefined,
              estado: normalizedEstado,
              total: total !== undefined ? parseFloat(total) : undefined,
              bodega,
              nc: nc !== undefined ? !!nc : undefined,
              ncMonto: ncMonto !== undefined ? parseFloat(ncMonto) : undefined,
              obs,
            },
          })
          return { status: 200, payload: pago }
        })
        return reply.code(result.status).send(result.payload)
      } catch (e) {
        if (e.code === 'P2002') return reply.code(409).send({ error: 'documento proveedor duplicado' })
        if (e.code === 'P2025') return reply.code(404).send({ error: 'Pago no encontrado' })
        throw e
      }
    })

    f.delete('/:id/pagos/:pagoId', {
      preHandler: [f.authenticate, f.rbac('proveedores', 'delete')],
    }, async (request, reply) => {
      const proveedorId = parseInt(request.params.id, 10)
      const pagoId = parseInt(request.params.pagoId, 10)
      if (isNaN(proveedorId) || isNaN(pagoId)) return reply.code(400).send({ error: 'ID invalido' })
      try {
        const proveedor = await requireActiveProveedor(f.prisma, proveedorId, reply)
        if (!proveedor) return reply
        const pago = await f.prisma.pagoProveedor.findFirst({
          where: proveedorPagoWhere(request.user, proveedor, { id: pagoId, eliminado: false }),
        })
        if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
        if (pago.stockAplicadoAt && !pago.stockReversadoAt) {
          return reply.code(409).send({ error: 'Use la accion Anular en pagos proveedores para reversar stock' })
        }
        await f.prisma.pagoProveedor.update({
          where: { id: pagoId },
          data: {
            estado: 'Anulado',
            eliminado: true,
            userMod: request.user?.nombre || request.user?.email || request.user?.role || 'Sistema',
            fecham: new Date(),
            motivoEliminacion: 'Anulado desde ficha proveedor',
          },
        })
        return reply.code(204).send()
      } catch (e) {
        if (e.code === 'P2025') return reply.code(404).send({ error: 'Pago no encontrado' })
        throw e
      }
    })
  })
}
