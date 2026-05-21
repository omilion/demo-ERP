import { buildOrdenScopeWhere, getPrimerRegistroInterno, mergeWhere } from '../historico/corte.js'

export default async function dashboardStats(fastify) {
  fastify.get('/stats', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const p = fastify.prisma
    const corte = await getPrimerRegistroInterno(p)
    const ordenOperacionalWhere = buildOrdenScopeWhere('operacional', corte)

    const [
      ventasNoPagadas,
      ventasPendienteEntrega,
      odtsPendientes,
      odtsEnProceso,
      odtsUrgentes,
      espumasPendientes,
      confeccionesPendientes,
      maderaPendientes,
      espumasUrgentes,
      confeccionesUrgentes,
      maderaUrgentes,
      stockRows,
      crmPendientes,
      crmEnGestion,
      crmAltaPrioridad,
      proveedoresTotal,
      cobranzaStats,
      ordenesWebPendientes,
      facturasProvNoPagadas,
      boletasProvNoPagadas,
      productosCalidadRows,
    ] = await Promise.all([
      p.orden.count({ where: mergeWhere({ estadoPago: 'No pagada', eliminada: false }, ordenOperacionalWhere) }),
      p.orden.count({ where: mergeWhere({ estadoEntrega: 'Pendiente entrega', eliminada: false }, ordenOperacionalWhere) }),
      p.odt.count({ where: { estado: 'Pendiente' } }),
      p.odt.count({ where: { estado: 'En proceso' } }),
      p.odt.count({ where: { OR: [{ prioridad: 'urgente' }, { estado: 'Prioritaria' }] } }),
      p.odt.count({ where: { tipo: 'Espumas', estado: { in: ['Pendiente', 'En proceso'] } } }),
      p.odt.count({ where: { tipo: 'Confecciones', estado: { in: ['Pendiente', 'En proceso'] } } }),
      p.odt.count({ where: { tipo: 'Madera', estado: { in: ['Pendiente', 'En proceso'] } } }),
      p.odt.count({ where: { tipo: 'Espumas', estado: { in: ['Pendiente', 'En proceso'] }, OR: [{ prioridad: 'urgente' }, { estado: 'Prioritaria' }] } }),
      p.odt.count({ where: { tipo: 'Confecciones', estado: { in: ['Pendiente', 'En proceso'] }, OR: [{ prioridad: 'urgente' }, { estado: 'Prioritaria' }] } }),
      p.odt.count({ where: { tipo: 'Madera', estado: { in: ['Pendiente', 'En proceso'] }, OR: [{ prioridad: 'urgente' }, { estado: 'Prioritaria' }] } }),
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
      p.crmRegistro.count({ where: { estado: '0' } }),
      p.crmRegistro.count({ where: { estado: '1' } }),
      p.crmRegistro.count({ where: { prioridad: { equals: 'Alta', mode: 'insensitive' } } }),
      p.proveedor.count({ where: { activo: true } }),
      p.$queryRaw`
        SELECT
          COALESCE(SUM(CASE WHEN UPPER(estado) = 'CANCELADA' THEN monto ELSE 0 END), 0)::numeric AS cobrado,
          COUNT(CASE WHEN UPPER(estado) = 'PENDIENTE' THEN 1 END)::int AS n_pendientes
        FROM ventas.cobranza_historico
      `,
      p.ordenCompraOnline.count({ where: { estadoCompra: { in: ['Pendiente', 'Activa', 'Nueva'] } } }).catch(() => 0),
      p.pagoProveedor.count({ where: { documento: 'Factura', estado: { in: ['Pendiente', 'No pagada'] } } }).catch(() => 0),
      p.pagoProveedor.count({ where: { documento: 'Boleta', estado: { in: ['Pendiente', 'No pagada'] } } }).catch(() => 0),
      p.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE (codigo_barra IS NULL OR codigo_barra = '') AND activo = true)::int AS sin_codigo_barra,
          COUNT(*) FILTER (WHERE (codigo_interno IS NULL OR codigo_interno = '') AND activo = true)::int AS sin_codigo_interno,
          COUNT(*) FILTER (WHERE categoria_id IS NULL AND activo = true)::int AS sin_categoria,
          COUNT(*) FILTER (WHERE proveedor_id IS NULL AND activo = true)::int AS sin_proveedor
        FROM catalogo.productos
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

    const cs = cobranzaStats[0]
    const cal = productosCalidadRows[0]
    return {
      ventas: {
        noPagadas: ventasNoPagadas,
        pendienteEntrega: ventasPendienteEntrega,
        webPendientes: ordenesWebPendientes,
      },
      proveedoresPagos: {
        facturasNoPagadas: facturasProvNoPagadas,
        boletasNoPagadas: boletasProvNoPagadas,
      },
      productosCalidad: {
        sinCodigoBarra: cal?.sin_codigo_barra ?? 0,
        sinCodigoInterno: cal?.sin_codigo_interno ?? 0,
        sinCategoria: cal?.sin_categoria ?? 0,
        sinProveedor: cal?.sin_proveedor ?? 0,
      },
      odts: {
        pendientes: odtsPendientes,
        enProceso: odtsEnProceso,
        urgentes: odtsUrgentes,
        total: odtsPendientes + odtsEnProceso,
      },
      talleres: [
        { tipo: 'Espumas',      activas: espumasPendientes,      urgentes: espumasUrgentes },
        { tipo: 'Confecciones', activas: confeccionesPendientes, urgentes: confeccionesUrgentes },
        { tipo: 'Madera',       activas: maderaPendientes,       urgentes: maderaUrgentes },
      ],
      stock: stockByBodega,
      crm: {
        pendientes: crmPendientes,
        enGestion: crmEnGestion,
        altaPrioridad: crmAltaPrioridad,
      },
      proveedores: {
        total: proveedoresTotal,
      },
      cobranzaHistorico: {
        cobrado: Number(cs.cobrado),
        pendientes: cs.n_pendientes,
      },
    }
  })
}
