import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, Btn, PageHeader } from '../../components/shared'
import { useDespacho, useDespachoTracking, useCreateDespachoTrackingEvento } from '../../api/despachos'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { TRACKING_ESTADOS, INCIDENT_TYPES, trackingTone, showError, input, cardStyle } from './shared'
import { Mono, Field, Footer } from './shared-ui'

// Tracking logistico de un despacho (estado, ubicacion, incidencias).
// Pagina propia (antes modal popup) para llegar directo desde la lista de
// registros sin perder el link/contexto.
export default function DespachoTrackingPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useAuthStore()
  const canWrite = can(user, 'despacho', 'write')
  const volver = () => navigate('/despachos?tab=registros')

  const despachoQuery = useDespacho(Number(id))
  if (despachoQuery.isLoading) {
    return <main className="page page-wide"><PageHeader title="Tracking" breadcrumb={['Inicio', 'Logistica', 'Despachos', 'Tracking']} /><div style={cardStyle}>Cargando...</div></main>
  }
  if (!despachoQuery.data) {
    return <main className="page page-wide"><PageHeader title="Tracking" breadcrumb={['Inicio', 'Logistica', 'Despachos', 'Tracking']} /><div style={cardStyle}>Despacho no encontrado. <Btn variant="ghost" onClick={volver}>Volver</Btn></div></main>
  }

  return (
    <main className="page page-wide">
      <PageHeader
        title={`Tracking despacho #${id}`}
        breadcrumb={['Inicio', 'Logistica', 'Despachos', 'Tracking']}
        actions={<Btn variant="ghost" onClick={volver}>Volver</Btn>}
      />
      <TrackingForm row={despachoQuery.data} canWrite={canWrite} onCancel={volver} />
    </main>
  )
}

function TrackingForm({ row, canWrite, onCancel }) {
  const { data: trace = { latest: null, eventos: [] }, isLoading } = useDespachoTracking(row.id)
  const createTrackingMut = useCreateDespachoTrackingEvento()
  const latest = trace.latest || row.tracking
  const [form, setForm] = useState({
    estado: latest?.estado || 'Preparado',
    transporte: latest?.transporte || row.transporte || '',
    ubicacion: latest?.ubicacion || '',
    fechaEvento: '',
    observacion: '',
    tipoIncidente: '',
    accionTomada: '',
    responsable: '',
    fechaCompromiso: '',
  })
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const save = () => {
    const esIncidencia = form.estado === 'Incidencia'
    const payload = {
      estado: form.estado,
      transporte: form.transporte.trim() || undefined,
      ubicacion: form.ubicacion.trim() || undefined,
      fechaEvento: form.fechaEvento || undefined,
      observacion: form.observacion.trim() || undefined,
    }
    if (esIncidencia) {
      payload.tipoIncidente = form.tipoIncidente.trim() || undefined
      payload.accionTomada = form.accionTomada.trim() || undefined
      payload.responsable = form.responsable.trim() || undefined
      payload.fechaCompromiso = form.fechaCompromiso || undefined
    }
    createTrackingMut.mutate({ despachoId: row.id, ...payload }, { onError: showError })
    setForm(prev => ({ ...prev, observacion: '', fechaEvento: '', tipoIncidente: '', accionTomada: '', responsable: '', fechaCompromiso: '' }))
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{row.interno ? `Interno ${row.interno}` : `Orden #${row.ordenId || '-'}`}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{row.tipoDespacho || 'Despacho'} {row.transporte ? `- ${row.transporte}` : ''}</div>
        </div>
        <Badge tone={trackingTone(latest?.estado)}>{latest?.estado || 'Sin tracking'}</Badge>
      </div>

      {canWrite && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 10 }}>
          <Field label="Estado">
            <select value={form.estado} onChange={event => set('estado', event.target.value)} style={input}>
              {TRACKING_ESTADOS.map(estado => <option key={estado} value={estado}>{estado}</option>)}
            </select>
          </Field>
          <Field label="Transporte">
            <input value={form.transporte} onChange={event => set('transporte', event.target.value)} style={input} />
          </Field>
          <Field label="Fecha evento">
            <input type="datetime-local" value={form.fechaEvento} onChange={event => set('fechaEvento', event.target.value)} style={input} />
          </Field>
          <Field label="Ubicacion">
            <input value={form.ubicacion} onChange={event => set('ubicacion', event.target.value)} style={input} />
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Observacion">
              <input value={form.observacion} onChange={event => set('observacion', event.target.value)} placeholder="Detalle operativo" style={input} />
            </Field>
          </div>
          {form.estado === 'Incidencia' && (
            <>
              <Field label="Tipo incidente">
                <select value={form.tipoIncidente} onChange={event => set('tipoIncidente', event.target.value)} style={input}>
                  <option value="">Seleccionar</option>
                  {INCIDENT_TYPES.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
                </select>
              </Field>
              <Field label="Responsable">
                <input value={form.responsable} onChange={event => set('responsable', event.target.value)} style={input} />
              </Field>
              <Field label="Fecha compromiso">
                <input type="datetime-local" value={form.fechaCompromiso} onChange={event => set('fechaCompromiso', event.target.value)} style={input} />
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Accion tomada">
                  <input value={form.accionTomada} onChange={event => set('accionTomada', event.target.value)} style={input} />
                </Field>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: canWrite ? 'space-between' : 'flex-end', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {isLoading && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Cargando...</span>}
        {canWrite && <Footer saving={createTrackingMut.isPending} onClose={onCancel} onSave={save} closeLabel="Volver" />}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        {(trace.eventos || []).length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Sin eventos logisticos registrados.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 280, overflowY: 'auto' }}>
            {(trace.eventos || []).map(evento => (
              <div key={evento.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)' }}>
                <Badge tone={trackingTone(evento.estado)}>{evento.estado}</Badge>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{evento.ubicacion || evento.transporte || 'Evento logistico'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {evento.usuario || 'Sistema'} - {new Date(evento.fechaEvento).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {evento.transporte ? ` - ${evento.transporte}` : ''}
                  </div>
                  {evento.observacion && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{evento.observacion}</div>}
                  {evento.estado === 'Incidencia' && (evento.tipoIncidente || evento.accionTomada || evento.responsable || evento.fechaCompromiso) && (
                    <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-2)' }}>
                      {evento.tipoIncidente && <Badge tone="red">{evento.tipoIncidente}</Badge>}
                      {evento.responsable && <span>Resp. {evento.responsable}</span>}
                      {evento.fechaCompromiso && <span>Compromiso {new Date(evento.fechaCompromiso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                      {evento.accionTomada && <span>Accion: {evento.accionTomada}</span>}
                    </div>
                  )}
                </div>
                <Mono muted>#{evento.id}</Mono>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
