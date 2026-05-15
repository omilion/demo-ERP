import { rowsToCsv, sendCsv } from '../../utils/csv.js'

export default async function reportesRoutes(fastify) {
  // Reporte stock crítico (productos + materiales bodega taller) — G6
  fastify.get('/stock-critico', {
    preHandler: [fastify.authenticate, fastify.rbac('bodega', 'read')],
  }, async () => {
    const [productos, materiales] = await Promise.all([
      fastify.prisma.producto.findMany({
        where: { activo: true },
        select: { id: true, codigo: true, nombre: true, stock: true, stockCritico: true, precioLista: true, bodegaId: true },
      }),
      fastify.prisma.bodegaTaller.findMany({
        where: { activo: true },
        select: { id: true, codigoInterno: true, nombre: true, stock: true, stockCritico: true, precio: true, categoriaId: true },
      }),
    ])

    const productosCriticos = productos.filter(p => (p.stock ?? 0) <= (p.stockCritico ?? 0))
    const materialesCriticos = materiales.filter(m => (m.stock ?? 0) <= (m.stockCritico ?? 0))

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
      where: { activo: true }, orderBy: { codigo: 'asc' },
    })
    const csv = rowsToCsv(productos, [
      { key: 'codigo', label: 'Código' },
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
    const { desde, hasta } = request.query
    const where = { eliminada: false }
    if (desde || hasta) {
      where.createdAt = {}
      if (desde) where.createdAt.gte = new Date(desde)
      if (hasta) where.createdAt.lte = new Date(hasta + 'T23:59:59')
    }
    const ventas = await fastify.prisma.orden.findMany({
      where, include: { items: true }, orderBy: { createdAt: 'desc' },
    })
    const rows = ventas.map(o => ({
      ...o,
      total: (o.items || []).reduce((s, i) => s + (i.cantidad || 0) * (i.precio || 0), 0) * (1 - (o.descuentoPct || 0) / 100),
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
    ])
    return sendCsv(reply, `ventas_${new Date().toISOString().slice(0, 10)}.csv`, csv)
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
