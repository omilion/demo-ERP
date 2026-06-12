export const ODT_ESTADOS = ['Pendiente', 'Asignada', 'En proceso', 'Control calidad', 'Terminada', 'Entregada', 'Prioritaria', 'Anulada']

export const ODT_ESTADOS_ACTUALES = ['Pendiente', 'Asignada', 'En proceso', 'Control calidad', 'Terminada', 'Entregada']
export const ODT_ESTADOS_ABIERTOS = ['Pendiente', 'Asignada', 'En proceso', 'Control calidad', 'Prioritaria']

export const ODT_FECHA_FIELDS = Object.freeze({
  createdAt: 'createdAt',
  fechaIngreso: 'fechaIngreso',
  fechaInicio: 'fechaInicio',
  fechaTermino: 'fechaTermino',
  plazo: 'plazo',
})

export function normalizeOdtFechaField(value) {
  if (!value) return 'createdAt'
  return ODT_FECHA_FIELDS[value] || null
}

export function tipoTallerFilter(tipo) {
  const text = String(tipo || '').toLowerCase()
  const names = []
  if (text.includes('espuma')) names.push('espuma')
  else if (text.includes('confe')) names.push('confe')
  else if (text.includes('madera')) names.push('madera', 'externo')
  else if (text.includes('externo')) names.push('externo', 'madera')
  if (!names.length) return { tipo }
  return {
    OR: [
      { tipo },
      ...names.map(name => ({
        items: {
          some: {
            eliminado: false,
            talleres: {
              some: { taller: { is: { nombre: { contains: name, mode: 'insensitive' } } } },
            },
          },
        },
      })),
    ],
  }
}

export function isTerminalOdtEstado(estado) {
  return ['Terminada', 'Entregada', 'Anulada'].includes(estado)
}

export function isOpenOdtEstado(estado) {
  return ODT_ESTADOS_ABIERTOS.includes(estado)
}

function toValidDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function roundHours(value) {
  return Math.round(value * 10) / 10
}

export function diffHours(start, end) {
  const startDate = toValidDate(start)
  const endDate = toValidDate(end)
  if (!startDate || !endDate || endDate < startDate) return null
  return roundHours((endDate.getTime() - startDate.getTime()) / 36e5)
}

export function isPrismaMissingTable(error) {
  return error?.code === 'P2021'
}

export function buildOdtTiempoMetrics(odt = {}, now = new Date()) {
  const nowDate = toValidDate(now) || new Date()
  const createdAt = toValidDate(odt.createdAt)
  const fechaInicio = toValidDate(odt.fechaInicio)
  const fechaTermino = toValidDate(odt.fechaTermino)
  const plazo = toValidDate(odt.plazo)
  const open = isOpenOdtEstado(odt.estado)
  const terminal = isTerminalOdtEstado(odt.estado)
  const productionEnd = fechaTermino || (open && fechaInicio ? nowDate : null)
  const cycleEnd = fechaTermino || (open && createdAt ? nowDate : null)
  const atrasoEnd = fechaTermino || (open ? nowDate : null)
  const atrasoHoras = plazo && atrasoEnd && atrasoEnd > plazo ? diffHours(plazo, atrasoEnd) : 0

  return {
    produccionHoras: diffHours(fechaInicio, productionEnd),
    esperaHoras: diffHours(createdAt, fechaInicio),
    cicloHoras: diffHours(createdAt, cycleEnd),
    atrasoHoras,
    atrasoDias: atrasoHoras ? roundHours(atrasoHoras / 24) : 0,
    enAtraso: atrasoHoras > 0 && !terminal,
  }
}

export function attachOdtMetrics(odts, now = new Date()) {
  const list = Array.isArray(odts) ? odts : [odts]
  const enriched = list.map(odt => ({ ...odt, tiempos: buildOdtTiempoMetrics(odt, now) }))
  return Array.isArray(odts) ? enriched : enriched[0]
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
  let trabajador = null
  try {
    trabajador = await prisma.trabajador.findFirst({
      where: { id: operarioId, estado: true },
      select: { id: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true, cargo: true, empresa: true },
    })
  } catch (error) {
    if (!isPrismaMissingTable(error)) throw error
  }
  return trabajador || { error: 'Operario no encontrado o inactivo' }
}

