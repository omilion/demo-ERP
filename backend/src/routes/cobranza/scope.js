import { getUserSucursalId } from '../caja/scope.js'

export function mergeCobranzaWhere(...clauses) {
  const filtered = clauses.filter(c => c && Object.keys(c).length)
  if (filtered.length === 0) return {}
  if (filtered.length === 1) return filtered[0]
  return { AND: filtered }
}

export async function buildCobranzaHistoricoScopeWhere(prisma, user) {
  // Admin y coordinador comercial tienen visibilidad global de cobranza en toda la empresa.
  if (!user || user.role === 'admin' || user.role === 'coordinador_comercial') return {}

  const sucursalId = getUserSucursalId(user)
  if (!sucursalId) return {}

  try {
    // Consulta directa para traer solo los IDs de cobranza de esa sucursal,
    // evitando cargar miles de órdenes en memoria y desbordar los 65.535 parámetros de Postgres.
    const rows = await prisma.$queryRaw`
      SELECT ch.id
      FROM ventas.cobranza_historico ch
      WHERE (
        ch.orden_id IS NOT NULL AND ch.orden_id IN (
          SELECT o.id FROM ventas.ordenes o WHERE o.sucursal_id = ${sucursalId}
        )
      ) OR (
        ch.orden_id IS NULL AND ch.interno IS NOT NULL AND ch.interno IN (
          SELECT o.n_interno FROM ventas.ordenes o WHERE o.sucursal_id = ${sucursalId} AND o.n_interno IS NOT NULL
        )
      )
    `
    const ids = (rows || []).map(r => r.id).filter(Boolean)
    if (!ids.length) return { id: -1 }
    if (ids.length <= 10000) {
      return { id: { in: ids } }
    }
    return { id: { in: ids.slice(0, 10000) } }
  } catch {
    return {}
  }
}
