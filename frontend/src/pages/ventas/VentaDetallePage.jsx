import { useState } from 'react'
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
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: venta } = useVenta(id)
  const displayNum = venta?.nInterno || id || '-'

  return (
    <main className="page page-wide">
      <PageHeader
        title={`Detalle de Venta #${displayNum}`}
        breadcrumb={['Inicio', 'Ventas', `Venta #${displayNum}`]}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {canWriteVentas && (
              <Btn variant="primary" icon="edit" size="sm" onClick={() => navigate(`/ventas/${safeId}/editar`)}>
                Editar
              </Btn>
            )}
            {canDeleteVentas && (
              <Btn variant="ghost" icon="trash" size="sm" onClick={() => setConfirmDelete(true)} style={{ color: 'var(--red)' }}>
                Eliminar
              </Btn>
            )}
            <Btn variant="secondary" icon="chevronLeft" size="sm" onClick={() => navigate('/ventas')}>
              Volver
            </Btn>
          </div>
        }
      />

      <ViewVentaPanel
        variant="page"
        venta={venta || { id }}
        canWrite={canWriteVentas}
        canDelete={canDeleteVentas}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        onClose={() => navigate('/ventas')}
        onEdit={() => navigate(`/ventas/${safeId}/editar`)}
      />
    </main>
  )
}
