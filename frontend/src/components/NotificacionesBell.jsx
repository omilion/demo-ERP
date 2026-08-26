import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './shared'
import { useNotificaciones } from '../api/notificaciones'

const SEV_COLOR = { alta: 'var(--red)', media: 'var(--amber)', baja: 'var(--text-3)' }
const TIPO_ICON = { licitacion: 'clipboard', factura_proveedor: 'dollarSign', odt_atrasada: 'tool', entrega_pendiente: 'truck' }

// Campanita de notificaciones. `dark` ajusta solo el boton disparador para
// convivir con el header verde oscuro (TopBar) o con fondos claros (ej.
// panel de ventas del dashboard); el panel desplegable es blanco en ambos.
export function NotificacionesBell({ dark = true }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const navigate = useNavigate()
  const { data } = useNotificaciones()
  const items = data?.items || []
  const total = data?.total || 0

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const iconColor = dark ? 'rgba(255,255,255,0.78)' : 'var(--text-3)'
  const hoverBg = dark ? 'rgba(255,255,255,0.18)' : 'var(--green-50)'
  const badgeBorder = dark ? 'var(--green-900)' : 'var(--bg)'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button aria-label="Notificaciones" onClick={() => setOpen(o => !o)}
        style={{ color: iconColor, minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, position: 'relative', background: open ? hoverBg : 'transparent', border: 'none', cursor: 'pointer' }}>
        <Icon name="bell" size={18} />
        {total > 0 && (
          <span style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${badgeBorder}` }}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 10000, width: 360, maxHeight: 460, background: '#fff', borderRadius: 10, boxShadow: '0 8px 32px oklch(0 0 0 / 0.18)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14, color: 'var(--text-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Notificaciones</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>{total} pendiente{total !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Sin notificaciones pendientes 🎉</div>
            ) : items.map((n, i) => (
              <button key={i} onClick={() => { setOpen(false); if (n.link) navigate(n.link) }}
                style={{ display: 'flex', gap: 10, width: '100%', padding: '11px 16px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', alignItems: 'flex-start' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <span style={{ marginTop: 2, color: SEV_COLOR[n.severidad] || 'var(--text-3)', flexShrink: 0 }}>
                  <Icon name={TIPO_ICON[n.tipo] || 'bell'} size={15} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.titulo}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{n.detalle}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
