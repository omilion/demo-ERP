import { useNavigate, useParams } from 'react-router-dom'
import { Btn, PageHeader } from '../../components/shared'
import { ViewVentaPanel } from '../../components/forms/ViewVentaPanel'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

export default function VentaDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canWriteVentas = can(user, 'ventas', 'write')
  const canDeleteVentas = can(user, 'ventas', 'delete')
  const safeId = encodeURIComponent(String(id || ''))

  return (
    <main className="page page-wide">
      <PageHeader
        title="Detalle de Venta"
        subtitle={`Venta #${id || '-'}`}
        breadcrumb={['Inicio', 'Ventas', `Venta #${id || '-'}`]}
        actions={<Btn variant="secondary" icon="chevronLeft" size="sm" onClick={() => navigate('/ventas')}>Volver</Btn>}
      />

      <ViewVentaPanel
        variant="page"
        venta={{ id }}
        canWrite={canWriteVentas}
        canDelete={canDeleteVentas}
        onClose={() => navigate('/ventas')}
        onEdit={() => navigate(`/ventas/${safeId}/editar`)}
      />
    </main>
  )
}
