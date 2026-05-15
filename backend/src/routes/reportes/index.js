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
}
