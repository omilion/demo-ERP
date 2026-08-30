// Movimientos manuales de stock por producto (ingreso / egreso / ajuste)
import { resolveOdtForWrite, resolveOrdenForWrite } from '../relation-guards.js'
import { can } from '../../middleware/rbac.js'
import { recomputeProductoCosteo } from './costeo.js'

const TIPOS = ['ingreso', 'egreso', 'ajuste', 'reserva', 'liberacion', 'dano', 'recuperacion', 'merma']
const MOTIVO_CATEGORIAS = [
  ['merma', 'Merma'],
  ['perdida', 'Perdida'],
  ['dano', 'Dano'],
  ['error inventario', 'Error inventario'],
  ['otro', 'Otro'],
]

function hasValue(value) {
  return value !== undefined && value !== null && value !== ''
}

function cleanText(value) {
  if (!hasValue(value)) return null
  const text = String(value).trim()
  return text || null
}

function normalizeForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeMotivoCategoria(value) {
  const normalized = normalizeForMatch(value)
  if (!normalized) return null
  const found = MOTIVO_CATEGORIAS.find(([key]) => key === normalized)
  return found?.[1] || null
}

function buildProportionalReductions(rows, cantidad) {
  const quantities = rows.map(row => Math.max(0, Number.parseInt(row.cantidad, 10) || 0))
  const total = quantities.reduce((sum, qty) => sum + qty, 0)
  const target = Math.min(Math.max(0, Number.parseInt(cantidad, 10) || 0), total)
  if (!target || !total) return []

  let remaining = target
  const reductions = quantities.map((qty) => {
    const reduction = Math.min(qty, Math.floor((target * qty) / total))
    remaining -= reduction
    return reduction
  })

  const order = rows
    .map((row, index) => ({ index, id: row.id, cantidad: quantities[index] }))
    .sort((a, b) => b.cantidad - a.cantidad || a.id - b.id)

  for (const item of order) {
    if (remaining <= 0) break
    if (reductions[item.index] >= quantities[item.index]) continue
    reductions[item.index] += 1
    remaining -= 1
  }

  return rows
    .map((row, index) => ({
      id: row.id,
      cantidad: quantities[index],
      reduccion: reductions[index],
    }))
    .filter(row => row.reduccion > 0)
}

async function reduceProductoProveedorStock(tx, productoId, cantidad) {
  const rows = await tx.productoProveedor.findMany({
    where: { productoId, activo: true, cantidad: { gt: 0 } },
    select: { id: true, cantidad: true },
    orderBy: [{ cantidad: 'desc' }, { id: 'asc' }],
  })
  if (!rows.length) return

  const reductions = buildProportionalReductions(rows, cantidad)
  for (const row of reductions) {
    await tx.productoProveedor.update({
      where: { id: row.id },
      data: { cantidad: row.cantidad - row.reduccion },
    })
  }
  await recomputeProductoCosteo(tx, productoId)
}

export function buildMovimientoMotivo({ tipo, cantidad, stockActual, motivo, motivoCategoria } = {}) {
  const detail = cleanText(motivo)
  if (!detail) return { error: 'motivo requerido' }
  const categoria = normalizeMotivoCategoria(motivoCategoria)
  if (hasValue(motivoCategoria) && !categoria) {
    return { error: 'motivoCategoria invalido' }
  }
  if (!categoria) return { motivo: detail }

  const isReduction = ['egreso', 'dano', 'merma'].includes(tipo) || (tipo === 'ajuste' && Number(cantidad) < Number(stockActual || 0))
  if (!isReduction) {
    return { error: 'motivoCategoria solo aplica a egreso o ajuste de disminucion' }
  }

  const normalizedDetail = normalizeForMatch(detail)
  const normalizedCategoria = normalizeForMatch(categoria)
  if (normalizedDetail === normalizedCategoria || normalizedDetail.startsWith(`${normalizedCategoria}:`) || normalizedDetail.startsWith(`${normalizedCategoria} -`)) {
    return { motivo: detail }
  }
  return { motivo: `${categoria}: ${detail}` }
}

