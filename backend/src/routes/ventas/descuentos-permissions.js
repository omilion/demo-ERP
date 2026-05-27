import { can } from '../../middleware/rbac.js'

export function canApplyDescuento(user) {
  if (!user) return false
  if (user.permisoDescuentos) return true
  return can(user.role, 'descuentos', 'write', user.permisosExtra)
}

export function requiresDescuentoPermission(value) {
  return Number(value || 0) > 0
}
