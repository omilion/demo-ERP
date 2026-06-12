import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Badge, KpiCard, SectionCard, ActionRow, PageHeader, Btn } from '../../components/shared'
import { useDashboardStats } from '../../api/dashboard'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const TALLER_ICONS = { Espumas: 'layers', Confecciones: 'scissors', Madera: 'box', Externo: 'truck' }

function TallerBar({ tipo, activas, urgentes = 0, max }) {
  const [hov, setHov] = useState(false)
  const navigate = useNavigate()
  const pct = max > 0 ? Math.round((activas / max) * 100) : 0
  const color = pct > 70 ? 'var(--red)' : pct > 40 ? 'var(--amber)' : 'var(--green-600)'
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={() => navigate(`/taller?tipo=${tipo}`)}
      style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer', background: hov ? 'var(--green-50)' : 'transparent', transition: 'all 0.14s', marginBottom: 2 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: 'var(--green-600)' }}><Icon name={TALLER_ICONS[tipo] || 'tool'} size={13} /></span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{tipo}</span>
          {urgentes > 0 && (
            <span
              onClick={e => { e.stopPropagation(); navigate(`/taller?tipo=${tipo}&prioridad=urgente`) }}
              style={{ marginLeft: 4 }}
            >
              <Badge tone="red">{urgentes} urgente{urgentes !== 1 ? 's' : ''}</Badge>
            </span>
          )}
        </div>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color }}>{activas.toLocaleString('es-CL')}</span>
      </div>
      <div style={{ height: 5, background: 'var(--border)', borderRadius: 99 }}>
        <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function StockRow({ label, icon, critico, sinStock, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 8, cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--green-50)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ color: 'var(--green-600)', flexShrink: 0 }}><Icon name={icon} size={14} /></span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 5 }}>
        {critico > 0 && <Badge tone="amber">{critico.toLocaleString('es-CL')} crítico{critico !== 1 ? 's' : ''}</Badge>}
        {sinStock > 0 && <Badge tone="red">{sinStock.toLocaleString('es-CL')} sin stock</Badge>}
        {critico === 0 && sinStock === 0 && <Badge tone="neutral">OK</Badge>}
      </div>
    </div>
  )
}

function QuickAccessTile({ label, icon, tone = 'blue', badge, onClick }) {
  const [hov, setHov] = useState(false)
  const colors = {
    red: { bg: '#dc4f4f', hover: '#d94747', glow: 'oklch(0.54 0.13 25 / 0.20)' },
    green: { bg: '#58b957', hover: '#51ae50', glow: 'oklch(0.54 0.11 150 / 0.20)' },
    blue: { bg: '#337fb9', hover: '#3078af', glow: 'oklch(0.50 0.11 240 / 0.20)' },
    cyan: { bg: '#56bed9', hover: '#50b5d0', glow: 'oklch(0.62 0.10 215 / 0.20)' },
    amber: { bg: '#f3b247', hover: '#e7a941', glow: 'oklch(0.66 0.12 70 / 0.20)' },
    purple: { bg: '#8e24aa', hover: '#8623a0', glow: 'oklch(0.48 0.13 315 / 0.20)' },
  }
  const palette = colors[tone] || colors.blue
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        minHeight: 66,
        border: 0,
        borderRadius: 6,
        background: `linear-gradient(135deg, ${hov ? palette.hover : palette.bg}, ${palette.bg})`,
        color: '#fff',
        display: 'grid',
        gridTemplateColumns: '52px minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 12,
        padding: '10px 18px',
        cursor: 'pointer',
        textAlign: 'left',
        position: 'relative',
        overflow: 'hidden',
        transform: hov ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hov
          ? `0 10px 22px ${palette.glow}, inset 0 1px 0 oklch(1 0 0 / 0.18)`
          : 'inset 0 -1px 0 oklch(0 0 0 / 0.08)',
        outline: hov ? '1px solid oklch(1 0 0 / 0.18)' : '1px solid transparent',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, outline-color 0.18s ease, background 0.18s ease',
      }}
    >
      <span style={{
        position: 'absolute',
        inset: 0,
        opacity: hov ? 1 : 0,
        background: 'linear-gradient(110deg, transparent 0%, oklch(1 0 0 / 0.10) 42%, transparent 68%)',
        transform: hov ? 'translateX(10%)' : 'translateX(-24%)',
        transition: 'opacity 0.18s ease, transform 0.36s ease',
        pointerEvents: 'none',
      }} />
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: hov ? 'scale(1.04)' : 'scale(1)', transition: 'transform 0.18s ease', position: 'relative' }}>
        <Icon name={icon} size={35} />
      </span>
      <span style={{ fontSize: 17, lineHeight: 1.2, fontWeight: 700, overflowWrap: 'anywhere', position: 'relative' }}>{label}</span>
      {badge != null && (
        <span style={{
          minWidth: 34,
          justifySelf: 'end',
          padding: '5px 8px',
          borderRadius: 999,
          background: 'oklch(1 0 0 / 0.18)',
          fontFamily: "'DM Mono', monospace",
          fontSize: 13,
          fontWeight: 700,
          textAlign: 'center',
          position: 'relative',
        }}>{badge}</span>
      )}
    </button>
  )
}

