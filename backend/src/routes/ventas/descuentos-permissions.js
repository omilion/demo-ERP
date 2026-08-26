import { can } from '../../middleware/rbac.js'

export function canApplyDescuento(user) {
  if (!user) return false
  if (user.permisoDescuentos) return true
  return can(user.role, 'descuentos', 'write', user.permisosExtra)
}

// Aprobar es una facultad distinta a conceder o administrar descuentos. El
// rol admin la conserva para no cortar la operacion existente; los demas
// usuarios necesitan la bandera explicita administrada desde Usuarios.
export function canApproveDescuento(user) {
  if (!user) return false
  return user.role === 'admin' || Boolean(user.permisoAprobarDescuentos)
}

export function requiresDescuentoPermission(value) {
  return Number(value || 0) > 0
}
