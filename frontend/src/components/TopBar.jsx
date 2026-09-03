import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { Icon } from './shared'
import api from '../api/client'
import { can, canAny, getUserRole, hasRole } from '../utils/permissions'
import { NotificacionesBell } from './NotificacionesBell'
import plastimarLogo from '../assets/plastimar-logo.webp'

const HIGHLIGHT_STYLES = {
  amber: { bg: '#fef08a', hoverBg: '#fde047', color: '#78350f' },
  blue: { bg: '#e0f2fe', hoverBg: '#bae6fd', color: '#0369a1' },
}

const NAV_GROUPS = [
  { label: 'Ventas', items: [
    {
      label: '+ Nueva Venta',
      route: '/ventas/nueva',
      module: 'ventas',
      permission: 'write',
      highlight: 'amber',
      children: [
        { label: 'Sala / Mostrador', route: '/ventas/nueva?tipo=Venta+Sala' },
        { label: 'Convenio Marco', route: '/ventas/nueva?tipo=Convenio+Marco' },
        { label: 'Trato Directo', route: '/ventas/nueva?tipo=Trato+Directo' },
        { label: 'Marketplace', route: '/ventas/nueva?tipo=Marketplace' },
        { label: 'Web', route: '/ventas/nueva?tipo=Venta+Web' },
      ],
    },
    {
      label: '+ Cotización',
      route: '/crm/nueva/cotizacion-simple',
      module: 'ventas',
      permission: 'write',
      highlight: 'blue',
      children: [
        { label: 'Simple', route: '/crm/nueva/cotizacion-simple' },
        { label: 'Licitación', route: '/crm/nueva/licitacion' },
        { label: 'Compra Ágil', route: '/crm/nueva/compra-agil' },
      ],
    },
    { label: 'Matriz Ventas', route: '/ventas', module: 'ventas' },
    { label: 'CRM', route: '/crm', module: 'ventas' },
    { label: 'Clientes', route: '/clientes', module: 'clientes' },
  ] },
  { label: 'Taller', items: [
    { label: 'Órdenes de Taller', route: '/taller', module: 'taller' },
    { label: 'Taller de Corte', route: '/taller-corte', module: 'taller' },
    { label: 'Pasar a Taller', route: '/pasar-taller', module: 'taller', permission: 'write' },
    { label: 'Bitacora', route: '/bitacora-taller', module: 'taller' },
    { label: 'Historial Materiales', route: '/historial-materiales', module: 'taller' },
  ] },
  { label: 'Bodega', items: [
    { label: 'Panel Picking', route: '/bodega/picking', module: 'bodega', highlight: true },
    { label: 'Panel Packing', route: '/bodega/packing', module: 'bodega' },
    { label: 'Inventario', route: '/bodega', module: 'bodega' },
    { label: 'Despachos y Salidas', route: '/despachos', module: 'despacho' },
    { label: 'Importaciones (Tránsito)', route: '/importaciones', module: 'bodega' },
    { label: 'Órdenes de Compra Proveedores', route: '/ordenes-compra-proveedores', module: 'bodega' },
    { label: 'Consulta Precios', route: '/consulta-precios', module: 'catalogo' },
    { label: 'Ingreso Mercaderia', route: '/stock-ingresos', module: 'bodega' },
    { label: 'Bodega Taller', route: '/bodega-taller', module: 'taller' },
    { label: 'Proveedores', route: '/proveedores', module: 'proveedores' },
    { label: 'Movimientos Anormales', route: '/reportes/movimientos-anormales', module: 'bodega' },
  ] },
  { label: 'Caja', items: [
    { label: 'Movimientos', route: '/caja', module: 'caja' },
    { label: 'Cobranza', route: '/cobranza', module: 'cobranza' },
    { label: 'Pagos Proveedores', route: '/pagos-proveedores', module: 'proveedores' },
  ] },
  { label: 'Facturación', items: [
    { label: 'Documentos Emitidos', route: '/facturacion/documentos', module: 'facturacion' },
    { label: 'Documentos recibidos', route: '/facturacion/recibidos', module: 'facturacion' },
    { label: 'Emitir documento', route: '/facturacion/emitir', module: 'facturacion' },
    { label: 'Emitir factura de compra', route: '/facturacion/factura-compra', module: 'facturacion', permission: 'write' },
    { label: 'Emitir liquidación factura', route: '/facturacion/liquidacion', module: 'facturacion', permission: 'write' },
    { label: 'Emitir documento exportación', route: '/facturacion/exportacion', module: 'facturacion', permission: 'write' },
    { label: 'Configuración', route: '/facturacion/configuracion', module: 'facturacion' },
  ] },
  { label: 'Gerencia', items: [
    { label: 'Reporteria Gerencial', route: '/reportes/gerenciales', module: 'reportes' },
    { label: 'Comisiones', route: '/reportes/comisiones', roles: ['admin'] },
    { label: 'Reglas de Comision', route: '/admin/comisiones', roles: ['admin'] },
    { label: 'Costeo de Fabricacion', route: '/costeo', module: 'costeo' },
  ] },
  { label: 'RRHH', items: [
    { label: 'Trabajadores', route: '/rrhh', module: 'rrhh' },
  ] },
  { label: 'Admin', items: [
    { label: 'Usuarios', route: '/usuarios', roles: ['admin'] },
    { label: 'Accesos', route: '/accesos', roles: ['admin'] },
    { label: 'Configuracion', route: '/config', roles: ['admin'] },
    { label: 'Reglas de Descuento', route: '/descuentos', requirements: [{ module: 'descuentos', permission: 'write' }] },
    { label: 'Asistente IA', route: '/asistente', roles: ['admin'] },
    { label: 'IA Balance', route: '/admin/ia-balance', roles: ['admin'] },
    { label: 'Integridad', route: '/admin/integridad', roles: ['admin'] },
    { label: 'Feedback marcha blanca', route: '/admin/feedback', roles: ['admin'] },
  ] },
]