function MainMenuTile({ label, icon, route, tone = 'green', onClick }) {
  const [hov, setHov] = useState(false)
  const colors = {
    green: { bg: '#064e3b', hover: '#075f48', fg: '#fff', iconBg: 'oklch(1 0 0 / 0.12)', glow: 'oklch(0.42 0.10 155 / 0.22)' },
    blue: { bg: '#0f5f9e', hover: '#136daf', fg: '#fff', iconBg: 'oklch(1 0 0 / 0.14)', glow: 'oklch(0.48 0.12 240 / 0.22)' },
    amber: { bg: '#b7791f', hover: '#c38425', fg: '#fff', iconBg: 'oklch(1 0 0 / 0.16)', glow: 'oklch(0.62 0.11 70 / 0.22)' },
    slate: { bg: '#334155', hover: '#3d4b5f', fg: '#fff', iconBg: 'oklch(1 0 0 / 0.12)', glow: 'oklch(0.38 0.03 250 / 0.18)' },
    red: { bg: '#b91c1c', hover: '#c92121', fg: '#fff', iconBg: 'oklch(1 0 0 / 0.14)', glow: 'oklch(0.46 0.13 25 / 0.22)' },
  }
  const palette = colors[tone] || colors.green
  return (
    <button
      type="button"
      onClick={() => onClick(route)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        minHeight: 92,
        border: 0,
        borderRadius: 8,
        background: `linear-gradient(145deg, ${hov ? palette.hover : palette.bg}, ${palette.bg})`,
        color: palette.fg,
        display: 'grid',
        gridTemplateRows: '1fr auto',
        alignItems: 'center',
        justifyItems: 'center',
        gap: 8,
        padding: '12px 10px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hov
          ? `0 14px 28px ${palette.glow}, inset 0 1px 0 oklch(1 0 0 / 0.18)`
          : '0 10px 24px oklch(0 0 0 / 0.12)',
        outline: hov ? '1px solid oklch(1 0 0 / 0.16)' : '1px solid transparent',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, outline-color 0.18s ease, background 0.18s ease',
      }}
    >
      <span style={{
        position: 'absolute',
        inset: 0,
        opacity: hov ? 1 : 0,
        background: 'radial-gradient(circle at 30% 12%, oklch(1 0 0 / 0.12), transparent 32%), linear-gradient(120deg, transparent, oklch(1 0 0 / 0.08), transparent)',
        transform: hov ? 'translateX(6%)' : 'translateX(-18%)',
        transition: 'opacity 0.18s ease, transform 0.36s ease',
        pointerEvents: 'none',
      }} />
      <span style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: palette.iconBg,
        transform: hov ? 'scale(1.04)' : 'scale(1)',
        transition: 'transform 0.18s ease, background 0.18s ease',
        position: 'relative',
      }}>
        <Icon name={icon} size={24} />
      </span>
      <span style={{ fontSize: 14, lineHeight: 1.15, fontWeight: 800, letterSpacing: 0, position: 'relative', textAlign: 'center' }}>{label}</span>
    </button>
  )
}

