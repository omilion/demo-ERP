import { can } from '../../middleware/rbac.js'
import { buildOrdenScopeWhere, getPrimerRegistroInterno, mergeWhere } from '../historico/corte.js'
import { getUserSucursalId } from '../caja/scope.js'
import { buildCobranzaHistoricoScopeWhere } from '../cobranza/scope.js'
import { getMatrizTotales, getVentasPorVendedor } from '../matriz-ventas/index.js'

// El taller real vive en los items (items.talleres.taller.nombre); Odt.tipo es
// "Legacy" en los datos migrados, asi que contar por `tipo` daba siempre 0.
function tallerWhere(nombre, extra = {}) {
  return {
    ...extra,
    items: {
      some: {
        eliminado: false,
        talleres: { some: { taller: { is: { nombre: { contains: nombre, mode: 'insensitive' } } } } },
      },
    },
  }
}

export default async function dashboardStats(fastify) {
  fastify.get('/stats', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const p = fastify.prisma
    const corte = await getPrimerRegistroInterno(p)
    const ordenOperacionalWhere = buildOrdenScopeWhere('operacional', corte)
    const sucursalId = getUserSucursalId(request.user)
    const ahora = new Date()
    const en30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0, 0)
    const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0)
    // El KPI y la pantalla de Taller deben usar el mismo alcance. Antes el
    // dashboard contaba OTs globales, pero /api/odts filtraba por sucursal:
    // al hacer clic el usuario pasaba de miles de pendientes a una lista vacía.
    const odtScope = sucursalId ? { AND: [{ OR: [{ sucursalId }, { sucursalId: null }] }] } : {}
    const pagoProveedorScope = { eliminado: false, ...(sucursalId ? { sucursalId } : {}) }
    const cobranzaScopeWhere = await buildCobranzaHistoricoScopeWhere(p, request.user)

    const [
      ventasNoPagadas,
      ventasPendienteEntrega,
      odtsPendientes,
      odtsEnProceso,
      odtsUrgentes,
      espumasPendientes,
      confeccionesPendientes,
      maderaPendientes,
      externoPendientes,
      espumasUrgentes,
      confeccionesUrgentes,
      maderaUrgentes,
      externoUrgentes,
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
      matrizTotales,
      dotacionPorEmpresa,
      contratosPorVencer,
      licenciasActivas,
      ventasPorVendedor,
      odtsComprometidas,
      entregasPendientes,
    ] = await Promise.all([
      p.orden.count({ where: mergeWhere({ estadoPago: 'No pagada', eliminada: false, estado: 'Activa' }, ordenOperacionalWhere) }),
      p.orden.count({ where: mergeWhere({ estadoEntrega: 'Pendiente entrega', eliminada: false, estado: 'Activa' }, ordenOperacionalWhere) }),
      p.odt.count({ where: { ...odtScope, estado: 'Pendiente' } }),
      p.odt.count({ where: { ...odtScope, estado: 'En proceso' } }),
      p.odt.count({ where: { ...odtScope, estado: { in: ['Pendiente', 'En proceso'] }, OR: [{ prioridad: { equals: 'Alta', mode: 'insensitive' } }, { estado: 'Prioritaria' }] } }),
      p.odt.count({ where: tallerWhere('espuma', { ...odtScope, estado: { in: ['Pendiente', 'En proceso'] } }) }),
      p.odt.count({ where: tallerWhere('confe', { ...odtScope, estado: { in: ['Pendiente', 'En proceso'] } }) }),
      p.odt.count({ where: tallerWhere('madera', { ...odtScope, estado: { in: ['Pendiente', 'En proceso'] } }) }),
      p.odt.count({ where: tallerWhere('externo', { ...odtScope, estado: { in: ['Pendiente', 'En proceso'] } }) }),
      p.odt.count({ where: tallerWhere('espuma', { ...odtScope, estado: { in: ['Pendiente', 'En proceso'] }, OR: [{ prioridad: { equals: 'Alta', mode: 'insensitive' } }, { estado: 'Prioritaria' }] }) }),
      p.odt.count({ where: tallerWhere('confe', { ...odtScope, estado: { in: ['Pendiente', 'En proceso'] }, OR: [{ prioridad: { equals: 'Alta', mode: 'insensitive' } }, { estado: 'Prioritaria' }] }) }),
      p.odt.count({ where: tallerWhere('madera', { ...odtScope, estado: { in: ['Pendiente', 'En proceso'] }, OR: [{ prioridad: { equals: 'Alta', mode: 'insensitive' } }, { estado: 'Prioritaria' }] }) }),
      p.odt.count({ where: tallerWhere('externo', { ...odtScope, estado: { in: ['Pendiente', 'En proceso'] }, OR: [{ prioridad: { equals: 'Alta', mode: 'insensitive' } }, { estado: 'Prioritaria' }] }) }),
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
      p.cobranzaHistorico.groupBy({
        by: ['estado'],
        where: cobranzaScopeWhere,
        _sum: { monto: true },
        _count: { _all: true },
      }),
      p.ordenCompraOnline.count({ where: { estadoCompra: { in: ['Pendiente', 'Activa', 'Nueva'] } } }).catch(() => 0),
      p.pagoProveedor.count({ where: { ...pagoProveedorScope, documento: 'Factura', estado: { in: ['Pendiente', 'No pagada', 'No pagado'] } } }).catch(() => 0),
      p.pagoProveedor.count({ where: { ...pagoProveedorScope, documento: 'Boleta', estado: { in: ['Pendiente', 'No pagada', 'No pagado'] } } }).catch(() => 0),
      p.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE (codigo_barra IS NULL OR codigo_barra = '') AND activo = true)::int AS sin_codigo_barra,
          COUNT(*) FILTER (WHERE (codigo_interno IS NULL OR codigo_interno = '') AND activo = true)::int AS sin_codigo_interno,
          COUNT(*) FILTER (WHERE categoria_id IS NULL AND activo = true)::int AS sin_categoria,
          COUNT(*) FILTER (WHERE proveedor_id IS NULL AND activo = true)::int AS sin_proveedor
        FROM catalogo.productos
      `,
      getMatrizTotales(fastify, {}, request.user).catch(() => ({ kpis: {} })),
      // RRHH: solo conteos. La ficha de cada trabajador vive en su modulo;
      // el tablero no es lugar para datos personales ni sueldos.
      p.trabajador.groupBy({ by: ['empresa'], where: { estado: true }, _count: { _all: true } }).catch(() => []),
      p.contrato.count({ where: { estado: true, termino: { gte: ahora, lte: en30dias } } }).catch(() => 0),
      p.licencia.count({ where: { estado: true, inicio: { lte: ahora }, termino: { gte: ahora } } }).catch(() => 0),
      // Solo se consulta a quien coordina: para el resto es una lectura de
      // todas las ordenes del mes que se descartaria igual.
      can(request.user?.role, 'equipo_comercial', 'read', request.user?.permisosExtra)
        ? getVentasPorVendedor(fastify, inicioMes, ahora, request.user, { hoyDesde: inicioHoy }).catch(() => [])
        : [],
      // Que trabajar primero. Se filtro por fecha de compromiso, pero HOY
      // ninguna OT la tiene cargada -ni `fechaEntregaCompromiso` ni `plazo`- y
      // la lista salia siempre vacia: el taller habria leido "al dia" con 45 OT
      // en cola. Se usa el mismo criterio que el listado de OT
      // (routes/odts/list.js): compromiso si existe, si no la antiguedad.
      // Postgres ordena los nulos al final, asi que lo comprometido sube solo.
      p.odt.findMany({
        where: {
          ...odtScope,
          eliminado: false,
          estado: { in: ['Pendiente', 'En proceso'] },
        },
        orderBy: [{ fechaEntregaCompromiso: 'asc' }, { plazo: 'asc' }, { createdAt: 'asc' }],
        take: 8,
        select: {
          id: true, tipo: true, clienteNombre: true, estado: true, prioridad: true,
          fechaEntregaCompromiso: true, plazo: true, legacyNInterno: true, createdAt: true,
        },
      }).catch(() => []),
      // Lo que bodega tiene que sacar: lo mas antiguo primero, que es lo que
      // lleva mas tiempo esperando al cliente.
      p.orden.findMany({
        where: mergeWhere({ estadoEntrega: 'Pendiente entrega', eliminada: false, estado: 'Activa' }, ordenOperacionalWhere),
        orderBy: { createdAt: 'asc' },
        take: 8,
        select: { id: true, nInterno: true, rutCliente: true, createdAt: true, estadoPago: true },
      }).catch(() => []),
    ])

    const stockByBodega = {}
    for (const row of stockRows) {
      stockByBodega[row.bodega] = {
        total: row.total,
        sinStock: row.sin_stock,
        critico: row.critico,
      }
    }

    const cobranzaByEstado = Object.fromEntries(cobranzaStats.map(g => [String(g.estado || '').toUpperCase(), g]))
    const cal = productosCalidadRows[0]

    // Cada bloque del tablero pertenece a un modulo. Se entrega solo lo que el
    // usuario puede abrir: mostrarle el total vendido a quien no tiene acceso a
    // ventas es filtrar informacion por la puerta de atras, y ademas le ofrece
    // tarjetas que al hacer clic lo llevan a un 403.
    //
    // El alcance por sucursal ya se aplica arriba; esto se suma, no lo sustituye.
    const ve = modulo => can(request.user?.role, modulo, 'read', request.user?.permisosExtra)
    const soloSi = (permitido, valor) => (permitido ? valor : null)
    return {
      kpis: soloSi(ve('ventas'), matrizTotales?.kpis || {}),
      ventas: soloSi(ve('ventas'), {
        noPagadas: ventasNoPagadas,
        pendienteEntrega: ventasPendienteEntrega,
        webPendientes: ordenesWebPendientes,
      }),
      proveedoresPagos: soloSi(ve('proveedores'), {
        facturasNoPagadas: facturasProvNoPagadas,
        boletasNoPagadas: boletasProvNoPagadas,
      }),
      productosCalidad: soloSi(ve('catalogo'), {
        sinCodigoBarra: cal?.sin_codigo_barra ?? 0,
        sinCodigoInterno: cal?.sin_codigo_interno ?? 0,
        sinCategoria: cal?.sin_categoria ?? 0,
        sinProveedor: cal?.sin_proveedor ?? 0,
      }),
      odts: soloSi(ve('taller'), {
        pendientes: odtsPendientes,
        enProceso: odtsEnProceso,
        urgentes: odtsUrgentes,
        total: odtsPendientes + odtsEnProceso,
      }),
      talleres: soloSi(ve('taller'), [
        { tipo: 'Espumas',      activas: espumasPendientes,      urgentes: espumasUrgentes },
        { tipo: 'Confecciones', activas: confeccionesPendientes, urgentes: confeccionesUrgentes },
        { tipo: 'Madera',       activas: maderaPendientes,       urgentes: maderaUrgentes },
        { tipo: 'Externo',      activas: externoPendientes,      urgentes: externoUrgentes },
      ]),
      stock: soloSi(ve('bodega'), stockByBodega),
      // Listas cortas y accionables, cada una detras del permiso de su modulo.
      tallerAgenda: soloSi(ve('taller'), odtsComprometidas),
      entregasAgenda: soloSi(ve('despacho'), entregasPendientes),
      crm: soloSi(ve('ventas'), {
        pendientes: crmPendientes,
        enGestion: crmEnGestion,
        altaPrioridad: crmAltaPrioridad,
      }),
      proveedores: soloSi(ve('proveedores'), {
        total: proveedoresTotal,
      }),
      cobranzaHistorico: soloSi(ve('cobranza'), {
        cobrado: Number(cobranzaByEstado.CANCELADA?._sum.monto || 0),
        pendientes: cobranzaByEstado.PENDIENTE?._count._all || 0,
      }),
      // Quien coordina responde por el avance del equipo, no solo por el suyo.
      // Son montos por vendedor del mes en curso, sin datos personales.
      equipoComercial: soloSi(ve('equipo_comercial'), {
        desde: inicioMes,
        vendedores: ventasPorVendedor,
        totalHoy: ventasPorVendedor.reduce((suma, v) => suma + v.hoy, 0),
        total: ventasPorVendedor.reduce((suma, v) => suma + v.total, 0),
      }),
      rrhh: soloSi(ve('rrhh'), {
        dotacionActiva: dotacionPorEmpresa.reduce((total, g) => total + g._count._all, 0),
        porEmpresa: Object.fromEntries(dotacionPorEmpresa.map(g => [g.empresa || 'sin empresa', g._count._all])),
        contratosPorVencer,
        licenciasActivas,
      }),
    }
  })
}
