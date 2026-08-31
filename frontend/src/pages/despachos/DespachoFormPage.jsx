import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader, Btn } from '../../components/shared'
import { useDespacho } from '../../api/despachos'
import { emptyDespacho, cardStyle } from './shared'
import DespachoWorkflowForm from './DespachoWorkflowForm'

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
