import { computeTotal } from '../ventas/helpers.js'
import { buildOdtTiempoMetrics, formatOperarioNombre, isPrismaMissingTable } from './operations.js'
import { can } from '../../middleware/rbac.js'

const JORNADA_MENSUAL_HORAS = 180

function round(value, digits = 1) {
  const factor = 10 ** digits
  return Math.round(Number(value || 0) * factor) / factor
}

function roundMoney(value) {
  return Math.round(Number(value || 0))
}

// Leer Taller permite ejecutar y seguir una OT; no revela costos, margenes ni
// remuneraciones. El costeo tiene su propio permiso y el sueldo exige uno aun
// mas especifico, incluso para quien puede analizar costos.
export function opcionesCosteoOdt(user = null) {
  return {
    incluirCosteo: can(user?.role, 'costeo', 'read', user?.permisosExtra),
    incluirRemuneracion: can(user?.role, 'rrhh.remuneracion', 'read', user?.permisosExtra),
  }
}

export function ocultarRemuneracionDeCosteo(costeo) {
  if (!costeo) return costeo
  const { sueldoLiquido, costoHora, ...sinRemuneracion } = costeo
  return sinRemuneracion
}

export function parseMoneyLike(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value).trim()
  if (!text) return null
  if (!/\d/.test(text)) return null
  const normalized = text.replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function sourceRank(source) {
  if (source === 'producto') return 1
  if (source === 'material_taller') return 2
  if (source === 'tela') return 3
  return 99
}

export function buildPriceLookup({ productos = [], materiales = [], telas = [] } = {}) {
  const rows = [
    ...productos.map(item => ({
      codigo: item.codigoInterno,
      nombre: item.nombre,
      precio: item.precioLista,
      fuente: 'producto',
    })),
    ...materiales.map(item => ({
      codigo: item.codigoInterno,
      nombre: item.nombre,
      precio: item.precio,
      fuente: 'material_taller',
    })),
    ...telas.map(item => ({
      codigo: item.codigo,
      nombre: item.nombre,
      precio: item.precio,
      fuente: 'tela',
    })),
  ]

  const byCode = new Map()
  for (const row of rows) {
    const codigo = row.codigo ? String(row.codigo).trim() : ''
    if (!codigo) continue
    const precio = Number(row.precio || 0)
    const current = byCode.get(codigo)
    if (!current || (current.precio <= 0 && precio > 0) || sourceRank(row.fuente) < sourceRank(current.fuente)) {
      byCode.set(codigo, {
        codigo,
        nombre: row.nombre || null,
        precio: Number.isFinite(precio) ? precio : 0,
        fuente: row.fuente,
      })
    }
  }
  return byCode
}

export function buildMaterialCostRows(historiales = [], priceByCode = new Map()) {
  const groups = new Map()

  for (const row of historiales) {
    const codigo = row.codigoInterno ? String(row.codigoInterno).trim() : ''
    const key = [codigo, row.nombre || '', row.unidad || '', row.taller || ''].join('|')
    const current = groups.get(key) || {
      codigoInterno: codigo || null,
      nombre: row.nombre || null,
      unidad: row.unidad || null,
      taller: row.taller || null,
      cantidad: 0,
    }
    current.cantidad += Number(row.egreso || 0) - Number(row.ingreso || 0)
    groups.set(key, current)
  }

  return [...groups.values()]
    .filter(row => row.cantidad > 0)
    .map(row => {
      const price = row.codigoInterno ? priceByCode.get(row.codigoInterno) : null
      const precioUnitario = Number(price?.precio || 0)
      return {
        ...row,
        cantidad: round(row.cantidad, 3),
        precioUnitario: roundMoney(precioUnitario),
        costo: roundMoney(row.cantidad * precioUnitario),
        fuentePrecio: price?.fuente || null,
        precioFaltante: !price || precioUnitario <= 0,
      }
    })
    .sort((a, b) => b.costo - a.costo || String(a.nombre || '').localeCompare(String(b.nombre || '')))
}