export async function attachOperarios(prisma, odts) {
  const list = Array.isArray(odts) ? odts : [odts]
  const ids = [...new Set(list.map(o => o?.operarioId).filter(Boolean))]
  if (!ids.length) return Array.isArray(odts) ? list : { ...odts, operario: null }
  let trabajadores = []
  try {
    trabajadores = await prisma.trabajador.findMany({
      where: { id: { in: ids } },
      select: { id: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true, cargo: true, empresa: true, estado: true },
    })
  } catch (error) {
    if (!isPrismaMissingTable(error)) throw error
  }
  const map = Object.fromEntries(trabajadores.map(t => [t.id, t]))
  const enriched = list.map(o => ({ ...o, operario: o.operarioId ? (map[o.operarioId] || null) : null }))
  return Array.isArray(odts) ? enriched : enriched[0]
}

export async function attachOrdenes(prisma, odts) {
  const list = Array.isArray(odts) ? odts : [odts]
  const ids = [...new Set(list.map(o => o?.ordenId).filter(Boolean))]
  if (!ids.length) {
    const enrichedEmpty = list.map(o => ({ ...o, orden: null, nInterno: null, clienteRut: null }))
    return Array.isArray(odts) ? enrichedEmpty : enrichedEmpty[0]
  }
  const ordenes = await prisma.orden.findMany({
    where: { id: { in: ids } },
    select: { id: true, nInterno: true, tipo: true, clienteId: true },
  })
  const clienteIds = [...new Set(ordenes.map(o => o.clienteId).filter(Boolean))]
  const clientes = clienteIds.length
    ? await prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, nombre: true, rut: true } })
    : []
  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c]))
  const map = Object.fromEntries(ordenes.map(o => [o.id, { ...o, cliente: o.clienteId ? (clienteMap[o.clienteId] || null) : null }]))
  const enriched = list.map(o => {
    const orden = o.ordenId ? (map[o.ordenId] || null) : null
    // Muchas ODT migradas no tienen clienteNombre propio pero si la orden ligada.
    const clienteNombre = o.clienteNombre || orden?.cliente?.nombre || null
    return { ...o, orden, nInterno: orden?.nInterno ?? null, clienteNombre, clienteRut: orden?.cliente?.rut ?? null }
  })
  return Array.isArray(odts) ? enriched : enriched[0]
}

// Deriva el/los taller(es) real(es) de cada ODT desde sus items.
// El campo Odt.tipo viene como "Legacy" en los datos migrados y no sirve para
// mostrar; el taller verdadero (Espumas/Confecciones/Madera/Externo) vive en
// odtItem.talleres[].taller.nombre. Resuelve en batch (una query) para evitar N+1.
export async function attachTalleres(prisma, odts) {
  const list = Array.isArray(odts) ? odts : [odts]
  const ids = [...new Set(list.map(o => o?.id).filter(Boolean))]
  if (!ids.length) {
    const empty = list.map(o => ({ ...o, talleres: [] }))
    return Array.isArray(odts) ? empty : empty[0]
  }
  const items = await prisma.odtItem.findMany({
    where: { odtId: { in: ids }, eliminado: false },
    select: { odtId: true, talleres: { select: { taller: { select: { nombre: true } } } } },
  })
  const byOdt = new Map()
  for (const it of items) {
    const set = byOdt.get(it.odtId) || new Set()
    for (const t of it.talleres) {
      const nombre = t?.taller?.nombre
      if (nombre) set.add(nombre)
    }
    byOdt.set(it.odtId, set)
  }
  const enriched = list.map(o => ({ ...o, talleres: o?.id ? [...(byOdt.get(o.id) || [])] : [] }))
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
