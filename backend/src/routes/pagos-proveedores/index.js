import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { getUserSucursalId, withTurnoSucursalScope } from '../caja/scope.js'
import { can } from '../../middleware/rbac.js'
import { normalizeDetalleDestino, reverseStockIngreso, validateAndApplyStockIngreso } from '../stock-ingresos/apply.js'

const STOCK_BODEGAS = new Set(['Inventario', 'Materias', 'Taller'])

function uploadsRoot() {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'))
}

export class StockIngresoRollbackError extends Error {
  constructor(payload, status = 400) {
    super(payload?.error || 'error al aplicar stock')
    this.name = 'StockIngresoRollbackError'
    this.payload = payload
    this.status = status
  }
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== ''
}

function cleanText(value) {
  if (!hasValue(value)) return null
  const text = String(value).trim()
  return text || null
}

function normalizePlainText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function parseOptionalInt(value) {
  if (!hasValue(value)) return null
  const n = Number.parseInt(value, 10)
  return Number.isInteger(n) && n > 0 ? n : null
}

function parseNumber(value) {
  if (!hasValue(value)) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function normalizePagoDocumento(value) {
  const text = cleanText(value)
  const plain = normalizePlainText(text)
  if (!plain) return null
  if (['nota', 'nota credito', 'nota de credito', 'nc', 'n/c'].includes(plain)) return 'Nota'
  if (plain === 'factura') return 'Factura'
  if (plain === 'boleta') return 'Boleta'
  return text
}

export function normalizePagoEstado(value) {
  const plain = normalizePlainText(value)
  if (!plain) return null
  if (plain === 'pagada' || plain === 'pagado') return 'Pagado'
  if (plain === 'abonada' || plain === 'abonado') return 'Abonado'
  if (plain === 'no pagada' || plain === 'no pagado' || plain === 'pendiente') return 'Pendiente'
  if (plain === 'vencida' || plain === 'vencido') return 'Vencido'
  if (plain === 'anulada' || plain === 'anulado') return 'Anulado'
  return cleanText(value)
}

export function calculatePagoFinancials(pago, { ncMontoOverride, totalOverride, montoPagadoOverride, ncOverride } = {}) {
  const totalNum = totalOverride !== undefined ? Number(totalOverride) : Number(pago.total || 0)
  const totalDec = new Prisma.Decimal(Number.isFinite(totalNum) ? totalNum.toFixed(2) : '0.00')

  const hasNc = ncOverride !== undefined ? Boolean(ncOverride) : Boolean(pago.nc)
  const ncMontoNum = ncMontoOverride !== undefined ? Number(ncMontoOverride) : Number(pago.ncMonto || 0)
  const ncDec = (hasNc && Number.isFinite(ncMontoNum) && ncMontoNum > 0)
    ? new Prisma.Decimal(ncMontoNum.toFixed(2))
    : new Prisma.Decimal('0.00')

  const efectivoPagar = Prisma.Decimal.max(new Prisma.Decimal('0.00'), totalDec.minus(ncDec))

  const montoPagadoDec = montoPagadoOverride !== undefined
    ? new Prisma.Decimal(Number(montoPagadoOverride).toFixed(2))
    : new Prisma.Decimal(pago.montoPagado != null ? Number(pago.montoPagado).toFixed(2) : '0.00')

  const saldoDec = Prisma.Decimal.max(new Prisma.Decimal('0.00'), efectivoPagar.minus(montoPagadoDec))

  let estado = pago.estado
  if (pago.eliminado || estado === 'Anulado') {
    estado = 'Anulado'
  } else if (saldoDec.lessThanOrEqualTo(new Prisma.Decimal('0.00')) && (efectivoPagar.greaterThan(0) || (hasNc && ncDec.greaterThan(0)))) {
    estado = 'Pagado'
  } else if (montoPagadoDec.greaterThan(0) && saldoDec.greaterThan(0)) {
    estado = 'Abonado'
  } else if (montoPagadoDec.equals(0)) {
    estado = 'Pendiente'
  }

  return {
    totalDec,
    ncDec,
    efectivoPagar,
    montoPagadoDec,
    saldoDec,
    estado,
  }
}

function estadoWhere(value) {
  const estado = normalizePagoEstado(value)
  if (!estado) return null
  if (estado === 'Pendiente') {
    return {
      estado: { in: ['Pendiente', 'No pagada', 'No pagado'] },
      saldo: { gt: 0 },
    }
  }
  if (estado === 'Abonado') {
    return {
      estado: 'Abonado',
      saldo: { gt: 0 },
    }
  }
  if (estado === 'Pagado') {
    return { estado: { in: ['Pagado', 'Pagada'] } }
  }
  if (estado === 'Vencido') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return {
      fechaVencimiento: { lt: today },
      saldo: { gt: 0 },
      estado: { not: 'Anulado' },
    }
  }
  return { estado }
}

function documentoWhere(value) {
  const documento = normalizePagoDocumento(value)
  if (!documento) return null
  if (documento === 'Nota') return { documento: { in: ['Nota', 'Nota Credito', 'Nota de Credito', 'NC'] } }
  return { documento }
}

function normalizeDetalles(rawDetalles) {
  return rawDetalles
    .map(d => ({
      codigoInterno: cleanText(d.codigoInterno),
      destino: normalizeDetalleDestino(d.destino),
      cantidad: parseNumber(d.cantidad),
      precio: parseNumber(d.precio),
      nombre: cleanText(d.nombre),
      unidadMedida: cleanText(d.unidadMedida),
      categoriaId: parseOptionalInt(d.categoriaId),
      subcategoriaId: parseOptionalInt(d.subcategoriaId),
      proveedorId: parseOptionalInt(d.proveedorId),
    }))
    .filter(d => d.codigoInterno)
}

function duplicateKey({ proveedorId, codigoProveedor, documento, nDoc, sucursalId } = {}) {
  if (!nDoc || (!proveedorId && !codigoProveedor)) return null
  const provider = proveedorId ? `proveedor:${proveedorId}` : `codigo:${codigoProveedor}`
  return [provider, documento || '', nDoc, sucursalId || 'global'].join('|').toLowerCase()
}

