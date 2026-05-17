import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Badge, KpiCard, SectionCard, ActionRow, PageHeader, Btn } from '../../components/shared'
import { useDashboardStats } from '../../api/dashboard'
import { useAuthStore } from '../../store/auth'

const TALLER_ICONS = { Espumas: 'layers', Confecciones: 'scissors', Madera: 'box' }

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

const ROLE_SECTIONS = {
  admin:        { ventas: true, bodega: true, taller: true, cobranza: true, admin: true, clientes: true, crm: true },
  vendedor:     { ventas: true, clientes: true, crm: true, cobranza: true },
  bodeguero:    { bodega: true, cobranza: true },
  cajero:       { cobranza: true, ventas: true },
  taller:       { taller: true, bodega: true },
  rrhh:         { clientes: true },
  solo_lectura: { ventas: true, bodega: true, taller: true, cobranza: true, clientes: true, crm: true },
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: stats, isLoading } = useDashboardStats()
  const { user } = useAuthStore()
  const role = user?.role || 'admin'
  const show = ROLE_SECTIONS[role] || ROLE_SECTIONS.admin

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
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: 'clamp(12px, 2vw, 24px)' }}>
      <PageHeader
        title="Panel de Control"
        subtitle={`${fecha} · ${hora} · Sucursal 5 Oriente`}
        breadcrumb={['Inicio', 'Dashboard']}
        actions={
          (show.ventas || show.admin) && <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/ventas/nueva')}>Nueva Venta</Btn>
        }
      />

      <div className="kpi-strip">
        {(show.ventas || show.cobranza) && (
          <KpiCard label="Ventas No Pagadas" value={n(stats?.ventas?.noPagadas)} icon="dollarSign" tone="red"
            sublabel="Gestión cobranza requerida" onClick={() => navigate('/ventas?filtro=no_pagadas')} />
        )}
        {(show.ventas || show.bodega) && (
          <KpiCard label="Pendientes Entrega" value={n(stats?.ventas?.pendienteEntrega)} icon="truck" tone="blue"
            sublabel="Órdenes por despachar" onClick={() => navigate('/ventas?filtro=pendiente_entrega')} />
        )}
        {show.ventas && (
          <KpiCard label="Cotizaciones Web" value={n(webPend)} icon="cloud" tone={webPend > 0 ? 'amber' : 'neutral'}
            sublabel="Pendientes revisión" onClick={() => navigate('/ventas?filtro=web')} />
        )}
        {show.taller && (
          <KpiCard label="ODTs Activas" value={n(stats?.odts?.total)} icon="wrench"
            sublabel={!isLoading ? `${stats.odts.urgentes} urgentes` : ''}
            tone={stats?.odts?.urgentes > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/taller')} />
        )}
        {show.bodega && (
          <KpiCard label="Stock Crítico — Inv." value={n((inv.critico ?? 0) + (inv.sinStock ?? 0))} icon="alertTriangle" tone="amber"
            sublabel={!isLoading ? `${inv.sinStock ?? 0} sin stock` : ''} onClick={() => navigate('/bodega?filtro=critico')} />
        )}
        {show.bodega && (
          <KpiCard label="Stock Crítico — Taller" value={n((tal.critico ?? 0) + (tal.sinStock ?? 0))} icon="alertTriangle" tone="amber"
            sublabel={!isLoading ? `${tal.sinStock ?? 0} sin stock` : ''} onClick={() => navigate('/bodega?tab=taller&filtro=critico')} />
        )}
        {show.crm && (
          <KpiCard label="CRM — Pendientes" value={n(crm.pendientes)} icon="phone" tone={crm.altaPrioridad > 0 ? 'red' : 'blue'}
            sublabel={!isLoading ? `${crm.altaPrioridad} prioridad alta` : ''} onClick={() => navigate('/crm')} />
        )}
        {show.cobranza && (
          <KpiCard label="Cobranza Cobrado" value={isLoading ? '…' : fmtM(cobHist.cobrado)} icon="trendingUp" tone="neutral"
            sublabel={!isLoading ? `${cobHist.pendientes} pendientes` : ''} onClick={() => navigate('/cobranza')} />
        )}
      </div>

      <div className="dash-grid">
        {show.taller && (
          <SectionCard title="Talleres — ODTs Activas" icon="tool">
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
            <ActionRow icon="plusCircle" label="Nueva ODT" onClick={() => navigate('/taller/nueva')} />
            <ActionRow icon="edit" label="Registrar Bitácora" onClick={() => navigate('/bitacora-taller')} />
            <ActionRow icon="package" label="Pasar a Taller" onClick={() => navigate('/pasar-taller')} />
            <ActionRow icon="layers" label="Historial Materiales" onClick={() => navigate('/historial-materiales')} />
          </SectionCard>
        )}

        {show.bodega && (
          <SectionCard title="Bodega Inventario" icon="warehouse">
            <StockRow label="Stock Crítico / 0" icon="alertTriangle"
              critico={inv.critico ?? 0} sinStock={inv.sinStock ?? 0} onClick={() => navigate('/bodega?filtro=critico')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            <ActionRow icon="warehouse" label="Mantención productos" onClick={() => navigate('/bodega')} />
            <ActionRow icon="plusCircle" label="Ingreso Mercadería" onClick={() => navigate('/stock-ingresos')} />
            <ActionRow icon="tag" label="Consulta Precios" onClick={() => navigate('/consulta-precios')} />
            <ActionRow icon="truck" label="Despachos" onClick={() => navigate('/despachos')} />
            <ActionRow icon="users" label="Proveedores" badge={n(proveedores.total)} badgeTone="neutral" onClick={() => navigate('/proveedores')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            <ActionRow icon="alertTriangle" label="Sin Código Barra" badge={cal.sinCodigoBarra} badgeTone={cal.sinCodigoBarra > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/bodega?filtro=sin_codigo_barra')} />
            <ActionRow icon="alertTriangle" label="Sin Código Interno" badge={cal.sinCodigoInterno} badgeTone={cal.sinCodigoInterno > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/bodega?filtro=sin_codigo_interno')} />
            <ActionRow icon="alertTriangle" label="Sin Categoría" badge={cal.sinCategoria} badgeTone={cal.sinCategoria > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/bodega?filtro=sin_categoria')} />
            <ActionRow icon="alertTriangle" label="Sin Proveedor" badge={cal.sinProveedor} badgeTone={cal.sinProveedor > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/bodega?filtro=sin_proveedor')} />
          </SectionCard>
        )}

        {show.bodega && (
          <SectionCard title="Bodega Taller" icon="box">
            <StockRow label="Stock Crítico / 0" icon="alertTriangle"
              critico={tal.critico ?? 0} sinStock={tal.sinStock ?? 0} onClick={() => navigate('/bodega?tab=taller&filtro=critico')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            <ActionRow icon="box" label="Mantención productos" onClick={() => navigate('/bodega?tab=taller')} />
            <ActionRow icon="layers" label="Telas" onClick={() => navigate('/telas')} />
            <ActionRow icon="box" label="Bodega Taller" onClick={() => navigate('/bodega-taller')} />
          </SectionCard>
        )}

        {show.ventas && (
          <SectionCard title="Ventas" icon="shoppingCart">
            <ActionRow icon="grid" label="Matriz Ventas" onClick={() => navigate('/matriz-ventas')} />
            <ActionRow icon="dollarSign" label="Ventas No Pagadas" badge={n(stats?.ventas?.noPagadas)} badgeTone="red" onClick={() => navigate('/ventas?filtro=no_pagadas')} />
            <ActionRow icon="truck" label="Pendientes Entrega" badge={n(stats?.ventas?.pendienteEntrega)} badgeTone="blue" onClick={() => navigate('/ventas?filtro=pendiente_entrega')} />
            <ActionRow icon="cloud" label="Cotizaciones Web" badge={n(webPend)} badgeTone={webPend > 0 ? 'amber' : 'neutral'} onClick={() => navigate('/ventas?filtro=web')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            <ActionRow icon="plusCircle" label="Nueva Venta Sala" onClick={() => navigate('/ventas/nueva')} />
            <ActionRow icon="clipboard" label="Cotizar Licitación" onClick={() => navigate('/licitaciones')} />
            <ActionRow icon="briefcase" label="Convenio Marco" onClick={() => navigate('/licitaciones?tipo=convenio')} />
            <ActionRow icon="fileText" label="Reportes Licitaciones" onClick={() => navigate('/reportes/licitaciones')} />
            <ActionRow icon="tag" label="Consulta Precios" onClick={() => navigate('/consulta-precios')} />
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
            <ActionRow icon="users" label="Clientes" onClick={() => navigate('/clientes')} />
            <ActionRow icon="plusCircle" label="Nuevo Cliente" onClick={() => navigate('/clientes/nuevo')} />
          </SectionCard>
        )}

        {show.cobranza && (
          <SectionCard title="Cobranza & Pagos Proveedores" icon="dollarSign">
            <ActionRow icon="dollarSign" label="Menú Cobranza" onClick={() => navigate('/cobranza')} />
            <ActionRow icon="plusCircle" label="Nueva Boleta/Factura Prov." onClick={() => navigate('/pagos-proveedores')} />
            <ActionRow icon="alertTriangle" label="Facturas No Pagadas" badge={n(provPagos.facturasNoPagadas)} badgeTone={provPagos.facturasNoPagadas > 0 ? 'red' : 'neutral'} onClick={() => navigate('/pagos-proveedores?doc=Factura&estado=Pendiente')} />
            <ActionRow icon="alertTriangle" label="Boletas No Pagadas" badge={n(provPagos.boletasNoPagadas)} badgeTone={provPagos.boletasNoPagadas > 0 ? 'red' : 'neutral'} onClick={() => navigate('/pagos-proveedores?doc=Boleta&estado=Pendiente')} />
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
            <ActionRow icon="creditCard" label="Caja Movimientos" onClick={() => navigate('/caja')} />
            <ActionRow icon="fileText" label="Órdenes Compra" onClick={() => navigate('/ordenes-compra')} />
          </SectionCard>
        )}

        {show.admin && (
          <SectionCard title="Administración" icon="settings">
            <ActionRow icon="tag" label="Descuentos / Mant. Precios" onClick={() => navigate('/descuentos')} />
            <ActionRow icon="users" label="Usuarios" onClick={() => navigate('/usuarios')} />
            <ActionRow icon="lock" label="Accesos" onClick={() => navigate('/accesos')} />
            <ActionRow icon="settings" label="Configuración" onClick={() => navigate('/config')} />
            <ActionRow icon="user" label="RRHH Trabajadores" onClick={() => navigate('/rrhh')} />
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
