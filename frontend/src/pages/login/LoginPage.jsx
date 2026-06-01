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
        </div>
        <form onSubmit={handleSubmit} style={s.form}>
          <label style={s.label}>
            Email
            <input style={s.input} type="email" autoComplete="email" value={email}
              onChange={e => setEmail(e.target.value)} required autoFocus aria-invalid={!!error} />
          </label>
          <label style={s.label}>
            Contraseña
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
  wrap:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--green-900)' },
  card:  { width: 360, background: '#fff', borderRadius: 14, padding: 40, boxShadow: 'var(--shadow-md)' },
  brand: { textAlign: 'center', marginBottom: 32 },
  logo:  { width: 230, maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' },
  form:  { display: 'flex', flexDirection: 'column', gap: 14 },
  label: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 500, color: 'var(--text-2)' },
  input: { padding: '11px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, minHeight: 44, fontFamily: 'inherit', color: 'var(--text-1)' },
  error: { display: 'block', fontSize: 12, color: 'var(--red)', marginTop: 4 },
  btn:   { padding: '12px 0', minHeight: 44, background: 'var(--green-700)', color: '#fff', borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: 'pointer', border: 'none', marginTop: 4 },
}
