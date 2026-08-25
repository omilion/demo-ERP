import { useNavigate } from 'react-router-dom'
import { Btn } from '../shared'

export function FormPage({ title, onSave, saving, children, headerActions, footerActions, saveLabel = 'Guardar' }) {
  const navigate = useNavigate()
  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: -0.3 }}>{title}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {headerActions ? headerActions : (
            <>
              <Btn variant="ghost" onClick={() => navigate(-1)}>Cancelar</Btn>
              <Btn variant="primary" icon={saving ? 'refreshCw' : 'check'} onClick={onSave} disabled={saving}>
                {saving ? 'Guardando…' : saveLabel}
              </Btn>
            </>
          )}
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', padding: '28px 32px' }}>
        {children}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
        {footerActions ? footerActions : (
          <>
            <Btn variant="ghost" onClick={() => navigate(-1)}>Cancelar</Btn>
            <Btn variant="primary" icon={saving ? 'refreshCw' : 'check'} onClick={onSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Btn>
          </>
        )}
      </div>
    </main>
  )
}
