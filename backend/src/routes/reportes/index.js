import { rowsToCsv, sendCsv } from '../../utils/csv.js'
import { can } from '../../middleware/rbac.js'
import { parseDate } from '../operational-utils.js'
import { buildOrdenScopeWhere, getPrimerRegistroInterno, mergeWhere, parseOrdenScope } from '../historico/corte.js'

function buildDateRange(desde, hasta) {
  const gte = desde ? parseDate(desde) : null
  const lte = hasta ? parseDate(hasta, true) : null
  if ((desde && !gte) || (hasta && !lte)) return { error: 'Rango de fechas invalido' }
  return { gte, lte }
}

function applyRange(where, field, range) {
  if (!range.gte && !range.lte) return where
  where[field] = {}
  if (range.gte) where[field].gte = range.gte
  if (range.lte) where[field].lte = range.lte
  return where
}

function periodKey(date, periodo = 'mes') {
  if (!date) return 'sin-fecha'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return 'sin-fecha'
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return periodo === 'dia' ? `${year}-${month}-${day}` : `${year}-${month}`
}

function addMetric(bucket, key, amount, count = 1) {
  const normalized = key || 'sin-dato'
  if (!bucket[normalized]) bucket[normalized] = { count: 0, total: 0 }
  bucket[normalized].count += count
  bucket[normalized].total += Number(amount || 0)
}

function totalOrden(orden) {
  const subtotal = (orden.items || []).reduce((s, i) => s + (i.cantidad || 0) * (i.precioUnitario || 0), 0)
  return subtotal * (1 - (orden.descuentoPct || 0) / 100)
}

function totalLicitacion(licitacion) {
  return (licitacion.items || []).reduce((s, i) => {
    const qty = i.cantAdjudicados || i.cantidad || 0
    return s + qty * (i.precio || 0)
  }, 0) * (1 - (licitacion.descuentoPct || 0) / 100)
}

function classifyLicitacion(licitacion) {
  const estado = String(licitacion.estado || '').toLowerCase()
  if (estado.includes('gan') || estado.includes('adjudic') || licitacion.ordenId || (licitacion.items || []).some(i => (i.cantAdjudicados || 0) > 0)) return 'ganada'
  if (estado.includes('perd') || estado.includes('rechaz') || estado.includes('no adjudic')) return 'perdida'
  return 'pendiente'
}

function requireRead(...modules) {
  return async (request, reply) => {
    const allowed = modules.every(module => can(request.user?.role, module, 'read', request.user?.permisosExtra))
    if (!allowed) return reply.status(403).send({ error: 'Forbidden' })
  }
}

