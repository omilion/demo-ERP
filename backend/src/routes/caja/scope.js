export function getUserSucursalId(user) {
  const raw = user?.sucursalId ?? user?.sucursal_id
  const value = raw == null ? null : Number(raw)
  return Number.isInteger(value) && value > 0 ? value : null
}

export function withCajaSucursalScope(user, where = {}) {
  const sucursalId = getUserSucursalId(user)
  return sucursalId ? { ...where, sucursalId } : where
}

export function withTurnoSucursalScope(user, where = {}) {
  const sucursalId = getUserSucursalId(user)
  if (!sucursalId) return where
  return {
    ...where,
    caja: { ...(where.caja || {}), sucursalId },
  }
}

export function withMovimientoSucursalScope(user, where = {}) {
  const sucursalId = getUserSucursalId(user)
  if (!sucursalId) return where

  const scope = {
    OR: [
      { sucursalId },
      { sucursalId: null, turno: { caja: { sucursalId } } },
    ],
  }
  return Object.keys(where).length ? { AND: [scope, where] } : scope
}

export function normalizeMedioPago(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function isReferencialMedioPago(value) {
  return normalizeMedioPago(value) === 'referencial'
}

export function isMovimientoInUserSucursal(user, movimiento) {
  const sucursalId = getUserSucursalId(user)
  if (!sucursalId) return true
  return movimiento?.sucursalId === sucursalId || movimiento?.turno?.caja?.sucursalId === sucursalId
}
