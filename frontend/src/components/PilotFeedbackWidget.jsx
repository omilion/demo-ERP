import { useEffect, useMemo, useRef, useState } from 'react'
import domtoimage from 'dom-to-image-more'
import { useLocation } from 'react-router-dom'
import { Btn, Icon } from './shared'
import { usePilotFeedbackConfig, useCreatePilotFeedback } from '../api/pilotFeedback'
import { useNotifStore } from '../store/notif'

const CATEGORIES = [
  ['error_funcional', 'Error funcional'],
  ['ux', 'Interfaz o uso'],
  ['datos', 'Datos o información'],
  ['permisos', 'Permisos o acceso'],
  ['integracion', 'Integración externa'],
  ['rendimiento', 'Lentitud o carga'],
  ['capacitacion', 'Duda de operación'],
]
const SEVERITIES = [['baja', 'No bloquea'], ['media', 'Dificulta'], ['alta', 'Bloquea tarea'], ['critica', 'Riesgo operativo']]

function contextFromLocation(location) {
  const path = location.pathname || '/'
  const [moduleName = 'general', submodule = null] = path.split('/').filter(Boolean)
  const segments = path.split('/').filter(Boolean)
  const id = segments.find(value => /^\d+$/.test(value)) || null
  const moduleMap = {
    ventas: 'ventas', bodega: 'bodega', despachos: 'despacho', taller: 'taller', 'taller-corte': 'taller',
    caja: 'caja', cobranza: 'cobranza', facturacion: 'facturacion', crm: 'ventas', licitaciones: 'licitaciones',
    proveedores: 'proveedores', usuarios: 'admin', accesos: 'admin', config: 'admin', admin: 'admin', reportes: 'reportes',
  }
  return {
    module: moduleMap[moduleName] || moduleName,
    submodule,
    route: `${path}${location.search || ''}`,
    entityType: id ? moduleName.replace(/s$/, '') : null,
    entityId: id,
  }
}

function redactClone(clone) {
  clone.querySelectorAll('[data-feedback-ignore]').forEach(node => { node.style.visibility = 'hidden' })
  clone.querySelectorAll('[data-feedback-redact], input:not([type="checkbox"]):not([type="radio"]), textarea').forEach(node => {
    node.value = ''
    node.textContent = ''
    node.style.setProperty('color', 'transparent', 'important')
    node.style.setProperty('text-shadow', '0 0 8px rgba(15, 23, 42, 0.55)', 'important')
    node.style.setProperty('background-color', '#e5e7eb', 'important')
  })
}

async function captureEvidence() {
  // Se captura la superficie operativa, no el shell completo. Así se evita
  // escalar una página larga a una miniatura y la evidencia sigue legible.
  const target = document.querySelector('main > main') || document.querySelector('main') || document.body
  return domtoimage.toJpeg(target, {
    quality: 0.68,
    width: target.clientWidth,
    height: Math.min(target.scrollHeight, window.innerHeight),
    // No toca ni desplaza la interfaz real; la página puede seguir usándose
    // mientras se prepara el formulario de reporte.
    style: {
      width: `${target.clientWidth}px`, height: `${target.scrollHeight}px`, overflow: 'hidden',
    },
    filter: node => !(node instanceof Element && node.dataset?.feedbackIgnore !== undefined),
    onclone: redactClone,
    preserveScroll: true,
  })
}