export function buildOdtCosteo(odt = {}, {
  historiales = [],
  priceByCode = new Map(),
  trabajador = null,
  orden = null,
  items = [],
  now = new Date(),
} = {}) {
  const tiempos = odt.tiempos || buildOdtTiempoMetrics(odt, now)
  const produccionHoras = tiempos.produccionHoras ?? 0
  const materiales = buildMaterialCostRows(historiales, priceByCode)
  const costoMateriales = roundMoney(materiales.reduce((sum, row) => sum + row.costo, 0))
  const sueldoLiquido = parseMoneyLike(trabajador?.sueldoLiquido)
  const costoHora = sueldoLiquido && sueldoLiquido > 0 ? sueldoLiquido / JORNADA_MENSUAL_HORAS : null
  const costoManoObra = costoHora && produccionHoras ? roundMoney(costoHora * produccionHoras) : 0
  const costoTotal = costoMateriales + costoManoObra
  const unidades = items.reduce((sum, item) => sum + Number(item.cantidad || 0), 0)
  const ventaTotal = orden ? computeTotal(orden.items || [], orden.descuentoPct, orden.cargos || [], orden.descuentoMonto) : null
  const margenEstimado = ventaTotal == null ? null : roundMoney(ventaTotal - costoTotal)

  return {
    costoMateriales,
    costoManoObra,
    costoTotal,
    costoHora: costoHora == null ? null : roundMoney(costoHora),
    sueldoLiquido: sueldoLiquido == null ? null : roundMoney(sueldoLiquido),
    produccionHoras: produccionHoras == null ? null : round(produccionHoras, 1),
    unidades,
    unidadesPorHora: produccionHoras > 0 ? round(unidades / produccionHoras, 2) : null,
    costoPorUnidad: unidades > 0 ? roundMoney(costoTotal / unidades) : null,
    ventaTotal: ventaTotal == null ? null : roundMoney(ventaTotal),
    margenEstimado,
    margenPct: ventaTotal && ventaTotal > 0 ? round((margenEstimado / ventaTotal) * 100, 1) : null,
    materiales,
    alertas: {
      materialesSinPrecio: materiales.filter(row => row.precioFaltante).length,
      manoObraSinSueldo: Boolean(odt.operarioId && costoHora == null),
      sinHorasProduccion: !produccionHoras,
    },
    fuente: {
      precios: 'catalogo_actual',
      manoObra: 'sueldo_liquido_180h',
    },
  }
}

export async function attachOdtCosteos(prisma, odts, now = new Date(), opciones = {}) {
  const { incluirCosteo = true, incluirRemuneracion = true } = opciones
  const list = Array.isArray(odts) ? odts : [odts]
  const odtIds = [...new Set(list.map(odt => odt?.id).filter(Boolean))]
  if (!odtIds.length) return Array.isArray(odts) ? list : list[0]
  // No consultar ni calcular costos para perfiles operativos. Asi tampoco se
  // carga el sueldo desde RRHH en listados que no tienen derecho a verlo.
  if (!incluirCosteo) return Array.isArray(odts) ? list : list[0]

  const trabajadorIds = [...new Set(list.map(odt => odt?.operarioId).filter(Boolean))]
  const ordenIds = [...new Set(list.map(odt => odt?.ordenId).filter(Boolean))]
  const [historiales, items, trabajadores, ordenes] = await Promise.all([
    prisma.tallerHistorialMaterial.findMany({
      where: { odtId: { in: odtIds } },
      select: { odtId: true, codigoInterno: true, nombre: true, egreso: true, ingreso: true, unidad: true, taller: true },
    }),
    prisma.odtItem.findMany({
      where: { odtId: { in: odtIds }, eliminado: false },
      select: { odtId: true, cantidad: true },
    }),
    trabajadorIds.length
      ? prisma.trabajador.findMany({
        where: { id: { in: trabajadorIds } },
        select: { id: true, sueldoLiquido: true },
      }).catch(error => {
        if (isPrismaMissingTable(error)) return []
        throw error
      })
      : [],
    prisma.orden.findMany({
      where: { id: { in: ordenIds } },
      select: {
        id: true,
        descuentoPct: true,
        descuentoMonto: true,
        items: { select: { cantidad: true, precioUnitario: true } },
        cargos: { select: { valor: true } },
      },
    }),
  ])

  const codes = [...new Set(historiales.map(row => row.codigoInterno).filter(Boolean))]
  const [productos, materiales, telas] = codes.length ? await Promise.all([
    prisma.producto.findMany({
      where: { codigoInterno: { in: codes } },
      select: { codigoInterno: true, nombre: true, precioLista: true },
    }),
    prisma.bodegaTaller.findMany({
      where: { codigoInterno: { in: codes } },
      select: { codigoInterno: true, nombre: true, precio: true },
    }),
    prisma.tela.findMany({
      where: { codigo: { in: codes } },
      select: { codigo: true, nombre: true, precio: true },
    }),
  ]) : [[], [], []]

  const priceByCode = buildPriceLookup({ productos, materiales, telas })
  const historialesByOdt = new Map()
  for (const row of historiales) {
    if (!historialesByOdt.has(row.odtId)) historialesByOdt.set(row.odtId, [])
    historialesByOdt.get(row.odtId).push(row)
  }
  const itemsByOdt = new Map()
  for (const item of items) {
    if (!itemsByOdt.has(item.odtId)) itemsByOdt.set(item.odtId, [])
    itemsByOdt.get(item.odtId).push(item)
  }
  const trabajadoresById = new Map(trabajadores.map(item => [item.id, item]))
  const ordenesById = new Map(ordenes.map(item => [item.id, item]))

  const enriched = list.map(odt => {
    const costeo = buildOdtCosteo(odt, {
      historiales: historialesByOdt.get(odt.id) || [],
      priceByCode,
      trabajador: odt.operarioId ? trabajadoresById.get(odt.operarioId) : null,
      orden: odt.ordenId ? ordenesById.get(odt.ordenId) : null,
      items: itemsByOdt.get(odt.id) || odt.items || [],
      now,
    })
    return {
      ...odt,
      costeo: incluirRemuneracion ? costeo : ocultarRemuneracionDeCosteo(costeo),
    }
  })
  return Array.isArray(odts) ? enriched : enriched[0]
}

