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
  const fechaStr = venta?.createdAt
    ? new Date(venta.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  const ejecutivoStr = venta?.creadorNombre || venta?.creador?.nombre || 'Sin vendedor'

  return (
    <main className="page page-wide">
      <PageHeader
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>Detalle de Venta #{displayNum}</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '3px 10px',
              color: 'var(--text-2)'
            }}>
              <strong style={{ color: 'var(--text-1)' }}>Ejecutivo(a):</strong> {ejecutivoStr}
            </span>
            {fechaStr && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 500,
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '3px 10px',
                color: 'var(--text-2)'
              }}>
                <strong style={{ color: 'var(--text-1)' }}>Fecha:</strong> {fechaStr}
              </span>
            )}
          </div>
        }
        breadcrumb={['Inicio', 'Ventas', `Venta #${displayNum}`]}
        actions={
          <Btn variant="secondary" icon="chevronLeft" size="sm" onClick={() => navigate('/ventas')}>
            Volver
          </Btn>
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