function duplicateWhere({ proveedorId, codigoProveedor, documento, nDoc, sucursalId, excludeId = null }) {
  const providers = []
  if (proveedorId) providers.push({ proveedorId })
  if (codigoProveedor) providers.push({ codigoProveedor })
  if (!nDoc || providers.length === 0) return null
  return {
    eliminado: false,
    estado: { not: 'Anulado' },
    nDoc: { equals: nDoc, mode: 'insensitive' },
    sucursalId: sucursalId ?? null,
    ...(documento ? { documento: { equals: documento, mode: 'insensitive' } } : {}),
    OR: providers,
    ...(excludeId ? { NOT: { id: excludeId } } : {}),
  }
}

async function findDuplicate(tx, data, excludeId = null) {
  const where = duplicateWhere({ ...data, excludeId })
  if (!where) return null
  return tx.pagoProveedor.findFirst({ where, orderBy: { id: 'asc' } })
}

function isUniqueViolation(error) {
  return error?.code === 'P2002' || String(error?.message || '').includes('pagos_proveedores_doc_provider_active_uidx')
}

async function resolveActiveProveedor(tx, { proveedorId, codigoProveedor }) {
  if (proveedorId) {
    const fn = (tx.proveedor?.findFirst || tx.proveedor?.findUnique)?.bind(tx.proveedor)
    const proveedor = fn ? await fn({
      where: { id: proveedorId, activo: true },
      select: { id: true, codigoProveedor: true },
    }) : null
    if (!proveedor) return { status: 404, payload: { error: 'Proveedor no encontrado o inactivo' } }
    if (codigoProveedor && proveedor.codigoProveedor && proveedor.codigoProveedor !== codigoProveedor) {
      return { status: 409, payload: { error: 'codigoProveedor no coincide con proveedorId' } }
    }
    return { proveedor }
  }

  const matches = await tx.proveedor.findMany({
    where: { codigoProveedor, activo: true },
    select: { id: true, codigoProveedor: true },
    take: 2,
  })
  if (matches.length === 0) return { status: 404, payload: { error: 'Proveedor no encontrado o inactivo' } }
  if (matches.length > 1) return { status: 409, payload: { error: 'codigoProveedor duplicado en proveedores activos' } }
  return { proveedor: matches[0] }
}

function resolvePagoSucursal(user, incomingSucursalId) {
  const userSucursalId = getUserSucursalId(user)
  if (userSucursalId) return userSucursalId
  return parseOptionalInt(incomingSucursalId)
}

async function providerMatches(prisma, search) {
  const text = String(search || '').trim()
  if (!text) return []
  const providers = await prisma.proveedor.findMany({
    where: {
      OR: [
        { nombre: { contains: text, mode: 'insensitive' } },
        { rut: { contains: text, mode: 'insensitive' } },
        ...(/^\d+$/.test(text) ? [{ codigoProveedor: Number.parseInt(text, 10) }] : []),
      ],
    },
    select: { id: true, codigoProveedor: true },
    take: 50,
  })
  const ids = providers.map(p => p.id).filter(Boolean)
  const codigos = providers.map(p => p.codigoProveedor).filter(Boolean)
  const clauses = []
  if (ids.length) clauses.push({ proveedorId: { in: ids } })
  if (codigos.length) clauses.push({ codigoProveedor: { in: codigos } })
  return clauses
}

async function buildPagoWhere(prisma, query = {}, user = null) {
  const {
    estado,
    documento,
    proveedorId,
    codigoProveedor,
    nDoc,
    sucursalId,
    bodega,
    onlyBodega,
    noPagadaFactura,
    noPagadaBoleta,
    desde,
    hasta,
    proveedor,
    search,
  } = query

  const clauses = [{ eliminado: false }]
  const userSucursalId = getUserSucursalId(user)
  if (userSucursalId) clauses.push({ sucursalId: userSucursalId })
  else if (sucursalId) clauses.push({ sucursalId: parseOptionalInt(sucursalId) })

  if (estado) {
    const estClause = estadoWhere(estado)
    if (estClause) clauses.push(estClause)
  }
  if (documento) {
    const docClause = documentoWhere(documento)
    if (docClause) clauses.push(docClause)
  }
  if (proveedorId) clauses.push({ proveedorId: parseOptionalInt(proveedorId) })
  if (codigoProveedor) clauses.push({ codigoProveedor: parseOptionalInt(codigoProveedor) })
  if (nDoc) clauses.push({ nDoc: { contains: String(nDoc).trim(), mode: 'insensitive' } })
  if (bodega) clauses.push({ bodega })
  if (onlyBodega === '1' || onlyBodega === 'true') {
    clauses.push({ bodega: { not: null } })
    clauses.push({ bodega: { not: 'No hay' } })
  }
  if (noPagadaFactura === '1' || noPagadaFactura === 'true') {
    clauses.push(documentoWhere('Factura'))
    clauses.push({ estado: { in: ['Pendiente', 'No pagada', 'No pagado', 'Abonado', 'Abonada', 'Vencido', 'Vencida'] } })
  }
  if (noPagadaBoleta === '1' || noPagadaBoleta === 'true') {
    clauses.push(documentoWhere('Boleta'))
    clauses.push({ estado: { in: ['Pendiente', 'No pagada', 'No pagado', 'Abonado', 'Abonada', 'Vencido', 'Vencida'] } })
  }
  if (desde || hasta) {
    const fechaDoc = {}
    if (desde) fechaDoc.gte = new Date(desde)
    if (hasta) fechaDoc.lte = new Date(`${hasta}T23:59:59`)
    clauses.push({ fechaDoc })
  }

  const providerSearch = proveedor || null
  if (providerSearch) {
    const providerClauses = await providerMatches(prisma, providerSearch)
    clauses.push(providerClauses.length ? { OR: providerClauses } : { id: -1 })
  }

  if (search) {
    const text = String(search).trim()
    const isNum = /^\d+$/.test(text)
    const providerClauses = await providerMatches(prisma, text)
    clauses.push({
      OR: [
        { nDoc: { contains: text, mode: 'insensitive' } },
        { documento: { contains: text, mode: 'insensitive' } },
        { obs: { contains: text, mode: 'insensitive' } },
        { bodega: { contains: text, mode: 'insensitive' } },
        ...(isNum ? [{ codigoProveedor: Number.parseInt(text, 10) }] : []),
        ...providerClauses,
      ],
    })
  }

  return clauses.filter(Boolean).length ? { AND: clauses.filter(Boolean) } : {}
}

