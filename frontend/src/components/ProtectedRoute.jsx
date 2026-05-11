import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}
