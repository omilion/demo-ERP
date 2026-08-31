// Estado operacional derivado: la venta conserva su estado comercial y cada
// hito visible acá tiene una evidencia (despacho, packing, guía o tracking).
// No se persiste otra columna que pueda quedar desincronizada.
export const ESTADO_LOGISTICO = Object.freeze({
  EN_TALLER: { codigo: 'EN_TALLER', label: 'En taller', tone: 'purple' },
  PICKING_PARCIAL: { codigo: 'PICKING_PARCIAL', label: 'Picking parcial · taller pendiente', tone: 'amber' },
  LISTA_PICKING: { codigo: 'LISTA_PICKING', label: 'Lista para picking', tone: 'gray' },
  PICKING: { codigo: 'PICKING', label: 'Picking', tone: 'blue' },
  PACKING: { codigo: 'PACKING', label: 'Packing', tone: 'amber' },
  LISTA_DESPACHO: { codigo: 'LISTA_DESPACHO', label: 'Lista para despacho', tone: 'green' },
  GUIA_PREPARADA: { codigo: 'GUIA_PREPARADA', label: 'Guía preparada', tone: 'amber' },
  GUIA_SII_PENDIENTE: { codigo: 'GUIA_PREPARADA', label: 'Guía preparada', tone: 'amber' },
  GUIA_SII_EMITIDA: { codigo: 'GUIA_SII_EMITIDA', label: 'Guía SII emitida', tone: 'blue' },
  PREPARADO: { codigo: 'PREPARADO', label: 'Preparado', tone: 'blue' },
  PATIO: { codigo: 'PATIO', label: 'Patio / Despacho', tone: 'blue' },
  DIDACTICO: { codigo: 'DIDACTICO', label: 'Didáctico', tone: 'blue' },
  REPARTO: { codigo: 'REPARTO', label: 'Reparto', tone: 'blue' },
  ENTREGADO: { codigo: 'ENTREGADO', label: 'Entregado', tone: 'green' },
  INCIDENCIA: { codigo: 'INCIDENCIA', label: 'Incidencia', tone: 'red' },
  RETENIDO: { codigo: 'RETENIDO', label: 'Retenido', tone: 'amber' },
  REPROGRAMADO: { codigo: 'REPROGRAMADO', label: 'Reprogramado', tone: 'amber' },
  DEVUELTO: { codigo: 'DEVUELTO', label: 'Devuelto', tone: 'red' },
})

const TRACKING_TO_ESTADO = Object.freeze({
  Preparado: 'PREPARADO',
  Patio: 'PATIO',
  Didáctico: 'DIDACTICO',
  Reparto: 'REPARTO',
  Entregado: 'ENTREGADO',
  Incidencia: 'INCIDENCIA',
  Retenido: 'RETENIDO',
  Reprogramado: 'REPROGRAMADO',
  Devuelto: 'DEVUELTO',
  'En ruta': 'REPARTO',
})

const DTE_GUIA_EMITIDA = new Set(['emitido', 'enviado', 'aceptado'])

export function resumenPacking(items = []) {
  const total = items.reduce((sum, item) => sum + Number(item.cantidad || 0), 0)
  const preparados = items.reduce((sum, item) => sum + Number(item.nEntregados ?? item.entregados ?? 0), 0)
  return { total, preparados, completo: total > 0 && preparados >= total }
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

// Las líneas inventariadas ya fueron validadas y descontadas al confirmar la
// venta; quedan disponibles para el trabajo físico de picking. Las
// transitorias sólo se habilitan cuando todos sus talleres asignados están
// listos. Esto permite una misma venta mixta sin fingir que producción está en
// bodega.
export function resumenPreparacion(items = [], odts = []) {
  const listoTallerPorProducto = new Map()
  for (const odt of odts) {
    if (odt?.eliminado) continue
    for (const item of odt.items || []) {
      const talleres = (item.talleres || []).filter(taller => normalize(taller.estado) !== 'cancelado')
      const listo = talleres.length > 0 && talleres.every(taller => normalize(taller.estado) === 'listo')
      if (listo && item.productoId) {
        listoTallerPorProducto.set(item.productoId, (listoTallerPorProducto.get(item.productoId) || 0) + Number(item.cantidad || 0))
      }
    }
  }

  let pendienteTotal = 0
  let disponibleInventario = 0
  let disponibleTaller = 0
  let pendienteTaller = 0
  const lineas = []
  for (const item of items) {
    const pendiente = Math.max(0, Number(item.cantidad || 0) - Number(item.nEntregados || 0))
    if (!pendiente) continue
    pendienteTotal += pendiente
    const esTransitorio = normalize(item.estadoInventario) === 'transitorio'
    if (!esTransitorio) {
      disponibleInventario += pendiente
      lineas.push({ ordenItemId: item.id, productoId: item.productoId, cantidad: pendiente, disponiblePicking: pendiente, pendienteTaller: 0, origen: 'inventario' })
      continue
    }
    const listo = Math.min(pendiente, listoTallerPorProducto.get(item.productoId) || 0)
    listoTallerPorProducto.set(item.productoId, Math.max(0, (listoTallerPorProducto.get(item.productoId) || 0) - listo))
    disponibleTaller += listo
    pendienteTaller += pendiente - listo
    lineas.push({ ordenItemId: item.id, productoId: item.productoId, cantidad: pendiente, disponiblePicking: listo, pendienteTaller: pendiente - listo, origen: 'taller' })
  }
  const disponiblePicking = disponibleInventario + disponibleTaller
  return {
    pendienteTotal,
    disponiblePicking,
    disponibleInventario,
    disponibleTaller,
    pendienteTaller,
    esMixta: disponiblePicking > 0 && pendienteTaller > 0,
    lineas,
  }
}

export function deriveEstadoLogistico({ items = [], despachos = [], guias = [], tracking = null, preparacion = null } = {}) {
  const trackingEstado = tracking?.estado && TRACKING_TO_ESTADO[tracking.estado]
  if (trackingEstado) return ESTADO_LOGISTICO[trackingEstado]

  const packing = resumenPacking(items)
  const resumen = preparacion || resumenPreparacion(items)
  const guiaSii = guias.find(guia => DTE_GUIA_EMITIDA.has(String(guia?.dteEstado || '').toLowerCase()))
  if (guiaSii) return ESTADO_LOGISTICO.GUIA_SII_EMITIDA
  if (guias.length) return ESTADO_LOGISTICO.GUIA_PREPARADA
  if (packing.completo && Number(resumen.pendienteTaller || 0) === 0) return ESTADO_LOGISTICO.LISTA_DESPACHO
  if (packing.preparados > 0) return ESTADO_LOGISTICO.PACKING
  if (despachos.some(despacho => !despacho.eliminado)) return ESTADO_LOGISTICO.PICKING
  if (resumen.pendienteTaller > 0 && resumen.disponiblePicking > 0) return ESTADO_LOGISTICO.PICKING_PARCIAL
  if (resumen.pendienteTaller > 0) return ESTADO_LOGISTICO.EN_TALLER
  return ESTADO_LOGISTICO.LISTA_PICKING
}
