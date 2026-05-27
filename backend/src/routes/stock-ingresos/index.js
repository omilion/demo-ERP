import { getUserSucursalId } from '../caja/scope.js'
import { normalizePagoDocumento, normalizePagoEstado } from '../pagos-proveedores/index.js'
import { validateAndApplyStockIngreso } from './apply.js'

const STOCK_BODEGAS = new Set(['Inventario', 'Materias', 'Taller'])

function hasFlag(value) {
  return value === '1' || value === 'true' || value === true
}

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number.parseInt(value, 10)
  return Number.isInteger(n) && n > 0 ? n : null
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

async function providerSearchClauses(prisma, term) {
  const text = String(term || '').trim()
  if (!text) return []
  const isNum = /^\d+$/.test(text)
  const providers = await prisma.proveedor.findMany({
    where: {
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
  return [
    ...(ids.length ? [{ proveedorId: { in: ids } }] : []),
    ...(codigos.length ? [{ codigoProveedor: { in: codigos } }] : []),
  ]
}

async function buildStockIngresoWhere(prisma, query, user) {
  const {
    desde,
    hasta,
    proveedorId,
    codigoProveedor,
    proveedor,
    nDoc,
    bodega,
    estado,
    noPagadaFactura,
    noPagadaBoleta,
    search,
  } = query
  const documento = query.documento || query.doc
  const clauses = [
    { eliminado: false },
    { bodega: { not: null } },
    { bodega: { not: 'No hay' } },
  ]
  const userSucursalId = getUserSucursalId(user)
  if (userSucursalId) clauses.push({ sucursalId: userSucursalId })
  if (proveedorId) clauses.push({ proveedorId: parseOptionalInt(proveedorId) })
  if (codigoProveedor) clauses.push({ codigoProveedor: parseOptionalInt(codigoProveedor) })
  if (nDoc) clauses.push({ nDoc: { contains: String(nDoc).trim(), mode: 'insensitive' } })
  if (bodega) clauses.push({ bodega })
  if (estado) clauses.push(estadoWhere(estado))
  if (documento) clauses.push(documentoWhere(documento))
  if (hasFlag(noPagadaFactura)) {
    clauses.push(documentoWhere('Factura'))
    clauses.push(estadoWhere('Pendiente'))
  }
  if (hasFlag(noPagadaBoleta)) {
    clauses.push(documentoWhere('Boleta'))
    clauses.push(estadoWhere('Pendiente'))
  }
  if (desde || hasta) {
    const fechaDoc = {}
    if (desde) fechaDoc.gte = new Date(desde)
    if (hasta) fechaDoc.lte = new Date(`${hasta}T23:59:59`)
    clauses.push({ fechaDoc })
  }
  if (proveedor) {
    const providerClauses = await providerSearchClauses(prisma, proveedor)
    clauses.push(providerClauses.length ? { OR: providerClauses } : { id: -1 })
  }
  if (search) {
    const text = String(search).trim()
    const isNum = /^\d+$/.test(text)
    const providerClauses = await providerSearchClauses(prisma, text)
    clauses.push({
      OR: [
        { nDoc: { contains: text, mode: 'insensitive' } },
        { documento: { contains: text, mode: 'insensitive' } },
        { bodega: { contains: text, mode: 'insensitive' } },
        { obs: { contains: text, mode: 'insensitive' } },
        ...(isNum ? [{ codigoProveedor: Number.parseInt(text, 10) }] : []),
        ...providerClauses,
      ],
    })
  }
  return { AND: clauses.filter(Boolean) }
}

async function enrichProviders(prisma, items) {
  const ids = [...new Set(items.map(p => p.proveedorId).filter(Boolean))]
  const codigos = [...new Set(items.filter(p => !p.proveedorId).map(p => p.codigoProveedor).filter(Boolean))]
  const [byId, byCodigo] = await Promise.all([
    ids.length ? prisma.proveedor.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true, rut: true, codigoProveedor: true } }) : [],
    codigos.length ? prisma.proveedor.findMany({ where: { codigoProveedor: { in: codigos } }, select: { id: true, nombre: true, rut: true, codigoProveedor: true } }) : [],
  ])
  const idMap = Object.fromEntries(byId.map(p => [p.id, p]))
  const codigoMap = Object.fromEntries(byCodigo.map(p => [p.codigoProveedor, p]))
  return items.map(p => ({
    ...p,
    proveedor: p.proveedorId ? idMap[p.proveedorId] || null : codigoMap[p.codigoProveedor] || null,
  }))
}

export default async function stockIngresosRoutes(fastify) {
  fastify.post('/aplicar/:pagoId', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'write')],
  }, async (request, reply) => {
    const pagoId = parseInt(request.params.pagoId, 10)
    if (isNaN(pagoId) || pagoId <= 0) return reply.code(400).send({ error: 'pagoId invalido' })

    const result = await fastify.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stock-ingreso:${pagoId}`})::bigint)`

      const pago = await tx.pagoProveedor.findUnique({ where: { id: pagoId } })
      if (!pago || pago.eliminado) return { status: 404, payload: { error: 'Pago no encontrado' } }
      const userSucursalId = getUserSucursalId(request.user)
      if (userSucursalId && pago.sucursalId !== userSucursalId) {
        return { status: 404, payload: { error: 'Pago no encontrado' } }
      }
      if (pago.estado === 'Anulado' || pago.stockReversadoAt) {
        return { status: 409, payload: { error: 'No se puede aplicar stock a un pago anulado o reversado' } }
      }
      if (!STOCK_BODEGAS.has(pago.bodega)) {
        return { status: 400, payload: { error: 'La bodega del documento no permite aplicar stock' } }
      }
      if (pago.stockAplicadoAt) {
        return {
          status: 200,
          payload: {
            ok: true,
            idempotent: true,
            pagoId,
            stockAplicadoAt: pago.stockAplicadoAt,
            aplicados: [],
          },
        }
      }

      const detalles = await tx.detalleFacturaProveedor.findMany({ where: { pagoId } })
      if (detalles.length === 0) return { status: 400, payload: { error: 'No hay detalles para aplicar' } }

      const userId = request.user?.id || 1
      const applied = await validateAndApplyStockIngreso({ tx, detalles, pago, userId, sucursalId: pago.sucursalId ?? userSucursalId })
      if (applied.error) return { status: applied.error.includes('stock') ? 409 : 400, payload: applied }
      const aplicados = applied.aplicados

      if (aplicados.some(item => item.ok)) {
        await tx.pagoProveedor.update({
          where: { id: pago.id },
          data: { stockAplicadoAt: new Date() },
        })
      }

      return { status: 200, payload: { ok: true, aplicados } }
    })

    return reply.code(result.status).send(result.payload)
  })

  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request) => {
    const { page = '1' } = request.query
    const LIMIT = 100
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * LIMIT
    const where = await buildStockIngresoWhere(fastify.prisma, request.query, request.user)
    const [items, total] = await Promise.all([
      fastify.prisma.pagoProveedor.findMany({
        where,
        orderBy: [{ fechaDoc: 'desc' }, { id: 'desc' }],
        take: LIMIT,
        skip,
        include: { detallesFactura: true },
      }),
      fastify.prisma.pagoProveedor.count({ where }),
    ])
    return { items: await enrichProviders(fastify.prisma, items), total, limit: LIMIT }
  })
}