async function enrichPagos(prisma, items) {
  const provIds = [...new Set(items.map(p => p.proveedorId).filter(Boolean))]
  const codigos = [...new Set(items.filter(p => !p.proveedorId).map(p => p.codigoProveedor).filter(Boolean))]
  const sucursalIds = [...new Set(items.map(p => p.sucursalId).filter(Boolean))]
  const pagoIds = items.map(p => p.id)

  const [byIds, byCodigo, sucursales, dtes] = await Promise.all([
    provIds.length
      ? prisma.proveedor.findMany({ where: { id: { in: provIds } }, select: { id: true, nombre: true, rut: true, codigoProveedor: true } })
      : [],
    codigos.length
      ? prisma.proveedor.findMany({ where: { codigoProveedor: { in: codigos }, activo: true }, select: { id: true, nombre: true, rut: true, codigoProveedor: true } })
      : [],
    sucursalIds.length
      ? prisma.sucursal.findMany({ where: { id: { in: sucursalIds } }, select: { id: true, nombre: true } })
      : [],
    pagoIds.length
      ? prisma.factDocumentoRecibido.findMany({
          where: { pagoProveedorId: { in: pagoIds } },
          select: { id: true, pagoProveedorId: true, folio: true, tipoDte: true },
        })
      : [],
  ])

  const idMap = Object.fromEntries(byIds.map(p => [p.id, p]))
  const codigoMap = Object.fromEntries(byCodigo.map(p => [p.codigoProveedor, p]))
  const sucursalMap = Object.fromEntries(sucursales.map(s => [s.id, s.nombre]))
  const dteMap = Object.fromEntries(dtes.map(d => [d.pagoProveedorId, d]))

  return items.map(p => ({
    ...p,
    proveedor: p.proveedorId ? idMap[p.proveedorId] || null : codigoMap[p.codigoProveedor] || null,
    sucursalNombre: p.sucursalId ? (sucursalMap[p.sucursalId] || `Sucursal #${p.sucursalId}`) : null,
    documentoRecibidoId: dteMap[p.id]?.id || null,
    dteFolio: dteMap[p.id]?.folio || null,
    dteTipo: dteMap[p.id]?.tipoDte || null,
  }))
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const text = value instanceof Date ? value.toISOString() : String(value)
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function buildCsv(items, detail = false) {
  const headers = detail
    ? [
        'ID', 'Sucursal', 'Proveedor', 'RUT', 'Documento', 'N Doc', 'Fecha Doc', 'Vencimiento',
        'Fecha Pago', 'Estado', 'Total Doc', 'Monto Pagado', 'Saldo Pendiente', 'Neto', 'IVA',
        'Codigo Item', 'Nombre Item', 'Destino', 'Cantidad', 'Costo Unitario', 'Subtotal Item',
      ]
    : [
        'ID', 'Sucursal', 'Proveedor', 'RUT', 'Documento', 'N Doc', 'Fecha Doc', 'Vencimiento',
        'Fecha Pago', 'Estado', 'Total Doc', 'Monto Pagado', 'Saldo Pendiente', 'Neto', 'IVA',
        'Bodega', 'Usuario', 'Nota Credito', 'Monto NC', 'Observaciones',
      ]

  const lines = [headers.map(csvEscape).join(';')]
  for (const p of items) {
    if (detail && Array.isArray(p.detallesFactura) && p.detallesFactura.length) {
      for (const d of p.detallesFactura) {
        lines.push([
          p.id,
          p.sucursalNombre || '',
          p.proveedor?.nombre || '',
          p.proveedor?.rut || '',
          p.documento || '',
          p.nDoc || '',
          p.fechaDoc ? p.fechaDoc.toISOString().slice(0, 10) : '',
          p.fechaVencimiento ? p.fechaVencimiento.toISOString().slice(0, 10) : '',
          p.fechaPago ? p.fechaPago.toISOString().slice(0, 10) : '',
          p.estado || '',
          p.total,
          p.montoPagado,
          p.saldo,
          p.neto || 0,
          p.iva || 0,
          d.codigoInterno || '',
          d.nombre || '',
          d.destino || '',
          d.cantidad,
          d.precio,
          Math.round(d.cantidad * d.precio),
        ].map(csvEscape).join(';'))
      }
    } else {
      lines.push([
        p.id,
        p.sucursalNombre || '',
        p.proveedor?.nombre || '',
        p.proveedor?.rut || '',
        p.documento || '',
        p.nDoc || '',
        p.fechaDoc ? p.fechaDoc.toISOString().slice(0, 10) : '',
        p.fechaVencimiento ? p.fechaVencimiento.toISOString().slice(0, 10) : '',
        p.fechaPago ? p.fechaPago.toISOString().slice(0, 10) : '',
        p.estado || '',
        p.total,
        p.montoPagado,
        p.saldo,
        p.neto || 0,
        p.iva || 0,
        p.bodega || '',
        p.usuario || '',
        p.nc ? 'Si' : 'No',
        p.ncMonto || 0,
        p.obs || '',
      ].map(csvEscape).join(';'))
    }
  }
  return '\uFEFF' + lines.join('\r\n')
}

async function anularPagoProveedor(fastify, request, reply) {
  const id = parseOptionalInt(request.params.id)
  if (!id) return reply.code(400).send({ error: 'ID invalido' })
  const motivo = cleanText(request.body?.motivo)
  if (!motivo) return reply.code(400).send({ error: 'Motivo de anulacion requerido' })
  const userId = request.user?.id || 1
  const userMod = request.user?.nombre || request.user?.email || request.user?.role || 'Sistema'

  const result = await fastify.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pago-proveedor-anular:${id}`})::bigint)`
    const pago = await tx.pagoProveedor.findUnique({
      where: { id },
      include: { abonos: true },
    })
    if (!pago || pago.eliminado) return { status: 404, payload: { error: 'Pago no encontrado' } }
    const userSucursalId = getUserSucursalId(request.user)
    if (userSucursalId && pago.sucursalId !== userSucursalId) {
      return { status: 404, payload: { error: 'Pago no encontrado' } }
    }

    // 1. Anular todos los abonos activos y revertir movimientos de caja
    const now = new Date()
    for (const abono of pago.abonos || []) {
      if (!abono.anulado) {
        if (abono.movimientoCajaId) {
          await tx.movimientoCaja.update({
            where: { id: abono.movimientoCajaId },
            data: { eliminado: true, estadoDoc: 'Nula', userMod, fecham: now },
          })
        }
        await tx.abonoPagoProveedor.update({
          where: { id: abono.id },
          data: {
            anulado: true,
            motivoAnulacion: `Anulacion de pago: ${motivo}`,
            anuladoAt: now,
            anuladoPor: userMod,
          },
        })
      }
    }

    // 2. Revertir stock si fue aplicado
    let reversa = { aplicados: [] }
    let stockReversadoAt = pago.stockReversadoAt
    if (pago.stockAplicadoAt && !pago.stockReversadoAt) {
      const detalles = await tx.detalleFacturaProveedor.findMany({ where: { pagoId: id } })
      reversa = await reverseStockIngreso({ tx, detalles, pago, userId })
      if (reversa.error) return { status: reversa.error.includes('stock') ? 409 : 400, payload: reversa }
      stockReversadoAt = now
    }

    // 3. Desvincular DTE recibido si estaba asociado
    await tx.factDocumentoRecibido.updateMany({
      where: { pagoProveedorId: id },
      data: { pagoProveedorId: null, estado: 'pendiente' },
    })

    // 4. Actualizar estado del pago a Anulado
    const updated = await tx.pagoProveedor.update({
      where: { id },
      data: {
        estado: 'Anulado',
        saldo: 0,
        montoPagado: 0,
        eliminado: true,
        userMod,
        fecham: now,
        motivoEliminacion: motivo,
        stockReversadoAt,
      },
    })
    return { status: 200, payload: { ok: true, pago: updated, reversa } }
  })

  return reply.code(result.status).send(result.payload)
}

