import { rowsToCsv, sendCsv } from '../../utils/csv.js'

export default async function reportesRoutes(fastify) {
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
    const { desde, hasta, tipo, rut, nInterno, oc, guia, odt, estadoPago, estadoEntrega, search } = request.query
    const where = { eliminada: false }
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
    const where = {}
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
