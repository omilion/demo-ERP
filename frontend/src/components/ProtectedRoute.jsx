import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { can, canAny, hasRole } from '../utils/permissions'

export function ProtectedRoute({ children, allowedRoles, module: moduleName, permission = 'read', requirements }) {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />

  if (requirements && !canAny(user, requirements)) {
    return <Navigate to="/dashboard" replace />
  }

  if (moduleName && !can(user, moduleName, permission)) {
    return <Navigate to="/dashboard" replace />
  }

  if (!moduleName && allowedRoles && !hasRole(user, allowedRoles)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