async function buildVentasGerenciales(fastify, query) {
  const { desde, hasta, rut, cliente, vendedor, tipo, periodo = 'mes' } = query
  const range = buildDateRange(desde, hasta)
  if (range.error) return { error: range.error }
  const corte = await getPrimerRegistroInterno(fastify.prisma)
  const tipoText = String(tipo || '').toLowerCase()
  const ordenWhere = mergeWhere(applyRange({ eliminada: false }, 'createdAt', range), buildOrdenScopeWhere('operacional', corte))
  if (rut || cliente) ordenWhere.rutCliente = { contains: rut || cliente, mode: 'insensitive' }
  if (vendedor) ordenWhere.creadorNombre = { contains: vendedor, mode: 'insensitive' }
  if (tipoText === 'venta-sala' || tipoText === 'venta-directa') ordenWhere.tipo = { in: ['Venta sala', 'Venta directa'] }
  else if (tipoText === 'convenio-marco' || tipoText === 'convenio') ordenWhere.tipo = 'Convenio Marco'
  else if (tipo) ordenWhere.tipo = { contains: tipo.replace(/-/g, ' '), mode: 'insensitive' }

  const ocWhere = applyRange({}, 'fechaHora', range)
  if (vendedor) ocWhere.codigoVendedor = { contains: vendedor, mode: 'insensitive' }
  if (cliente) ocWhere.emailComprador = { contains: cliente, mode: 'insensitive' }

  const licWhere = applyRange({}, 'fecha', range)
  if (rut || cliente) licWhere.rutCliente = { contains: rut || cliente, mode: 'insensitive' }
  if (vendedor) licWhere.usuario = { contains: vendedor, mode: 'insensitive' }

  const includeOrdenes = !tipo || ['venta', 'normal', 'sala', 'directa', 'convenio'].some(t => tipoText.includes(t))
  const includeOc = !tipo || tipoText.includes('web')
  const includeLic = !tipo || tipoText.includes('licit')

  const [ordenes, ocs, licitaciones] = await Promise.all([
    includeOrdenes ? fastify.prisma.orden.findMany({ where: ordenWhere, include: { items: true } }) : [],
    includeOc ? fastify.prisma.ordenCompraOnline.findMany({ where: ocWhere }) : [],
    includeLic ? fastify.prisma.cotizacionLicitacion.findMany({ where: licWhere, include: { items: true } }) : [],
  ])

  const byPeriodo = {}
  const byCliente = {}
  const byVendedor = {}
  const byTipo = {}
  let total = 0
  let count = 0
  const push = ({ fecha, cliente: rowCliente, vendedor: rowVendedor, tipo: rowTipo, monto }) => {
    total += monto
    count += 1
    addMetric(byPeriodo, periodKey(fecha, periodo), monto)
    addMetric(byCliente, rowCliente, monto)
    addMetric(byVendedor, rowVendedor, monto)
    addMetric(byTipo, rowTipo, monto)
  }

  for (const o of ordenes) push({ fecha: o.createdAt, cliente: o.rutCliente, vendedor: o.creadorNombre, tipo: o.tipo, monto: totalOrden(o) })
  for (const o of ocs) push({ fecha: o.fechaHora, cliente: o.emailComprador, vendedor: o.codigoVendedor, tipo: 'Venta Web', monto: o.total || 0 })
  for (const l of licitaciones) push({ fecha: l.fecha, cliente: l.rutCliente, vendedor: l.usuario, tipo: 'Licitacion', monto: totalLicitacion(l) })

  return {
    filtros: { desde: desde || null, hasta: hasta || null, periodo },
    total,
    count,
    fuentes: {
      ordenes: { count: ordenes.length, total: ordenes.reduce((s, o) => s + totalOrden(o), 0) },
      ocOnline: { count: ocs.length, total: ocs.reduce((s, o) => s + (o.total || 0), 0) },
      licitaciones: { count: licitaciones.length, total: licitaciones.reduce((s, l) => s + totalLicitacion(l), 0) },
    },
    byPeriodo,
    byCliente,
    byVendedor,
    byTipo,
  }
}

