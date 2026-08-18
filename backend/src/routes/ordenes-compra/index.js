import { rowsToCsv, sendCsv } from '../../utils/csv.js'
import { getUserSucursalId } from '../caja/scope.js'
import { computeTotal } from '../ventas/helpers.js'
import { applyVentaStockDeltas, buildStockDeltasFromItems, isVentaDirectaStockTipo } from '../ventas/stock.js'
import { approveCrmFromPurchaseOrder } from '../../domain/crm/service.js'

const ESTADOS_COMPRA = new Set([
  'Pendiente',
  'En proceso',
  'Despachada',
  'Entregada',
  'Cancelada',
  'Pagada',
  'Recepcionada',
  'Procesada',
  'Anulada',
])

const CANALES_COMPRA = new Set(['Web', 'Convenio Marco', 'Venta Sala', 'Telefonica', 'Telefónica'])

function scopedWhere(user, where = {}) {
  const sucursalId = getUserSucursalId(user)
  return sucursalId ? { ...where, sucursalId } : where
}

function parseId(value) {
  const id = Number.parseInt(value, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

function cleanOptionalText(value) {
  if (value === null) return null
  if (value === undefined) return undefined
  const text = String(value).trim()
  return text || null
}

function parseMoney(value, field) {
  if (value === null || value === undefined || String(value).trim() === '') return { value: 0 }
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return { error: `${field} debe ser un monto mayor o igual a 0` }
  return { value: amount }
}

function buildWhere(user, query = {}) {
  const { search, estado, canal } = query
  const where = scopedWhere(user)
  if (estado) where.estadoCompra = estado
  if (canal) where.canal = canal
  if (search) {
    const text = String(search).trim()
    where.OR = [
      { nCompra: { contains: text, mode: 'insensitive' } },
      { emailComprador: { contains: text, mode: 'insensitive' } },
      { codigoVendedor: { contains: text, mode: 'insensitive' } },
      { tipoDocumento: { contains: text, mode: 'insensitive' } },
    ]
  }
  return where
}

function validateUpdate(body = {}) {
  const data = {}
  for (const f of ['tipoDocumento', 'codigoVendedor', 'obsCliente', 'textoPie', 'tipoCotizacion', 'cargoServicio', 'historialCargo']) {
    if (body[f] !== undefined) data[f] = cleanOptionalText(body[f])
  }
  if (body.estadoCompra !== undefined) {
    const estado = cleanOptionalText(body.estadoCompra)
    if (estado && !ESTADOS_COMPRA.has(estado)) return { error: 'estadoCompra invalido' }
    data.estadoCompra = estado
  }
  if (body.canal !== undefined) {
    const canal = cleanOptionalText(body.canal)
    if (canal && !CANALES_COMPRA.has(canal)) return { error: 'canal invalido' }
    data.canal = canal
  }
  if (body.total !== undefined) {
    const parsed = parseMoney(body.total, 'total')
    if (parsed.error) return parsed
    data.total = parsed.value
  }
  if (body.costoEnvio !== undefined) {
    const parsed = parseMoney(body.costoEnvio, 'costoEnvio')
    if (parsed.error) return parsed
    data.costoEnvio = parsed.value
  }
  if (body.fechaCotizacion !== undefined) {
    const fecha = body.fechaCotizacion ? new Date(body.fechaCotizacion) : null
    if (fecha && Number.isNaN(fecha.getTime())) return { error: 'fechaCotizacion invalida' }
    data.fechaCotizacion = fecha
  }
  return { data }
}

function buildVentaWebObservacion(oc) {
  return [
    `Procesada desde OC online ${oc.nCompra || oc.id}`,
    oc.emailComprador ? `Comprador: ${oc.emailComprador}` : '',
    oc.canal ? `Canal: ${oc.canal}` : '',
    oc.obsCliente ? `Obs cliente: ${oc.obsCliente}` : '',
  ].filter(Boolean).join('\n')
}

export default async function ordenesCompraRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request) => {
    const LIMIT = 100
    const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1)
    const where = buildWhere(request.user, request.query)

    const [items, total] = await Promise.all([
      fastify.prisma.ordenCompraOnline.findMany({
        where,
        orderBy: { fechaHora: 'desc' },
        take: LIMIT,
        skip: (page - 1) * LIMIT,
      }),
      fastify.prisma.ordenCompraOnline.count({ where }),
    ])
    return { items, total, limit: LIMIT }
  })

  fastify.get('/export', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const items = await fastify.prisma.ordenCompraOnline.findMany({
      where: buildWhere(request.user, request.query),
      orderBy: { fechaHora: 'desc' },
    })
    const csv = rowsToCsv(items, [
      { key: 'nCompra', label: 'N Compra' },
      { key: 'fechaHora', label: 'Fecha' },
      { key: 'emailComprador', label: 'Email comprador' },
      { key: 'total', label: 'Total' },
      { key: 'estadoCompra', label: 'Estado compra' },
      { key: 'tipoDocumento', label: 'Tipo documento' },
      { key: 'codigoVendedor', label: 'Codigo vendedor' },
      { key: 'canal', label: 'Canal' },
      { key: 'costoEnvio', label: 'Costo envio' },
      { key: 'cargoServicio', label: 'Cargo servicio' },
      { key: 'obsCliente', label: 'Observacion cliente' },
    ])
    return sendCsv(reply, `ordenes_compra_online_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const oc = await fastify.prisma.ordenCompraOnline.findFirst({
      where: scopedWhere(request.user, { id }),
      include: { items: true },
    })
    if (!oc) return reply.code(404).send({ error: 'OC no encontrada' })
    return oc
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const validated = validateUpdate(request.body || {})
    if (validated.error) return reply.code(400).send({ error: validated.error })
    try {
      const current = await fastify.prisma.ordenCompraOnline.findFirst({
        where: scopedWhere(request.user, { id }),
        select: { id: true },
      })
      if (!current) return reply.code(404).send({ error: 'OC no encontrada' })
      return await fastify.prisma.ordenCompraOnline.update({ where: { id }, data: validated.data })
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'OC no encontrada' })
      throw e
    }
  })

  fastify.post('/:id/procesar-venta', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'write')],
  }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    const clienteId = parseId(request.body?.clienteId)
    if (!clienteId) return reply.code(400).send({ error: 'clienteId requerido' })
    const clienteSucursalId = request.body?.clienteSucursalId ? parseId(request.body.clienteSucursalId) : null
    if (request.body?.clienteSucursalId && !clienteSucursalId) return reply.code(400).send({ error: 'clienteSucursalId invalido' })

    let result
    try {
      result = await fastify.prisma.$transaction(async (tx) => {
      const oc = await tx.ordenCompraOnline.findFirst({
        where: scopedWhere(request.user, { id }),
        include: { items: true },
      })
      if (!oc) return { statusCode: 404, error: 'OC no encontrada' }
      if (['Procesada', 'Anulada', 'Cancelada'].includes(oc.estadoCompra)) {
        return { statusCode: 409, error: `La OC esta en estado ${oc.estadoCompra}` }
      }
      if (!oc.items.length) return { statusCode: 400, error: 'La OC no tiene productos' }
      if (oc.nCompra) {
        const existing = await tx.orden.findFirst({
          where: { tipo: 'Venta Web', licitacion: oc.nCompra, eliminada: false },
          select: { id: true },
        })
        if (existing) return { statusCode: 409, error: 'La OC online ya tiene una Venta Web asociada', ventaId: existing.id }
      }

      const cliente = await tx.cliente.findUnique({ where: { id: clienteId }, select: { id: true, activo: true } })
      if (!cliente) return { statusCode: 404, error: 'Cliente no encontrado' }
      if (!cliente.activo) return { statusCode: 409, error: 'Cliente inactivo no puede generar ventas' }
      if (clienteSucursalId) {
        const sucursal = await tx.clienteSucursal.findFirst({
          where: { id: clienteSucursalId, clienteId, activo: true },
          select: { id: true },
        })
        if (!sucursal) return { statusCode: 400, error: 'Sucursal no pertenece al cliente' }
      }

      const codes = [...new Set(oc.items.map(i => String(i.codigoInterno || '').trim()).filter(Boolean))]
      if (codes.length !== oc.items.length) return { statusCode: 409, error: 'Hay items de OC sin codigo interno' }
      const productos = await tx.producto.findMany({
        where: { codigoInterno: { in: codes } },
        select: { id: true, codigoInterno: true, nombre: true, activo: true },
      })
      const productByCode = Object.fromEntries(productos.map(p => [p.codigoInterno, p]))
      const missing = codes.filter(code => !productByCode[code] || !productByCode[code].activo)
      if (missing.length) return { statusCode: 409, error: `Productos no encontrados o inactivos: ${missing.join(', ')}` }

      const invalidItem = oc.items.find(i =>
        !Number.isInteger(Number(i.cantidad)) || Number(i.cantidad) <= 0 ||
        !Number.isFinite(Number(i.precio)) || Number(i.precio) < 0
      )
      if (invalidItem) return { statusCode: 400, error: 'La OC tiene cantidades o precios invalidos' }

      const itemsData = oc.items.map(item => {
        const producto = productByCode[String(item.codigoInterno).trim()]
        return {
          productoId: producto.id,
          codigoInterno: producto.codigoInterno,
          nombre: producto.nombre || item.nombre || item.descripcion,
          descripcion: item.descripcion || null,
          cantidad: Number(item.cantidad),
          precioUnitario: Number(item.precio || 0),
        }
      })

      const orden = await tx.orden.create({
        data: {
          tipo: 'Venta Web',
          estado: 'Activa',
          estadoPago: 'No pagada',
          estadoEntrega: 'Pendiente entrega',
          clienteId,
          clienteSucursalId,
          userId: request.user.id,
          sucursalId: request.user?.sucursalId ?? oc.sucursalId ?? null,
          descuentoPct: 0,
          licitacion: oc.nCompra || null,
          observaciones: buildVentaWebObservacion(oc),
          creadorNombre: request.user.nombre || request.user.username || oc.codigoVendedor || null,
          items: { create: itemsData },
        },
        include: { items: true },
      })
      await approveCrmFromPurchaseOrder(tx, orden, oc.nCompra, request.user)

      const stock = await applyVentaStockDeltas(tx, {
        deltas: isVentaDirectaStockTipo(orden.tipo) ? buildStockDeltasFromItems(itemsData, 1) : new Map(),
        ordenId: orden.id,
        nInterno: orden.nInterno,
        tipo: orden.tipo,
        userId: request.user.id,
        user: request.user,
        motivo: `Venta web ${oc.nCompra || oc.id}`,
      })
      if (stock.error) {
        const err = new Error(stock.error)
        err.statusCode = stock.status || 400
        throw err
      }

      await tx.ordenCompraOnline.update({ where: { id: oc.id }, data: { estadoCompra: 'Procesada' } })
      return { orden: { ...orden, total: computeTotal(orden.items, orden.descuentoPct, [], orden.descuentoMonto) } }
      })
    } catch (e) {
      if (e.statusCode) return reply.code(e.statusCode).send({ error: e.message })
      throw e
    }

    if (result.statusCode) return reply.code(result.statusCode).send({ error: result.error, ventaId: result.ventaId })
    return reply.code(201).send(result.orden)
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'delete')],
  }, async (request, reply) => {
    const id = parseId(request.params.id)
    if (!id) return reply.code(400).send({ error: 'ID invalido' })
    try {
      const current = await fastify.prisma.ordenCompraOnline.findFirst({
        where: scopedWhere(request.user, { id }),
        select: { id: true },
      })
      if (!current) return reply.code(404).send({ error: 'OC no encontrada' })
      await fastify.prisma.ordenCompraOnline.update({ where: { id }, data: { estadoCompra: 'Anulada' } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'OC no encontrada' })
      throw e
    }
  })
}