export function buildProductividadOperarios(odts = [], { incluirCosteo = true } = {}) {
  const byOperario = new Map()

  for (const odt of odts) {
    const key = odt.operarioId || 0
    const current = byOperario.get(key) || {
      operarioId: odt.operarioId || null,
      operario: odt.operario || null,
      responsable: odt.operario ? formatOperarioNombre(odt.operario) : 'Sin responsable',
      odts: 0,
      unidades: 0,
      produccionHoras: 0,
      ...(incluirCosteo ? {
        costoMateriales: 0,
        costoManoObra: 0,
        costoTotal: 0,
        ventaTotal: 0,
        margenEstimado: 0,
      } : {}),
      alertas: {
        materialesSinPrecio: 0,
        manoObraSinSueldo: 0,
        sinHorasProduccion: 0,
      },
    }
    const costeo = odt.costeo || {}
    current.odts += 1
    // La productividad operacional sigue disponible sin abrir el costeo:
    // cantidades de los items y horas de la OT no son remuneracion ni margen.
    const unidadesOperativas = costeo.unidades ?? (odt.items || []).reduce((sum, item) => sum + Number(item.cantidad || 0), 0)
    const horasProduccion = costeo.produccionHoras ?? odt.tiempos?.produccionHoras ?? 0
    current.unidades += Number(unidadesOperativas || 0)
    current.produccionHoras += Number(horasProduccion || 0)
    if (incluirCosteo) {
      current.costoMateriales += Number(costeo.costoMateriales || 0)
      current.costoManoObra += Number(costeo.costoManoObra || 0)
      current.costoTotal += Number(costeo.costoTotal || 0)
      current.ventaTotal += Number(costeo.ventaTotal || 0)
      current.margenEstimado += Number(costeo.margenEstimado || 0)
      if (costeo.alertas?.materialesSinPrecio) current.alertas.materialesSinPrecio += costeo.alertas.materialesSinPrecio
      if (costeo.alertas?.manoObraSinSueldo) current.alertas.manoObraSinSueldo += 1
    }
    if (costeo.alertas?.sinHorasProduccion || !horasProduccion) current.alertas.sinHorasProduccion += 1
    byOperario.set(key, current)
  }

  return [...byOperario.values()].map(item => ({
    ...item,
    produccionHoras: round(item.produccionHoras, 1),
    ...(incluirCosteo ? {
      costoMateriales: roundMoney(item.costoMateriales),
      costoManoObra: roundMoney(item.costoManoObra),
      costoTotal: roundMoney(item.costoTotal),
      ventaTotal: roundMoney(item.ventaTotal),
      margenEstimado: roundMoney(item.margenEstimado),
      costoPorUnidad: item.unidades > 0 ? roundMoney(item.costoTotal / item.unidades) : null,
      margenPct: item.ventaTotal > 0 ? round((item.margenEstimado / item.ventaTotal) * 100, 1) : null,
    } : {}),
    unidadesPorHora: item.produccionHoras > 0 ? round(item.unidades / item.produccionHoras, 2) : null,
  })).sort((a, b) => b.unidades - a.unidades || b.produccionHoras - a.produccionHoras || a.responsable.localeCompare(b.responsable))
}
