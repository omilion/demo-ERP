import { Navigate, useLocation, useParams } from 'react-router-dom'

export function VentaLegacyRedirect() {
  const { id } = useParams()
  const value = encodeURIComponent(id || '')
  return <Navigate to={`/ventas?search=${value}&open=${value}`} replace />
}

export function OdtLegacyRedirect() {
  const { id } = useParams()
  const { search } = useLocation()
  const ordenId = new URLSearchParams(search).get('ordenId')
  const value = id || ordenId || ''
  return <Navigate to={value ? `/taller?search=${encodeURIComponent(value)}` : '/taller'} replace />
}

// Las licitaciones nuevas se gestionan desde CRM. Se conserva el acceso a
// fichas y detalles históricos por su URL específica, pero las entradas de
// listado, creación y reportes llevan al módulo que hoy es dueño del flujo.
export function LicitacionesLegacyRedirect({ destination = 'crm' }) {
  const { search } = useLocation()
  if (destination === 'nueva') {
    const crmId = new URLSearchParams(search).get('crmId')
    return <Navigate to={`/crm/nueva/licitacion${crmId ? `?crmId=${encodeURIComponent(crmId)}` : ''}`} replace />
  }
  if (destination === 'reportes') return <Navigate to="/reportes/gerenciales" replace />
  return <Navigate to="/crm" replace />
}
