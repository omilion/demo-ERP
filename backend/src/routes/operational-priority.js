const PRIORITY_RANK = Object.freeze({
  urgente: 0,
  alta: 1,
  media: 2,
  normal: 2,
  baja: 3,
})

const TERMINAL_ODT_STATES = new Set(['anulada', 'terminada', 'entregada'])

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function normalizeOperationalPriority(value) {
  const normalized = normalizeText(value)
  if (normalized === 'emergencia') return 'urgente'
  return PRIORITY_RANK[normalized] !== undefined ? normalized : null
}

function isOpenOdt(odt) {
  return Boolean(odt && !odt.eliminado && !TERMINAL_ODT_STATES.has(normalizeText(odt.estado)))
}

export function summarizeOperationalPriority(odts = []) {
  const candidates = odts
    .filter(isOpenOdt)
    .map(odt => {
      const value = normalizeOperationalPriority(odt.prioridad)
      if (!value) return null
      return {
        value,
        rank: PRIORITY_RANK[value],
        odtId: odt.id || null,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || Number(b.odtId || 0) - Number(a.odtId || 0))

  return candidates[0] || { value: null, rank: 99, odtId: null }
}

export function summarizeOperationalAttention({
  multas = [],
  despachos = [],
  odts = [],
  clienteConflictivo = false,
  plazoVencido = false,
} = {}) {
  const prioridad = summarizeOperationalPriority(odts)
  const multaCount = multas.length
  const multaDespachoCount = despachos.filter(despacho => despacho.tieneMulta).length
  const multaTotal = multas.reduce((sum, multa) => sum + Math.abs(Number(multa.monto || 0)), 0)
  const tieneMulta = multaCount > 0 || multaDespachoCount > 0
  const prioridadAlta = prioridad.rank <= 1

  return {
    tieneMulta,
    multaCount,
    multaDespachoCount,
    multaTotal,
    prioridadOperativa: prioridad.value,
    prioridadOperativaRank: prioridad.rank,
    prioridadOperativaOdtId: prioridad.odtId,
    clienteConflictivo: Boolean(clienteConflictivo),
    plazoVencido: Boolean(plazoVencido),
    requiereAtencion: Boolean(tieneMulta || prioridadAlta || clienteConflictivo || plazoVencido),
  }
}
