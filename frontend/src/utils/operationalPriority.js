const PRIORITY_META = Object.freeze({
  urgente: { label: 'Urgente', tone: 'red' },
  alta: { label: 'Alta', tone: 'amber' },
  media: { label: 'Media', tone: 'blue' },
  normal: { label: 'Normal', tone: 'gray' },
  baja: { label: 'Baja', tone: 'gray' },
})

export function operationalPriorityMeta(value) {
  const key = String(value || '').trim().toLowerCase()
  return PRIORITY_META[key] || { label: value || 'Sin prioridad', tone: 'gray' }
}

export function operationalPrioritySortValue(row) {
  return Number.isFinite(Number(row?.prioridadOperativaRank))
    ? Number(row.prioridadOperativaRank)
    : 99
}
