import { rangoPeriodo, PERIODO_ENUM } from './helpers.js'
import { ODT_ESTADOS_ABIERTOS, buildOdtTiempoMetrics } from '../../odts/operations.js'
import { computeTotal } from '../../ventas/helpers.js'

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
