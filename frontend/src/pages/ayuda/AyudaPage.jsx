import { useMemo } from 'react'
import { useAuthStore } from '../../store/auth'
import { getUserRole } from '../../utils/permissions'
import { helpDocumentsForUser } from './helpDocuments'

export default function AyudaPage() {
  const user = useAuthStore(state => state.user)
  const documents = useMemo(() => helpDocumentsForUser(user), [user])
  const role = getUserRole(user)

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '26px 24px 48px' }}>
      <section style={{ padding: '24px 26px', borderRadius: 16, background: 'linear-gradient(135deg, #064e3b, #047857)', color: '#fff', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#a7f3d0' }}>SisGestión 3.0 · Marcha Blanca</div>
        <h1 style={{ margin: '6px 0 8px', color: '#fff', fontSize: 30 }}>Centro de ayuda</h1>
        <p style={{ margin: 0, maxWidth: 760, color: 'rgba(255,255,255,.82)', lineHeight: 1.6 }}>
          Aquí aparecen las guías correspondientes a tu función. Los manuales se abren en una pestaña nueva para que puedas consultarlos sin perder el trabajo actual.
        </p>
        <div style={{ marginTop: 14, display: 'inline-flex', padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.14)', fontSize: 12 }}>
          Rol activo: {role || 'sin rol'}
        </div>
      </section>

      <div style={{ margin: '22px 0 14px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <div><h2 style={{ margin: 0, fontSize: 20, color: 'var(--text-1)' }}>Documentación disponible</h2><p style={{ margin: '5px 0 0', color: 'var(--text-3)', fontSize: 13 }}>Versión MB-1.1 · revisada el 04-09-2026</p></div>
        <a href="/ayuda/" target="_blank" rel="noreferrer" style={{ color: 'var(--green-700)', fontSize: 13, fontWeight: 700 }}>Abrir índice completo ↗</a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {documents.map(document => (
          <a key={document.id} href={document.href} target="_blank" rel="noreferrer" style={{ display: 'block', padding: 18, minHeight: 150, borderRadius: 12, border: '1px solid var(--border)', borderTop: `4px solid ${document.tone}`, background: '#fff', color: 'inherit', textDecoration: 'none', boxShadow: 'var(--shadow-sm)' }}>
            <span style={{ display: 'inline-flex', padding: '3px 7px', borderRadius: 5, background: `${document.tone}14`, color: document.tone, fontSize: 11, fontWeight: 800 }}>{document.id}</span>
            <h3 style={{ margin: '12px 0 6px', fontSize: 16, color: 'var(--text-1)' }}>{document.title}</h3>
            <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5 }}>{document.description}</p>
            <div style={{ marginTop: 13, color: document.tone, fontSize: 12, fontWeight: 700 }}>Abrir manual ↗</div>
          </a>
        ))}
      </div>

      <section style={{ marginTop: 20, padding: '16px 18px', border: '1px solid #fecaca', borderRadius: 12, background: '#fef2f2' }}>
        <strong style={{ color: '#991b1b' }}>¿La pantalla no coincide con el manual?</strong>
        <p style={{ margin: '5px 0 0', color: '#7f1d1d', fontSize: 13 }}>No improvises ni repitas una operación que pueda duplicar stock, pagos o DTE. Usa “Reportar observación” e informa el identificador del caso.</p>
      </section>
    </div>
  )
}
