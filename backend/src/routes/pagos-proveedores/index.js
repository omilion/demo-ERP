import { getUserSucursalId } from '../caja/scope.js'
import { can } from '../../middleware/rbac.js'
import { normalizeDetalleDestino, reverseStockIngreso, validateAndApplyStockIngreso } from '../stock-ingresos/apply.js'

const STOCK_BODEGAS = new Set(['Inventario', 'Materias', 'Taller'])

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
  if (plain === 'no pagada' || plain === 'no pagado' || plain === 'pendiente') return 'Pendiente'
  if (plain === 'vencida' || plain === 'vencido') return 'Vencido'
  if (plain === 'anulada' || plain === 'anulado') return 'Anulado'
  return cleanText(value)
}

function estadoWhere(value) {
  const estado = normalizePagoEstado(value)
  if (!estado) return null
  if (estado === 'Pendiente') return { estado: { in: ['Pendiente', 'No pagada', 'No pagado'] } }
  if (estado === 'Pagado') return { estado: { in: ['Pagado', 'Pagada'] } }
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

function resolvePagoSucursal(user, requestedSucursalId) {
  const scoped = getUserSucursalId(user)
  if (scoped) return scoped
  return parseOptionalInt(requestedSucursalId)
}

function duplicateKey({ proveedorId, codigoProveedor, documento, nDoc, sucursalId }) {
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

async function resolveActiveProveedor(tx, { proveedorId, codigoProveedor }) {
  if (proveedorId) {
    const proveedor = await tx.proveedor.findFirst({
      where: { id: proveedorId, activo: true },
      select: { id: true, codigoProveedor: true },
    })
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

function isUniqueViolation(error) {
  return error?.code === 'P2002' || String(error?.message || '').includes('pagos_proveedores_doc_provider_active_uidx')
}

async function providerMatches(prisma, term) {
  const text = cleanText(term)
  if (!text) return []
  const isNum = /^\d+$/.test(text)
  const providers = await prisma.proveedor.findMany({
    where: {
      activo: true,
      OR: [
        { nombre: { contains: text, mode: 'insensitive' } },
        { razonSocial: { contains: text, mode: 'insensitive' } },
        { rut: { contains: text, mode: 'insensitive' } },
        ...(isNum ? [{ codigoProveedor: Number.parseInt(text, 10) }] : []),
      ],
    },
    select: { id: true, codigoProveedor: true },
    take: 100,
  })
  const ids = providers.map(p => p.id).filter(Boolean)
  const codigos = providers.map(p => p.codigoProveedor).filter(Boolean)
  const clauses = []
  if (ids.length) clauses.push({ proveedorId: { in: ids } })
  if (codigos.length) clauses.push({ codigoProveedor: { in: codigos } })
  return clauses
}

async function buildPagoWhere(prisma, query, user) {
  const {
    search,
    proveedor,
    proveedorId,
    codigoProveedor,
    desde,
    hasta,
    nDoc,
    bodega,
    onlyBodega,
    noPagadaFactura,
    noPagadaBoleta,
    sucursalId,
  } = query
  const documento = query.documento || query.doc
  const estado = query.estado
  const clauses = [{ eliminado: false }]
  const userSucursalId = getUserSucursalId(user)
  if (userSucursalId) clauses.push({ sucursalId: userSucursalId })
  else if (sucursalId) clauses.push({ sucursalId: parseOptionalInt(sucursalId) })

  if (estado) clauses.push(estadoWhere(estado))
  if (documento) clauses.push(documentoWhere(documento))
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
    clauses.push(estadoWhere('Pendiente'))
  }
  if (noPagadaBoleta === '1' || noPagadaBoleta === 'true') {
    clauses.push(documentoWhere('Boleta'))
    clauses.push(estadoWhere('Pendiente'))
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
  const [byIds, byCodigo, sucursales] = await Promise.all([
    provIds.length
      ? prisma.proveedor.findMany({ where: { id: { in: provIds } }, select: { id: true, nombre: true, rut: true, codigoProveedor: true } })
      : [],
    codigos.length
      ? prisma.proveedor.findMany({ where: { codigoProveedor: { in: codigos }, activo: true }, select: { id: true, nombre: true, rut: true, codigoProveedor: true } })
      : [],
    sucursalIds.length
      ? prisma.sucursal.findMany({ where: { id: { in: sucursalIds } }, select: { id: true, nombre: true } })
      : [],
  ])
  const idMap = Object.fromEntries(byIds.map(p => [p.id, p]))
  const codigoMap = Object.fromEntries(byCodigo.map(p => [p.codigoProveedor, p]))
  const sucursalMap = Object.fromEntries(sucursales.map(s => [s.id, s.nombre]))
  return items.map(p => ({
    ...p,
    proveedor: p.proveedorId ? idMap[p.proveedorId] || null : codigoMap[p.codigoProveedor] || null,
    sucursalNombre: p.sucursalId ? (sucursalMap[p.sucursalId] || `Sucursal #${p.sucursalId}`) : null,
  }))
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const text = value instanceof Date ? value.toISOString() : String(value)
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvDate(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : ''
}

function buildCsv(rows, detail = false) {
  const header = detail
    ? ['id_pago', 'documento', 'n_doc', 'estado', 'proveedor', 'rut', 'fecha_doc', 'bodega', 'codigo_interno', 'destino', 'nombre', 'cantidad', 'precio', 'total_linea']
    : ['id', 'n_doc', 'documento', 'estado', 'total', 'nc_monto', 'rut', 'proveedor', 'fecha_doc', 'fecha_vencimiento', 'fecha_pago', 'fecha_creacion', 'creada_por', 'bodega', 'sucursal', 'obs']
  const lines = [header.join(';')]
  for (const row of rows) {
    if (detail) {
      const detalles = row.detallesFactura?.length ? row.detallesFactura : [null]
      for (const d of detalles) {
        lines.push([
          row.id,
          row.documento,
          row.nDoc,
          row.estado,
          row.proveedor?.nombre,
          row.proveedor?.rut,
          csvDate(row.fechaDoc),
          row.bodega,
          d?.codigoInterno,
          d?.destino,
          d?.nombre,
          d?.cantidad,
          d?.precio,
          d ? Number(d.cantidad || 0) * Number(d.precio || 0) : '',
        ].map(csvEscape).join(';'))
      }
    } else {
      lines.push([
        row.id,
        row.nDoc,
        row.documento,
        row.estado,
        row.total,
        row.ncMonto,
        row.proveedor?.rut,
        row.proveedor?.nombre,
        csvDate(row.fechaDoc),
        csvDate(row.fechaVencimiento),
        csvDate(row.fechaPago),
        csvDate(row.createdAt),
        row.usuario,
        row.bodega,
        row.sucursalNombre,
        row.obs,
      ].map(csvEscape).join(';'))
    }
  }
  return `\uFEFF${lines.join('\n')}\n`
}

function pagoProveedorScopeWhere(user, extra = {}) {
  const sucursalId = getUserSucursalId(user)
  return {
    eliminado: false,
    ...(sucursalId ? { sucursalId } : {}),
    ...extra,
  }
}

function noPagadaDocumentoWhere(user, documento) {
  return pagoProveedorScopeWhere(user, {
    documento,
    estado: { in: ['Pendiente', 'No pagada', 'No pagado'] },
  })
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
    const pago = await tx.pagoProveedor.findUnique({ where: { id } })
    if (!pago || pago.eliminado) return { status: 404, payload: { error: 'Pago no encontrado' } }
    const userSucursalId = getUserSucursalId(request.user)
    if (userSucursalId && pago.sucursalId !== userSucursalId) {
      return { status: 404, payload: { error: 'Pago no encontrado' } }
    }

    let reversa = { aplicados: [] }
    let stockReversadoAt = pago.stockReversadoAt
    if (pago.stockAplicadoAt && !pago.stockReversadoAt) {
      const detalles = await tx.detalleFacturaProveedor.findMany({ where: { pagoId: id } })
      reversa = await reverseStockIngreso({ tx, detalles, pago, userId })
      if (reversa.error) return { status: reversa.error.includes('stock') ? 409 : 400, payload: reversa }
      stockReversadoAt = new Date()
    }

    const updated = await tx.pagoProveedor.update({
      where: { id },
      data: {
        estado: 'Anulado',
        eliminado: true,
        userMod,
        fecham: new Date(),
        motivoEliminacion: motivo,
        stockReversadoAt,
      },
    })
    return { status: 200, payload: { ok: true, pago: updated, reversa } }
  })

  return reply.code(result.status).send(result.payload)
}

export default async function pagosProveedoresRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'read')],
  }, async (request) => {
    const { page = '1' } = request.query
    const LIMIT = 100
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * LIMIT
    const where = await buildPagoWhere(fastify.prisma, request.query, request.user)

    const [items, total, byEstado, sumAgg, facturasNoPagadas, boletasNoPagadas] = await Promise.all([
      fastify.prisma.pagoProveedor.findMany({
        where,
        orderBy: [{ fechaVencimiento: 'asc' }, { fechaDoc: 'asc' }, { id: 'asc' }],
        take: LIMIT,
        skip: offset,
      }),
      fastify.prisma.pagoProveedor.count({ where }),
      fastify.prisma.pagoProveedor.groupBy({ by: ['estado'], where, _count: { _all: true }, _sum: { total: true } }),
      fastify.prisma.pagoProveedor.aggregate({ where, _sum: { total: true } }),
      fastify.prisma.pagoProveedor.count({ where: noPagadaDocumentoWhere(request.user, 'Factura') }),
      fastify.prisma.pagoProveedor.count({ where: noPagadaDocumentoWhere(request.user, 'Boleta') }),
    ])
    const stats = {
      Pendiente: 0,
      Pagado: 0,
      Vencido: 0,
      Anulado: 0,
      montoTotal: sumAgg._sum.total || 0,
      montoPendiente: 0,
      montoVencido: 0,
      facturasNoPagadas,
      boletasNoPagadas,
    }
    for (const g of byEstado) {
      const estado = normalizePagoEstado(g.estado) || g.estado
      stats[estado] = (stats[estado] || 0) + g._count._all
      if (estado === 'Pendiente') stats.montoPendiente += g._sum.total || 0
      if (estado === 'Vencido') stats.montoVencido += g._sum.total || 0
    }

    const enriched = await enrichPagos(fastify.prisma, items)
    enriched.sort((a, b) => {
      const rut = String(a.proveedor?.rut || '').localeCompare(String(b.proveedor?.rut || ''), 'es')
      if (rut) return rut
      const vencA = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Number.MAX_SAFE_INTEGER
      const vencB = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Number.MAX_SAFE_INTEGER
      if (vencA !== vencB) return vencA - vencB
      return new Date(a.fechaDoc || a.createdAt || 0) - new Date(b.fechaDoc || b.createdAt || 0)
    })
    return { items: enriched, total, limit: LIMIT, stats }
  })

  fastify.get('/export', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'read')],
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
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'read')],
  }, async (request, reply) => {
    const id = parseOptionalInt(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const where = { id, eliminado: false }
    const userSucursalId = getUserSucursalId(request.user)
    if (userSucursalId) where.sucursalId = userSucursalId
    const pago = await fastify.prisma.pagoProveedor.findFirst({ where })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    const detalles = await fastify.prisma.detalleFacturaProveedor.findMany({ where: { pagoId: id }, orderBy: { id: 'asc' } })
    const [enriched] = await enrichPagos(fastify.prisma, [pago])
    return { ...enriched, detalles }
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'write')],
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
    const estado = normalizePagoEstado(b.estado) || 'Pendiente'

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
            estado,
            total: totalCalc,
            usuario: request.user?.nombre || request.user?.username || null,
            bodega,
            nc: !!b.nc || documento === 'Nota',
            ncNumero: cleanText(b.ncNumero),
            ncMonto: b.ncMonto != null ? parseFloat(b.ncMonto) : null,
            obs: cleanText(b.obs),
            stockAplicadoAt: null,
          },
        })

        const userId = request.user?.id || 1
        let stockAplicado = false
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
          stockAplicado = applied.aplicados.some(item => item.ok)
        }

        const payload = stockAplicado
          ? await tx.pagoProveedor.update({ where: { id: pago.id }, data: { stockAplicadoAt: new Date() } })
          : pago
        if (documentoRecibidoId) await tx.factDocumentoRecibido.update({ where: { id: documentoRecibidoId }, data: { pagoProveedorId: pago.id, estado: 'ingresado' } })
        return { status: 201, payload }
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

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'write')],
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

    if (incomingEstado !== undefined) data.estado = incomingEstado
    if (body.documento !== undefined) data.documento = normalizePagoDocumento(body.documento)
    for (const f of ['nDoc', 'usuario', 'bodega', 'obs', 'ncNumero']) {
      if (body[f] !== undefined) data[f] = cleanText(body[f])
    }
    if (body.fechaDoc !== undefined) data.fechaDoc = body.fechaDoc ? new Date(body.fechaDoc) : null
    if (body.fechaPago !== undefined) data.fechaPago = body.fechaPago ? new Date(body.fechaPago) : null
    if (body.fechaVencimiento !== undefined) data.fechaVencimiento = body.fechaVencimiento ? new Date(body.fechaVencimiento) : null
    if (body.total !== undefined) data.total = parseFloat(body.total) || 0
    if (body.nc !== undefined) data.nc = !!body.nc
    if (body.ncMonto !== undefined) data.ncMonto = body.ncMonto === null || body.ncMonto === '' ? null : parseFloat(body.ncMonto)
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
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'delete')],
  }, async (request, reply) => anularPagoProveedor(fastify, request, reply))

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'delete')],
  }, async (request, reply) => anularPagoProveedor(fastify, request, reply))
}
