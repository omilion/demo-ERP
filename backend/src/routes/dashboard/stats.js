export default async function dashboardStats(fastify) {
  fastify.get('/stats', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const p = fastify.prisma

    const [
      ventasNoPagadas,
      ventasPendienteEntrega,
      odtsPendientes,
      odtsEnProceso,
      odtsUrgentes,
      espumasPendientes,
      confeccionesPendientes,
      maderaPendientes,
      stockRows,
    ] = await Promise.all([
      p.orden.count({ where: { estadoPago: 'No pagada' } }),
      p.orden.count({ where: { estadoEntrega: 'Pendiente entrega' } }),
      p.odt.count({ where: { estado: 'Pendiente' } }),
      p.odt.count({ where: { estado: 'En proceso' } }),
      p.odt.count({ where: { prioridad: 'urgente' } }),
      p.odt.count({ where: { tipo: 'Espumas', estado: { in: ['Pendiente', 'En proceso'] } } }),
      p.odt.count({ where: { tipo: 'Confecciones', estado: { in: ['Pendiente', 'En proceso'] } } }),
      p.odt.count({ where: { tipo: 'Madera', estado: { in: ['Pendiente', 'En proceso'] } } }),
      p.$queryRaw`
        SELECT
          bodega,
          COUNT(*)::int                                                          AS total,
          COUNT(*) FILTER (WHERE stock = 0)::int                                AS sin_stock,
          COUNT(*) FILTER (WHERE stock > 0 AND stock < stock_critico)::int      AS critico
        FROM catalogo.productos
        WHERE activo = true
        GROUP BY bodega
      `,
    ])

    const stockByBodega = {}
    for (const row of stockRows) {
      stockByBodega[row.bodega] = {
        total: row.total,
        sinStock: row.sin_stock,
        critico: row.critico,
      }
    }

    return {
      ventas: {
        noPagadas: ventasNoPagadas,
        pendienteEntrega: ventasPendienteEntrega,
      },
      odts: {
        pendientes: odtsPendientes,
        enProceso: odtsEnProceso,
        urgentes: odtsUrgentes,
        total: odtsPendientes + odtsEnProceso,
      },
      talleres: [
        { tipo: 'Espumas',      activas: espumasPendientes },
        { tipo: 'Confecciones', activas: confeccionesPendientes },
        { tipo: 'Madera',       activas: maderaPendientes },
      ],
      stock: stockByBodega,
    }
  })
}
