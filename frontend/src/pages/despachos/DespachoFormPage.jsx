import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader, Badge, Btn } from '../../components/shared'
import { useCreateDespacho, useUpdateDespacho, useDespacho } from '../../api/despachos'
import { useVenta } from '../../api/ventas'
import { emptyDespacho, showError, checkLabel, input, grid, cardStyle } from './shared'
import { DespachoCamposFields, Field, Footer } from './shared-ui'

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
      <DespachoForm key={id || 'nuevo'} isEdit={isEdit} initial={initial} onDone={volver} onCancel={volver} />
    </main>
  )
}

function DespachoForm({ isEdit, initial, onDone, onCancel }) {
  const [form, setForm] = useState(() => ({
    ...emptyDespacho,
    ...initial,
    fechaInterno: initial.fechaInterno ? String(initial.fechaInterno).slice(0, 10) : '',
    fechaEntrega: initial.fechaEntrega ? String(initial.fechaEntrega).slice(0, 10) : '',
    plazoEntrega: initial.plazoEntrega && /^\d{4}-\d{2}-\d{2}/.test(initial.plazoEntrega) ? initial.plazoEntrega.slice(0, 10) : '',
  }))
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const { data: venta } = useVenta(form.ordenId || undefined)

  const effectiveEmail = form.emailContacto || (!isEdit ? venta?.emailContactoDespacho : '') || ''

  const createMut = useCreateDespacho()
  const updateMut = useUpdateDespacho()
  const saving = createMut.isPending || updateMut.isPending

  const guardar = () => {
    if (!/^\S+@\S+\.\S+$/.test(String(effectiveEmail).trim())) {
      showError({ response: { data: { error: 'Ingresa un correo de contacto de despacho valido' } } })
      return
    }
    if (isEdit) {
      updateMut.mutate({ id: initial.id, data: { ...form, emailContacto: effectiveEmail } }, { onSuccess: onDone, onError: showError })
    } else {
      createMut.mutate({ ...form, emailContacto: effectiveEmail }, { onSuccess: onDone, onError: showError })
    }
  }

  return (
    <div style={cardStyle}>
      {(form.parcial || form.tieneMulta) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {form.parcial && <Badge tone="amber">Envío parcial</Badge>}
          {form.tieneMulta && <Badge tone="red">Tiene multa</Badge>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        <label style={checkLabel}><input type="checkbox" checked={!!form.parcial} onChange={e => set('parcial', e.target.checked)} /> Parcial</label>
        <label style={checkLabel}><input type="checkbox" checked={!!form.tieneMulta} onChange={e => set('tieneMulta', e.target.checked)} /> Tiene multa</label>
      </div>
      <div style={grid}>
        <Field label="Orden ID"><input value={form.ordenId || ''} onChange={e => set('ordenId', e.target.value)} style={input} /></Field>
        <Field label="OT ID"><input value={form.odtId || ''} onChange={e => set('odtId', e.target.value)} style={input} /></Field>
        <Field label="Interno"><input value={form.interno || ''} disabled style={{ ...input, background: 'var(--bg)', color: 'var(--text-3)' }} title="Es el numero interno de la venta, no se edita aca" /></Field>
        <Field label="Tipo de venta"><input value={venta?.tipo || '—'} disabled style={{ ...input, background: 'var(--bg)', color: 'var(--text-3)' }} /></Field>
      </div>
      <DespachoCamposFields form={{ ...form, emailContacto: effectiveEmail }} set={set} />
      <Footer saving={saving} onClose={onCancel} onSave={guardar} />
    </div>
  )
}
