import { useEffect, useState } from 'react'
import { Badge, Btn, Icon, PageHeader } from '../../components/shared'
import { getPilotFeedbackCapture, usePilotFeedback, useUpdatePilotFeedback } from '../../api/pilotFeedback'

const STATUS_LABELS = { nuevo: 'Nuevo', clasificado: 'Clasificado', en_progreso: 'En progreso', validacion_usuario: 'Validación usuario', resuelto: 'Resuelto', descartado: 'Descartado' }
const CATEGORY_LABELS = { error_funcional: 'Error funcional', ux: 'Interfaz o uso', datos: 'Datos', permisos: 'Permisos', integracion: 'Integración', rendimiento: 'Rendimiento', capacitacion: 'Capacitación' }
const STATUS_TONES = { nuevo: 'red', clasificado: 'amber', en_progreso: 'blue', validacion_usuario: 'blue', resuelto: 'green', descartado: 'gray' }
const SEVERITY_TONES = { baja: 'gray', media: 'amber', alta: 'red', critica: 'red' }

export default function PilotFeedbackPage() {
  const [filters, setFilters] = useState({ status: '', module: '', severity: '', category: '', limit: 150 })
  const [selected, setSelected] = useState(null)
  const { data, isLoading, error } = usePilotFeedback(cleanFilters(filters))
  const items = data?.items || []
  const open = items.filter(item => !['resuelto', 'descartado'].includes(item.status))
  const blocking = open.filter(item => ['alta', 'critica'].includes(item.severity))
  const modules = [...new Set(items.map(item => item.module).filter(Boolean))].sort()

  return <main className="page page-wide">
    <PageHeader title="Feedback de Marcha Blanca" actions={<span style={{ fontSize: 12, color: 'var(--text-3)', alignSelf: 'center' }}>Evidencia privada · sólo administración</span>} />
    <p style={{ margin: '-6px 0 16px', color: 'var(--text-2)', fontSize: 13, maxWidth: 800 }}>Observaciones contextualizadas por rol, ruta y documento. Este tablero es de triage: clasifica, prioriza y deja la referencia de la solución antes de marcar un caso como resuelto.</p>

    <div style={metricsStyle}>
      <Metric label="Pendientes" value={open.length} icon="messageSquare" tone="var(--blue)" />
      <Metric label="Bloquean operación" value={blocking.length} icon="alertTriangle" tone="var(--red)" />
      <Metric label="Resueltos" value={items.filter(item => item.status === 'resuelto').length} icon="checkCircle" tone="var(--green-600)" />
      <Metric label="Total consultado" value={data?.total ?? 0} icon="clipboard" tone="var(--text-2)" />
    </div>

    <section style={filterStyle} aria-label="Filtros de feedback">
      <Filter label="Estado" value={filters.status} onChange={value => setFilters(v => ({ ...v, status: value }))} options={[['', 'Todos'], ...Object.entries(STATUS_LABELS)]} />
      <Filter label="Módulo" value={filters.module} onChange={value => setFilters(v => ({ ...v, module: value }))} options={[['', 'Todos'], ...modules.map(value => [value, value])]} />
      <Filter label="Impacto" value={filters.severity} onChange={value => setFilters(v => ({ ...v, severity: value }))} options={[['', 'Todos'], ['critica', 'Crítica'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']]} />
      <Filter label="Categoría" value={filters.category} onChange={value => setFilters(v => ({ ...v, category: value }))} options={[['', 'Todas'], ...Object.entries(CATEGORY_LABELS)]} />
    </section>

    {isLoading && <LoadState title="Cargando feedback" detail="Consultando reportes de marcha blanca…" />}
    {error && <LoadState title="No fue posible cargar los reportes" detail={error.response?.data?.error || error.message} error />}
    {!isLoading && !error && <section style={tableCardStyle}>
      {items.length === 0 ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}><Icon name="messageSquare" size={26} /><div style={{ marginTop: 10 }}>No hay reportes con estos filtros.</div></div> : <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr>{['Fecha', 'Estado', 'Impacto', 'Módulo / contexto', 'Reportado por', 'Observación', ''].map(label => <th key={label} style={thStyle}>{label}</th>)}</tr></thead>
          <tbody>{items.map(item => <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={tdStyle}>{new Date(item.createdAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td style={tdStyle}><Badge tone={STATUS_TONES[item.status] || 'gray'}>{STATUS_LABELS[item.status] || item.status}</Badge></td>
            <td style={tdStyle}><Badge tone={SEVERITY_TONES[item.severity] || 'gray'}>{item.severity}</Badge></td>
            <td style={{ ...tdStyle, maxWidth: 180 }}><strong>{item.module}</strong><br /><span style={{ color: 'var(--text-3)' }}>{item.route}</span></td>
            <td style={tdStyle}>{item.reporter?.nombre || item.reporterName || 'Usuario'}<br /><span style={{ color: 'var(--text-3)' }}>{item.reporterRole || '—'}</span></td>
            <td style={{ ...tdStyle, maxWidth: 350, whiteSpace: 'normal', lineHeight: 1.4 }}>{item.note}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}><Btn size="xs" variant="secondary" onClick={() => setSelected(item)}>Revisar</Btn></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>}
    {selected && <FeedbackDetail item={selected} onClose={() => setSelected(null)} />}
  </main>
}

function FeedbackDetail({ item, onClose }) {
  const update = useUpdatePilotFeedback()
  const [draft, setDraft] = useState({ status: item.status, priority: item.priority || 'normal', resolutionReference: item.resolutionReference || '', resolutionNote: item.resolutionNote || '' })
  const [captureUrl, setCaptureUrl] = useState(null)
  const [captureError, setCaptureError] = useState(null)

  useEffect(() => {
    if (!item.hasScreenshot) return undefined
    let currentUrl = null
    getPilotFeedbackCapture(item.id).then(blob => {
      currentUrl = URL.createObjectURL(blob)
      setCaptureUrl(currentUrl)
    }).catch(error => setCaptureError(error.response?.data?.error || 'No se pudo cargar la evidencia.'))
    return () => { if (currentUrl) URL.revokeObjectURL(currentUrl) }
  }, [item.id, item.hasScreenshot])

  const save = async event => {
    event.preventDefault()
    try {
      await update.mutateAsync({ id: item.id, ...draft })
      onClose()
    } catch { /* The visible error below preserves the detail modal for retry. */ }
  }

  const annotation = item.annotation
  return <div role="dialog" aria-modal="true" aria-labelledby="feedback-detail-title" onMouseDown={event => event.target === event.currentTarget && onClose()} style={detailOverlayStyle}>
    <section style={detailPanelStyle}>
      <header style={detailHeaderStyle}><div><h2 id="feedback-detail-title" style={{ margin: 0, fontSize: 18 }}>Detalle de observación</h2><p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>{item.id} · {new Date(item.createdAt).toLocaleString('es-CL')}</p></div><button type="button" onClick={onClose} aria-label="Cerrar detalle" style={closeStyle}><Icon name="x" size={18} /></button></header>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
        <div style={detailBodyStyle}>
          <div style={contextGridStyle}>
            <Info label="Origen" value={`${item.module}${item.submodule ? ` / ${item.submodule}` : ''}`} />
            <Info label="Rol" value={item.reporterRole || item.reporter?.role || '—'} />
            <Info label="Entidad" value={item.entityType && item.entityId ? `${item.entityType} #${item.entityId}` : 'Sin documento asociado'} />
            <Info label="Ruta" value={item.route} />
          </div>
          <div style={noteStyle}><strong>{CATEGORY_LABELS[item.category] || item.category}</strong><p style={{ margin: '7px 0 0', whiteSpace: 'pre-wrap' }}>{item.note}</p>{item.expected && <><span style={noteLabelStyle}>Esperaba que ocurriera</span><p style={{ margin: '5px 0 0', whiteSpace: 'pre-wrap' }}>{item.expected}</p></>}</div>
          {item.externalApi && <div style={apiFlagStyle}><Icon name="cloud" size={15} />Depende de integración externa</div>}
          {item.hasScreenshot && <div><span style={noteLabelStyle}>Evidencia privada</span>{captureError && <p style={{ color: 'var(--red)', fontSize: 12 }}>{captureError}</p>}<div style={captureWrapStyle}>{captureUrl ? <><img src={captureUrl} alt="Evidencia de la observación" style={{ width: '100%', display: 'block' }} />{annotation && <span style={{ position: 'absolute', left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%`, width: `${annotation.width * 100}%`, height: `${annotation.height * 100}%`, border: '2px solid #dc2626', pointerEvents: 'none' }} />}</> : !captureError && <span style={{ display: 'block', padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Cargando evidencia privada…</span>}</div></div>}
          <div style={fieldGridStyle}>
            <Field label="Estado"><select value={draft.status} onChange={e => setDraft(v => ({ ...v, status: e.target.value }))} style={inputStyle}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Prioridad"><select value={draft.priority} onChange={e => setDraft(v => ({ ...v, priority: e.target.value }))} style={inputStyle}>{[['baja', 'Baja'], ['normal', 'Normal'], ['alta', 'Alta'], ['urgente', 'Urgente']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          </div>
          <Field label="Referencia de solución"><input value={draft.resolutionReference} onChange={e => setDraft(v => ({ ...v, resolutionReference: e.target.value }))} placeholder="Commit, ticket, prueba o decisión gerencial" style={inputStyle} /></Field>
          <Field label="Nota de cierre"><textarea value={draft.resolutionNote} onChange={e => setDraft(v => ({ ...v, resolutionNote: e.target.value }))} placeholder="Qué se corrigió, qué debe validar el usuario o por qué se descartó." style={{ ...inputStyle, minHeight: 82, resize: 'vertical' }} /></Field>
          {update.isError && <div style={{ padding: '9px 10px', borderRadius: 7, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>{update.error.response?.data?.error || 'No se pudo guardar el triage.'}</div>}
        </div>
        <footer style={detailFooterStyle}><Btn variant="ghost" onClick={onClose}>Cerrar</Btn><Btn type="submit" icon="check" disabled={update.isPending}>{update.isPending ? 'Guardando…' : 'Guardar triage'}</Btn></footer>
      </form>
    </section>
  </div>
}

function cleanFilters(filters) { return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')) }
function Filter({ label, value, onChange, options }) { return <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>{label}<select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label> }
function Field({ label, children }) { return <label style={{ display: 'grid', gap: 5, color: 'var(--text-2)', fontSize: 12, fontWeight: 650 }}>{label}{children}</label> }
function Info({ label, value }) { return <div><span style={noteLabelStyle}>{label}</span><div style={{ marginTop: 3, wordBreak: 'break-word', color: 'var(--text-1)', fontSize: 12 }}>{value}</div></div> }
function Metric({ label, value, icon, tone }) { return <div style={metricStyle}><span style={{ color: tone }}><Icon name={icon} size={17} /></span><div><div style={{ fontSize: 20, fontWeight: 750, lineHeight: 1.1, color: 'var(--text-1)' }}>{value.toLocaleString('es-CL')}</div><div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 3 }}>{label}</div></div></div> }
function LoadState({ title, detail, error = false }) { return <div style={{ padding: 32, borderRadius: 10, background: error ? 'var(--red-bg)' : '#fff', border: '1px solid var(--border)', color: error ? 'var(--red)' : 'var(--text-2)' }}><strong style={{ display: 'block', marginBottom: 5 }}>{title}</strong><span style={{ fontSize: 12 }}>{detail}</span></div> }

const metricsStyle = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 14 }
const metricStyle = { minHeight: 68, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: '#fff' }
const filterStyle = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 10, padding: 12, borderRadius: 10, background: '#fff', border: '1px solid var(--border)', marginBottom: 14 }
const tableCardStyle = { overflow: 'hidden', background: '#fff', border: '1px solid var(--border)', borderRadius: 12 }
const thStyle = { padding: '9px 12px', textAlign: 'left', background: 'var(--bg)', color: 'var(--text-3)', fontSize: 10, letterSpacing: .35, textTransform: 'uppercase' }
const tdStyle = { padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }
const inputStyle = { boxSizing: 'border-box', width: '100%', padding: '8px 9px', border: '1px solid var(--border)', borderRadius: 7, background: '#fff', color: 'var(--text-1)', font: 'inherit', fontSize: 12 }
const detailOverlayStyle = { position: 'fixed', inset: 0, zIndex: 10002, display: 'flex', justifyContent: 'flex-end', background: 'rgba(15, 23, 42, .45)' }
const detailPanelStyle = { width: 680, maxWidth: '100%', minHeight: '100%', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '-14px 0 38px rgba(15,23,42,.20)' }
const detailHeaderStyle = { padding: '18px 20px', display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border)', background: 'var(--green-50)' }
const detailBodyStyle = { padding: 20, overflowY: 'auto', display: 'grid', alignContent: 'start', gap: 15 }
const detailFooterStyle = { padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }
const contextGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, padding: 13, borderRadius: 8, background: 'var(--bg)' }
const noteStyle = { padding: '13px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, lineHeight: 1.45, color: 'var(--text-1)' }
const noteLabelStyle = { display: 'block', color: 'var(--text-3)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: .35 }
const apiFlagStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 9px', width: 'fit-content', borderRadius: 6, background: 'var(--blue-bg)', color: 'var(--blue)', fontSize: 12, fontWeight: 600 }
const captureWrapStyle = { position: 'relative', marginTop: 6, overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)' }
const fieldGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }
const closeStyle = { padding: 5, color: 'var(--text-3)', cursor: 'pointer', borderRadius: 6, alignSelf: 'flex-start' }