function buildQuickAccess({ show, canReadCatalogo, canWriteVentas, stats, inv, tal, isLoading }) {
  const n = v => isLoading ? '...' : (v ?? 0).toLocaleString('es-CL')
  const invCritico = (inv.critico ?? 0) + (inv.sinStock ?? 0)
  const talCritico = (tal.critico ?? 0) + (tal.sinStock ?? 0)

  return [
    show.bodega && { label: 'Mantención Bodega Inventario y Web', icon: 'warehouse', tone: 'red', route: '/bodega' },
    show.bodega && { label: 'Stock Crítico Bodega Inventario', icon: 'alertTriangle', tone: 'red', badge: n(invCritico), route: '/bodega?filtro=critico' },
    show.bodega && { label: 'Mantención Bodega Taller', icon: 'box', tone: 'green', route: '/bodega?tab=taller' },
    show.bodega && { label: 'Stock Crítico Bodega Taller', icon: 'alertTriangle', tone: 'green', badge: n(talCritico), route: '/bodega?tab=taller&filtro=critico' },
    show.ventas && { label: 'Matriz Ventas', icon: 'grid', tone: 'blue', route: '/matriz-ventas' },
    show.ventas && { label: 'Ventas No pagadas', icon: 'alertTriangle', tone: 'red', badge: n(stats?.ventas?.noPagadas), route: '/ventas?filtro=no_pagadas' },
    show.ventas && { label: 'Ventas Pendientes entrega', icon: 'truck', tone: 'red', badge: n(stats?.ventas?.pendienteEntrega), route: '/ventas?filtro=pendiente_entrega' },
    canReadCatalogo && { label: 'Consulta Precios', icon: 'tag', tone: 'blue', route: '/consulta-precios' },
    canWriteVentas && { label: 'Venta por Sala', icon: 'shoppingCart', tone: 'cyan', route: '/ventas/nueva' },
    show.taller && { label: 'OT Taller Pendientes', icon: 'wrench', tone: 'cyan', badge: n(stats?.odts?.pendientes), route: '/taller?estado=Pendiente' },
    show.taller && { label: 'OT Taller Prioritarias', icon: 'wrench', tone: 'red', badge: n(stats?.odts?.urgentes), route: '/taller?prioridad=urgente' },
    show.taller && { label: 'OT Taller Espumas Pendientes', icon: 'wrench', tone: 'green', route: '/taller?tipo=Espumas&estado=Pendiente' },
    show.taller && { label: 'OT Taller Espumas Prioritarias', icon: 'wrench', tone: 'green', route: '/taller?tipo=Espumas&prioridad=urgente' },
    show.taller && { label: 'OT Taller Confecciones Pendientes', icon: 'wrench', tone: 'blue', route: '/taller?tipo=Confecciones&estado=Pendiente' },
    show.taller && { label: 'OT Taller Confecciones Prioritarias', icon: 'wrench', tone: 'blue', route: '/taller?tipo=Confecciones&prioridad=urgente' },
    show.taller && { label: 'OT Taller Madera Pendientes', icon: 'wrench', tone: 'cyan', route: '/taller?tipo=Madera&estado=Pendiente' },
    show.taller && { label: 'OT Taller Madera Prioritarias', icon: 'wrench', tone: 'cyan', route: '/taller?tipo=Madera&prioridad=urgente' },
    show.cobranza && { label: 'Cobranza / Documentos pagos Proveedores', icon: 'dollarSign', tone: 'amber', route: '/cobranza' },
  ].filter(Boolean)
}

function getAccessModel(user, stats, isLoading) {
  const role = user?.role || 'admin'
  const canReadVentas = can(user, 'ventas')
  const canReadBodega = can(user, 'bodega')
  const canReadCatalogo = can(user, 'catalogo')
  const canReadTaller = can(user, 'taller')
  const canReadCaja = can(user, 'caja')
  const canReadClientes = can(user, 'clientes')
  const canReadProveedores = can(user, 'proveedores')
  const canWriteVentas = can(user, 'ventas', 'write')
  const show = {
    ventas: canReadVentas,
    bodega: canReadBodega,
    taller: canReadTaller,
    cobranza: canReadVentas || canReadCaja || canReadProveedores,
    admin: role === 'admin',
    clientes: canReadClientes,
    crm: canReadVentas,
    caja: canReadCaja,
    rrhh: can(user, 'rrhh'),
    licitaciones: can(user, 'licitaciones'),
  }
  const inv = stats?.stock?.Inventario ?? {}
  const tal = stats?.stock?.Taller ?? {}
  const quickAccess = buildQuickAccess({ show, canReadCatalogo, canWriteVentas, stats, inv, tal, isLoading })
  return { show, inv, tal, quickAccess }
}

