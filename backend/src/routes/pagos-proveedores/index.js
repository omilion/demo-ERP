function hasValue(value) {
  return value !== undefined && value !== null && value !== ''
}

function cleanText(value) {
  if (!hasValue(value)) return null
  const text = String(value).trim()
  return text || null
}

function parseOptionalInt(value) {
  if (!hasValue(value)) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

function parseNumber(value) {
  if (!hasValue(value)) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeDetalles(rawDetalles) {
  return rawDetalles
    .map(d => ({
      codigoInterno: cleanText(d.codigoInterno),
      cantidad: parseNumber(d.cantidad),
      precio: parseNumber(d.precio),
    }))
    .filter(d => d.codigoInterno)
}

function stockIdempotencyKey({ proveedorId, codigoProveedor, documento, nDoc }) {
  if (!nDoc || (!proveedorId && !codigoProveedor)) return null
  const provider = proveedorId ? `proveedor:${proveedorId}` : `codigo:${codigoProveedor}`
  return [provider, documento || '', nDoc].join('|').toLowerCase()
}

function stockIdempotencyWhere({ proveedorId, codigoProveedor, documento, nDoc }) {
  const providers = []
  if (proveedorId) providers.push({ proveedorId })
  if (codigoProveedor) providers.push({ codigoProveedor })
  if (!nDoc || providers.length === 0) return null
  return {
    nDoc,
    stockAplicadoAt: { not: null },
    ...(documento ? { documento } : {}),
    OR: providers,
  }
}

export default async function pagosProveedoresRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'read')],
  }, async (request) => {
    const { search, estado, proveedorId, desde, hasta, page = '1' } = request.query
    const LIMIT = 100
    const offset = (parseInt(page, 10) - 1) * LIMIT

    const where = {}
    if (estado) where.estado = estado
    if (proveedorId) where.proveedorId = parseInt(proveedorId, 10)
    if (search) {
      const isNum = /^\d+$/.test(search.trim())
      where.OR = [
        { nDoc: { contains: search, mode: 'insensitive' } },
        { documento: { contains: search, mode: 'insensitive' } },
        { obs: { contains: search, mode: 'insensitive' } },
        ...(isNum ? [{ codigoProveedor: parseInt(search, 10) }] : []),
      ]
    }
    if (desde || hasta) {
      where.fechaDoc = {}
      if (desde) where.fechaDoc.gte = new Date(desde)
      if (hasta) where.fechaDoc.lte = new Date(hasta + 'T23:59:59')
    }

    const [items, total, byEstado, sumAgg] = await Promise.all([
      fastify.prisma.pagoProveedor.findMany({
        where,
        orderBy: [{ fechaDoc: 'desc' }, { id: 'desc' }],
        take: LIMIT,
        skip: offset,
      }),
      fastify.prisma.pagoProveedor.count({ where }),
      fastify.prisma.pagoProveedor.groupBy({ by: ['estado'], where, _count: { _all: true }, _sum: { total: true } }),
      fastify.prisma.pagoProveedor.aggregate({ where, _sum: { total: true } }),
    ])
    const stats = { Pendiente: 0, Pagado: 0, Vencido: 0, Anulado: 0, montoTotal: sumAgg._sum.total || 0, montoPendiente: 0, montoVencido: 0 }
    for (const g of byEstado) {
      stats[g.estado] = g._count._all
      if (g.estado === 'Pendiente') stats.montoPendiente = g._sum.total || 0
      if (g.estado === 'Vencido') stats.montoVencido = g._sum.total || 0
    }

    const provIds = [...new Set(items.map(p => p.proveedorId).filter(Boolean))]
    let provMap = {}
    if (provIds.length) {
      const provs = await fastify.prisma.proveedor.findMany({
        where: { id: { in: provIds } },
        select: { id: true, nombre: true, rut: true },
      })
      provMap = Object.fromEntries(provs.map(p => [p.id, p]))
    }
    const enriched = items.map(p => ({ ...p, proveedor: p.proveedorId ? provMap[p.proveedorId] || null : null }))
    return { items: enriched, total, limit: LIMIT, stats }
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'read')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const pago = await fastify.prisma.pagoProveedor.findUnique({ where: { id } })
    if (!pago) return reply.code(404).send({ error: 'Pago no encontrado' })
    const detalles = await fastify.prisma.detalleFacturaProveedor.findMany({ where: { pagoId: id } })
    let proveedor = null
    if (pago.proveedorId) {
      proveedor = await fastify.prisma.proveedor.findUnique({
        where: { id: pago.proveedorId },
        select: { id: true, nombre: true, rut: true, email: true, telefono: true },
      })
    }
    return { ...pago, proveedor, detalles }
  })

  // G15: POST con detalles - crea factura proveedor con items + actualiza stock
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'write')],
  }, async (request, reply) => {
    const b = request.body || {}
    const proveedorId = parseOptionalInt(b.proveedorId)
    const codigoProveedor = parseOptionalInt(b.codigoProveedor)
    const documento = cleanText(b.documento)
    const nDoc = cleanText(b.nDoc)
    if (!proveedorId && !codigoProveedor) return reply.code(400).send({ error: 'proveedorId o codigoProveedor requerido' })
    if (!hasValue(b.total) && !Array.isArray(b.detalles)) return reply.code(400).send({ error: 'total o detalles requerido' })

    const detalles = normalizeDetalles(Array.isArray(b.detalles) ? b.detalles : [])
    const stockInvalid = b.ingresaStock
      ? detalles.find(d => !Number.isInteger(d.cantidad) || d.cantidad <= 0)
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

    const stockKey = b.ingresaStock
      ? stockIdempotencyKey({ proveedorId, codigoProveedor, documento, nDoc })
      : null
    const stockWhere = stockKey
      ? stockIdempotencyWhere({ proveedorId, codigoProveedor, documento, nDoc })
      : null

    const result = await fastify.prisma.$transaction(async (tx) => {
      if (stockKey && stockWhere) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${stockKey})::bigint)`
        const existing = await tx.pagoProveedor.findFirst({
          where: stockWhere,
          orderBy: { id: 'asc' },
        })
        if (existing) return { ...existing, idempotent: true }
      }

      let productosByCodigo = new Map()
      if (b.ingresaStock && detalles.length > 0) {
        const codigos = [...new Set(detalles.map(d => d.codigoInterno).filter(Boolean))]
        const productos = await tx.producto.findMany({
          where: { codigoInterno: { in: codigos } },
          select: { id: true, codigoInterno: true },
        })
        productosByCodigo = new Map(productos.map(p => [p.codigoInterno, p]))
        const codigosFaltantes = codigos.filter(codigo => !productosByCodigo.has(codigo))
        if (codigosFaltantes.length > 0) {
          return {
            status: 400,
            payload: {
              error: 'productos no encontrados para ingresar stock',
              codigos: codigosFaltantes,
            },
          }
        }
      }

      const pago = await tx.pagoProveedor.create({
        data: {
          proveedorId,
          codigoProveedor,
          sucursalId: parseOptionalInt(b.sucursalId),
          documento,
          nDoc,
          fechaDoc: b.fechaDoc ? new Date(b.fechaDoc) : new Date(),
          fechaPago: b.fechaPago ? new Date(b.fechaPago) : null,
          fechaVencimiento: b.fechaVencimiento ? new Date(b.fechaVencimiento) : null,
          estado: b.estado || 'Pendiente',
          total: totalCalc,
          usuario: request.user?.nombre || request.user?.username || null,
          bodega: b.bodega || null,
          nc: !!b.nc,
          ncNumero: b.ncNumero || null,
          ncMonto: b.ncMonto != null ? parseFloat(b.ncMonto) : null,
          obs: b.obs || null,
          stockAplicadoAt: null,
        },
      })

      const userId = request.user?.id || 1
      const motivoStock = `Ingreso factura ${pago.documento || ''} ${pago.nDoc || ''}`.trim()
      let stockAplicado = false

      // Crear detalles + sumar stock si ingresa mercaderia.
      for (const d of detalles) {
        if (!d.codigoInterno) continue
        await tx.detalleFacturaProveedor.create({
          data: {
            pagoId: pago.id,
            codigoInterno: d.codigoInterno,
            cantidad: d.cantidad,
            precio: d.precio,
          },
        })

        if (b.ingresaStock) {
          const prod = productosByCodigo.get(d.codigoInterno)
          await tx.producto.update({ where: { id: prod.id }, data: { stock: { increment: d.cantidad } } })
          await tx.movimientoBodega.create({
            data: {
              productoId: prod.id,
              tipo: 'ingreso',
              cantidad: d.cantidad,
              motivo: motivoStock,
              userId,
              pagoProveedorId: pago.id,
              origenTipo: 'pago_proveedor',
              origenId: pago.id,
            },
          })
          stockAplicado = true
        }
      }

      if (stockAplicado) {
        return tx.pagoProveedor.update({
          where: { id: pago.id },
          data: { stockAplicadoAt: new Date() },
        })
      }

      return pago
    })

    if (result.status && result.payload) return reply.code(result.status).send(result.payload)
    return reply.code(result.idempotent ? 200 : 201).send(result)
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('proveedores', 'write')],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const body = request.body || {}
    const data = {}
    for (const f of ['estado', 'documento', 'nDoc', 'usuario', 'bodega', 'obs', 'ncNumero']) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    if (body.fechaDoc !== undefined) data.fechaDoc = body.fechaDoc ? new Date(body.fechaDoc) : null
    if (body.fechaPago !== undefined) data.fechaPago = body.fechaPago ? new Date(body.fechaPago) : null
    if (body.fechaVencimiento !== undefined) data.fechaVencimiento = body.fechaVencimiento ? new Date(body.fechaVencimiento) : null
    if (body.total !== undefined) data.total = parseFloat(body.total) || 0
    if (body.nc !== undefined) data.nc = !!body.nc
    if (body.ncMonto !== undefined) data.ncMonto = body.ncMonto === null ? null : parseFloat(body.ncMonto)
    try {
      return await fastify.prisma.pagoProveedor.update({ where: { id }, data })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'Pago no encontrado' })
      throw e
    }
  })
}
