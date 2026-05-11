import { useAuthStore } from '../../store/auth'

export default function DashboardPage() {
  const { user } = useAuthStore()
  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Bienvenido, {user?.nombre}</h1>
        <p style={{ color: 'var(--text-3)', marginTop: 4 }}>Rol activo: <strong style={{ color: 'var(--green-700)' }}>{user?.role}</strong></p>
      </div>
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--border)', padding: '48px 32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
        KPIs en tiempo real — Fase 5
      </div>
    </div>
  )
}
