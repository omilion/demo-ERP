export function PageStub({ title, description, fase = 2 }) {
  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>{title}</h1>
        <p style={{ color: 'var(--text-3)', marginTop: 4, fontSize: 13 }}>{description}</p>
      </div>
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--border)', padding: '48px 32px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Módulo en construcción — Fase {fase}</p>
      </div>
    </div>
  )
}
