const MS_POR_DIA = 24 * 60 * 60 * 1000

function diasEntre(inicio, fin) {
  const inicioDate = inicio ? new Date(inicio) : null
  const finDate = fin ? new Date(fin) : null
  if (!inicioDate || !finDate || Number.isNaN(inicioDate.getTime()) || Number.isNaN(finDate.getTime())) return null
  const diff = finDate.getTime() - inicioDate.getTime()
  return diff < 0 ? null : diff / MS_POR_DIA
}

function resumir(duraciones) {
  const muestras = duraciones.filter(duracion => duracion !== null)
  if (!muestras.length) return { promedioDias: null, muestras: 0 }
  const promedio = muestras.reduce((total, duracion) => total + duracion, 0) / muestras.length
  return { promedioDias: Math.round(promedio * 10) / 10, muestras: muestras.length }
}

export function buildTiemposBodegaKpis({ ordenesCompra = [], despachos = [] } = {}) {
  return {
    ocARecepcion: resumir(ordenesCompra.map(oc => diasEntre(oc.fechaEmision, oc.fechaRecepcion))),
    internoADespacho: resumir(despachos.map(despacho => diasEntre(despacho.fechaInterno || despacho.createdAt, despacho.fechaEntrega))),
    trazabilidadCompleta: {
      disponible: false,
      muestras: 0,
      motivo: 'Las OC de proveedores y los despachos de ventas no tienen una relación persistida; no se infieren vínculos por producto o fecha.',
    },
  }
}
