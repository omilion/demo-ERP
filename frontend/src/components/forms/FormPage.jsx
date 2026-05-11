import { useNavigate } from 'react-router-dom'
import { Btn } from '../shared'

export function FormPage({ title, subtitle, breadcrumb, onSave, saving, children }) {
  const navigate = useNavigate()
  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 12, color: 'var(--text-3)' }}>
        {breadcrumb.map((crumb, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span>›</span>}
            <span style={{ color: i === breadcrumb.length - 1 ? 'var(--text-1)' : 'var(--text-3)', fontWeight: i === breadcrumb.length - 1 ? 600 : 400 }}>{crumb}</span>
          </span>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: -0.3 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{subtitle}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={() => navigate(-1)}>Cancelar</Btn>
          <Btn variant="primary" icon={saving ? 'refreshCw' : 'check'} onClick={onSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Btn>
        </div>
      </div>

      {/* Form content */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', padding: '28px 32px' }}>
        {children}
      </div>

      {/* Footer actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={() => navigate(-1)}>Cancelar</Btn>
        <Btn variant="primary" icon={saving ? 'refreshCw' : 'check'} onClick={onSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Btn>
      </div>
    </main>
  )
}
