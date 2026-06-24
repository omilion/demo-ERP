import { rangoPeriodo, PERIODO_ENUM, nombreMes } from './helpers.js'
import { ODT_ESTADOS_ABIERTOS, buildOdtTiempoMetrics } from '../../odts/operations.js'
import { computeTotal } from '../../ventas/helpers.js'
import { buildComisionesReporte } from '../../reportes/comisiones.js'

// ── Registro de herramientas ──────────────────────────────────────────────
// Cada herramienta: { definition (JSON schema Anthropic), execute(prisma, input, user) }.
// TODAS son de SOLO LECTURA y parametrizadas: el LLM elige herramienta + args
// tipados (enums/ints), nunca escribe SQL. El ejecutor corre Prisma y devuelve
// un objeto serializable que vuelve al modelo como tool_result.

const tools = {}
function register(definition, execute) { tools[definition.name] = { definition, execute } }

// ── VENTAS ─────────────────────────────────────────────────────────────────
register({
  name: 'consultar_ventas',
  description: 'Resumen de ventas (órdenes) en un período: cantidad de órdenes, monto total, y desglose por estado de pago y entrega. Usar para preguntas sobre ventas, facturación, ingresos por ventas.',
  input_schema: {
    type: 'object',
    properties: {
      periodo: { type: 'string', enum: PERIODO_ENUM, description: 'Período a consultar' },
      anio: { type: 'integer', description: 'Año (para mes_especifico / anio_especifico)' },
      mes: { type: 'integer', description: 'Mes 1-12 (para mes_especifico)' },
    },
    required: ['periodo'],
  },
}, async (prisma, input) => {
  const fecha = rangoPeriodo(input.periodo, input.anio, input.mes)
  const where = { eliminada: false, createdAt: fecha }
  const [ordenes, total, porEstadoPago] = await Promise.all([
    prisma.orden.count({ where }),
    prisma.orden.findMany({ where, select: { id: true, descuentoPct: true, descuentoMonto: true, items: { select: { cantidad: true, precioUnitario: true } } } }),
    prisma.orden.groupBy({ by: ['estadoPago'], where, _count: { _all: true } }),
  ])
  const montoTotal = total.reduce((s, o) => s + computeTotal(o.items || [], o.descuentoPct, [], o.descuentoMonto), 0)
  return {
    periodo: input.periodo,
    rango: { desde: fecha.gte.toISOString().slice(0, 10), hasta: fecha.lt.toISOString().slice(0, 10) },
    ordenes,
    montoTotalCLP: Math.round(montoTotal),
    porEstadoPago: Object.fromEntries(porEstadoPago.map(g => [g.estadoPago, g._count._all])),
  }
})

