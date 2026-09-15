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

const SOURCE_TYPE_LABELS = {
  manual: 'Movimiento manual',
  ajuste_manual: 'Ajuste manual',
  importacion: 'Importación',
  importacion_stock: 'Importación de stock',
  carga_excel_locaciones: 'Carga de inventario por Excel',
  orden: 'Venta',
  venta: 'Venta',
  venta_directa: 'Venta directa',
  odt: 'Orden de trabajo',
  odt_consumo: 'Consumo de ODT',
  pago_proveedor: 'Documento proveedor',
  orden_compra_proveedor: 'Orden de compra proveedor',
}

function normalizeSourceType(value) {
  return normalizeForMatch(value).replace(/[\s-]+/g, '_')
}

function sourceTypeLabel(value) {
  const normalized = normalizeSourceType(value)
  if (!normalized) return SOURCE_TYPE_LABELS.manual
  if (SOURCE_TYPE_LABELS[normalized]) return SOURCE_TYPE_LABELS[normalized]
  return normalized
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function sourceReferenceFromMotivo(movimiento, sourceType) {
  if (sourceType !== 'carga_excel_locaciones') return null
  const filename = String(movimiento.motivo || '').match(/\(([^)]+\.(?:xlsx?|csv))\)/i)?.[1]
  return filename || null
}

export function buildDocumentoOrigen(movimiento, relations = {}) {
  const pagoProveedor = relations.pagoProveedor || movimiento.pagoProveedor
  if (pagoProveedor) {
    const parts = [pagoProveedor.documento, pagoProveedor.nDoc ? `N° ${pagoProveedor.nDoc}` : null].filter(Boolean)
    return {
      tipo: SOURCE_TYPE_LABELS.pago_proveedor,
      referencia: parts.join(' · ') || `Pago proveedor #${pagoProveedor.id}`,
      id: pagoProveedor.id,
    }
  }

  const odt = relations.odt || movimiento.odt
  if (odt) {
    const number = odt.legacyNInterno ?? odt.id
    return {
      tipo: SOURCE_TYPE_LABELS.odt,
      referencia: `ODT #${number}`,
      id: odt.id,
    }
  }

  const orden = relations.orden || movimiento.orden
  if (orden) {
    const number = orden.nInterno ?? orden.id
    return {
      tipo: SOURCE_TYPE_LABELS.orden,
      referencia: `Venta #${number}`,
      id: orden.id,
    }
  }

  const sourceType = normalizeSourceType(movimiento.origenTipo)
  const tipo = sourceTypeLabel(sourceType)
  const referencia = sourceReferenceFromMotivo(movimiento, sourceType)
    || (movimiento.origenId ? `${tipo} #${movimiento.origenId}` : null)

  return {
    tipo,
    referencia,
    id: movimiento.origenId ?? null,
  }
}

export function buildMovimientoUsuario(movimiento, user = null) {
  const id = movimiento.userId ?? null
  const nombre = user?.nombre || user?.email || (id ? `Usuario #${id}` : 'Sistema')
  return { id, nombre, email: user?.email || null }
}

function isOrderSource(sourceType) {
  return sourceType === 'orden' || sourceType === 'venta' || sourceType.startsWith('venta_')
}

function isOdtSource(sourceType) {
  return sourceType === 'odt' || sourceType.startsWith('odt_')
}

async function loadOriginRelations(prisma, movimientos) {
  const orderIds = new Set()
  const odtIds = new Set()
  const pagoProveedorIds = new Set()

  for (const movimiento of movimientos) {
    const sourceType = normalizeSourceType(movimiento.origenTipo)
    const originId = Number.isInteger(movimiento.origenId) ? movimiento.origenId : null
    if (!originId) continue
    if (!movimiento.orden && isOrderSource(sourceType)) orderIds.add(originId)
    if (!movimiento.odt && isOdtSource(sourceType)) odtIds.add(originId)
    if (!movimiento.pagoProveedor && sourceType === 'pago_proveedor') pagoProveedorIds.add(originId)
  }

  const [ordenes, odts, pagosProveedor] = await Promise.all([
    orderIds.size
      ? prisma.orden.findMany({ where: { id: { in: [...orderIds] } }, select: { id: true, nInterno: true } })
      : [],
    odtIds.size
      ? prisma.odt.findMany({ where: { id: { in: [...odtIds] } }, select: { id: true, legacyNInterno: true } })
      : [],
    pagoProveedorIds.size
      ? prisma.pagoProveedor.findMany({ where: { id: { in: [...pagoProveedorIds] } }, select: { id: true, documento: true, nDoc: true } })
      : [],
  ])

  return {
    ordenes: new Map(ordenes.map(orden => [orden.id, orden])),
    odts: new Map(odts.map(odt => [odt.id, odt])),
    pagosProveedor: new Map(pagosProveedor.map(pago => [pago.id, pago])),
  }
}

