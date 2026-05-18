import { Navigate, useLocation, useParams } from 'react-router-dom'

export function VentaLegacyRedirect() {
  const { id } = useParams()
  return <Navigate to={`/ventas?search=${encodeURIComponent(id || '')}`} replace />
}

export function OdtLegacyRedirect() {
  const { id } = useParams()
  const { search } = useLocation()
  const ordenId = new URLSearchParams(search).get('ordenId')
  const value = id || ordenId || ''
  return <Navigate to={value ? `/taller?search=${encodeURIComponent(value)}` : '/taller'} replace />
}