register({
  name: 'ranking_ventas',
  description: 'Ranking de los productos o categorías MÁS (o menos) vendidos en un período, por monto facturado y por cantidad de unidades. Usar para preguntas como "producto más vendido", "categoría más vendida", "top 10 productos", "qué se vende más". Devuelve ambas métricas (monto y unidades) para que tú elijas la relevante.',
  input_schema: {
    type: 'object',
    properties: {
      agrupar_por: { type: 'string', enum: ['producto', 'categoria'], description: 'Agrupar el ranking por producto individual o por categoría' },
      periodo: { type: 'string', enum: PERIODO_ENUM, description: 'Período a consultar' },
      anio: { type: 'integer', description: 'Año (para mes_especifico / anio_especifico)' },
      mes: { type: 'integer', description: 'Mes 1-12 (para mes_especifico)' },
      ordenar_por: { type: 'string', enum: ['monto', 'cantidad'], description: 'Métrica de ordenamiento del ranking (default: monto)' },
      limite: { type: 'integer', description: 'Cuántos resultados devolver (default 10, máx 50)' },
    },
    required: ['agrupar_por', 'periodo'],
  },
}, async (prisma, input) => {
  const fecha = rangoPeriodo(input.periodo, input.anio, input.mes)
  const limite = Math.min(Math.max(parseInt(input.limite, 10) || 10, 1), 50)
  const orderCol = input.ordenar_por === 'cantidad' ? 'unidades' : 'monto'
  // Monto por linea = cantidad * precio_unitario (sin descuentos de cabecera; ranking relativo).
  const groupExpr = input.agrupar_por === 'categoria'
    ? `COALESCE(NULLIF(TRIM(p.categoria), ''), 'Sin categoría')`
    : `COALESCE(NULLIF(TRIM(i.nombre), ''), p.nombre, i.codigo_interno, 'Sin nombre')`
  const extraSelect = input.agrupar_por === 'producto' ? `, MAX(i.codigo_interno) AS codigo` : ''
  const rows = await prisma.$queryRawUnsafe(
    `SELECT ${groupExpr} AS etiqueta${extraSelect},
            SUM(i.cantidad)::bigint AS unidades,
            ROUND(SUM(i.cantidad * i.precio_unitario))::bigint AS monto
     FROM ventas.orden_items i
     JOIN ventas.ordenes o ON o.id = i.orden_id
     LEFT JOIN catalogo.productos p ON p.id = i.producto_id
     WHERE o.eliminada = false AND i.eliminado = false
       AND o.created_at >= $1 AND o.created_at < $2
     GROUP BY ${groupExpr}
     ORDER BY ${orderCol} DESC
     LIMIT ${limite}`,
    fecha.gte, fecha.lt,
  )
  return {
    agrupadoPor: input.agrupar_por,
    ordenadoPor: orderCol,
    periodo: input.periodo,
    rango: { desde: fecha.gte.toISOString().slice(0, 10), hasta: fecha.lt.toISOString().slice(0, 10) },
    ranking: rows.map((r, idx) => ({
      posicion: idx + 1,
      [input.agrupar_por]: r.etiqueta,
      ...(r.codigo ? { codigo: r.codigo } : {}),
      unidades: Number(r.unidades),
      montoCLP: Number(r.monto),
    })),
  }
})

register({
  name: 'comparar_ventas_anios',
  description: 'Compara el monto total de ventas entre dos años y calcula la variación porcentual. Usar para preguntas de tipo "ventas 2024 vs 2025", crecimiento interanual.',
  input_schema: {
    type: 'object',
    properties: {
      anio1: { type: 'integer', description: 'Primer año a comparar' },
      anio2: { type: 'integer', description: 'Segundo año a comparar' },
    },
    required: ['anio1', 'anio2'],
  },
}, async (prisma, input) => {
  const montoAnio = async (y) => {
    const ordenes = await prisma.orden.findMany({
      where: { eliminada: false, createdAt: { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) } },
      select: { descuentoPct: true, descuentoMonto: true, items: { select: { cantidad: true, precioUnitario: true } } },
    })
    return Math.round(ordenes.reduce((s, o) => s + computeTotal(o.items || [], o.descuentoPct, [], o.descuentoMonto), 0))
  }
  const [m1, m2] = await Promise.all([montoAnio(input.anio1), montoAnio(input.anio2)])
  const variacionPct = m1 ? Math.round(((m2 - m1) / m1) * 1000) / 10 : null
  return { [String(input.anio1)]: m1, [String(input.anio2)]: m2, variacionPct }
})

