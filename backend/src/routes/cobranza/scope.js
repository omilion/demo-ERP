import { getUserSucursalId } from '../caja/scope.js'

export function mergeCobranzaWhere(...clauses) {
  const filtered = clauses.filter(c => c && Object.keys(c).length)
  if (filtered.length === 0) return {}
  if (filtered.length === 1) return filtered[0]
  return { AND: filtered }
}

export async function buildCobranzaHistoricoScopeWhere(prisma, user) {
  const sucursalId = getUserSucursalId(user)
  if (!sucursalId) return {}

  const ordenes = await prisma.orden.findMany({
    where: { sucursalId },
    select: { id: true, nInterno: true },
  })
  const ordenIds = ordenes.map(o => o.id).filter(Boolean)
  const internos = [...new Set(ordenes.map(o => o.nInterno).filter(Boolean))]
  const OR = []
  if (ordenIds.length) OR.push({ ordenId: { in: ordenIds } })
  if (internos.length) OR.push({ ordenId: null, interno: { in: internos } })

  return OR.length ? { OR } : { id: -1 }
}
