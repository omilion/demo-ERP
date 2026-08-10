import { useCallback, useState } from 'react'
import { Icon, Btn } from '../shared'

// ── FormPanel (slide-in from right) ──────────────────────────────────────────
export const FormPanel = ({ title, subtitle, onClose, onSave, saving, children, width = 520 }) => {
  const isMobile = window.innerWidth < 640
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'oklch(0 0 0 / 0.38)', animation: 'none' }} />
      <div style={{
        position: 'relative', zIndex: 1,
        width: isMobile ? '100%' : width, height: '100%',
        background: '#fff',
        boxShadow: '-8px 0 48px oklch(0 0 0 / 0.14)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideIn 0.22s ease',
      }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-1)', letterSpacing: -0.3 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, color: 'var(--text-3)', flexShrink: 0, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 22px' }}>
          {children}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0, background: 'oklch(0.985 0.004 155)' }}>
          <Btn variant="primary" icon={saving ? 'refreshCw' : 'check'} onClick={onSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        </div>
      </div>
    </div>
  )
}

// ── ViewPanel (read-only slide-in) ────────────────────────────────────────────
export const ViewPanel = ({ title, subtitle, onClose, onEdit, onDelete, onPrint, children }) => {
  const isMobile = window.innerWidth < 640
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'oklch(0 0 0 / 0.38)' }} />
      <div style={{
        position: 'relative', zIndex: 1,
        width: isMobile ? '100%' : 520, height: '100%',
        background: '#fff', boxShadow: '-8px 0 48px oklch(0 0 0 / 0.14)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideIn 0.22s ease',
      }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-1)', letterSpacing: -0.3 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, color: 'var(--text-3)' }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 22px' }}>{children}</div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0 }}>
          {onEdit && <Btn variant="primary" icon="edit" onClick={onEdit}>Editar</Btn>}
          <Btn variant="secondary" icon="printer" onClick={onPrint || (() => window.print())}>Imprimir</Btn>
          {onDelete && <Btn variant="ghost" icon="trash" onClick={onDelete} style={{ marginLeft: 'auto', color: 'var(--red)' }}>Eliminar</Btn>}
        </div>
      </div>
    </div>
  )
}

// ── FormField ─────────────────────────────────────────────────────────────────
export const FormField = ({ label, required, error, children, hint }) => (
  <div style={{ marginBottom: 18 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: error ? 'var(--red)' : 'var(--text-2)', marginBottom: 6, letterSpacing: 0.1 }}>
      {label}{required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
    </label>
    {children}
    {hint && !error && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{hint}</div>}
    {error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="alertTriangle" size={11} />{error}</div>}
  </div>
)

const inputBase = (error, extra = {}) => ({
  width: '100%', padding: '9px 12px', borderRadius: 8, fontFamily: 'inherit',
  border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
  fontSize: 13, color: 'var(--text-1)', background: '#fff', outline: 'none',
  transition: 'border-color 0.15s',
  ...extra,
})

export const Input = ({ value, onChange, placeholder, type = 'text', error, disabled, prefix, ...props }) => (
  <div style={{ position: 'relative' }}>
    {prefix && <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 13, pointerEvents: 'none' }}>{prefix}</span>}
    <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} {...props}
      style={{ ...inputBase(error, prefix ? { paddingLeft: 26 } : {}), opacity: disabled ? 0.6 : 1 }}
      onFocus={e => !error && (e.target.style.borderColor = 'var(--green-600)')}
      onBlur={e => !error && (e.target.style.borderColor = 'var(--border)')}
    />
  </div>
)

export const Select = ({ value, onChange, options, error, disabled, style, ...props }) => (
  <select value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled}
    style={{ ...inputBase(error), cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'calc(100% - 12px) center', paddingRight: 32, ...style }}
    onFocus={e => !error && (e.target.style.borderColor = 'var(--green-600)')}
    onBlur={e => !error && (e.target.style.borderColor = 'var(--border)')}
    {...props}
  >
    {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
)

export const Textarea = ({ value, onChange, placeholder, rows = 3, error }) => (
  <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{ ...inputBase(error), resize: 'vertical', lineHeight: 1.5 }}
    onFocus={e => !error && (e.target.style.borderColor = 'var(--green-600)')}
    onBlur={e => !error && (e.target.style.borderColor = 'var(--border)')}
  />
)

export const FormDivider = ({ label }) => (
  <div style={{ margin: '4px 0 16px', paddingBottom: 9, borderBottom: '1px solid var(--border)' }}>
    <div style={{ fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0, color: 'var(--text-1)', lineHeight: 1.2 }}>{label}</div>
  </div>
)

export const FormSection = ({ title, children, tone = 'default' }) => {
  const tones = {
    default: 'oklch(0.985 0.003 240)',
    inventory: 'oklch(0.98 0.004 155)',
    price: 'oklch(0.982 0.004 75)',
  }
  return (
    <section style={{
      margin: '18px 0',
      padding: '18px 20px 2px',
      border: '1px solid var(--border)',
      borderRadius: 10,
      background: tones[tone] || tones.default,
    }}>
      <FormDivider label={title} />
      {children}
    </section>
  )
}

export const DetailRow = ({ label, value, mono }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{label}</span>
    <span style={{ fontSize: 13, color: 'var(--text-1)', fontFamily: mono ? "'DM Mono', monospace" : 'inherit', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
  </div>
)

// ── useForm ───────────────────────────────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export const useForm = (initial) => {
  const [data, setData] = useState(initial)
  const [errors, setErrors] = useState({})
  const set = useCallback((key, val) => { setData(d => ({ ...d, [key]: val })); setErrors(e => ({ ...e, [key]: '' })) }, [])
  const validate = useCallback((rules) => {
    const errs = {}
    for (const [k, r] of Object.entries(rules)) {
      if (r.required && !data[k]) errs[k] = 'Campo requerido'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }, [data])
  return { data, set, errors, validate }
}

// ── useSave ───────────────────────────────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export const useSave = (onDone) => {
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const save = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 700))
    setSaving(false)
    setDone(true)
    setTimeout(() => { setDone(false); onDone && onDone() }, 400)
  }
  return { saving, done, save }
}