function useSmartNavigate() {
  const navigate = useNavigate()
  const clickTimerRef = useRef(null)
  const lastRouteRef = useRef(null)

  const handleNav = (route, onAfter, e) => {
    if (e && (e.ctrlKey || e.metaKey || e.button === 1)) {
      window.open(route, '_blank')
      if (onAfter) onAfter()
      return
    }

    if (clickTimerRef.current && lastRouteRef.current === route) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
      lastRouteRef.current = null
      window.open(route, '_blank')
      if (onAfter) onAfter()
    } else {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      lastRouteRef.current = route
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null
        lastRouteRef.current = null
        navigate(route)
        if (onAfter) onAfter()
      }, 220)
    }
  }

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    }
  }, [])

  return handleNav
}

function canUseNavItem(user, item) {
  if (item.roles) return hasRole(user, item.roles)
  if (item.requirements) return canAny(user, item.requirements)
  return can(user, item.module, item.permission || 'read')
}

const DropdownItem = ({ item, isLast, currentPath, handleNav, onCloseAll }) => {
  const [isSubOpen, setIsSubOpen] = useState(false)
  const subTimer = useRef()
  const hlStyle = item.highlight ? (typeof item.highlight === 'string' ? HIGHLIGHT_STYLES[item.highlight] || HIGHLIGHT_STYLES.amber : HIGHLIGHT_STYLES.amber) : null
  const isCurrent = item.route === currentPath || currentPath.startsWith(item.route + '/')
  const hasChildren = item.children && item.children.length > 0

  const handleMouseEnter = () => {
    clearTimeout(subTimer.current)
    if (hasChildren) setIsSubOpen(true)
  }

  const handleMouseLeave = () => {
    clearTimeout(subTimer.current)
    if (hasChildren) {
      subTimer.current = setTimeout(() => setIsSubOpen(false), 150)
    }
  }

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={e => handleNav(item.route, onCloseAll, e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          width: '100%',
          padding: '9px 16px',
          fontSize: 13,
          fontWeight: hlStyle ? 700 : isCurrent ? 600 : 400,
          color: hlStyle ? hlStyle.color : isCurrent ? 'var(--green-700)' : 'var(--text-1)',
          background: hlStyle ? (isSubOpen ? hlStyle.hoverBg : hlStyle.bg) : (isSubOpen || isCurrent) ? 'var(--green-50)' : 'none',
          borderBottom: !isLast ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.1s',
        }}
      >
        <span>{item.label}</span>
        {hasChildren && (
          <span style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.7, transform: isSubOpen ? 'translateX(2px)' : 'none', transition: 'transform 0.15s' }}>
            <Icon name="chevronRight" size={11} color={hlStyle ? hlStyle.color : undefined} />
          </span>
        )}
      </button>

      {hasChildren && isSubOpen && (
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            position: 'absolute',
            top: -1,
            left: 'calc(100% + 2px)',
            background: '#fff',
            borderRadius: 10,
            minWidth: 200,
            boxShadow: '0 8px 32px oklch(0 0 0 / 0.15)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            zIndex: 10001,
            animation: 'dropIn 0.15s ease',
          }}
        >
          {item.children.map((sub, idx) => {
            const subIsCurrent = sub.route === currentPath
            return (
              <button
                key={sub.route}
                onClick={e => {
                  e.stopPropagation()
                  handleNav(sub.route, onCloseAll, e)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '9px 16px',
                  fontSize: 13,
                  fontWeight: subIsCurrent ? 600 : 400,
                  color: subIsCurrent ? 'var(--green-700)' : 'var(--text-1)',
                  background: subIsCurrent ? 'var(--green-50)' : 'none',
                  borderBottom: idx < item.children.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => !subIsCurrent && (e.currentTarget.style.background = 'var(--green-50)')}
                onMouseLeave={e => !subIsCurrent && (e.currentTarget.style.background = 'none')}
              >
                {sub.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const DropdownGroup = ({ group, currentPath }) => {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const handleNav = useSmartNavigate()
  const ref = useRef()
  const menuRef = useRef()
  const closeTimer = useRef()
  const isActive = group.items.some(i => currentPath === i.route || currentPath.startsWith(i.route + '/'))

  const openMenu = () => {
    clearTimeout(closeTimer.current)
    const rect = ref.current?.getBoundingClientRect()
    if (rect) setMenuPos({ top: rect.bottom + 6, left: rect.left })
    setOpen(true)
  }

  const scheduleClose = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  useEffect(() => {
    const handler = e => {
      if (
        ref.current && !ref.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  useEffect(() => {
    if (!open) return
    const update = () => {
      const rect = ref.current?.getBoundingClientRect()
      if (rect) setMenuPos({ top: rect.bottom + 6, left: rect.left })
    }
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }} onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
      <button onClick={() => open ? setOpen(false) : openMenu()} style={{
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
        <div ref={menuRef} onMouseEnter={() => clearTimeout(closeTimer.current)} onMouseLeave={scheduleClose} style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 10000 }}>
          <div style={{
            background: '#fff', borderRadius: 10, minWidth: 180,
            boxShadow: '0 8px 32px oklch(0 0 0 / 0.15)', border: '1px solid var(--border)',
            overflow: 'visible', animation: 'dropIn 0.15s ease',
          }}>
            {group.items.map((item, i) => (
              <DropdownItem
                key={item.route}
                item={item}
                isLast={i === group.items.length - 1}
                currentPath={currentPath}
                handleNav={handleNav}
                onCloseAll={() => setOpen(false)}
              />
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
  const handleNav = useSmartNavigate()
  const location = useLocation()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userRef = useRef()
  const clock = useClock()
  const role = getUserRole(user)
  const dashboardActive = location.pathname === '/dashboard/operativo'
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
      <div className="topbar-inner">
        <div onClick={e => handleNav('/dashboard', null, e)} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <img src={plastimarLogo} alt="Plastimar Sisgestion 3.0" className="topbar-brand-logo" style={{ display: 'block', width: 132, height: 'auto' }} />
        </div>

        <nav className="topbar-nav">
          <button onClick={e => handleNav('/dashboard/operativo', null, e)} style={{
            padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            color: dashboardActive ? '#fff' : 'rgba(255,255,255,0.78)',
            fontWeight: dashboardActive ? 600 : 400,
            background: dashboardActive ? 'rgba(255,255,255,0.18)' : 'transparent',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => !dashboardActive && (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={e => !dashboardActive && (e.currentTarget.style.background = 'transparent')}
          >
            Dashboard
          </button>
          {visibleGroups.map(group => (
            <DropdownGroup key={group.label} group={group} currentPath={location.pathname} />
          ))}
        </nav>

        <div className="topbar-actions">
          <span className="topbar-clock" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: 0 }}>{clock}</span>
          <NotificacionesBell />

          <div ref={userRef} style={{ position: 'relative' }}>
            <button onClick={() => setUserMenuOpen(o => !o)} style={{
              display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
              background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '4px 10px',
            }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--green-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{initials}</span>
              </div>
              <span className="topbar-user-name" style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12 }}>{user?.nombre || 'Usuario'}</span>
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
