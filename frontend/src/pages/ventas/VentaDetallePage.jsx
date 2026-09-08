import { useNavigate, useParams } from 'react-router-dom'
import { Btn, PageHeader } from '../../components/shared'
import { ViewVentaPanel } from '../../components/forms/ViewVentaPanel'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { useVenta } from '../../api/ventas'

export default function VentaDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canWriteVentas = can(user, 'ventas', 'write')
  const canDeleteVentas = can(user, 'ventas', 'delete')
  const safeId = encodeURIComponent(String(id || ''))

  const { data: venta } = useVenta(id)
  const displayNum = venta?.nInterno || id || '-'

  return (
    <main className="page page-wide">
      <PageHeader
        title="Detalle de Venta"
        subtitle={`Venta #${displayNum}`}
        breadcrumb={['Inicio', 'Ventas', `Venta #${displayNum}`]}
        actions={<Btn variant="secondary" icon="chevronLeft" size="sm" onClick={() => navigate('/ventas')}>Volver</Btn>}
      />

      <ViewVentaPanel
        variant="page"
        venta={venta || { id }}
        canWrite={canWriteVentas}
        canDelete={canDeleteVentas}
        onClose={() => navigate('/ventas')}
        onEdit={() => navigate(`/ventas/${safeId}/editar`)}
      />
    </main>
  )
}