function pagoProveedorScopeWhere(user, extra = {}) {
  const userSucursalId = getUserSucursalId(user)
  return {
    eliminado: false,
    ...(userSucursalId ? { sucursalId: userSucursalId } : {}),
    ...extra,
  }
}

function noPagadaDocumentoWhere(user, documento) {
  return pagoProveedorScopeWhere(user, {
    ...(documentoWhere(documento) || { documento }),
    estado: { in: ['Pendiente', 'No pagada', 'No pagado', 'Abonado', 'Abonada', 'Vencido', 'Vencida'] },
  })
}

export default async function pagosProveedoresRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac(['proveedores', 'caja.pagos_proveedores'], 'read')],
  }, async (request) => {
    const { page = '1' } = request.query
    const LIMIT = 100
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * LIMIT
    const where = await buildPagoWhere(fastify.prisma, request.query, request.user)

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayOfWeek = today.getDay()
    const diffToMonday = (dayOfWeek + 6) % 7
    const monday = new Date(today)
    monday.setDate(today.getDate() - diffToMonday)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    const userSucursalId = getUserSucursalId(request.user)
    const baseScope = {
      eliminado: false,
      ...(userSucursalId ? { sucursalId: userSucursalId } : {}),
    }

    const [
      items,
      total,
      sumAgg,
      vencidosAgg,
      estaSemanaAgg,
      esteMesAgg,
      facturasNoPagadas,
      boletasNoPagadas,
    ] = await Promise.all([
      fastify.prisma.pagoProveedor.findMany({
        where,
        orderBy: [{ fechaVencimiento: 'asc' }, { fechaDoc: 'asc' }, { id: 'asc' }],
        take: LIMIT,
        skip: offset,
      }),
      fastify.prisma.pagoProveedor.count({ where }),
      fastify.prisma.pagoProveedor.aggregate({
        where,
        _sum: { total: true, saldo: true, montoPagado: true },
      }),
      fastify.prisma.pagoProveedor.aggregate({
        where: {
          ...baseScope,
          fechaVencimiento: { lt: today },
          saldo: { gt: 0 },
          estado: { not: 'Anulado' },
        },
        _count: { _all: true },
        _sum: { saldo: true },
      }),
      fastify.prisma.pagoProveedor.aggregate({
        where: {
          ...baseScope,
          fechaVencimiento: { gte: monday, lte: sunday },
          saldo: { gt: 0 },
          estado: { not: 'Anulado' },
        },
        _count: { _all: true },
        _sum: { saldo: true },
      }),
      fastify.prisma.pagoProveedor.aggregate({
        where: {
          ...baseScope,
          fechaVencimiento: { gte: firstDayOfMonth, lte: lastDayOfMonth },
          saldo: { gt: 0 },
          estado: { not: 'Anulado' },
        },
        _count: { _all: true },
        _sum: { saldo: true },
      }),
      fastify.prisma.pagoProveedor.count({
        where: noPagadaDocumentoWhere(request.user, 'Factura'),
      }),
      fastify.prisma.pagoProveedor.count({
        where: noPagadaDocumentoWhere(request.user, 'Boleta'),
      }),
    ])

    const stats = {
      montoTotal: Number(sumAgg._sum.total || 0),
      saldoTotalPendiente: Number(sumAgg._sum.saldo || 0),
      montoPagadoTotal: Number(sumAgg._sum.montoPagado || 0),
      vencidoTotal: Number(vencidosAgg._sum.saldo || 0),
      vencidoCount: vencidosAgg._count._all || 0,
      estaSemanaTotal: Number(estaSemanaAgg._sum.saldo || 0),
      estaSemanaCount: estaSemanaAgg._count._all || 0,
      esteMesTotal: Number(esteMesAgg._sum.saldo || 0),
      esteMesCount: esteMesAgg._count._all || 0,
      facturasNoPagadas,
      boletasNoPagadas,
    }

    const enriched = await enrichPagos(fastify.prisma, items)
    return { items: enriched, total, limit: LIMIT, stats }
  })

  fastify.get('/export', {
    preHandler: [fastify.authenticate, fastify.rbac(['proveedores', 'caja.pagos_proveedores'], 'read')],
  }, async (request, reply) => {
    const detail = request.query.detalle === '1' || request.query.detalle === 'true'
    const where = await buildPagoWhere(fastify.prisma, request.query, request.user)
    const rows = await fastify.prisma.pagoProveedor.findMany({
      where,
      orderBy: [{ fechaVencimiento: 'asc' }, { fechaDoc: 'asc' }, { id: 'asc' }],
      include: detail ? { detallesFactura: true } : undefined,
    })
    const enriched = await enrichPagos(fastify.prisma, rows)
    const csv = buildCsv(enriched, detail)
    reply.header('content-type', 'text/csv; charset=utf-8')
    reply.header('content-disposition', `attachment; filename="pagos_proveedores_${detail ? 'detalle' : 'resumen'}.csv"`)
    return reply.send(csv)
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac(['proveedores', 'caja.pagos_proveedores'], 'read')],
  }, async (request, reply) => {
    const id = parseOptionalInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const where = { id, eliminado: false }
    const userSucursalId = getUserSucursalId(request.user)
    if (userSucursalId) where.sucursalId = userSucursalId
    const pago = await fastify.prisma.pagoProveedor.findFirst({
      where,
      include: {
        abonos: { orderBy: { fechaPago: 'desc' } },
        documentoRecibido: { select: { id: true, folio: true, tipoDte: true, estado: true, rutEmisor: true, razonSocialEmisor: true } },
      },
    })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    const detalles = await fastify.prisma.detalleFacturaProveedor.findMany({ where: { pagoId: id }, orderBy: { id: 'asc' } })
    const [enriched] = await enrichPagos(fastify.prisma, [pago])
    return { ...enriched, detalles }
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac(['proveedores', 'caja.pagos_proveedores'], 'write')],
  }, async (request, reply) => {
    const b = request.body || {}
    const proveedorId = parseOptionalInt(b.proveedorId)
    const codigoProveedor = parseOptionalInt(b.codigoProveedor)
    const sucursalId = resolvePagoSucursal(request.user, b.sucursalId)
    const documento = normalizePagoDocumento(b.documento)
    const nDoc = cleanText(b.nDoc)
    const documentoRecibidoId = parseOptionalInt(b.documentoRecibidoId)
    if (!proveedorId && !codigoProveedor) return reply.code(400).send({ error: 'proveedorId o codigoProveedor requerido' })
    if (!documento) return reply.code(400).send({ error: 'documento requerido' })
    if (!nDoc) return reply.code(400).send({ error: 'nDoc requerido' })
    if (!hasValue(b.total) && !Array.isArray(b.detalles)) return reply.code(400).send({ error: 'total o detalles requerido' })
    const bodega = cleanText(b.bodega)
    if (b.ingresaStock && !can(request.user?.role, 'bodega', 'write', request.user?.permisosExtra)) {
      return reply.code(403).send({ error: 'No tiene permiso para aplicar stock' })
    }
    if (b.ingresaStock && !STOCK_BODEGAS.has(bodega)) {
      return reply.code(400).send({ error: 'La bodega seleccionada no permite aplicar stock' })
    }

    const detalles = normalizeDetalles(Array.isArray(b.detalles) ? b.detalles : [])
    if (b.ingresaStock && detalles.length === 0) {
      return reply.code(400).send({ error: 'Debe incluir al menos una línea con código interno para aplicar stock' })
    }
    const stockInvalid = b.ingresaStock
      ? detalles.find(d => d.cantidad <= 0 || (d.destino === 'producto' && !Number.isInteger(d.cantidad)))
      : null
    if (stockInvalid) {
      return reply.code(400).send({
        error: 'cantidad debe ser entera y mayor que cero para ingresar stock de productos',
        codigoInterno: stockInvalid.codigoInterno,
      })
    }
    const totalCalc = detalles.length
      ? detalles.reduce((s, d) => s + d.cantidad * d.precio, 0)
      : parseNumber(b.total)
    const estadoInput = normalizePagoEstado(b.estado) || 'Pendiente'

    const hasNc = !!b.nc || documento === 'Nota'
    const ncMonto = b.ncMonto != null ? parseFloat(b.ncMonto) : null

    const financials = calculatePagoFinancials({
      total: totalCalc,
      nc: hasNc,
      ncMonto,
      estado: estadoInput,
      eliminado: false,
    })

    const netoDec = b.neto != null
      ? new Prisma.Decimal(Number(b.neto).toFixed(2))
      : (documento === 'Factura' ? new Prisma.Decimal((totalCalc / 1.19).toFixed(2)) : financials.totalDec)
    const ivaDec = b.iva != null
      ? new Prisma.Decimal(Number(b.iva).toFixed(2))
      : (documento === 'Factura' ? new Prisma.Decimal((totalCalc - (totalCalc / 1.19)).toFixed(2)) : new Prisma.Decimal('0.00'))
    const exentoDec = b.exento != null
      ? new Prisma.Decimal(Number(b.exento).toFixed(2))
      : new Prisma.Decimal('0.00')

    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        if (documentoRecibidoId) {
          await tx.$queryRaw`SELECT id FROM "facturacion"."documentos_recibidos" WHERE id = ${documentoRecibidoId} FOR UPDATE`
          const recibido = await tx.factDocumentoRecibido.findUnique({ where: { id: documentoRecibidoId }, select: { id: true, pagoProveedorId: true } })
          if (!recibido) return { status: 404, payload: { error: 'Documento recibido no encontrado' } }
          if (recibido.pagoProveedorId) return { status: 409, payload: { error: 'Este documento recibido ya fue ingresado como mercadería', pagoProveedorId: recibido.pagoProveedorId } }
        }
        const resolved = await resolveActiveProveedor(tx, { proveedorId, codigoProveedor })
        if (resolved.payload) return resolved
        const pagoProveedorId = resolved.proveedor.id
        const pagoCodigoProveedor = resolved.proveedor.codigoProveedor || codigoProveedor
        const lockKey = duplicateKey({ proveedorId: pagoProveedorId, codigoProveedor: pagoCodigoProveedor, documento, nDoc, sucursalId })
        if (lockKey) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`
          const existing = await findDuplicate(tx, { proveedorId: pagoProveedorId, codigoProveedor: pagoCodigoProveedor, documento, nDoc, sucursalId })
          if (existing) {
            if (b.ingresaStock && existing.stockAplicadoAt) {
              return { status: 200, payload: { ...existing, idempotent: true } }
            }
            return { status: 409, payload: { error: 'documento proveedor duplicado', duplicateId: existing.id } }
          }
        }

        const pago = await tx.pagoProveedor.create({
          data: {
            proveedorId: pagoProveedorId,
            codigoProveedor: pagoCodigoProveedor,
            sucursalId,
            documento,
            nDoc,
            fechaDoc: b.fechaDoc ? new Date(b.fechaDoc) : new Date(),
            fechaPago: b.fechaPago ? new Date(b.fechaPago) : null,
            fechaVencimiento: b.fechaVencimiento ? new Date(b.fechaVencimiento) : null,
            estado: financials.estado,
            total: totalCalc,
            neto: netoDec,
            iva: ivaDec,
            exento: exentoDec,
            montoPagado: financials.montoPagadoDec,
            saldo: financials.saldoDec,
            usuario: request.user?.nombre || request.user?.username || null,
            bodega,
            nc: hasNc,
            ncNumero: cleanText(b.ncNumero),
            ncMonto,
            obs: cleanText(b.obs),
            stockAplicadoAt: null,
          },
        })

        const userId = request.user?.id || 1
        for (const d of detalles) {
          await tx.detalleFacturaProveedor.create({
            data: {
              pagoId: pago.id,
              codigoInterno: d.codigoInterno,
              destino: d.destino,
              cantidad: d.cantidad,
              precio: d.precio,
              nombre: d.nombre,
              unidadMedida: d.unidadMedida,
              categoriaId: d.categoriaId,
              subcategoriaId: d.subcategoriaId,
            },
          })
        }

        if (b.ingresaStock && detalles.length > 0) {
          const applied = await validateAndApplyStockIngreso({ tx, detalles, pago, userId, sucursalId })
          if (applied.error) throw new StockIngresoRollbackError(applied)
          await tx.pagoProveedor.update({ where: { id: pago.id }, data: { stockAplicadoAt: new Date() } })
          pago.stockAplicadoAt = new Date()
        }

        if (documentoRecibidoId) await tx.factDocumentoRecibido.update({ where: { id: documentoRecibidoId }, data: { pagoProveedorId: pago.id, estado: 'ingresado' } })
        return { status: 201, payload: pago }
      })
      return reply.code(result.status).send(result.payload)
    } catch (error) {
      if (error instanceof StockIngresoRollbackError) {
        return reply.code(error.status).send(error.payload)
      }
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: 'documento proveedor duplicado' })
      }
      throw error
    }
  })

  // Registrar Abono / Pago a Proveedor
  fastify.post('/:id/abonos', {
    preHandler: [fastify.authenticate, fastify.rbac('caja.pagos_proveedores', 'write')],
  }, async (request, reply) => {
    const id = parseOptionalInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const body = request.body || {}

    const montoNum = Number(body.monto)
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      return reply.code(400).send({ error: 'Monto debe ser mayor a 0' })
    }
    const montoDec = new Prisma.Decimal(montoNum.toFixed(2))

    const origenFondos = cleanText(body.origenFondos) || 'Banco'
    if (!['Caja', 'Banco'].includes(origenFondos)) {
      return reply.code(400).send({ error: 'origenFondos debe ser Caja o Banco' })
    }
    const medioPago = cleanText(body.medioPago) || (origenFondos === 'Caja' ? 'Efectivo' : 'Transferencia')
    const bancoOrigen = cleanText(body.bancoOrigen)
    const numeroOperacion = cleanText(body.numeroOperacion)
    const fechaPago = body.fechaPago ? new Date(body.fechaPago) : new Date()
    const obs = cleanText(body.obs)
    const comprobanteUrl = cleanText(body.comprobanteUrl)
    const usuario = request.user?.nombre || request.user?.email || request.user?.username || 'Sistema'

    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        // Bloqueo pesimista e idempotencia estricta
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pago-proveedor-abono:${id}`})::bigint)`
        await tx.$queryRaw`SELECT id FROM "catalogo"."pagos_proveedores" WHERE id = ${id} FOR UPDATE`

        const pago = await tx.pagoProveedor.findUnique({ where: { id } })
        if (!pago || pago.eliminado) {
          return { status: 404, payload: { error: 'Pago no encontrado' } }
        }
        const userSucursalId = getUserSucursalId(request.user)
        if (userSucursalId && pago.sucursalId !== userSucursalId) {
          return { status: 404, payload: { error: 'Pago no encontrado' } }
        }
        if (pago.estado === 'Anulado') {
          return { status: 400, payload: { error: 'No se pueden registrar pagos en un documento anulado' } }
        }

        const currentSaldoDec = new Prisma.Decimal(pago.saldo != null ? Number(pago.saldo).toFixed(2) : '0.00')
        if (currentSaldoDec.lessThanOrEqualTo(0)) {
          return { status: 400, payload: { error: 'El documento ya fue pagado en su totalidad' } }
        }
        if (montoDec.greaterThan(currentSaldoDec)) {
          return {
            status: 400,
            payload: {
              error: `El monto ingresado ($${Number(montoDec).toLocaleString('es-CL')}) excede el saldo pendiente ($${Number(currentSaldoDec).toLocaleString('es-CL')})`,
            },
          }
        }

        let movimientoCaja = null
        if (origenFondos === 'Caja') {
          const turno = await tx.turno.findFirst({
            where: withTurnoSucursalScope(request.user, { estado: 'abierto' }),
            include: { caja: true },
            orderBy: { apertura: 'desc' },
          })
          if (!turno) {
            return {
              status: 400,
              payload: { error: 'No hay turno de caja abierto para registrar egreso en efectivo. Debe abrir un turno primero.' },
            }
          }

          movimientoCaja = await tx.movimientoCaja.create({
            data: {
              tipo: 'Egreso',
              monto: Number(montoDec),
              medioPago,
              turnoId: turno.id,
              sucursalId: pago.sucursalId || turno.caja?.sucursalId || userSucursalId,
              origenTipo: 'pago_proveedor',
              origenId: pago.id,
              documento: pago.documento,
              nDoc: pago.nDoc,
              nMedioPago: numeroOperacion,
              origenMedioPago: bancoOrigen,
              referencia: `Pago proveedor ${pago.documento || ''} ${pago.nDoc || pago.id}`.trim(),
              usuario,
              fecha: fechaPago,
            },
          })
        }

        const abono = await tx.abonoPagoProveedor.create({
          data: {
            pagoId: pago.id,
            monto: montoDec,
            fechaPago,
            medioPago,
            origenFondos,
            bancoOrigen,
            numeroOperacion,
            movimientoCajaId: movimientoCaja?.id || null,
            usuario,
            comprobanteUrl,
            obs,
          },
        })

        const financials = calculatePagoFinancials(pago, {
          montoPagadoOverride: new Prisma.Decimal(pago.montoPagado != null ? Number(pago.montoPagado).toFixed(2) : '0.00').plus(montoDec),
        })

        const updatedPago = await tx.pagoProveedor.update({
          where: { id: pago.id },
          data: {
            montoPagado: financials.montoPagadoDec,
            saldo: financials.saldoDec,
            estado: financials.estado,
            fechaPago,
            userMod: usuario,
            fecham: new Date(),
          },
        })

        return { status: 201, payload: { ok: true, abono, pago: updatedPago } }
      })

      return reply.code(result.status).send(result.payload)
    } catch (e) {
      request.log.error(e)
      return reply.code(500).send({ error: 'Error al registrar abono' })
    }
  })

  // Anular Abono específico
  fastify.post('/:id/abonos/:abonoId/anular', {
    preHandler: [fastify.authenticate, fastify.rbac('caja.pagos_proveedores', 'delete')],
  }, async (request, reply) => {
    const id = parseOptionalInt(request.params.id)
    const abonoId = parseOptionalInt(request.params.abonoId)
    if (!id || !abonoId) return reply.code(400).send({ error: 'Parametros invalidos' })
    const motivo = cleanText(request.body?.motivo)
    if (!motivo) return reply.code(400).send({ error: 'Motivo de anulacion requerido' })
    const usuario = request.user?.nombre || request.user?.email || request.user?.username || 'Sistema'

    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pago-proveedor-abono:${id}`})::bigint)`
        await tx.$queryRaw`SELECT id FROM "catalogo"."pagos_proveedores" WHERE id = ${id} FOR UPDATE`

        const pago = await tx.pagoProveedor.findUnique({ where: { id } })
        if (!pago || pago.eliminado) return { status: 404, payload: { error: 'Pago no encontrado' } }
        const userSucursalId = getUserSucursalId(request.user)
        if (userSucursalId && pago.sucursalId !== userSucursalId) {
          return { status: 404, payload: { error: 'Pago no encontrado' } }
        }

        const abono = await tx.abonoPagoProveedor.findFirst({
          where: { id: abonoId, pagoId: id },
        })
        if (!abono) return { status: 404, payload: { error: 'Abono no encontrado' } }
        if (abono.anulado) return { status: 400, payload: { error: 'El abono ya se encuentra anulado' } }

        const now = new Date()
        if (abono.movimientoCajaId) {
          await tx.movimientoCaja.update({
            where: { id: abono.movimientoCajaId },
            data: { eliminado: true, estadoDoc: 'Nula', userMod: usuario, fecham: now },
          })
        }

        const updatedAbono = await tx.abonoPagoProveedor.update({
          where: { id: abonoId },
          data: {
            anulado: true,
            motivoAnulacion: motivo,
            anuladoAt: now,
            anuladoPor: usuario,
          },
        })

        const newMontoPagado = Prisma.Decimal.max(
          new Prisma.Decimal('0.00'),
          new Prisma.Decimal(pago.montoPagado != null ? Number(pago.montoPagado).toFixed(2) : '0.00').minus(new Prisma.Decimal(abono.monto))
        )
        const financials = calculatePagoFinancials(pago, {
          montoPagadoOverride: newMontoPagado,
        })

        const updatedPago = await tx.pagoProveedor.update({
          where: { id },
          data: {
            montoPagado: financials.montoPagadoDec,
            saldo: financials.saldoDec,
            estado: financials.estado,
            userMod: usuario,
            fecham: now,
          },
        })

        return { status: 200, payload: { ok: true, abono: updatedAbono, pago: updatedPago } }
      })

      return reply.code(result.status).send(result.payload)
    } catch (e) {
      request.log.error(e)
      return reply.code(500).send({ error: 'Error al anular abono' })
    }
  })

  // Subir Comprobante de Transferencia / Pago
  fastify.post('/upload-comprobante', {
    preHandler: [fastify.authenticate, fastify.rbac('caja.pagos_proveedores', 'write')],
  }, async (request, reply) => {
    let file
    try {
      file = await request.file()
    } catch (err) {
      return reply.code(400).send({ error: 'Error al procesar archivo' })
    }
    if (!file) return reply.code(400).send({ error: 'Archivo requerido' })

    const allowedMime = {
      'application/pdf': '.pdf',
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
    }
    const ext = allowedMime[file.mimetype]
    if (!ext) {
      return reply.code(400).send({ error: 'Formato no permitido. Solo se aceptan PDF, PNG, JPG o WEBP' })
    }

    const buffer = await file.toBuffer()
    if (buffer.length > 5 * 1024 * 1024) {
      return reply.code(400).send({ error: 'El archivo excede el limite de 5MB' })
    }

    const filename = `comprobante-${randomUUID()}${ext}`
    const dir = path.join(uploadsRoot(), 'pagos-proveedores', 'comprobantes')
    await mkdir(dir, { recursive: true })
    const target = path.join(dir, filename)
    await writeFile(target, buffer)

    return reply.code(201).send({ url: `/api/uploads/pagos-proveedores/comprobantes/${filename}`, filename })
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac(['proveedores', 'caja.pagos_proveedores'], 'write')],
  }, async (request, reply) => {
    const id = parseOptionalInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const body = request.body || {}
    const current = await fastify.prisma.pagoProveedor.findUnique({ where: { id } })
    if (!current || current.eliminado) return reply.code(404).send({ error: 'Pago no encontrado' })
    const userSucursalId = getUserSucursalId(request.user)
    if (userSucursalId && current.sucursalId !== userSucursalId) {
      return reply.code(404).send({ error: 'Pago no encontrado' })
    }

    const data = {}
    const incomingEstado = body.estado !== undefined ? normalizePagoEstado(body.estado) : undefined
    if (incomingEstado === 'Anulado') {
      return reply.code(409).send({ error: 'Use la accion Anular para reversar stock y conservar trazabilidad' })
    }

    const protectedFields = ['documento', 'nDoc', 'total', 'bodega', 'nc', 'ncMonto', 'ncNumero', 'fechaDoc']
    const touchesProtected = protectedFields.some(f => body[f] !== undefined)
    if (current.stockAplicadoAt && !current.stockReversadoAt && touchesProtected) {
      return reply.code(409).send({ error: 'No se puede modificar documento, total o bodega con stock aplicado. Anule/reverse el ingreso si corresponde.' })
    }

    if (body.total !== undefined) {
      const t = Number(body.total)
      if (!Number.isFinite(t) || t <= 0) return reply.code(400).send({ error: 'total debe ser mayor a 0' })
      data.total = t
    }
    if (body.documento !== undefined) data.documento = normalizePagoDocumento(body.documento)
    for (const f of ['nDoc', 'usuario', 'bodega', 'obs', 'ncNumero']) {
      if (body[f] !== undefined) data[f] = cleanText(body[f])
    }
    if (body.fechaDoc !== undefined) data.fechaDoc = body.fechaDoc ? new Date(body.fechaDoc) : null
    if (body.fechaPago !== undefined) data.fechaPago = body.fechaPago ? new Date(body.fechaPago) : null
    if (body.fechaVencimiento !== undefined) data.fechaVencimiento = body.fechaVencimiento ? new Date(body.fechaVencimiento) : null
    if (body.nc !== undefined) data.nc = !!body.nc
    if (body.ncMonto !== undefined) data.ncMonto = body.ncMonto === null || body.ncMonto === '' ? null : parseFloat(body.ncMonto)
    if (body.neto !== undefined) data.neto = body.neto != null ? new Prisma.Decimal(Number(body.neto).toFixed(2)) : null
    if (body.iva !== undefined) data.iva = body.iva != null ? new Prisma.Decimal(Number(body.iva).toFixed(2)) : null
    if (body.exento !== undefined) data.exento = body.exento != null ? new Prisma.Decimal(Number(body.exento).toFixed(2)) : null

    // Recalcular saldo y estado financiero si cambian total, nc, ncMonto o estado
    const financials = calculatePagoFinancials(current, {
      totalOverride: data.total,
      ncMontoOverride: data.ncMonto,
      ncOverride: data.nc,
    })
    data.saldo = financials.saldoDec
    if (incomingEstado !== undefined) {
      data.estado = incomingEstado
    } else {
      data.estado = financials.estado
    }

    data.userMod = request.user?.nombre || request.user?.email || request.user?.role || 'Sistema'
    data.fecham = new Date()

    const next = { ...current, ...data }
    const lockKey = duplicateKey({
      proveedorId: next.proveedorId,
      codigoProveedor: next.codigoProveedor,
      documento: next.documento,
      nDoc: next.nDoc,
      sucursalId: next.sucursalId,
    })

    try {
      const updated = await fastify.prisma.$transaction(async (tx) => {
        if (lockKey) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`
          const duplicate = await findDuplicate(tx, {
            proveedorId: next.proveedorId,
            codigoProveedor: next.codigoProveedor,
            documento: next.documento,
            nDoc: next.nDoc,
            sucursalId: next.sucursalId,
          }, id)
          if (duplicate) return { status: 409, payload: { error: 'documento proveedor duplicado', duplicateId: duplicate.id } }
        }
        const pago = await tx.pagoProveedor.update({ where: { id }, data })
        return { status: 200, payload: pago }
      })
      return reply.code(updated.status).send(updated.payload)
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'documento proveedor duplicado' })
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Pago no encontrado' })
      throw e
    }
  })

  fastify.post('/:id/anular', {
    preHandler: [fastify.authenticate, fastify.rbac(['proveedores', 'caja.pagos_proveedores'], 'delete')],
  }, async (request, reply) => anularPagoProveedor(fastify, request, reply))

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac(['proveedores', 'caja.pagos_proveedores'], 'delete')],
  }, async (request, reply) => anularPagoProveedor(fastify, request, reply))
}
