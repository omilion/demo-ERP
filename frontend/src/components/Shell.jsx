import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuthStore } from '../store/auth'
import api from '../api/client'

export function Shell() {
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  async function handleLogout() {
    await api.post('/auth/logout').catch(() => {})
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div style={s.root}>
      <Sidebar />
      <div style={s.body}>
        <header style={s.header}>
          <div style={{ flex: 1 }} />
          <button onClick={handleLogout} style={s.logoutBtn}>Cerrar sesión</button>
        </header>
        <main style={s.main}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

const s = {
  root:      { display: 'flex', minHeight: '100vh' },
  body:      { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  header:    { height: 52, background: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', flexShrink: 0 },
  logoutBtn: { fontSize: 12, color: 'var(--text-3)', padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' },
  main:      { flex: 1, padding: 24, overflow: 'auto' },
}