export function PilotFeedbackWidget() {
  const location = useLocation()
  const { data: config } = usePilotFeedbackConfig()
  const createFeedback = useCreatePilotFeedback()
  const notify = useNotifStore(s => s.add)
  const [open, setOpen] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [screenshot, setScreenshot] = useState(null)
  const [annotation, setAnnotation] = useState(null)
  const [marking, setMarking] = useState(false)
  const [form, setForm] = useState({ category: 'error_funcional', severity: 'media', note: '', expected: '', externalApi: false })
  const noteRef = useRef(null)
  const context = useMemo(() => contextFromLocation(location), [location])
  const enabled = config?.enabled === true

  const close = () => {
    if (createFeedback.isPending) return
    setOpen(false)
    setScreenshot(null)
    setAnnotation(null)
    setMarking(false)
    setForm({ category: 'error_funcional', severity: 'media', note: '', expected: '', externalApi: false })
  }

  const begin = async () => {
    if (capturing || createFeedback.isPending) return
    setCapturing(true)
    try {
      const capture = await captureEvidence()
      setScreenshot(capture)
      setOpen(true)
      setTimeout(() => noteRef.current?.focus(), 50)
    } catch {
      setScreenshot(null)
      setOpen(true)
      notify({ type: 'warning', message: 'No se pudo capturar la pantalla. Puedes enviar el reporte sin imagen.' })
    } finally {
      setCapturing(false)
    }
  }

  useEffect(() => {
    const keydown = event => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'f' && enabled) {
        event.preventDefault()
        begin()
      }
      if (event.key === 'Escape' && open) close()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  // begin intentionally only reacts to the stable enabled/open state through user interaction.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, open])

  const submit = async event => {
    event.preventDefault()
    try {
      await createFeedback.mutateAsync({
        ...context,
        ...form,
        screenshot,
        annotation,
        browser: navigator.userAgent.slice(0, 300),
        viewport: `${window.innerWidth}×${window.innerHeight}`,
        appVersion: import.meta.env.VITE_APP_VERSION || 'local',
      })
      notify({ type: 'success', message: 'Reporte enviado. Administración podrá revisarlo con el contexto de esta pantalla.' })
      close()
    } catch (error) {
      notify({ type: 'error', message: error.response?.data?.error || 'No fue posible enviar el reporte. Intenta nuevamente.' })
    }
  }

  const mark = event => {
    if (!marking) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    setAnnotation({ x: Math.max(0, x - 0.09), y: Math.max(0, y - 0.06), width: 0.18, height: 0.12 })
    setMarking(false)
  }

  if (!enabled) return null

  return <>
    <button
      type="button"
      data-feedback-ignore
      onClick={begin}
      disabled={capturing}
      aria-label="Reportar observación de marcha blanca"
      title="Reportar observación (Alt + Shift + F)"
      style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 9998, minHeight: 46, display: 'inline-flex', alignItems: 'center', gap: 9, padding: '0 16px', borderRadius: 10, color: '#fff', background: capturing ? 'var(--green-700)' : 'var(--green-900)', boxShadow: '0 10px 25px rgba(10, 70, 45, 0.26)', fontWeight: 700, fontSize: 12, cursor: capturing ? 'wait' : 'pointer' }}>
      <Icon name="messageSquare" size={17} />
      {capturing ? 'Capturando…' : 'Reportar observación'}
    </button>

    {open && <div data-feedback-ignore role="dialog" aria-modal="true" aria-labelledby="pilot-feedback-title" onMouseDown={event => event.target === event.currentTarget && close()} style={overlayStyle}>
      <section style={panelStyle}>
        <header style={headerStyle}>
          <div>
            <h2 id="pilot-feedback-title" style={{ margin: 0, fontSize: 18, letterSpacing: -0.25, color: 'var(--text-1)' }}>Reportar observación</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-3)', fontSize: 12 }}>Marcha blanca · {context.module} · {context.route}</p>
          </div>
          <button type="button" onClick={close} aria-label="Cerrar reporte" style={iconButtonStyle}><Icon name="x" size={18} /></button>
        </header>
        <form onSubmit={submit} style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={bodyStyle}>
            <div style={fieldGridStyle}>
              <Field label="Tipo de observación"><select value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))} style={inputStyle}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Impacto"><select value={form.severity} onChange={e => setForm(v => ({ ...v, severity: e.target.value }))} style={inputStyle}>{SEVERITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            </div>
            <Field label="¿Qué ocurrió?" required><textarea ref={noteRef} required minLength={5} value={form.note} onChange={e => setForm(v => ({ ...v, note: e.target.value }))} placeholder="Indica la acción, el resultado y dónde se produjo el problema." style={{ ...inputStyle, minHeight: 94, resize: 'vertical', lineHeight: 1.45 }} /></Field>
            <Field label="¿Qué esperabas que ocurriera?"><textarea value={form.expected} onChange={e => setForm(v => ({ ...v, expected: e.target.value }))} placeholder="Opcional, pero ayuda a reproducirlo." style={{ ...inputStyle, minHeight: 58, resize: 'vertical', lineHeight: 1.4 }} /></Field>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 10px', background: 'var(--bg)', borderRadius: 8, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.externalApi} onChange={e => setForm(v => ({ ...v, externalApi: e.target.checked }))} style={{ marginTop: 2 }} />
              Este caso depende de una integración externa (SII, Mercado Público, correo u otra API).
            </label>
            {screenshot && <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 7px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>Evidencia capturada</span>
                <Btn size="xs" variant={marking ? 'primary' : 'secondary'} onClick={() => setMarking(v => !v)}>{marking ? 'Haz clic en el área' : annotation ? 'Cambiar marca' : 'Marcar área'}</Btn>
              </div>
              <div onClick={mark} role="button" tabIndex={0} onKeyDown={event => event.key === 'Enter' && mark(event)} aria-label="Captura de evidencia; marca el área relevante" style={{ position: 'relative', border: marking ? '2px solid var(--green-600)' : '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', cursor: marking ? 'crosshair' : 'default', maxHeight: 210, background: '#eef2f0' }}>
                <img src={screenshot} alt="Captura con campos de entrada enmascarados" style={{ width: '100%', display: 'block', maxHeight: 208, objectFit: 'contain' }} />
                {annotation && <span aria-label="Área marcada" style={{ position: 'absolute', left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%`, width: `${annotation.width * 100}%`, height: `${annotation.height * 100}%`, border: '2px solid #dc2626', background: 'rgba(220,38,38,0.08)', pointerEvents: 'none' }} />}
              </div>
            </div>}
            <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, margin: '12px 0 0' }}>Los campos de entrada se ocultan en la captura. No incluyas claves, tokens ni datos sensibles en la descripción.</p>
          </div>
          <footer style={footerStyle}>
            <Btn variant="ghost" onClick={close}>Cancelar</Btn>
            <Btn type="submit" icon="send" disabled={createFeedback.isPending || form.note.trim().length < 5}>{createFeedback.isPending ? 'Enviando…' : 'Enviar reporte'}</Btn>
          </footer>
        </form>
      </section>
    </div>}
  </>
}

function Field({ label, required, children }) {
  return <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 650, color: 'var(--text-2)' }}>{label}{required ? ' *' : ''}{children}</label>
}

const overlayStyle = { position: 'fixed', inset: 0, zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15, 23, 42, 0.48)', backdropFilter: 'blur(3px)' }
const panelStyle = { width: 680, maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', borderRadius: 14, boxShadow: '0 24px 56px rgba(15,23,42,.30)' }
const headerStyle = { padding: '17px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, background: 'var(--green-50)' }
const bodyStyle = { padding: '16px 20px', overflowY: 'auto', display: 'grid', gap: 13 }
const footerStyle = { padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#fff' }
const fieldGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }
const inputStyle = { boxSizing: 'border-box', width: '100%', border: '1px solid var(--border)', borderRadius: 7, background: '#fff', color: 'var(--text-1)', padding: '8px 10px', outline: 'none', font: 'inherit', fontSize: 13 }
const iconButtonStyle = { padding: 5, cursor: 'pointer', color: 'var(--text-3)', borderRadius: 6, display: 'inline-flex', alignItems: 'center' }