export function serializeMovimiento(movimiento, user, relations = {}) {
  const documentoOrigen = buildDocumentoOrigen(movimiento, relations)
  const usuario = buildMovimientoUsuario(movimiento, user)
  const { orden, odt, pagoProveedor, ...base } = movimiento
  return {
    ...base,
    documentoOrigen,
    usuario,
    tipoDocumento: documentoOrigen.tipo,
    documentoReferencia: documentoOrigen.referencia,
    usuarioNombre: usuario.nombre,
  }
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
  // Merma y daño cambian estados distintos del inventario. Permitir que se
  // anoten como un egreso genérico destruye el indicador de dañado y permite
  // descontar merma sin pasar antes por la cuarentena física.
  const categoriaEsperada = tipo === 'merma' ? 'Merma' : tipo === 'dano' ? 'Dano' : null
  if (categoriaEsperada && categoria !== categoriaEsperada) {
    return { error: `${tipo} requiere motivoCategoria ${categoriaEsperada}` }
  }
  if (categoria === 'Merma' && tipo !== 'merma') return { error: 'Merma debe registrarse con tipo merma' }
  if (categoria === 'Dano' && tipo !== 'dano') return { error: 'Dano debe registrarse con tipo dano' }
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

async function lockProductoStock(tx, productoId) {
  if (typeof tx.$executeRaw === 'function') {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stock-producto:${productoId}`})::bigint)`
  }
}

function throwStockPlanError(error) {
  const failure = new Error(error)
  failure.statusCode = error.includes('supera') || error.includes('previamente') ? 409 : 400
  throw failure
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
    const movimientos = await fastify.prisma.movimientoBodega.findMany({
      where: { productoId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        orden: { select: { id: true, nInterno: true } },
        odt: { select: { id: true, legacyNInterno: true } },
        pagoProveedor: { select: { id: true, documento: true, nDoc: true } },
      },
    })
    const users = await fastify.prisma.user.findMany({
      where: { id: { in: [...new Set(movimientos.map(movimiento => movimiento.userId).filter(Number.isInteger))] } },
      select: { id: true, nombre: true, email: true },
    })
    const usersById = new Map(users.map(user => [user.id, user]))
    const originRelations = await loadOriginRelations(fastify.prisma, movimientos)

    return movimientos.map(movimiento => serializeMovimiento(
      movimiento,
      usersById.get(movimiento.userId),
      {
        orden: movimiento.orden || originRelations.ordenes.get(movimiento.origenId),
        odt: movimiento.odt || originRelations.odts.get(movimiento.origenId),
        pagoProveedor: movimiento.pagoProveedor || originRelations.pagosProveedor.get(movimiento.origenId),
      },
    ))
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
    const qty = Number(cantidad)
    if (!Number.isInteger(qty)) return reply.code(400).send({ error: 'cantidad invalida' })

    const traceability = await resolveTraceability(fastify.prisma, request.body || {}, { user: request.user })
    if (traceability.error) return reply.code(traceability.status || 400).send({ error: traceability.error })

    const userId = request.user?.id || 1

    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        // El candado coincide con los flujos de venta; el CAS protege además
        // contra cualquier escritor que aún no tome ese candado.
        await lockProductoStock(tx, id)
        const prod = await tx.producto.findUnique({ where: { id } })
        if (!prod) {
          const missing = new Error('Producto no encontrado')
          missing.statusCode = 404
          throw missing
        }
        const builtMotivo = buildMovimientoMotivo({ tipo, cantidad: qty, stockActual: prod.stock, motivo, motivoCategoria })
        if (builtMotivo.error) throwStockPlanError(builtMotivo.error)
      const plan = buildStockMovementPlan({
        tipo,
        cantidad: qty,
        stock: prod.stock,
        stockReservado: prod.stockReservado,
        stockDanado: prod.stockDanado,
      })
        if (plan.error) throwStockPlanError(plan.error)
        const updated = await tx.producto.updateMany({
          where: {
            id,
            stock: Number(prod.stock || 0),
            stockReservado: Number(prod.stockReservado || 0),
            stockDanado: Number(prod.stockDanado || 0),
          },
        data: {
          stock: plan.final.stock,
          stockReservado: plan.final.reservado,
          stockDanado: plan.final.danado,
        },
      })
      if (updated.count !== 1) return { error: 'El stock cambió mientras registraba el movimiento; recargue el producto e intente nuevamente', status: 409 }
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
    } catch (error) {
      if (error.statusCode) return reply.code(error.statusCode).send({ error: error.message })
      throw error
    }
  })
}
