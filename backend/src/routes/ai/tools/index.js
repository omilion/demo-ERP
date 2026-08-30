import { rangoPeriodo, PERIODO_ENUM, nombreMes } from './helpers.js'
import { ODT_ESTADOS_ABIERTOS, buildOdtTiempoMetrics } from '../../odts/operations.js'
import { computeTotal } from '../../ventas/helpers.js'
import { buildComisionesReporte } from '../../reportes/comisiones.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GRAFIAS_ENTREGADA } from '../../ventas/estados-normalize.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const docsDir = path.join(__dirname, '../docs')


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
  description: 'Ranking de los productos o categorías MÁS (o menos) vendidos en un período, por monto facturado, cantidad de unidades, o margen (rentabilidad). Usar para preguntas como "producto más rentable", "top 10 productos más vendidos", "qué categoría se vende más". Devuelve métricas (monto, unidades y margen si aplica) para que tú elijas la relevante.',
  input_schema: {
    type: 'object',
    properties: {
      agrupar_por: { type: 'string', enum: ['producto', 'categoria'], description: 'Agrupar el ranking por producto individual o por categoría' },
      periodo: { type: 'string', enum: PERIODO_ENUM, description: 'Período a consultar' },
      anio: { type: 'integer', description: 'Año (para mes_especifico / anio_especifico)' },
      mes: { type: 'integer', description: 'Mes 1-12 (para mes_especifico)' },
      ordenar_por: { type: 'string', enum: ['monto', 'cantidad', 'margen'], description: 'Métrica de ordenamiento del ranking (default: monto, margen solo disponible con agrupar_por: producto)' },
      limite: { type: 'integer', description: 'Cuántos resultados devolver (default 10, máx 50)' },
    },
    required: ['agrupar_por', 'periodo'],
  },
}, async (prisma, input) => {
  const fecha = rangoPeriodo(input.periodo, input.anio, input.mes)
  const limite = Math.min(Math.max(parseInt(input.limite, 10) || 10, 1), 50)

  if (input.ordenar_por === 'margen') {
    if (input.agrupar_por === 'categoria') {
      throw new Error('El ordenamiento por margen solo está disponible cuando se agrupa por producto.')
    }
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COALESCE(NULLIF(TRIM(i.nombre), ''), p.nombre, i.codigo_interno, 'Sin nombre') AS etiqueta,
              MAX(i.codigo_interno) AS codigo,
              SUM(i.cantidad)::bigint AS unidades,
              ROUND(SUM(i.cantidad * i.precio_unitario))::bigint AS monto,
              AVG(i.precio_unitario)::float AS precio_prom,
              COALESCE(costo_sub.costo_prom, 0)::float AS costo_prom
       FROM ventas.orden_items i
       JOIN ventas.ordenes o ON o.id = i.orden_id
       LEFT JOIN catalogo.productos p ON p.id = i.producto_id
       LEFT JOIN (
         SELECT codigo_interno, AVG(precio) AS costo_prom
         FROM catalogo.detalle_facturas_proveedor
         WHERE precio > 0
         GROUP BY codigo_interno
       ) costo_sub ON costo_sub.codigo_interno = i.codigo_interno
       WHERE o.eliminada = false AND i.eliminado = false
         AND o.created_at >= $1 AND o.created_at < $2
       GROUP BY COALESCE(NULLIF(TRIM(i.nombre), ''), p.nombre, i.codigo_interno, 'Sin nombre'), costo_sub.costo_prom`,
      fecha.gte, fecha.lt
    )

    const mapped = rows.map(r => {
      const costo = r.costo_prom || 0
      const precio = r.precio_prom || 0
      const margenPct = (costo > 0 && precio > 0)
        ? Math.round((1 - (costo / precio)) * 100)
        : null
      return {
        etiqueta: r.etiqueta,
        codigo: r.codigo,
        unidades: Number(r.unidades),
        monto: Number(r.monto),
        costoProm: Math.round(costo),
        margenPct
      }
    })

    mapped.sort((a, b) => {
      if (a.margenPct === null && b.margenPct === null) return 0
      if (a.margenPct === null) return 1
      if (b.margenPct === null) return -1
      return b.margenPct - a.margenPct
    })

    const finalRows = mapped.slice(0, limite)

    return {
      agrupadoPor: input.agrupar_por,
      ordenadoPor: 'margen',
      periodo: input.periodo,
      rango: { desde: fecha.gte.toISOString().slice(0, 10), hasta: fecha.lt.toISOString().slice(0, 10) },
      ranking: finalRows.map((r, idx) => ({
        posicion: idx + 1,
        [input.agrupar_por]: r.etiqueta,
        ...(r.codigo ? { codigo: r.codigo } : {}),
        unidades: r.unidades,
        montoCLP: r.monto,
        costoPromCLP: r.costoProm,
        margenPct: r.margenPct
      })),
      nota: 'Costo = promedio de todas las compras del producto, sin considerar la fecha. El margen no refleja variaciones de costo en el tiempo.'
    }
  }

  const orderCol = input.ordenar_por === 'cantidad' ? 'unidades' : 'monto'
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
  name: 'ficha_producto',
  description: 'Expediente integral de UN producto: rentabilidad (margen = precio de venta vs. costo de compra) y tiempos de producción en taller. Usar para preguntas como "qué margen deja este producto", "cuánto tiempo estuvo en taller espuma", "cuál fue su mejor tiempo de producción", "es rentable el producto X". Recibe el código o nombre del producto. NO sirve para rankings de varios productos (para eso usar ranking_ventas).',
  input_schema: {
    type: 'object',
    properties: {
      producto: { type: 'string', description: 'Código interno o nombre (búsqueda parcial) del producto' }
    },
    required: ['producto']
  }
}, async (prisma, input) => {
  const search = (input.producto || '').trim()
  if (!search) {
    return { encontrado: false, error: 'Debe ingresar un nombre o código de producto.' }
  }

  // 1. Resolve product
  const matches = await prisma.producto.findMany({
    where: {
      OR: [
        { codigoInterno: { equals: search, mode: 'insensitive' } },
        { nombre: { contains: search, mode: 'insensitive' } }
      ],
      activo: true
    },
    take: 5
  })

  if (matches.length === 0) {
    return { encontrado: false }
  }

  // Tie-breaker: find the one with the most sales
  let selected = matches[0]
  let maxSales = -1
  for (const match of matches) {
    const salesCount = await prisma.ordenItem.count({
      where: { productoId: match.id, eliminado: false, orden: { eliminada: false } }
    })
    if (salesCount > maxSales) {
      maxSales = salesCount
      selected = match
    }
  }

  const alternativas = matches
    .filter(m => m.id !== selected.id)
    .map(m => ({ id: m.id, codigoInterno: m.codigoInterno, nombre: m.nombre }))

  // 2. Rentabilidad
  // Costo promedio de compra
  const costRows = await prisma.$queryRawUnsafe(
    `SELECT ROUND(AVG(precio))::bigint AS costo_prom
     FROM catalogo.detalle_facturas_proveedor
     WHERE codigo_interno = $1 AND precio > 0`,
    selected.codigoInterno
  )
  const costoProm = costRows[0]?.costo_prom ? Number(costRows[0].costo_prom) : null

  // Ventas promedio, unidades y monto
  const saleRows = await prisma.$queryRawUnsafe(
    `SELECT ROUND(AVG(oi.precio_unitario))::bigint AS precio_prom,
            SUM(oi.cantidad)::int AS unidades,
            ROUND(SUM(oi.cantidad * oi.precio_unitario))::bigint AS monto
     FROM ventas.orden_items oi
     JOIN ventas.ordenes o ON o.id = oi.orden_id
     WHERE oi.producto_id = $1 AND o.eliminada = false AND oi.eliminado = false`,
    selected.id
  )
  const precioProm = saleRows[0]?.precio_prom ? Number(saleRows[0].precio_prom) : null
  const unidades = saleRows[0]?.unidades ? Number(saleRows[0].unidades) : 0
  const monto = saleRows[0]?.monto ? Number(saleRows[0].monto) : 0

  const margenPct = (costoProm && precioProm && precioProm > 0)
    ? Math.round((1 - (costoProm / precioProm)) * 100)
    : null

  // 3. Taller
  // Veces en producción total (sin filtro de fechas)
  const totalProduccion = await prisma.odtItem.count({
    where: { productoId: selected.id, eliminado: false }
  })

  // Tiempos promedio por taller
  const tallerRows = await prisma.$queryRawUnsafe(
    `SELECT t.nombre AS taller,
            COUNT(*)::int AS veces,
            ROUND(AVG(EXTRACT(EPOCH FROM (oit.fecha_listo - oit.fecha_inicio))/3600)::numeric, 1)::float AS horas_prom,
            ROUND(MIN(EXTRACT(EPOCH FROM (oit.fecha_listo - oit.fecha_inicio))/3600)::numeric, 1)::float AS mejor_horas
     FROM taller.odt_item_talleres oit
     JOIN taller.odt_items oi ON oi.id = oit.odt_item_id
     JOIN taller.talleres t ON t.id = oit.taller_id
     WHERE oi.producto_id = $1
       AND oit.fecha_inicio IS NOT NULL AND oit.fecha_listo IS NOT NULL
       AND oit.fecha_listo >= oit.fecha_inicio
     GROUP BY t.nombre`,
    selected.id
  )

  const porTaller = tallerRows.map(r => ({
    taller: r.taller,
    veces: Number(r.veces),
    tiempoPromedioHoras: Number(r.horas_prom),
    mejorTiempoHoras: Number(r.mejor_horas)
  }))

  return {
    encontrado: true,
    producto: {
      id: selected.id,
      codigo: selected.codigoInterno,
      nombre: selected.nombre,
      categoria: selected.categoria,
      stock: selected.stock
    },
    alternativas: alternativas.length > 0 ? alternativas : undefined,
    rentabilidad: {
      costoPromCompra: costoProm,
      precioPromVenta: precioProm,
      unidadesVendidas: unidades,
      montoVendidoCLP: monto,
      margenPct,
      nota: 'Costo = promedio de todas las compras del producto, sin considerar la fecha. El margen no refleja variaciones de costo en el tiempo.'
    },
    taller: {
      vecesEnProduccionTotal: totalProduccion,
      porTaller,
      nota: 'Los tiempos se calculan solo sobre registros con inicio y fin marcados. Hoy la mayoría de las ODT no registra estos tiempos, por lo que la cobertura es baja y los promedios pueden no ser representativos.'
    }
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
  // Ambas grafias significan lo mismo: nombrar solo una contaba como pendientes
  // las ordenes ya entregadas escritas con la otra.
  const where = { eliminada: false, createdAt: fecha, estadoEntrega: { notIn: GRAFIAS_ENTREGADA } }
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

register({
  name: 'consultar_documentacion',
  description: 'Busca en la documentación de USO del sistema Plastimar cómo realizar una tarea o dónde está una función (ej: cómo crear una venta, dónde marcar un cliente conflictivo, cómo generar una ficha de licitación). Usar para preguntas de "cómo hago...", "dónde está...", "para qué sirve...". NO usar para consultar datos (ventas, stock, etc.), para eso están las otras herramientas.',
  input_schema: {
    type: 'object',
    properties: {
      tema: { type: 'string', description: 'Tema, palabra clave o módulo a consultar (ej: "ventas", "licitaciones", "cliente conflictivo")' }
    },
    required: ['tema']
  }
}, async (prisma, input) => {
  const query = String(input.tema || '').trim()
  if (!query) return { encontrado: false }

  const normalizeText = (text) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  const STOP_WORDS = new Set(['de', 'la', 'el', 'en', 'y', 'para', 'con', 'un', 'una', 'unos', 'unas', 'lo', 'los', 'las', 'como', 'donde', 'que', 'a', 'o', 'como', 'hacer', 'crear', 'ver'])
  const queryWords = normalizeText(query)
    .split(/[^a-z0-9]+/i)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))

  if (queryWords.length === 0) {
    const fallbackWord = normalizeText(query).trim()
    if (fallbackWord) {
      queryWords.push(fallbackWord)
    } else {
      return { encontrado: false }
    }
  }

  let files = []
  try {
    files = await fs.readdir(docsDir)
  } catch (e) {
    return { encontrado: false, error: 'No se pudo leer la carpeta de documentación' }
  }

  // _index.md es el catálogo de módulos: hace match con casi todo y ensucia el
  // ranking. Se excluye de la búsqueda (sirve solo como referencia interna).
  const mdFiles = files.filter(f => f.endsWith('.md') && f !== '_index.md')
  const matches = []

  for (const file of mdFiles) {
    const filePath = path.join(docsDir, file)
    const content = await fs.readFile(filePath, 'utf-8')
    const normContent = normalizeText(content)

    const fileBase = normalizeText(file).replace(/\.md$/, '')
    let score = 0
    for (const word of queryWords) {
      const regex = new RegExp(word, 'g')
      const count = (normContent.match(regex) || []).length
      score += count

      // El nombre del archivo en el título pesa; un match EXACTO del nombre base
      // (ej. tema "ventas" → ventas.md) prima sobre uno parcial (matriz-ventas.md).
      if (fileBase === word) score += 50
      else if (fileBase.includes(word)) score += 15
    }

    if (score > 0) {
      matches.push({
        modulo: file.replace('.md', ''),
        contenido: content,
        score
      })
    }
  }

  matches.sort((a, b) => b.score - a.score)
  const topMatches = matches.slice(0, 2)

  if (topMatches.length === 0) {
    return { encontrado: false }
  }

  return {
    encontrado: true,
    documentos: topMatches.map(m => ({ modulo: m.modulo, contenido: m.contenido }))
  }
})


// Permiso de dominio que exige cada herramienta.
//
// El permiso 'ai' habilita el asistente; NO es una llave a los datos. Sin este
// mapa, asignar ai:read desde Accesos daba acceso de lectura a remuneraciones,
// caja y comisiones a cualquier rol, saltandose el RBAC de esos modulos.
//
// Una herramienta sin entrada aqui no exige permiso de dominio: son las de
// documentacion y las de UI, que no leen datos del negocio.
const PERMISO_POR_HERRAMIENTA = {
  consultar_ventas: 'ventas',
  ranking_ventas: 'ventas',
  comparar_ventas_anios: 'ventas',
  ventas_despacho_incompleto: 'ventas',
  consultar_crm: 'ventas',
  consultar_comisiones: 'ventas',
  ficha_producto: 'catalogo',
  consultar_stock: 'bodega',
  consultar_taller: 'taller',
  demora_produccion: 'taller',
  consultar_caja: 'caja',
  consultar_rrhh: 'rrhh',
  consultar_planillas: 'rrhh',
}

export function permisoDeHerramienta(name) {
  return PERMISO_POR_HERRAMIENTA[name] ?? null
}

export function getToolDefinitions() {
  return Object.values(tools).map(t => t.definition)
}

export async function runTool(name, input, ctx) {
  const tool = tools[name]
  if (!tool) return { error: `Herramienta desconocida: ${name}` }
  // Se valida aqui y no solo al elegir que herramientas ofrecer: el modelo
  // podria pedir una que no se le ofrecio, y el nombre viaja en su respuesta.
  const modulo = permisoDeHerramienta(name)
  if (modulo) {
    const { can } = await import('../../../middleware/rbac.js')
    if (!can(ctx.user?.role, modulo, 'read', ctx.user?.permisosExtra)) {
      return { error: `No tienes permiso de ${modulo} para esta consulta` }
    }
  }
  try {
    return await tool.execute(ctx.prisma, input || {}, ctx.user)
  } catch (e) {
    return { error: `Error ejecutando ${name}: ${e.message}` }
  }
}

export { tools }
