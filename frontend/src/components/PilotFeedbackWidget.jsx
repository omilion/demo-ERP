import { useEffect, useMemo, useRef, useState } from 'react'
import domtoimage from 'dom-to-image-more'
import { useLocation } from 'react-router-dom'
import { Btn, Icon } from './shared'
import { usePilotFeedbackConfig, useCreatePilotFeedback } from '../api/pilotFeedback'
import { useNotifStore } from '../store/notif'

const FEEDBACK_TYPES = [
  ['falla', 'Falla', 'Algo no funciona como debería.', 'alertTriangle'],
  ['falta', 'Falta', 'Hace falta un campo, control o acción.', 'plus'],
  ['mejora', 'Mejora', 'Funciona, pero se podría hacer mejor.', 'trendingUp'],
]
const SEVERITIES = [['bloqueante', 'Bloqueante'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']]
const REPRODUCIBILITIES = [['siempre', 'Siempre'], ['a_veces', 'A veces'], ['una_vez', 'Una vez']]

function emptyForm() {
  return {
    category: '', severity: 'media', esReproducible: 'siempre', note: '', comportamientoEsperado: '',
    queFalta: '', paraQueSeNecesita: '', bloqueaFlujo: false,
    queExisteHoy: '', queSePropone: '', impactoEsperado: '', externalApi: false,
  }
}

// Modulos que en este sistema dependen de una API externa real (no solo
// mencionan el termino): facturacion llama al SII y manda correo via mailer.js;
// licitaciones/CRM opera sobre el canal Mercado Publico. Es una pre-marca, no
// una verdad absoluta -- el usuario puede corregirla si el mapeo no aplica.
const EXTERNAL_API_MODULES = new Set(['facturacion', 'licitaciones'])

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
  const resolvedModule = moduleMap[moduleName] || moduleName
  return {
    module: resolvedModule,
    submodule,
    route: `${path}${location.search || ''}`,
    entityType: id ? moduleName.replace(/s$/, '') : null,
    entityId: id,
    likelyExternalApi: EXTERNAL_API_MODULES.has(resolvedModule) || EXTERNAL_API_MODULES.has(moduleName),
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
  const [drag, setDrag] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const typeSelectorRef = useRef(null)
  const context = useMemo(() => contextFromLocation(location), [location])
  const enabled = config?.enabled === true

  const close = () => {
    if (createFeedback.isPending) return
    setOpen(false)
    setScreenshot(null)
    setAnnotation(null)
    setMarking(false)
    setDrag(null)
    setForm(emptyForm())
  }

  const begin = async () => {
    if (capturing || createFeedback.isPending) return
    setCapturing(true)
    setForm({ ...emptyForm(), externalApi: context.likelyExternalApi })
    try {
      const capture = await captureEvidence()
      setScreenshot(capture)
      setOpen(true)
      setTimeout(() => typeSelectorRef.current?.focus(), 50)
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
    const specific = form.category === 'falla'
      ? { severity: form.severity, esReproducible: form.esReproducible, comportamientoEsperado: form.comportamientoEsperado || null }
      : form.category === 'falta'
        ? { queFalta: form.queFalta, paraQueSeNecesita: form.paraQueSeNecesita || null, bloqueaFlujo: form.bloqueaFlujo }
        : { queExisteHoy: form.queExisteHoy || null, queSePropone: form.queSePropone, impactoEsperado: form.impactoEsperado || null }
    try {
      await createFeedback.mutateAsync({
        ...context,
        category: form.category,
        note: form.note,
        externalApi: form.externalApi,
        ...specific,
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

  // Arrastrar dibuja el rectangulo real en vez de plantar un cuadro de tamano
  // fijo donde se hizo clic; un clic sin arrastre (o Enter por teclado) cae al
  // recuadro por defecto de antes, centrado en ese punto.
  const relativePoint = (event, rect) => ({
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  })
  const rectFromPoints = (a, b) => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  })

  const startMark = event => {
    if (!marking) return
    const rect = event.currentTarget.getBoundingClientRect()
    setDrag({ rect, start: relativePoint(event, rect) })
  }
  const moveMark = event => {
    if (!marking || !drag) return
    setAnnotation(rectFromPoints(drag.start, relativePoint(event, drag.rect)))
  }
  const endMark = event => {
    if (!marking || !drag) return
    const point = relativePoint(event, drag.rect)
    const dragged = rectFromPoints(drag.start, point)
    setAnnotation(dragged.width > 0.02 || dragged.height > 0.02
      ? dragged
      : { x: Math.max(0, point.x - 0.09), y: Math.max(0, point.y - 0.06), width: 0.18, height: 0.12 })
    setDrag(null)
    setMarking(false)
  }
  const markByKeyboard = event => {
    if (event.key !== 'Enter' || !marking) return
    setAnnotation({ x: 0.41, y: 0.44, width: 0.18, height: 0.12 })
    setMarking(false)
  }
  const clearAnnotation = () => setAnnotation(null)

  if (!enabled) return null

  const validSpecific = form.category === 'falla'
    || (form.category === 'falta' && form.queFalta.trim().length > 0)
    || (form.category === 'mejora' && form.queSePropone.trim().length > 0)
  const submitDisabled = createFeedback.isPending || !form.category || form.note.trim().length < 5 || !validSpecific

  return <>
    <button
      type="button"
      data-feedback-ignore
      onClick={begin}
      disabled={capturing}
      aria-label="Reportar observación de marcha blanca"
      title="Reportar observación (Alt + Shift + F)"
      style={{ position: 'fixed', left: 20, bottom: 20, zIndex: 9998, minHeight: 46, display: 'inline-flex', alignItems: 'center', gap: 9, padding: '0 16px', borderRadius: 10, color: '#fff', background: capturing ? '#b91c1c' : '#dc2626', boxShadow: '0 10px 25px rgba(153, 27, 27, 0.32)', fontWeight: 700, fontSize: 12, cursor: capturing ? 'wait' : 'pointer' }}>
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
            <div>
              <div style={choiceLabelStyle}>1. ¿Qué quieres reportar?</div>
              <div role="radiogroup" aria-label="Tipo de feedback" style={typeSelectorStyle}>
                {FEEDBACK_TYPES.map(([value, label, description, icon], index) => <button key={value} ref={index === 0 ? typeSelectorRef : undefined} type="button" role="radio" aria-checked={form.category === value} onClick={() => setForm(v => ({ ...v, category: value }))} style={{ ...typeButtonStyle, ...(form.category === value ? selectedTypeButtonStyle : {}) }}>
                  <Icon name={icon} size={16} />
                  <span><strong style={{ display: 'block' }}>{label}</strong><small style={{ display: 'block', marginTop: 2, fontWeight: 500, lineHeight: 1.25 }}>{description}</small></span>
                </button>)}
              </div>
            </div>
            {!form.category && <div style={typeHintStyle}>Selecciona un tipo para mostrar los campos correspondientes.</div>}
            {form.category === 'falla' && <>
              <div style={fieldGridStyle}>
                <Field label="Severidad" required><select value={form.severity} onChange={e => setForm(v => ({ ...v, severity: e.target.value }))} style={inputStyle}>{SEVERITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="¿Se puede reproducir?" required><select value={form.esReproducible} onChange={e => setForm(v => ({ ...v, esReproducible: e.target.value }))} style={inputStyle}>{REPRODUCIBILITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              </div>
              <Field label="¿Qué esperabas que ocurriera?"><textarea value={form.comportamientoEsperado} onChange={e => setForm(v => ({ ...v, comportamientoEsperado: e.target.value }))} placeholder="Opcional: resultado esperado." style={{ ...inputStyle, minHeight: 58, resize: 'vertical', lineHeight: 1.4 }} /></Field>
              <Field label="¿Qué ocurre actualmente?" required><textarea required minLength={5} value={form.note} onChange={e => setForm(v => ({ ...v, note: e.target.value }))} placeholder="Describe la acción, el resultado actual y dónde se produjo." style={{ ...inputStyle, minHeight: 94, resize: 'vertical', lineHeight: 1.45 }} /></Field>
            </>}
            {form.category === 'falta' && <>
              <Field label="¿Qué falta?" required><input required value={form.queFalta} onChange={e => setForm(v => ({ ...v, queFalta: e.target.value }))} placeholder="Ej.: Campo RUT en formulario de cliente" style={inputStyle} /></Field>
              <Field label="¿Para qué se necesita?"><textarea value={form.paraQueSeNecesita} onChange={e => setForm(v => ({ ...v, paraQueSeNecesita: e.target.value }))} placeholder="Opcional: flujo o caso de uso." style={{ ...inputStyle, minHeight: 58, resize: 'vertical', lineHeight: 1.4 }} /></Field>
              <label style={checkboxStyle}><input type="checkbox" checked={form.bloqueaFlujo} onChange={e => setForm(v => ({ ...v, bloqueaFlujo: e.target.checked }))} style={{ marginTop: 2 }} />Esto bloquea el flujo de trabajo.</label>
              <Field label="Detalle del caso" required><textarea required minLength={5} value={form.note} onChange={e => setForm(v => ({ ...v, note: e.target.value }))} placeholder="Explica dónde y cuándo se hizo evidente esta falta." style={{ ...inputStyle, minHeight: 82, resize: 'vertical', lineHeight: 1.45 }} /></Field>
            </>}
            {form.category === 'mejora' && <>
              <Field label="¿Qué existe hoy?"><textarea value={form.queExisteHoy} onChange={e => setForm(v => ({ ...v, queExisteHoy: e.target.value }))} placeholder="Opcional: describe brevemente el comportamiento actual." style={{ ...inputStyle, minHeight: 58, resize: 'vertical', lineHeight: 1.4 }} /></Field>
              <Field label="¿Qué propones?" required><textarea required value={form.queSePropone} onChange={e => setForm(v => ({ ...v, queSePropone: e.target.value }))} placeholder="Describe la mejora concreta." style={{ ...inputStyle, minHeight: 72, resize: 'vertical', lineHeight: 1.45 }} /></Field>
              <Field label="Impacto esperado"><textarea value={form.impactoEsperado} onChange={e => setForm(v => ({ ...v, impactoEsperado: e.target.value }))} placeholder="Opcional: menos clics, menos tiempo o menos confusión." style={{ ...inputStyle, minHeight: 58, resize: 'vertical', lineHeight: 1.4 }} /></Field>
              <Field label="Detalle adicional" required><textarea required minLength={5} value={form.note} onChange={e => setForm(v => ({ ...v, note: e.target.value }))} placeholder="Agrega contexto, ejemplo o usuario afectado." style={{ ...inputStyle, minHeight: 82, resize: 'vertical', lineHeight: 1.45 }} /></Field>
            </>}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 10px', background: 'var(--bg)', borderRadius: 8, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.externalApi} onChange={e => setForm(v => ({ ...v, externalApi: e.target.checked }))} style={{ marginTop: 2 }} />
              <span>Este caso depende de una integración externa (SII, Mercado Público, correo u otra API).
                {context.likelyExternalApi && <> <em style={{ fontStyle: 'normal', color: 'var(--text-3)' }}>Pre-marcado porque estás en {context.module}; desmarca si no aplica.</em></>}
              </span>
            </label>
            {screenshot && <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 7px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>Evidencia capturada</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {annotation && !marking && <Btn size="xs" variant="ghost" onClick={clearAnnotation}>Quitar marca</Btn>}
                  <Btn size="xs" variant={marking ? 'primary' : 'secondary'} onClick={() => setMarking(v => !v)}>{marking ? 'Arrastra sobre el área' : annotation ? 'Cambiar marca' : 'Marcar área'}</Btn>
                </div>
              </div>
              <div
                onMouseDown={startMark} onMouseMove={moveMark} onMouseUp={endMark} onMouseLeave={event => drag && endMark(event)}
                role="button" tabIndex={0} onKeyDown={markByKeyboard}
                aria-label="Captura de evidencia; arrastra para marcar el área relevante"
                style={{ position: 'relative', border: marking ? '2px solid var(--green-600)' : '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', cursor: marking ? 'crosshair' : 'default', maxHeight: 210, background: '#eef2f0', userSelect: 'none' }}>
                <img src={screenshot} alt="Captura con campos de entrada enmascarados" draggable={false} style={{ width: '100%', display: 'block', maxHeight: 208, objectFit: 'contain' }} />
                {annotation && <span aria-label="Área marcada" style={{ position: 'absolute', left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%`, width: `${annotation.width * 100}%`, height: `${annotation.height * 100}%`, border: '2px solid #dc2626', background: 'rgba(220,38,38,0.08)', pointerEvents: 'none' }} />}
              </div>
            </div>}
            <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, margin: '12px 0 0' }}>Los campos de entrada se ocultan en la captura. No incluyas claves, tokens ni datos sensibles en la descripción.</p>
          </div>
          <footer style={footerStyle}>
            <Btn variant="ghost" onClick={close}>Cancelar</Btn>
            <Btn type="submit" icon="send" disabled={submitDisabled}>{createFeedback.isPending ? 'Enviando…' : 'Enviar reporte'}</Btn>
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
const choiceLabelStyle = { marginBottom: 7, fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }
const typeSelectorStyle = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }
const typeButtonStyle = { display: 'flex', textAlign: 'left', gap: 8, alignItems: 'flex-start', minHeight: 70, padding: '10px 9px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', color: 'var(--text-2)', cursor: 'pointer', font: 'inherit', fontSize: 12 }
const selectedTypeButtonStyle = { borderColor: 'var(--green-600)', background: 'var(--green-50)', color: 'var(--green-900)', boxShadow: '0 0 0 1px var(--green-600)' }
const typeHintStyle = { padding: '9px 10px', borderRadius: 8, background: 'var(--bg)', color: 'var(--text-3)', fontSize: 12 }
const checkboxStyle = { display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 10px', background: 'var(--bg)', borderRadius: 8, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }
