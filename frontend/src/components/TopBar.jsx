import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { Icon } from './shared'
import api from '../api/client'
import { can, canAny, getUserRole, hasRole } from '../utils/permissions'

const NAV_GROUPS = [
  { label: 'Ventas', items: [
    { label: 'Ventas', route: '/ventas', module: 'ventas' },
    { label: 'Matriz Ventas', route: '/matriz-ventas', module: 'ventas' },
    { label: 'Licitaciones', route: '/licitaciones', module: 'ventas' },
    { label: 'Reportes Licitaciones', route: '/reportes/licitaciones', module: 'ventas' },
    { label: 'CRM', route: '/crm', module: 'ventas' },
  ] },
  { label: 'Bodega', items: [
    { label: 'Inventario', route: '/bodega', module: 'catalogo' },
    { label: 'Consulta Precios', route: '/consulta-precios', module: 'catalogo' },
    { label: 'Ingreso Mercaderia', route: '/stock-ingresos', module: 'bodega', permission: 'write' },
    { label: 'Despachos', route: '/despachos', module: 'despacho' },
    { label: 'Proveedores', route: '/proveedores', module: 'catalogo' },
  ] },
  { label: 'Taller', items: [
    { label: 'ODTs', route: '/taller', module: 'taller' },
    { label: 'Pasar a Taller', route: '/pasar-taller', module: 'taller', permission: 'write' },
    { label: 'Bitacora', route: '/bitacora-taller', module: 'taller' },
    { label: 'Historial Materiales', route: '/historial-materiales', module: 'taller' },
  ] },
  { label: 'Caja', items: [
    { label: 'Movimientos', route: '/caja', module: 'caja' },
    { label: 'Cobranza', route: '/cobranza', module: 'cobranza' },
  ] },
  { label: 'Clientes', items: [
    { label: 'Clientes', route: '/clientes', module: 'clientes' },
  ] },
  { label: 'RRHH', items: [
    { label: 'Trabajadores', route: '/rrhh', module: 'rrhh' },
  ] },
  { label: 'Admin', items: [
    { label: 'Usuarios', route: '/usuarios', roles: ['admin'] },
    { label: 'Accesos', route: '/accesos', roles: ['admin'] },
    { label: 'Configuracion', route: '/config', roles: ['admin'] },
    { label: 'Descuentos', route: '/descuentos', requirements: [{ module: 'ventas', permission: 'write' }] },
    { label: 'Integridad', route: '/admin/integridad', roles: ['admin'] },
    { label: 'Auditoria', route: '/admin/auditoria', roles: ['admin'] },
  ] },
]

function canUseNavItem(user, item) {
  if (item.roles) return hasRole(user, item.roles)
  if (item.requirements) return canAny(user, item.requirements)
  return can(user, item.module, item.permission || 'read')
}

const DropdownGroup = ({ group, currentPath }) => {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const ref = useRef()
  const isActive = group.items.some(i => currentPath === i.route || currentPath.startsWith(i.route + '/'))

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6,
        color: isActive || open ? '#fff' : 'rgba(255,255,255,0.78)',
        fontSize: 13, fontWeight: isActive ? 600 : 400, cursor: 'pointer',
        background: open || isActive ? 'rgba(255,255,255,0.18)' : 'transparent', transition: 'background 0.15s',
      }}>
        {group.label}
        <span style={{ marginLeft: 1, opacity: 0.6, display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
          <Icon name="chevronDown" size={11} />
        </span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000, paddingTop: 6 }}>
          <div style={{
            background: '#fff', borderRadius: 10, minWidth: 180,
            boxShadow: '0 8px 32px oklch(0 0 0 / 0.15)', border: '1px solid var(--border)',
            overflow: 'hidden', animation: 'dropIn 0.15s ease',
          }}>
            {group.items.map((item, i) => (
              <button key={item.route} onClick={() => { navigate(item.route); setOpen(false) }} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 16px', fontSize: 13,
                fontWeight: item.route === currentPath ? 600 : 400,
                color: item.route === currentPath ? 'var(--green-700)' : 'var(--text-1)',
                background: item.route === currentPath ? 'var(--green-50)' : 'none',
                borderBottom: i < group.items.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
              }}
                onMouseEnter={e => item.route !== currentPath && (e.currentTarget.style.background = 'var(--green-50)')}
                onMouseLeave={e => item.route !== currentPath && (e.currentTarget.style.background = 'none')}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function useClock() {
  const fmt = () => {
    const now = new Date()
    return now.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
      + ', ' + now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  }
  const [clock, setClock] = useState(fmt)
  useEffect(() => {
    const id = setInterval(() => setClock(fmt()), 30000)
    return () => clearInterval(id)
  }, [])
  return clock
}

export function TopBar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userRef = useRef()
  const clock = useClock()
  const role = getUserRole(user)
  const visibleGroups = NAV_GROUPS
    .map(group => ({ ...group, items: group.items.filter(item => canUseNavItem(user, item)) }))
    .filter(group => group.items.length > 0)

  useEffect(() => {
    const handler = e => { if (userRef.current && !userRef.current.contains(e.target)) setUserMenuOpen(false) }
    if (userMenuOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch { /* logout locally even if the server cookie is already gone */ }
    logout()
    navigate('/login', { replace: true })
  }

  const initials = user?.nombre ? user.nombre.slice(0, 1).toUpperCase() : 'U'

  return (
    <header style={{ background: 'var(--green-900)', position: 'sticky', top: 0, zIndex: 100, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 52, padding: '0 20px', gap: 16 }}>
        <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--green-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>P</span>
          </div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: 0 }}>PLASTIMAR</span>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>ERP</span>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
          <button onClick={() => navigate('/')} style={{
            padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            color: location.pathname === '/' ? '#fff' : 'rgba(255,255,255,0.78)',
            fontWeight: location.pathname === '/' ? 600 : 400,
            background: location.pathname === '/' ? 'rgba(255,255,255,0.18)' : 'transparent',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => location.pathname !== '/' && (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={e => location.pathname !== '/' && (e.currentTarget.style.background = 'transparent')}
          >
            Dashboard
          </button>
          {visibleGroups.map(group => (
            <DropdownGroup key={group.label} group={group} currentPath={location.pathname} />
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: 0 }}>{clock}</span>
          <button aria-label="Notificaciones" style={{ color: 'rgba(255,255,255,0.78)', minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, position: 'relative' }}>
            <Icon name="bell" size={18} />
            <span style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)', border: '1.5px solid var(--green-900)' }} />
          </button>

          <div ref={userRef} style={{ position: 'relative' }}>
            <button onClick={() => setUserMenuOpen(o => !o)} style={{
              display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
              background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '4px 10px',
            }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--green-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{initials}</span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12 }}>{user?.nombre || 'Usuario'}</span>
              <Icon name="chevronDown" size={11} color="rgba(255,255,255,0.5)" />
            </button>

            {userMenuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 1000,
                background: '#fff', borderRadius: 10, minWidth: 200,
                boxShadow: '0 8px 32px oklch(0 0 0 / 0.15)', border: '1px solid var(--border)',
                overflow: 'hidden', animation: 'dropIn 0.15s ease',
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{user?.nombre || 'Usuario'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{role || 'Sin rol'}</div>
                </div>
                <button onClick={handleLogout} style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '10px 16px', fontSize: 13, color: 'var(--red)',
                  cursor: 'pointer', transition: 'background 0.1s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--red-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Icon name="logOut" size={14} color="var(--red)" />
                  Cerrar sesion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