const dashboardStartShell = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg)',
  padding: 'clamp(16px, 3vh, 34px) clamp(12px, 2vw, 28px)',
}

const dashboardStartFrame = {
  width: 'clamp(320px, 75vw, 1440px)',
  maxWidth: '100%',
  minWidth: 0,
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: stats, isLoading } = useDashboardStats()
  const { user } = useAuthStore()
  const { show, quickAccess } = getAccessModel(user, stats, isLoading)
  const mainModules = [
    { label: 'Dashboard', icon: 'barChart2', tone: 'green', route: '/dashboard/operativo' },
    show.ventas && { label: 'Ventas', icon: 'shoppingCart', tone: 'blue', route: '/matriz-ventas' },
    show.bodega && { label: 'Bodega', icon: 'warehouse', tone: 'green', route: '/bodega' },
    show.caja && { label: 'Caja', icon: 'creditCard', tone: 'slate', route: '/caja' },
    show.rrhh && { label: 'RRHH', icon: 'users', tone: 'amber', route: '/rrhh' },
    show.licitaciones && { label: 'Licitaciones', icon: 'briefcase', tone: 'blue', route: '/licitaciones' },
    show.taller && { label: 'Taller', icon: 'wrench', tone: 'green', route: '/taller' },
    show.admin && { label: 'Admin', icon: 'settings', tone: 'red', route: '/usuarios' },
  ].filter(Boolean)

  return (
    <main className="page" style={dashboardStartShell}>
      <div style={dashboardStartFrame}>
        <section style={{ marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 10 }}>
            {mainModules.map(item => (
              <MainMenuTile key={item.route} {...item} onClick={navigate} />
            ))}
          </div>
        </section>

        <section>
          <div style={{
            background: 'var(--green-700)',
            color: '#fff',
            padding: '9px 12px',
            fontSize: 16,
            fontWeight: 700,
            textTransform: 'uppercase',
            borderRadius: '6px 6px 0 0',
          }}>
            Accesos rápidos
          </div>
          <div style={{
            background: '#fff',
            border: '1px solid var(--border)',
            borderTop: 0,
            borderRadius: '0 0 8px 8px',
            padding: 6,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 6,
          }}>
            {quickAccess.map(item => (
              <QuickAccessTile
                key={`${item.route}-${item.label}`}
                {...item}
                onClick={() => navigate(item.route)}
              />
            ))}
          </div>
        </section>

      </div>
    </main>
  )
}

