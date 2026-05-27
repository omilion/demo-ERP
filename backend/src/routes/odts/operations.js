export const ODT_ESTADOS = ['Pendiente', 'Asignada', 'En proceso', 'Control calidad', 'Terminada', 'Entregada', 'Prioritaria', 'Anulada']

export const ODT_ESTADOS_ACTUALES = ['Pendiente', 'Asignada', 'En proceso', 'Control calidad', 'Terminada', 'Entregada']
export const ODT_ESTADOS_ABIERTOS = ['Pendiente', 'Asignada', 'En proceso', 'Control calidad', 'Prioritaria']

export function isTerminalOdtEstado(estado) {
  return ['Terminada', 'Entregada', 'Anulada'].includes(estado)
}

export function isOpenOdtEstado(estado) {
  return ODT_ESTADOS_ABIERTOS.includes(estado)
}

export function applyOdtStateSideEffects(data, current = {}, now = new Date()) {
  const next = { ...data }
  if (next.estado === 'En proceso' && !current.fechaInicio && next.fechaInicio === undefined) {
    next.fechaInicio = now
  }
  if (isTerminalOdtEstado(next.estado) && !current.fechaTermino && next.fechaTermino === undefined) {
    next.fechaTermino = now
  }
  if (isOpenOdtEstado(next.estado) && current.fechaTermino && next.fechaTermino === undefined) {
    next.fechaTermino = null
  }
  if (next.estado === 'Anulada' && next.eliminado === undefined) {
    next.eliminado = true
  }
  return next
}

export async function validateOperario(prisma, operarioId) {
  if (operarioId === undefined || operarioId === null) return null
  const trabajador = await prisma.trabajador.findFirst({
    where: { id: operarioId, estado: true },
    select: { id: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true, cargo: true, empresa: true },
  })
  return trabajador || { error: 'Operario no encontrado o inactivo' }
}

export async function attachOperarios(prisma, odts) {
  const list = Array.isArray(odts) ? odts : [odts]
  const ids = [...new Set(list.map(o => o?.operarioId).filter(Boolean))]
  if (!ids.length) return Array.isArray(odts) ? list : { ...odts, operario: null }
  const trabajadores = await prisma.trabajador.findMany({
    where: { id: { in: ids } },
    select: { id: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true, cargo: true, empresa: true, estado: true },
  })
  const map = Object.fromEntries(trabajadores.map(t => [t.id, t]))
  const enriched = list.map(o => ({ ...o, operario: o.operarioId ? (map[o.operarioId] || null) : null }))
  return Array.isArray(odts) ? enriched : enriched[0]
}

export function formatOperarioNombre(operario) {
  if (!operario) return 'Sin responsable'
  return [operario.nombres, operario.apellidoPaterno, operario.apellidoMaterno]
    .filter(Boolean)
    .join(' ')
    .trim() || `Trabajador #${operario.id}`
}

export function getAuditUsuario(user) {
  const nombre = user?.nombre ? String(user.nombre).trim() : ''
  if (nombre) return nombre
  const email = user?.email ? String(user.email).trim() : ''
  return email || 'Sistema'
}

export function buildOdtUpdateBitacoraEntries({ current = {}, data = {}, operario = null, user = null }) {
  const usuario = getAuditUsuario(user)
  const base = {
    usuario,
    usuarioReporta: usuario,
    sucursalId: current.sucursalId ?? null,
    fecha: new Date(),
  }
  const entries = []

  if (data.estado !== undefined && data.estado !== current.estado) {
    entries.push({
      ...base,
      odtId: current.id,
      texto: `Estado ODT: ${current.estado || 'Sin estado'} -> ${data.estado}`,
    })
  }

  if (data.operarioId !== undefined && data.operarioId !== current.operarioId) {
    entries.push({
      ...base,
      odtId: current.id,
      texto: `Responsable ODT actualizado: ${formatOperarioNombre(operario)}`,
    })
  }

  return entries
}

export function buildOperarioCargaItems(groups = [], trabajadores = []) {
  const trabajadoresById = new Map(trabajadores.map(t => [t.id, t]))
  const byOperario = new Map()

  for (const group of groups) {
    const operarioId = group.operarioId
    if (!operarioId) continue
    const item = byOperario.get(operarioId) || {
      operarioId,
      operario: trabajadoresById.get(operarioId) || null,
      total: 0,
      estados: Object.fromEntries(ODT_ESTADOS_ABIERTOS.map(estado => [estado, 0])),
    }
    const count = group._count?._all ?? 0
    item.total += count
    if (group.estado) item.estados[group.estado] = (item.estados[group.estado] ?? 0) + count
    byOperario.set(operarioId, item)
  }

  return [...byOperario.values()].sort((a, b) => b.total - a.total || a.operarioId - b.operarioId)
}