export function buildStockMovementPlan({ tipo, cantidad, stock, stockReservado = 0, stockDanado = 0 } = {}) {
  const qty = Number.parseInt(cantidad, 10)
  const current = {
    stock: Number(stock || 0),
    reservado: Number(stockReservado || 0),
    danado: Number(stockDanado || 0),
  }
  current.disponible = Math.max(0, current.stock - current.reservado - current.danado)
  if (!TIPOS.includes(tipo)) return { error: `tipo debe ser ${TIPOS.join(', ')}` }
  if (!Number.isInteger(qty) || (tipo === 'ajuste' ? qty < 0 : qty <= 0)) return { error: 'cantidad invalida' }

  let stockDelta = 0
  let reservadoDelta = 0
  let danadoDelta = 0
  if (tipo === 'ingreso') stockDelta = qty
  if (tipo === 'egreso') {
    if (qty > current.disponible) return { error: 'Egreso supera el stock disponible' }
    stockDelta = -qty
  }
  if (tipo === 'ajuste') {
    if (qty < current.reservado + current.danado) return { error: 'El ajuste no puede dejar menos stock físico que el reservado y dañado' }
    stockDelta = qty - current.stock
  }
  if (tipo === 'reserva') {
    if (qty > current.disponible) return { error: 'Reserva supera el stock disponible' }
    reservadoDelta = qty
  }
  if (tipo === 'liberacion') {
    if (qty > current.reservado) return { error: 'Liberación supera el stock reservado' }
    reservadoDelta = -qty
  }
  if (tipo === 'dano') {
    if (qty > current.disponible) return { error: 'Daño supera el stock disponible' }
    danadoDelta = qty
  }
  if (tipo === 'recuperacion') {
    if (qty > current.danado) return { error: 'Recuperación supera el stock dañado' }
    danadoDelta = -qty
  }
  if (tipo === 'merma') {
    if (qty > current.danado) return { error: 'La merma debe provenir de stock previamente marcado como dañado' }
    stockDelta = -qty
    danadoDelta = -qty
  }

  const final = {
    stock: current.stock + stockDelta,
    reservado: current.reservado + reservadoDelta,
    danado: current.danado + danadoDelta,
  }
  final.disponible = final.stock - final.reservado - final.danado
  if (stockDelta === 0 && reservadoDelta === 0 && danadoDelta === 0) return { error: 'El movimiento no cambia el stock' }
  return { qty, current, final, stockDelta, reservadoDelta, danadoDelta }
}

function parseOptionalPositiveInt(value, field) {
  if (!hasValue(value)) return { value: null }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { error: `${field} invalido` }
  }
  return { value: parsed }
}

async function resolveTraceability(prisma, body, options = {}) {
  const ordenInput = parseOptionalPositiveInt(body.ordenId, 'ordenId')
  if (ordenInput.error) return { status: 400, error: ordenInput.error }
  const odtInput = parseOptionalPositiveInt(body.odtId, 'odtId')
  if (odtInput.error) return { status: 400, error: odtInput.error }
  const pagoInput = parseOptionalPositiveInt(body.pagoProveedorId, 'pagoProveedorId')
  if (pagoInput.error) return { status: 400, error: pagoInput.error }
  const origenInput = parseOptionalPositiveInt(body.origenId, 'origenId')
  if (origenInput.error) return { status: 400, error: origenInput.error }

  let ordenId = ordenInput.value
  const odtId = odtInput.value
  const pagoProveedorId = pagoInput.value

  if (odtId) {
    const resolvedOdt = await resolveOdtForWrite(prisma, odtId, { user: options.user })
    if (resolvedOdt.error) return resolvedOdt
    if (ordenId && ordenId !== resolvedOdt.odt.ordenId) {
      return { status: 409, error: 'ODT no pertenece a la orden indicada' }
    }
    ordenId = resolvedOdt.odt.ordenId
  }

  if (ordenId) {
    const resolvedOrden = await resolveOrdenForWrite(prisma, { ordenId }, { user: options.user })
    if (resolvedOrden.error) return resolvedOrden
  }

  if (pagoProveedorId) {
    const pago = await prisma.pagoProveedor.findUnique({
      where: { id: pagoProveedorId },
      select: { id: true },
    })
    if (!pago) return { status: 404, error: 'Pago proveedor no encontrado' }
  }

  const origenTipo = String(body.origenTipo || '').trim()
    || (pagoProveedorId ? 'pago_proveedor' : odtId ? 'odt' : ordenId ? 'orden' : 'manual')
  const origenId = origenInput.value ?? pagoProveedorId ?? odtId ?? ordenId

  return { ordenId, odtId, pagoProveedorId, origenTipo, origenId }
}

