// Utilidades compartidas por las herramientas del asistente IA.

// Convierte un período tipado (enum del LLM) en un rango de fechas { gte, lt }.
// El LLM nunca pasa fechas crudas para los presets — elige un enum.
export function rangoPeriodo(periodo, anio, mes) {
  const now = new Date()
  const y = anio || now.getFullYear()
  switch (periodo) {
    case 'hoy': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const next = new Date(d); next.setDate(d.getDate() + 1)
      return { gte: d, lt: next }
    }
    case 'mes_actual': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1)
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      return { gte: d, lt: next }
    }
    case 'mes_anterior': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const next = new Date(now.getFullYear(), now.getMonth(), 1)
      return { gte: d, lt: next }
    }
    case 'anio_actual':
      return { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) }
    case 'mes_especifico': {
      const m = (mes || 1) - 1
      return { gte: new Date(y, m, 1), lt: new Date(y, m + 1, 1) }
    }
    case 'anio_especifico':
      return { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) }
    case 'ultimos_30_dias':
    default: {
      const d = new Date(now); d.setDate(now.getDate() - 30)
      return { gte: d, lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) }
    }
  }
}

export const PERIODO_ENUM = ['hoy', 'mes_actual', 'mes_anterior', 'anio_actual', 'ultimos_30_dias', 'mes_especifico', 'anio_especifico']

export const clp = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-CL')
