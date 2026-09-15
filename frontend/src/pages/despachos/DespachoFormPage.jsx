import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader, Btn } from '../../components/shared'
import { useDespacho } from '../../api/despachos'
import { emptyDespacho, cardStyle } from './shared'
import DespachoWorkflowForm from './DespachoWorkflowForm'

// Modal embebido para registrar la salida sin salir de la pantalla de venta.
// La venta es el contexto maestro; el operador sólo completa los datos de
// salida y las etapas de packing, guía y tracking siguen separadas.
export function DespachoModal({ ordenId, nInterno, venta, onClose }) {
  const initial = { ...emptyDespacho, ordenId: String(ordenId), interno: String(nInterno || ''), origenTipo: 'orden' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'oklch(0 0 0 / .45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div
        role="dialog" aria-modal="true" aria-label="Registrar salida desde venta"
        onClick={event => event.stopPropagation()}
        style={{ width: 1040, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', borderRadius: 12, boxShadow: '0 16px 48px oklch(0 0 0 / .2)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 10px 0' }}>
          <button onClick={onClose} aria-label="Cerrar diálogo" title="Cerrar" style={{ minWidth: 40, minHeight: 40, background: '#fff', borderRadius: 8, color: 'var(--text-3)' }}>✕</button>
        </div>
        <DespachoWorkflowForm isEdit={false} initial={initial} venta={venta} fromVenta onDone={onClose} onCancel={onClose} />
      </div>
    </div>
  )
}

// Registro de despacho (orden de transporte). Pagina propia (antes modal
// popup) para que "Nuevo despacho"/"Editar despacho" tengan URL real.
export default function DespachoFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = !!id
  const volver = () => navigate('/despachos?tab=registros')

  const despachoQuery = useDespacho(isEdit ? Number(id) : undefined)
  if (isEdit && despachoQuery.isLoading) {
    return <main className="page page-wide"><PageHeader title="Editar despacho" breadcrumb={['Inicio', 'Logistica', 'Despachos', 'Editar']} /><div style={cardStyle}>Cargando...</div></main>
  }
  if (isEdit && !despachoQuery.data) {
    return <main className="page page-wide"><PageHeader title="Editar despacho" breadcrumb={['Inicio', 'Logistica', 'Despachos', 'Editar']} /><div style={cardStyle}>Despacho no encontrado. <Btn variant="ghost" onClick={volver}>Volver</Btn></div></main>
  }

  const initial = isEdit ? despachoQuery.data : {
    ...emptyDespacho,
    ordenId: searchParams.get('ordenId') || '',
    interno: searchParams.get('nInterno') || '',
    direccion: searchParams.get('direccion') || '',
    region: searchParams.get('region') || '',
    comuna: searchParams.get('comuna') || '',
  }

  return (
    <main className="page page-wide">
      <PageHeader
        title={isEdit ? `Editar despacho #${id}` : 'Nuevo despacho'}
        breadcrumb={['Inicio', 'Logistica', 'Despachos', isEdit ? 'Editar' : 'Nuevo']}
      />
      <DespachoWorkflowForm key={id || 'nuevo'} isEdit={isEdit} initial={initial} onDone={volver} onCancel={volver} />
    </main>
  )
}