export default async function reportesRoutes(fastify) {
  fastify.get('/gerencial/ventas', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const reporte = await buildVentasGerenciales(fastify, request.query)
    if (reporte.error) return reply.code(400).send({ error: reporte.error })
    return reporte
  })

  fastify.get('/gerencial/cobranza-caja', {
    preHandler: [fastify.authenticate, requireRead('caja', 'cobranza')],
  }, async (request, reply) => {
    const range = buildDateRange(request.query.desde, request.query.hasta)
    if (range.error) return reply.code(400).send({ error: range.error })
    const cobranzaWhere = applyRange({}, 'fechaFactura', range)
    const cajaWhere = applyRange({ eliminado: false }, 'fecha', range)
    const [cobranza, caja] = await Promise.all([
      fastify.prisma.cobranzaHistorico.findMany({ where: cobranzaWhere }),
      fastify.prisma.movimientoCaja.findMany({ where: cajaWhere }),
    ])
    const byEstado = {}
    let porCobrar = 0
    let cobrado = 0
    for (const c of cobranza) {
      const estado = String(c.estado || 'sin-dato').toUpperCase()
      const valor = Number(c.valorFactura || 0)
      const monto = Number(c.monto || 0)
      if (!byEstado[estado]) byEstado[estado] = { count: 0, valorFactura: 0, monto: 0 }
      byEstado[estado].count += 1
      byEstado[estado].valorFactura += valor
      byEstado[estado].monto += monto
      if (estado === 'PENDIENTE') porCobrar += valor
      if (estado === 'CANCELADA') cobrado += monto
    }
    const cajaStats = caja.reduce((acc, m) => {
      const monto = Number(m.monto || 0)
      if (String(m.tipo).toLowerCase() === 'ingreso') acc.ingresos += monto
      if (String(m.tipo).toLowerCase() === 'egreso') acc.egresos += Math.abs(monto)
      addMetric(acc.byMedioPago, m.medioPago, monto)
      return acc
    }, { ingresos: 0, egresos: 0, byMedioPago: {} })
    return { cuentasPorCobrar: { porCobrar, cobrado, count: cobranza.length, byEstado }, caja: { ...cajaStats, count: caja.length } }
  })

  fastify.get('/gerencial/stock', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request, reply) => {
    const range = buildDateRange(request.query.desde, request.query.hasta)
    if (range.error) return reply.code(400).send({ error: range.error })
    const [critico, movProductos, movMateriales, movTelas] = await Promise.all([
      Promise.all([
        fastify.prisma.producto.findMany({ where: { activo: true, stockCritico: { gt: 0 } }, select: { id: true, codigoInterno: true, nombre: true, stock: true, stockCritico: true } }),
        fastify.prisma.bodegaTaller.findMany({ where: { activo: true, stockCritico: { gt: 0 } }, select: { id: true, codigoInterno: true, nombre: true, stock: true, stockCritico: true } }),
      ]),
      fastify.prisma.movimientoBodega.findMany({ where: applyRange({}, 'createdAt', range) }),
      fastify.prisma.bodegaTallerMovimiento.findMany({ where: applyRange({}, 'createdAt', range) }),
      fastify.prisma.telaMovimiento.findMany({ where: applyRange({}, 'fecha', range) }),
    ])
    const [productos, materiales] = critico
    const productosCriticos = productos.filter(p => (p.stock || 0) <= (p.stockCritico || 0))
    const materialesCriticos = materiales.filter(m => (m.stock || 0) <= (m.stockCritico || 0))
    const movimientos = { productos: {}, materiales: {}, telas: {}, total: movProductos.length + movMateriales.length + movTelas.length }
    for (const m of movProductos) addMetric(movimientos.productos, m.tipo, m.cantidad, 1)
    for (const m of movMateriales) addMetric(movimientos.materiales, m.tipo, m.cantidad, 1)
    for (const m of movTelas) addMetric(movimientos.telas, m.tipo, m.cantidad, 1)
    return {
      stockCritico: {
        productos: productosCriticos,
        materiales: materialesCriticos,
        totales: { productosCriticos: productosCriticos.length, materialesCriticos: materialesCriticos.length },
      },
      movimientos,
    }
  })

  fastify.get('/gerencial/licitaciones', {
    preHandler: [fastify.authenticate, fastify.rbac('licitaciones', 'read')],
  }, async (request, reply) => {
    const range = buildDateRange(request.query.desde, request.query.hasta)
    if (range.error) return reply.code(400).send({ error: range.error })
    const where = applyRange({}, 'fecha', range)
    const licitaciones = await fastify.prisma.cotizacionLicitacion.findMany({ where, include: { items: true } })
    const byResultado = { ganada: { count: 0, total: 0 }, perdida: { count: 0, total: 0 }, pendiente: { count: 0, total: 0 } }
    for (const l of licitaciones) addMetric(byResultado, classifyLicitacion(l), totalLicitacion(l))
    return { count: licitaciones.length, byResultado }
  })

  fastify.get('/gerencial/operaciones', {
    preHandler: [fastify.authenticate, requireRead('taller', 'despacho')],
  }, async (request, reply) => {
    const range = buildDateRange(request.query.desde, request.query.hasta)
    if (range.error) return reply.code(400).send({ error: range.error })
    const [odts, despachos, guias] = await Promise.all([
      fastify.prisma.odt.findMany({ where: { ...applyRange({}, 'createdAt', range), eliminado: false } }),
      fastify.prisma.despacho.findMany({ where: applyRange({}, 'fechaEntrega', range) }),
      fastify.prisma.guiaDespacho.findMany({ select: { ordenId: true, odtId: true, origenTipo: true, origenId: true } }),
    ])
    const odtsPendientes = odts.filter(o => String(o.estado || '').toLowerCase() !== 'terminada')
    const guiasKeys = new Set(guias.flatMap(g => [
      g.ordenId ? `orden:${g.ordenId}` : null,
      g.odtId ? `odt:${g.odtId}` : null,
      g.origenTipo && g.origenId ? `${g.origenTipo}:${g.origenId}` : null,
    ].filter(Boolean)))
    const despachosPendientes = despachos.filter(d => {
      const keys = [
        d.ordenId ? `orden:${d.ordenId}` : null,
        d.odtId ? `odt:${d.odtId}` : null,
        d.origenTipo && d.origenId ? `${d.origenTipo}:${d.origenId}` : null,
      ].filter(Boolean)
      return keys.length === 0 || keys.every(k => !guiasKeys.has(k))
    })
    const byEstadoOdt = {}
    for (const o of odtsPendientes) addMetric(byEstadoOdt, o.estado, 0, 1)
    const now = new Date()
    return {
      taller: { pendientes: odtsPendientes.length, byEstado: byEstadoOdt },
      despachos: {
        pendientes: despachosPendientes.length,
        vencidos: despachosPendientes.filter(d => d.fechaEntrega && new Date(d.fechaEntrega) < now).length,
      },
    }
  })
  // Reporte stock crítico (productos + materiales bodega taller) — G6
  fastify.get('/stock-critico', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async () => {
    // Filtra en SQL (stock <= stock_critico, solo items con threshold > 0)
    // — sin el filtro stock_critico>0, casi todos los items con stock=0 matchearían
    const [productosCriticos, materialesCriticos] = await Promise.all([
      fastify.prisma.$queryRaw`
        SELECT id, codigo_interno AS "codigoInterno", nombre, stock,
               stock_critico AS "stockCritico", precio_lista AS "precioLista", bodega
        FROM catalogo.productos
        WHERE activo = true
          AND COALESCE(stock_critico, 0) > 0
          AND COALESCE(stock, 0) <= COALESCE(stock_critico, 0)
        ORDER BY nombre ASC
      `,
      fastify.prisma.$queryRaw`
        SELECT id, codigo_interno AS "codigoInterno", nombre, stock,
               stock_critico AS "stockCritico", precio, categoria_id AS "categoriaId"
        FROM taller.bodega_taller
        WHERE activo = true
          AND COALESCE(stock_critico, 0) > 0
          AND COALESCE(stock, 0) <= COALESCE(stock_critico, 0)
        ORDER BY nombre ASC
      `,
    ])

    return {
      generadoEn: new Date().toISOString(),
      productos: productosCriticos,
      materiales: materialesCriticos,
      totales: {
        productosCriticos: productosCriticos.length,
        materialesCriticos: materialesCriticos.length,
      },
    }
  })

  // G11: exports CSV — productos, clientes, proveedores, ventas, caja
  fastify.get('/export/productos', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request, reply) => {
    const productos = await fastify.prisma.producto.findMany({
      where: { activo: true }, orderBy: { codigoInterno: 'asc' },
    })
    const csv = rowsToCsv(productos, [
      { key: 'codigoInterno', label: 'Código' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'unidadMedida', label: 'Unidad' },
      { key: 'stock', label: 'Stock' },
      { key: 'stockCritico', label: 'Crítico' },
      { key: 'precioLista', label: 'Precio' },
      { key: 'codigoBarra', label: 'Cód. Barra' },
    ])
    return sendCsv(reply, `productos_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/clientes', {
    preHandler: [fastify.authenticate, fastify.rbac('clientes', 'read')],
  }, async (request, reply) => {
    const clientes = await fastify.prisma.cliente.findMany({ orderBy: { razonSocial: 'asc' } })
    const csv = rowsToCsv(clientes, [
      { key: 'rut', label: 'RUT' },
      { key: 'razonSocial', label: 'Razón Social' },
      { key: 'direccion', label: 'Dirección' },
      { key: 'comuna', label: 'Comuna' },
      { key: 'region', label: 'Región' },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'email', label: 'Email' },
      { key: 'giro', label: 'Giro' },
    ])
    return sendCsv(reply, `clientes_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/proveedores', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async (request, reply) => {
    const proveedores = await fastify.prisma.proveedor.findMany({ orderBy: { razonSocial: 'asc' } })
    const csv = rowsToCsv(proveedores, [
      { key: 'rut', label: 'RUT' },
      { key: 'razonSocial', label: 'Razón Social' },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'email', label: 'Email' },
      { key: 'direccion', label: 'Dirección' },
    ])
    return sendCsv(reply, `proveedores_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/ventas', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const { desde, hasta, tipo, rut, nInterno, oc, guia, odt, estadoPago, estadoEntrega, search, scope: scopeParam } = request.query
    const scope = parseOrdenScope(scopeParam, 'operacional')
    if (!scope) return reply.code(400).send({ error: 'scope invalido' })
    let where = { eliminada: false }
    if (desde || hasta) {
      where.createdAt = {}
      if (desde) where.createdAt.gte = new Date(desde)
      if (hasta) where.createdAt.lte = new Date(hasta + 'T23:59:59')
    }
    if (tipo === 'venta-sala' || tipo === 'venta-directa') where.tipo = { in: ['Venta sala', 'Venta directa'] }
    else if (tipo === 'convenio-marco') where.tipo = 'Convenio Marco'
    else if (tipo === 'licitacion') where.tipo = 'Licitación'
    if (rut) where.rutCliente = { contains: rut, mode: 'insensitive' }
    if (nInterno) where.nInterno = parseInt(nInterno, 10)
    if (oc) where.licitacion = { contains: oc, mode: 'insensitive' }
    if (guia) where.guias = parseInt(guia, 10)
    if (estadoPago) where.estadoPago = estadoPago
    if (estadoEntrega) where.estadoEntrega = estadoEntrega
    if (odt) {
      const odts = await fastify.prisma.odt.findMany({ where: { id: parseInt(odt, 10) }, select: { ordenId: true } })
      const ids = odts.map(o => o.ordenId).filter(Boolean)
      where.id = ids.length ? { in: ids } : -1
    }
    if (search) {
      const isNum = /^\d+$/.test(search.trim())
      where.OR = [
        { creadorNombre: { contains: search, mode: 'insensitive' } },
        { rutCliente: { contains: search, mode: 'insensitive' } },
        { observaciones: { contains: search, mode: 'insensitive' } },
        ...(isNum ? [{ nInterno: parseInt(search, 10) }, { id: parseInt(search, 10) }] : []),
      ]
    }
    const corte = await getPrimerRegistroInterno(fastify.prisma)
    where = mergeWhere(where, buildOrdenScopeWhere(scope, corte))
    const ventas = await fastify.prisma.orden.findMany({
      where, include: { items: true }, orderBy: { createdAt: 'desc' },
    })
    const rows = ventas.map(o => ({
      ...o,
      total: (o.items || []).reduce((s, i) => s + (i.cantidad || 0) * (i.precioUnitario || 0), 0) * (1 - (o.descuentoPct || 0) / 100),
    }))
    const csv = rowsToCsv(rows, [
      { key: 'nInterno', label: 'N° Interno' },
      { key: 'createdAt', label: 'Fecha' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'rutCliente', label: 'RUT' },
      { key: 'creadorNombre', label: 'Vendedor' },
      { key: 'total', label: 'Total' },
      { key: 'estadoPago', label: 'Pago' },
      { key: 'estadoEntrega', label: 'Entrega' },
      { key: 'licitacion', label: 'OC / Ref' },
      { key: 'observaciones', label: 'Observaciones' },
    ])
    return sendCsv(reply, `ventas_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/cobranza', {
    preHandler: [fastify.authenticate, fastify.rbac('ventas', 'read')],
  }, async (request, reply) => {
    const { ejecutiva, estado, mes, search } = request.query
    const where = {}
    if (ejecutiva) where.ejecutiva = { contains: ejecutiva, mode: 'insensitive' }
    if (estado) where.estado = { equals: estado, mode: 'insensitive' }
    if (mes) where.mesAnio = { contains: mes, mode: 'insensitive' }
    if (search) {
      where.OR = [
        { cliente: { contains: search, mode: 'insensitive' } },
        { rut: { contains: search, mode: 'insensitive' } },
      ]
    }
    const items = await fastify.prisma.cobranzaHistorico.findMany({
      where, orderBy: { fechaFactura: 'desc' },
    })
    const csv = rowsToCsv(items, [
      { key: 'fechaFactura', label: 'Fecha Factura' },
      { key: 'ndoc', label: 'N° Doc' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'rut', label: 'RUT' },
      { key: 'valorFactura', label: 'Valor Factura' },
      { key: 'monto', label: 'Monto Cobrado' },
      { key: 'estado', label: 'Estado' },
      { key: 'ejecutiva', label: 'Ejecutiva' },
      { key: 'fechaPago', label: 'Fecha Pago' },
      { key: 'banco', label: 'Banco' },
      { key: 'mesAnio', label: 'Período' },
    ])
    return sendCsv(reply, `cobranza_historico_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/caja', {
    preHandler: [fastify.authenticate, fastify.rbac('caja', 'read')],
  }, async (request, reply) => {
    const { desde, hasta } = request.query
    const where = { eliminado: false }
    if (desde || hasta) {
      where.fecha = {}
      if (desde) where.fecha.gte = new Date(desde)
      if (hasta) where.fecha.lte = new Date(hasta + 'T23:59:59')
    }
    const movs = await fastify.prisma.movimientoCaja.findMany({ where, orderBy: { fecha: 'desc' } })
    const csv = rowsToCsv(movs, [
      { key: 'fecha', label: 'Fecha' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'referencia', label: 'Referencia' },
      { key: 'monto', label: 'Monto' },
      { key: 'medioPago', label: 'Medio Pago' },
      { key: 'documento', label: 'Documento' },
      { key: 'nDoc', label: 'N° Doc' },
      { key: 'usuario', label: 'Usuario' },
    ])
    return sendCsv(reply, `caja_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })

  fastify.get('/export/bodega-taller', {
    preHandler: [fastify.authenticate, fastify.rbac('taller', 'read')],
  }, async (request, reply) => {
    const items = await fastify.prisma.bodegaTaller.findMany({
      where: { activo: true }, orderBy: { nombre: 'asc' },
    })
    const csv = rowsToCsv(items, [
      { key: 'codigoInterno', label: 'Código' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'unidadMedida', label: 'Unidad' },
      { key: 'stock', label: 'Stock' },
      { key: 'stockCritico', label: 'Crítico' },
      { key: 'precio', label: 'Precio' },
    ])
    return sendCsv(reply, `bodega_taller_${new Date().toISOString().slice(0, 10)}.csv`, csv)
  })
}