register({
  name: 'ventas_despacho_incompleto',
  description: 'Lista las ventas (órdenes) de un período que aún no han sido despachadas por completo (estado de entrega pendiente o parcial). Usar para preguntas sobre despachos pendientes, entregas atrasadas.',
  input_schema: {
    type: 'object',
    properties: {
      periodo: { type: 'string', enum: PERIODO_ENUM }, anio: { type: 'integer' }, mes: { type: 'integer' },
    },
    required: ['periodo'],
  },
}, async (prisma, input) => {
  const fecha = rangoPeriodo(input.periodo, input.anio, input.mes)
  const where = { eliminada: false, createdAt: fecha, estadoEntrega: { not: 'Entregado' } }
  const [total, lista] = await Promise.all([
    prisma.orden.count({ where }),
    prisma.orden.findMany({ where, select: { nInterno: true, estadoEntrega: true, estadoPago: true, rutCliente: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ])
  return {
    periodo: input.periodo,
    pendientes: total,
    ordenes: lista.map(o => ({ nInterno: o.nInterno, entrega: o.estadoEntrega, pago: o.estadoPago, rut: o.rutCliente, fecha: o.createdAt?.toISOString().slice(0, 10) })),
  }
})

register({
  name: 'demora_produccion',
  description: 'Calcula la demora promedio de producción (horas de ciclo desde creación a término) de las ODT terminadas, global y por taller. Usar para preguntas sobre tiempos de producción, eficiencia del taller, cuánto demora una ODT.',
  input_schema: { type: 'object', properties: {}, required: [] },
}, async (prisma) => {
  const terminadas = await prisma.odt.findMany({
    where: { eliminado: false, estado: { in: ['Terminada', 'Entregada'] }, fechaTermino: { not: null } },
    select: { createdAt: true, fechaTermino: true },
    take: 5000,
  })
  const horas = terminadas
    .map(o => buildOdtTiempoMetrics(o).cicloHoras)
    .filter(h => h != null && h >= 0)
  const promedio = horas.length ? Math.round((horas.reduce((s, h) => s + h, 0) / horas.length) * 10) / 10 : null
  return {
    odtTerminadas: terminadas.length,
    odtConTiempo: horas.length,
    cicloPromedioHoras: promedio,
    cicloPromedioDias: promedio != null ? Math.round((promedio / 24) * 10) / 10 : null,
  }
})

// ── TALLER / ODT ─────────────────────────────────────────────────────────
register({
  name: 'consultar_taller',
  description: 'Estado de las órdenes de trabajo (ODT) del taller: conteo por estado, ODT atrasadas, y desglose por taller real (Espumas/Confecciones/Madera/Externo). Usar para preguntas sobre producción, taller, ODT, atrasos.',
  input_schema: {
    type: 'object',
    properties: {
      taller: { type: 'string', enum: ['todos', 'espumas', 'confecciones', 'madera', 'externo'], description: 'Filtrar por taller (todos = sin filtro)' },
    },
    required: [],
  },
}, async (prisma, input) => {
  const abiertas = { estado: { in: ODT_ESTADOS_ABIERTOS }, eliminado: false }
  const [porEstado, abiertasList] = await Promise.all([
    prisma.odt.groupBy({ by: ['estado'], where: { eliminado: false }, _count: { _all: true } }),
    prisma.odt.findMany({ where: abiertas, select: { id: true, estado: true, plazo: true, fechaInicio: true, fechaTermino: true, createdAt: true }, take: 2000 }),
  ])
  const conMetricas = abiertasList.map(o => ({ ...o, tiempos: buildOdtTiempoMetrics(o) }))
  const atrasadas = conMetricas.filter(o => o.tiempos.enAtraso).length
  // Conteo por taller real desde los items
  const tallerNombre = input.taller && input.taller !== 'todos' ? input.taller : null
  let porTaller = {}
  if (!tallerNombre) {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT t.nombre, count(DISTINCT o.id)::int AS n
      FROM taller.odts o
      JOIN taller.odt_items i ON i.odt_id=o.id AND i.eliminado=false
      JOIN taller.odt_item_talleres it ON it.odt_item_id=i.id
      JOIN taller.talleres t ON t.id=it.taller_id
      WHERE o.eliminado=false AND o.estado = ANY($1)
      GROUP BY t.nombre ORDER BY t.nombre`, ODT_ESTADOS_ABIERTOS)
    porTaller = Object.fromEntries(rows.map(r => [r.nombre, r.n]))
  }
  return {
    porEstado: Object.fromEntries(porEstado.map(g => [g.estado, g._count._all])),
    abiertas: abiertasList.length,
    atrasadas,
    porTaller,
  }
})

// ── CAJA ────────────────────────────────────────────────────────────────
register({
  name: 'consultar_caja',
  description: 'Movimientos de caja en un período: total de ingresos, egresos, y conteo de movimientos. Usar para preguntas sobre caja, flujo de efectivo, ingresos/egresos diarios.',
  input_schema: {
    type: 'object',
    properties: {
      periodo: { type: 'string', enum: PERIODO_ENUM, description: 'Período a consultar' },
      anio: { type: 'integer' }, mes: { type: 'integer' },
    },
    required: ['periodo'],
  },
}, async (prisma, input) => {
  const fecha = rangoPeriodo(input.periodo, input.anio, input.mes)
  const where = { eliminado: false, fecha }
  const [agg, count] = await Promise.all([
    prisma.movimientoCaja.groupBy({ by: ['tipo'], where, _sum: { monto: true }, _count: { _all: true } }),
    prisma.movimientoCaja.count({ where }),
  ])
  const byTipo = Object.fromEntries(agg.map(g => [g.tipo, { monto: Math.round(g._sum.monto || 0), movimientos: g._count._all }]))
  return {
    periodo: input.periodo,
    rango: { desde: fecha.gte.toISOString().slice(0, 10), hasta: fecha.lt.toISOString().slice(0, 10) },
    movimientos: count,
    ingresosCLP: byTipo.ingreso?.monto || 0,
    egresosCLP: byTipo.egreso?.monto || 0,
    detalle: byTipo,
  }
})

// ── CRM ────────────────────────────────────────────────────────────────
register({
  name: 'consultar_crm',
  description: 'Pipeline CRM: conteo de registros por estado y por ejecutiva. Usar para preguntas sobre seguimiento comercial, cotizaciones en gestión, desempeño de ejecutivas.',
  input_schema: { type: 'object', properties: { ejecutiva: { type: 'string', description: 'Filtrar por ejecutiva (opcional)' } }, required: [] },
}, async (prisma, input) => {
  const where = input.ejecutiva ? { ejecutiva: { contains: input.ejecutiva, mode: 'insensitive' } } : {}
  const [total, porEstado, topEjecutivas] = await Promise.all([
    prisma.crmRegistro.count({ where }),
    prisma.crmRegistro.groupBy({ by: ['estado'], where, _count: { _all: true } }),
    prisma.$queryRawUnsafe(`SELECT ejecutiva, count(*)::int AS n FROM ventas.crm_registros WHERE ejecutiva IS NOT NULL GROUP BY ejecutiva ORDER BY n DESC LIMIT 10`),
  ])
  return {
    total,
    porEstado: Object.fromEntries(porEstado.map(g => [g.estado || 'sin_estado', g._count._all])),
    topEjecutivas: topEjecutivas.map(r => ({ ejecutiva: r.ejecutiva, registros: r.n })),
  }
})

// ── STOCK / BODEGA ─────────────────────────────────────────────────────
register({
  name: 'consultar_stock',
  description: 'Inventario: productos con stock crítico o sin stock, total de productos activos, por bodega. Usar para preguntas sobre inventario, quiebres de stock, reposición.',
  input_schema: { type: 'object', properties: { bodega: { type: 'string', description: 'Filtrar por bodega (opcional, ej: Inventario, Taller)' } }, required: [] },
}, async (prisma, input) => {
  const base = { activo: true, ...(input.bodega ? { bodega: input.bodega } : {}) }
  // stock < stock_critico compara dos columnas → no expresable en Prisma where; va por SQL.
  const [total, sinStock, criticosLista] = await Promise.all([
    prisma.producto.count({ where: base }),
    prisma.producto.count({ where: { ...base, stock: 0 } }),
    prisma.$queryRawUnsafe(
      `SELECT codigo_interno, nombre, stock, stock_critico, bodega FROM catalogo.productos WHERE activo=true ${input.bodega ? 'AND bodega=$1' : ''} AND stock > 0 AND stock < stock_critico ORDER BY stock ASC LIMIT 25`,
      ...(input.bodega ? [input.bodega] : []),
    ),
  ])
  return {
    totalProductos: total,
    sinStock,
    criticos: criticosLista.length,
    productosCriticos: criticosLista.map(p => ({ codigo: p.codigo_interno, nombre: p.nombre, stock: p.stock, critico: p.stock_critico, bodega: p.bodega })),
  }
})

// ── RRHH ────────────────────────────────────────────────────────────────
register({
  name: 'consultar_rrhh',
  description: 'Dotación de personal: conteo de trabajadores activos por empresa (Plastimar/Allegro). Usar para preguntas sobre personal, dotación, recursos humanos.',
  input_schema: { type: 'object', properties: {}, required: [] },
}, async (prisma) => {
  const porEmpresa = await prisma.trabajador.groupBy({ by: ['empresa'], where: { estado: true }, _count: { _all: true } })
  const total = porEmpresa.reduce((s, g) => s + g._count._all, 0)
  return { totalActivos: total, porEmpresa: Object.fromEntries(porEmpresa.map(g => [g.empresa || 'sin_empresa', g._count._all])) }
})

// ── COMISIONES (motor real del ERP) ───────────────────────────────────────
register({
  name: 'consultar_comisiones',
  description: 'Comisiones de los vendedores en un período, CALCULADAS con el motor oficial del ERP (respeta reglas por vendedor/tipo, tramos, base vendido/cobrado, y descuenta multas y notas de crédito). Usar para preguntas como "cuánto de comisión le toca a X", "comisiones del mes", "total a pagar en comisiones". Devuelve el desglose por vendedor.',
  input_schema: {
    type: 'object',
    properties: {
      periodo: { type: 'string', enum: PERIODO_ENUM, description: 'Período a consultar' },
      anio: { type: 'integer', description: 'Año (para mes_especifico / anio_especifico)' },
      mes: { type: 'integer', description: 'Mes 1-12 (para mes_especifico)' },
      vendedor: { type: 'string', description: 'Filtrar por nombre de vendedor (opcional, búsqueda parcial)' },
    },
    required: ['periodo'],
  },
}, async (prisma, input) => {
  const fecha = rangoPeriodo(input.periodo, input.anio, input.mes)
  const desde = fecha.gte.toISOString().slice(0, 10)
  // El reporte usa rango inclusivo (hasta); restamos 1 día al lt exclusivo.
  const hastaDate = new Date(fecha.lt); hastaDate.setDate(hastaDate.getDate() - 1)
  const hasta = hastaDate.toISOString().slice(0, 10)
  const reporte = await buildComisionesReporte({ prisma }, {
    desde, hasta,
    ...(input.vendedor ? { vendedor: input.vendedor } : {}),
    limit: '5000',
  })
  if (reporte.error) return { error: reporte.error }
  const reglasActivas = await prisma.comisionRegla.count({ where: { activo: true } })
  const porVendedor = Object.entries(reporte.byVendedor || {}).map(([nombre, v]) => ({
    vendedor: nombre,
    ventas: v.count,
    totalVendidoCLP: Math.round(v.totalVendido || 0),
    totalCobradoCLP: Math.round(v.totalCobrado || 0),
    multasCLP: Math.round(v.totalMultas || 0),
    notasCreditoCLP: Math.round(v.totalNC || 0),
    comisionCLP: Math.round(v.totalComision || 0),
  })).sort((a, b) => b.comisionCLP - a.comisionCLP)
  return {
    periodo: input.periodo,
    rango: { desde, hasta },
    totalComisionCLP: Math.round(reporte.totales?.totalComision || 0),
    ventasConsideradas: reporte.totales?.count || 0,
    reglasComisionActivas: reglasActivas,
    ...(reglasActivas === 0 ? { advertencia: 'No hay reglas de comisión configuradas en el ERP, por eso toda comisión calcula $0. Para obtener cifras reales hay que cargar las reglas en Admin → Reglas de Comisión.' } : {}),
    nota: 'La comisión solo se paga si la venta está pagada, entregada y facturada (regla del ERP).',
    porVendedor,
  }
})

// ── PLANILLAS / LIQUIDACIONES (datos cargados) ─────────────────────────────
register({
  name: 'consultar_planillas',
  description: 'Planilla de sueldos (liquidaciones cargadas) de un mes/año: líquido a pagar, haberes, descuentos y sueldo base, por trabajador y total. Usar para "cuánto fue la planilla de X mes", "cuánto ganó un trabajador", "total de descuentos del mes". Reporta solo lo que está cargado; si un período no tiene liquidaciones, lo indica.',
  input_schema: {
    type: 'object',
    properties: {
      anio: { type: 'integer', description: 'Año (ej: 2025)' },
      mes: { type: 'integer', description: 'Mes 1-12 (opcional; sin mes = todo el año)' },
      trabajador: { type: 'string', description: 'Filtrar por nombre/apellido del trabajador (opcional, búsqueda parcial)' },
    },
    required: ['anio'],
  },
}, async (prisma, input) => {
  const where = { anio: String(input.anio) }
  const mesNombre = input.mes ? nombreMes(input.mes) : null
  if (input.mes && !mesNombre) return { error: 'mes inválido (1-12)' }
  if (mesNombre) where.mes = mesNombre
  if (input.trabajador) {
    const t = String(input.trabajador)
    where.trabajador = {
      is: {
        OR: [
          { nombres: { contains: t, mode: 'insensitive' } },
          { apellidoPaterno: { contains: t, mode: 'insensitive' } },
          { apellidoMaterno: { contains: t, mode: 'insensitive' } },
        ],
      },
    }
  }
  const rows = await prisma.liquidacion.findMany({
    where,
    select: {
      anio: true, mes: true, sueldoBase: true, totalHaberes: true,
      totalDescuentos: true, liquidoPagar: true, horasExtras: true, totalExtras: true,
      trabajador: { select: { nombres: true, apellidoPaterno: true, apellidoMaterno: true, empresa: true } },
    },
    take: 1000,
  })
  if (!rows.length) {
    return { periodo: { anio: input.anio, mes: mesNombre || 'todo el año' }, liquidaciones: 0, mensaje: 'No hay liquidaciones cargadas para ese período/filtro.' }
  }
  const sum = (k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0)
  return {
    periodo: { anio: input.anio, mes: mesNombre || 'todo el año' },
    liquidaciones: rows.length,
    totalLiquidoPagarCLP: Math.round(sum('liquidoPagar')),
    totalHaberesCLP: Math.round(sum('totalHaberes')),
    totalDescuentosCLP: Math.round(sum('totalDescuentos')),
    detalle: rows.map(r => ({
      trabajador: [r.trabajador?.nombres, r.trabajador?.apellidoPaterno, r.trabajador?.apellidoMaterno].filter(Boolean).join(' '),
      empresa: r.trabajador?.empresa || null,
      mes: r.mes,
      sueldoBaseCLP: Number(r.sueldoBase || 0),
      haberesCLP: Number(r.totalHaberes || 0),
      descuentosCLP: Number(r.totalDescuentos || 0),
      liquidoCLP: Number(r.liquidoPagar || 0),
      horasExtras: Number(r.horasExtras || 0),
    })).sort((a, b) => b.liquidoCLP - a.liquidoCLP),
  }
})

export function getToolDefinitions() {
  return Object.values(tools).map(t => t.definition)
}

export async function runTool(name, input, ctx) {
  const tool = tools[name]
  if (!tool) return { error: `Herramienta desconocida: ${name}` }
  try {
    return await tool.execute(ctx.prisma, input || {}, ctx.user)
  } catch (e) {
    return { error: `Error ejecutando ${name}: ${e.message}` }
  }
}

export { tools }