export function DashboardOperativoPage() {
  const navigate = useNavigate()
  const { data: stats, isLoading } = useDashboardStats()
  const { user } = useAuthStore()
  const role = user?.role || 'admin'
  const canReadVentas = can(user, 'ventas')
  const canReadBodega = can(user, 'bodega')
  const canReadCatalogo = can(user, 'catalogo')
  const canReadTaller = can(user, 'taller')
  const canReadDespacho = can(user, 'despacho')
  const canReadClientes = can(user, 'clientes')
  const canReadCaja = can(user, 'caja')
  const canReadProveedores = can(user, 'proveedores')
  const canWriteVentas = can(user, 'ventas', 'write')
  const canWriteTaller = can(user, 'taller', 'write')
  const canWriteBodega = can(user, 'bodega', 'write')
  const canWriteClientes = can(user, 'clientes', 'write')
  const canWriteProveedores = can(user, 'proveedores', 'write')
  const show = {
    ventas: canReadVentas,
    bodega: canReadBodega,
    taller: canReadTaller,
    cobranza: canReadVentas || canReadCaja || canReadProveedores,
    admin: role === 'admin',
    clientes: canReadClientes,
    crm: canReadVentas,
  }

  const inv = stats?.stock?.Inventario ?? {}
  const tal = stats?.stock?.Taller ?? {}
  const maxTaller = Math.max(...(stats?.talleres ?? []).map(t => t.activas), 1)
  const crm = stats?.crm ?? { pendientes: 0, enGestion: 0, altaPrioridad: 0 }
  const proveedores = stats?.proveedores ?? { total: 0 }
  const cobHist = stats?.cobranzaHistorico ?? { cobrado: 0, pendientes: 0 }
  const provPagos = stats?.proveedoresPagos ?? { facturasNoPagadas: 0, boletasNoPagadas: 0 }
  const cal = stats?.productosCalidad ?? { sinCodigoBarra: 0, sinCodigoInterno: 0, sinCategoria: 0, sinProveedor: 0 }
  const webPend = stats?.ventas?.webPendientes ?? 0
  const fmtM = n => '$' + (Math.abs(n || 0) / 1_000_000).toFixed(1) + 'M'
  const n = v => isLoading ? '…' : (v ?? 0).toLocaleString('es-CL')

  const now = new Date()
  const hora = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  const fecha = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <main className="page page-wide">
      <PageHeader
        title="Inicio operativo"
        subtitle={`${fecha} · ${hora} · Sucursal 5 Oriente`}
        breadcrumb={['Inicio', 'Dashboard']}
        actions={
          canWriteVentas && <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/ventas/nueva')}>Nueva Venta</Btn>
        }
      />

      <div className="kpi-strip">
        {canReadVentas && (
          <KpiCard label="Ventas No Pagadas" value={n(stats?.ventas?.noPagadas)} icon="dollarSign" tone="red"
            sublabel="Gestión cobranza requerida" onClick={() => navigate('/ventas?filtro=no_pagadas')} />
        )}
        {canReadVentas && (
          <KpiCard label="Pendientes Entrega" value={n(stats?.ventas?.pendienteEntrega)} icon="truck" tone="blue"
            sublabel="Órdenes por despachar" onClick={() => navigate('/ventas?filtro=pendiente_entrega')} />
        )}
        {show.ventas && (
          <KpiCard label="Cotizaciones Web" value={n(webPend)} icon="cloud" tone={webPend > 0 ? 'amber' : 'neutral'}
            sublabel="Pendientes revision" onClick={() => navigate('/ordenes-compra?estado=Pendiente')} />
        )}
        {show.taller && (
          <KpiCard label="ODTs Activas" value={n(stats?.odts?.total)} icon="wrench"
            sublabel={!isLoading ? `${stats.odts.urgentes} urgentes` : ''}
            tone={stats?.odts?.urgentes > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/taller')} />
        )}
        {show.bodega && (
          <KpiCard label="Stock Crítico - Inv." value={n((inv.critico ?? 0) + (inv.sinStock ?? 0))} icon="alertTriangle" tone="amber"
            sublabel={!isLoading ? `${inv.sinStock ?? 0} sin stock` : ''} onClick={() => navigate('/bodega?filtro=critico')} />
        )}
        {show.bodega && (
          <KpiCard label="Stock Crítico - Taller" value={n((tal.critico ?? 0) + (tal.sinStock ?? 0))} icon="alertTriangle" tone="amber"
            sublabel={!isLoading ? `${tal.sinStock ?? 0} sin stock` : ''} onClick={() => navigate('/bodega?tab=taller&filtro=critico')} />
        )}
        {show.crm && (
          <KpiCard label="CRM - Pendientes" value={n(crm.pendientes)} icon="phone" tone={crm.altaPrioridad > 0 ? 'red' : 'blue'}
            sublabel={!isLoading ? `${crm.altaPrioridad} prioridad alta` : ''} onClick={() => navigate('/crm')} />
        )}
        {canReadVentas && (
          <KpiCard label="Cobranza Cobrado" value={isLoading ? '...' : fmtM(cobHist.cobrado)} icon="trendingUp" tone="neutral"
            sublabel={!isLoading ? `${cobHist.pendientes} pendientes` : ''} onClick={() => navigate('/cobranza')} />
        )}
      </div>

      <div className="dash-grid">
        {show.taller && (
          <SectionCard title="Talleres - ODTs Activas" icon="tool">
            <div style={{ padding: '4px 14px 8px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--blue)', fontSize: 13 }}>{n(stats?.odts?.enProceso)}</span> en proceso
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--amber)', fontSize: 13 }}>{n(stats?.odts?.pendientes)}</span> pendientes
                </span>
                {!isLoading && stats?.odts?.urgentes > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--red)', fontSize: 13 }}>{stats.odts.urgentes}</span> urgentes
                  </span>
                )}
              </div>
              <button onClick={() => navigate('/taller')} style={{ fontSize: 11, color: 'var(--green-600)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Ver todas →</button>
            </div>
            {(stats?.talleres ?? []).map(t => <TallerBar key={t.tipo} {...t} max={maxTaller} />)}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            {canWriteTaller && <ActionRow icon="plusCircle" label="Nueva ODT" onClick={() => navigate('/taller/nueva')} />}
            <ActionRow icon="edit" label="Registrar Bitácora" onClick={() => navigate('/bitacora-taller')} />
            {canWriteTaller && <ActionRow icon="package" label="Pasar a Taller" onClick={() => navigate('/pasar-taller')} />}
            <ActionRow icon="layers" label="Historial Materiales" onClick={() => navigate('/historial-materiales')} />
          </SectionCard>
        )}

        {show.bodega && (
          <SectionCard title="Bodega Inventario" icon="warehouse">
            <StockRow label="Stock Crítico / 0" icon="alertTriangle"
              critico={inv.critico ?? 0} sinStock={inv.sinStock ?? 0} onClick={() => navigate('/bodega?filtro=critico')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            <ActionRow icon="warehouse" label="Mantención productos" onClick={() => navigate('/bodega')} />
            {canWriteBodega && <ActionRow icon="plusCircle" label="Ingreso Mercadería" onClick={() => navigate('/stock-ingresos')} />}
            <ActionRow icon="tag" label="Consulta Precios" onClick={() => navigate('/consulta-precios')} />
            {canReadDespacho && <ActionRow icon="truck" label="Despachos" onClick={() => navigate('/despachos')} />}
            <ActionRow icon="users" label="Proveedores" badge={n(proveedores.total)} badgeTone="neutral" onClick={() => navigate('/proveedores')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            <ActionRow icon="alertTriangle" label="Sin Código Barra" badge={cal.sinCodigoBarra} badgeTone={cal.sinCodigoBarra > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/bodega?filtro=sin_codigo_barra')} />
            <ActionRow icon="alertTriangle" label="Sin Código Interno" badge={cal.sinCodigoInterno} badgeTone={cal.sinCodigoInterno > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/bodega?filtro=sin_codigo_interno')} />
            <ActionRow icon="alertTriangle" label="Sin Categoría" badge={cal.sinCategoria} badgeTone={cal.sinCategoria > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/bodega?filtro=sin_categoria')} />
            <ActionRow icon="alertTriangle" label="Sin Proveedor" badge={cal.sinProveedor} badgeTone={cal.sinProveedor > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/bodega?filtro=sin_proveedor')} />
          </SectionCard>
        )}

        {show.taller && (
          <SectionCard title="Bodega Taller" icon="box">
            <StockRow label="Stock Crítico / 0" icon="alertTriangle"
              critico={tal.critico ?? 0} sinStock={tal.sinStock ?? 0} onClick={() => navigate('/bodega?tab=taller&filtro=critico')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            {canReadCatalogo && <ActionRow icon="box" label="Mantención productos" onClick={() => navigate('/bodega?tab=taller')} />}
            <ActionRow icon="layers" label="Telas" onClick={() => navigate('/telas')} />
            <ActionRow icon="box" label="Bodega Taller" onClick={() => navigate('/bodega-taller')} />
          </SectionCard>
        )}

        {show.ventas && (
          <SectionCard title="Ventas" icon="shoppingCart">
            <ActionRow icon="grid" label="Matriz Ventas" onClick={() => navigate('/matriz-ventas')} />
            <ActionRow icon="dollarSign" label="Ventas No Pagadas" badge={n(stats?.ventas?.noPagadas)} badgeTone="red" onClick={() => navigate('/ventas?filtro=no_pagadas')} />
            <ActionRow icon="truck" label="Pendientes Entrega" badge={n(stats?.ventas?.pendienteEntrega)} badgeTone="blue" onClick={() => navigate('/ventas?filtro=pendiente_entrega')} />
            <ActionRow icon="cloud" label="Cotizaciones Web" badge={n(webPend)} badgeTone={webPend > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/ordenes-compra?estado=Pendiente')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            {canWriteVentas && <ActionRow icon="plusCircle" label="Nueva Venta Sala" onClick={() => navigate('/ventas/nueva')} />}
            <ActionRow icon="clipboard" label="Cotizar Licitación" onClick={() => navigate('/licitaciones')} />
            <ActionRow icon="briefcase" label="Convenio Marco" onClick={() => navigate('/licitaciones?tipo=convenio')} />
            <ActionRow icon="fileText" label="Reportes Licitaciones" onClick={() => navigate('/reportes/licitaciones')} />
            {canReadCatalogo && <ActionRow icon="tag" label="Consulta Precios" onClick={() => navigate('/consulta-precios')} />}
          </SectionCard>
        )}

        {(show.crm || show.clientes) && (
          <SectionCard title="CRM & Clientes" icon="phone">
            {show.crm && (
              <div style={{ padding: '4px 14px 8px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--amber)', fontSize: 13 }}>{n(crm.pendientes)}</span> pendientes
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--blue)', fontSize: 13 }}>{n(crm.enGestion)}</span> en gestión
                  </span>
                  {!isLoading && crm.altaPrioridad > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--red)', fontSize: 13 }}>{crm.altaPrioridad}</span> alta
                    </span>
                  )}
                </div>
              </div>
            )}
            {show.crm && <ActionRow icon="phone" label="Ver CRM" onClick={() => navigate('/crm')} />}
            {canReadClientes && <ActionRow icon="users" label="Clientes" onClick={() => navigate('/clientes')} />}
            {canWriteClientes && <ActionRow icon="plusCircle" label="Nuevo Cliente" onClick={() => navigate('/clientes/nuevo')} />}
          </SectionCard>
        )}

        {show.cobranza && (
          <SectionCard title="Cobranza & Pagos Proveedores" icon="dollarSign">
            {canReadVentas && <ActionRow icon="dollarSign" label="Menú Cobranza" onClick={() => navigate('/cobranza')} />}
            {canWriteProveedores && <ActionRow icon="plusCircle" label="Nueva Boleta/Factura Prov." onClick={() => navigate('/pagos-proveedores')} />}
            {canReadProveedores && <ActionRow icon="alertTriangle" label="Facturas No Pagadas" badge={n(provPagos.facturasNoPagadas)} badgeTone={provPagos.facturasNoPagadas > 0 ? 'red' : 'neutral'} onClick={() => navigate('/pagos-proveedores?doc=Factura&estado=Pendiente')} />}
            {canReadProveedores && <ActionRow icon="alertTriangle" label="Boletas No Pagadas" badge={n(provPagos.boletasNoPagadas)} badgeTone={provPagos.boletasNoPagadas > 0 ? 'red' : 'neutral'} onClick={() => navigate('/pagos-proveedores?doc=Boleta&estado=Pendiente')} />}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            {canReadCaja && <ActionRow icon="creditCard" label="Caja Movimientos" onClick={() => navigate('/caja')} />}
            {canReadVentas && <ActionRow icon="fileText" label="Ordenes Compra Online" onClick={() => navigate('/ordenes-compra')} />}
          </SectionCard>
        )}

        {show.admin && (
          <SectionCard title="Administración" icon="settings">
            <ActionRow icon="tag" label="Reglas de Descuento" onClick={() => navigate('/descuentos')} />
            <ActionRow icon="users" label="Usuarios" onClick={() => navigate('/usuarios')} />
            <ActionRow icon="lock" label="Accesos" onClick={() => navigate('/accesos')} />
            <ActionRow icon="settings" label="Configuración" onClick={() => navigate('/config')} />
            <ActionRow icon="user" label="RRHH Trabajadores" onClick={() => navigate('/rrhh')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            <ActionRow icon="alertTriangle" label="Integridad de Datos" onClick={() => navigate('/admin/integridad')} />
            <ActionRow icon="fileText" label="Auditoría de Actividad" onClick={() => navigate('/admin/auditoria')} />
          </SectionCard>
        )}
      </div>

      <div style={{ marginTop: 28, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Plastimar ERP · Sucursal 5 Oriente</span>
        {!isLoading && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {(inv.total ?? 0).toLocaleString('es-CL')} productos inventario · {(tal.total ?? 0).toLocaleString('es-CL')} en taller
          </span>
        )}
      </div>
    </main>
  )
}
