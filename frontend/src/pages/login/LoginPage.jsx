import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'
import api from '../../api/client'
import plastimarLogo from '../../assets/plastimar-logo.webp'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      login(data.user, data.accessToken)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Email o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.brand}>
          <img src={plastimarLogo} alt="Plastimar Sisgestion 3.0" style={s.logo} />
          <div style={s.title}>Ingreso al ERP</div>
          <div style={s.subtitle}>Acceso seguro para operaciones Plastimar</div>
        </div>
        <form onSubmit={handleSubmit} style={s.form}>
          <label style={s.label}>
            Correo electronico
            <input style={s.input} type="email" autoComplete="email" value={email}
              onChange={e => setEmail(e.target.value)} required autoFocus aria-invalid={!!error} />
          </label>
          <label style={s.label}>
            Contrasena
            <input style={s.input} type="password" autoComplete="current-password" value={password}
              onChange={e => setPassword(e.target.value)} required aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined} />
            {error && <span id="login-error" role="alert" style={s.error}>{error}</span>}
          </label>
          <button aria-busy={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}

const s = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'var(--bg)',
  },
  card: {
    width: 'min(100%, 390px)',
    background: 'var(--green-800)',
    border: '1px solid oklch(0.42 0.11 150)',
    borderRadius: 8,
    padding: '34px 32px 30px',
    boxShadow: '0 18px 42px oklch(0 0 0 / 0.18), 0 4px 12px oklch(0 0 0 / 0.10)',
  },
  brand: { textAlign: 'center', marginBottom: 26 },
  logo: { width: 260, maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto 18px' },
  title: { color: '#fff', fontSize: 20, lineHeight: 1.15, fontWeight: 700, marginBottom: 6 },
  subtitle: { color: 'oklch(0.86 0.04 150)', fontSize: 12, lineHeight: 1.35 },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: 'oklch(0.92 0.035 150)',
  },
  input: {
    padding: '12px 13px',
    borderRadius: 7,
    border: '1px solid oklch(0.80 0.025 150)',
    background: '#fff',
    fontSize: 14,
    minHeight: 46,
    fontFamily: 'inherit',
    color: 'var(--text-1)',
    boxShadow: '0 1px 0 oklch(0 0 0 / 0.04)',
  },
  error: {
    display: 'block',
    fontSize: 12,
    color: '#fff',
    background: 'oklch(0.50 0.18 25)',
    borderRadius: 6,
    padding: '7px 9px',
    marginTop: 4,
  },
  btn: {
    padding: '12px 0',
    minHeight: 46,
    background: '#fff',
    color: 'var(--green-800)',
    borderRadius: 7,
    fontWeight: 800,
    fontSize: 14,
    cursor: 'pointer',
    border: '1px solid oklch(0.88 0.025 150)',
    marginTop: 4,
    boxShadow: '0 1px 0 oklch(0 0 0 / 0.06)',
  },
}