export default async function movimientosProductoRoutes(fastify) {
  fastify.get('/:id/movimientos', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    return fastify.prisma.movimientoBodega.findMany({
      where: { productoId: id }, orderBy: { createdAt: 'desc' }, take: 100,
    })
  })

  // Entradas y salidas: es lo que hace el encargado de inventario a diario.
  fastify.post('/:id/movimientos', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega.movimientos', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const { tipo, cantidad, motivo, motivoCategoria } = request.body || {}
    if (!TIPOS.includes(tipo)) return reply.code(400).send({ error: `tipo debe ser ${TIPOS.join(', ')}` })
    if (tipo === 'ajuste' && !can(request.user?.role, 'bodega', 'delete', request.user?.permisosExtra)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    const qty = parseInt(cantidad, 10)
    const prod = await fastify.prisma.producto.findUnique({ where: { id } })
    if (!prod) return reply.code(404).send({ error: 'Producto no encontrado' })
    const builtMotivo = buildMovimientoMotivo({
      tipo,
      cantidad: qty,
      stockActual: prod.stock,
      motivo,
      motivoCategoria,
    })
    if (builtMotivo.error) return reply.code(400).send({ error: builtMotivo.error })

    const traceability = await resolveTraceability(fastify.prisma, request.body || {}, { user: request.user })
    if (traceability.error) return reply.code(traceability.status || 400).send({ error: traceability.error })

    const plan = buildStockMovementPlan({
      tipo,
      cantidad: qty,
      stock: prod.stock,
      stockReservado: prod.stockReservado,
      stockDanado: prod.stockDanado,
    })
    if (plan.error) return reply.code(plan.error.includes('supera') || plan.error.includes('previamente') ? 409 : 400).send({ error: plan.error })
    const userId = request.user?.id || 1

    const result = await fastify.prisma.$transaction(async (tx) => {
      await tx.producto.update({
        where: { id },
        data: {
          stock: plan.final.stock,
          stockReservado: plan.final.reservado,
          stockDanado: plan.final.danado,
        },
      })
      if (plan.stockDelta < 0) {
        await reduceProductoProveedorStock(tx, id, Math.abs(plan.stockDelta))
      }
      const movimiento = await tx.movimientoBodega.create({
        data: {
          productoId: id,
          tipo,
          cantidad: plan.stockDelta,
          stockAnterior: plan.current.stock,
          stockPosterior: plan.final.stock,
          reservadoDelta: plan.reservadoDelta,
          danadoDelta: plan.danadoDelta,
          reservadoFinal: plan.final.reservado,
          danadoFinal: plan.final.danado,
          motivo: builtMotivo.motivo,
          userId,
          ...traceability,
        },
      })
      return {
        movimiento,
        stockFinal: plan.final.stock,
        stockFisico: plan.final.stock,
        stockReservado: plan.final.reservado,
        stockDanado: plan.final.danado,
        stockDisponible: plan.final.disponible,
      }
    })
    return reply.code(201).send(result)
  })
}
