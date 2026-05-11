import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

const NAV = [
  { to: '/dashboard',    label: 'Inicio',        roles: ['admin','vendedor','bodeguero','cajero','taller','rrhh','solo_lectura'] },
  { to: '/ventas',       label: 'Ventas',         roles: ['admin','vendedor'] },
  { to: '/licitaciones', label: 'Licitaciones',   roles: ['admin','vendedor'] },
  { to: '/clientes',     label: 'Clientes',       roles: ['admin','vendedor'] },
  { to: '/bodega',       label: 'Bodega',         roles: ['admin','bodeguero'] },
  { to: '/taller',       label: 'Taller',         roles: ['admin','taller'] },
  { to: '/caja',         label: 'Caja',           roles: ['admin','cajero'] },
  { to: '/cobranza',     label: 'Cobranza',       roles: ['admin','cajero'] },
]

export default function Sidebar() {
  const { user } = useAuthStore()
  const visible = NAV.filter(n => n.roles.includes(user?.role))

  return (
    <aside style={s.aside}>
      <div style={s.brand}>
        <div style={s.brandMark}>P</div>
        <div>
          <strong style={s.brandName}>Plastimar</strong>
          <small style={s.brandSub}>Sisgestion 3.0</small>
        </div>
      </div>
      <nav style={s.nav}>
        {visible.map(n => (
          <NavLink key={n.to} to={n.to}
            style={({ isActive }) => ({ ...s.link, ...(isActive ? s.active : {}) })}>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div style={s.foot}>
        <div style={s.avatar}>{user?.nombre?.[0]?.toUpperCase()}</div>
        <div>
          <div style={s.footName}>{user?.nombre}</div>
          <div style={s.footRole}>{user?.role}</div>
        </div>
      </div>
    </aside>
  )
}

const s = {
  aside:     { width: 220, minHeight: '100vh', background: 'var(--green-900)', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  brand:     { padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid oklch(1 0 0 / 0.08)' },
  brandMark: { width: 34, height: 34, borderRadius: 9, background: 'oklch(1 0 0 / 0.12)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 },
  brandName: { display: 'block', color: '#fff', fontSize: 13, fontWeight: 700 },
  brandSub:  { display: 'block', color: 'oklch(1 0 0 / 0.45)', fontSize: 10, marginTop: 1 },
  nav:       { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1 },
  link:      { display: 'block', padding: '8px 10px', borderRadius: 7, color: 'oklch(1 0 0 / 0.6)', fontSize: 13, fontWeight: 500 },
  active:    { background: 'oklch(1 0 0 / 0.1)', color: '#fff' },
  foot:      { padding: 14, borderTop: '1px solid oklch(1 0 0 / 0.08)', display: 'flex', alignItems: 'center', gap: 10 },
  avatar:    { width: 30, height: 30, borderRadius: '50%', background: 'oklch(1 0 0 / 0.12)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  footName:  { color: '#fff', fontSize: 12, fontWeight: 500 },
  footRole:  { color: 'oklch(1 0 0 / 0.45)', fontSize: 10, marginTop: 1 },
}
