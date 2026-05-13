import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Badge, KpiCard, SectionCard, ActionRow, PageHeader, Btn } from '../../components/shared'
import { useDashboardStats } from '../../api/dashboard'

const TALLER_ICONS = { Espumas: 'layers', Confecciones: 'scissors', Madera: 'box' }

function TallerBar({ tipo, activas, max }) {
  const [hov, setHov] = useState(false)
  const navigate = useNavigate()
  const pct = max > 0 ? Math.round((activas / max) * 100) : 0
  const color = pct > 70 ? 'var(--red)' : pct > 40 ? 'var(--amber)' : 'var(--green-600)'
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={() => navigate('/taller')}
      style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer', background: hov ? 'var(--green-50)' : 'transparent', transition: 'all 0.14s', marginBottom: 2 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: 'var(--green-600)' }}><Icon name={TALLER_ICONS[tipo] || 'tool'} size={13} /></span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{tipo}</span>
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

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: stats, isLoading } = useDashboardStats()

  const inv = stats?.stock?.Inventario ?? {}
  const tal = stats?.stock?.Taller ?? {}
  const maxTaller = Math.max(...(stats?.talleres ?? []).map(t => t.activas), 1)

  const now = new Date()
  const hora = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  const fecha = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Panel de Control"
        subtitle={`${fecha} · ${hora} · Sucursal 5 Oriente`}
        breadcrumb={['Inicio', 'Dashboard']}
        actions={
          <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/ventas/nueva')}>Nueva Venta</Btn>
        }
      />

      <div className="kpi-strip">
        <KpiCard
          label="Ventas No Pagadas"
          value={isLoading ? '…' : stats.ventas.noPagadas.toLocaleString('es-CL')}
          icon="dollarSign" tone="red"
          sublabel="Gestión cobranza requerida"
          onClick={() => navigate('/ventas')}
        />
        <KpiCard
          label="Pendientes Entrega"
          value={isLoading ? '…' : stats.ventas.pendienteEntrega.toLocaleString('es-CL')}
          icon="truck" tone="blue"
          sublabel="Órdenes por despachar"
          onClick={() => navigate('/ventas')}
        />
        <KpiCard
          label="ODTs Activas"
          value={isLoading ? '…' : stats.odts.total.toLocaleString('es-CL')}
          icon="wrench"
          sublabel={isLoading ? '' : `${stats.odts.urgentes} urgentes`}
          tone={stats?.odts?.urgentes > 0 ? 'amber' : 'neutral'}
          onClick={() => navigate('/taller')}
        />
        <KpiCard
          label="Stock Crítico — Inventario"
          value={isLoading ? '…' : ((inv.critico ?? 0) + (inv.sinStock ?? 0)).toLocaleString('es-CL')}
          icon="alertTriangle" tone="amber"
          sublabel={isLoading ? '' : `${inv.sinStock ?? 0} sin stock`}
          onClick={() => navigate('/bodega')}
        />
        <KpiCard
          label="Stock Crítico — Taller"
          value={isLoading ? '…' : ((tal.critico ?? 0) + (tal.sinStock ?? 0)).toLocaleString('es-CL')}
          icon="alertTriangle" tone="amber"
          sublabel={isLoading ? '' : `${tal.sinStock ?? 0} sin stock`}
          onClick={() => navigate('/bodega')}
        />
      </div>

      <div className="dash-grid">
        <SectionCard title="Talleres — ODTs Activas" icon="tool">
          <div style={{ padding: '4px 14px 8px', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--blue)', fontSize: 13 }}>
                  {isLoading ? '…' : stats.odts.enProceso.toLocaleString('es-CL')}
                </span>{' '}en proceso
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--amber)', fontSize: 13 }}>
                  {isLoading ? '…' : stats.odts.pendientes.toLocaleString('es-CL')}
                </span>{' '}pendientes
              </span>
              {!isLoading && stats.odts.urgentes > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--red)', fontSize: 13 }}>
                    {stats.odts.urgentes.toLocaleString('es-CL')}
                  </span>{' '}urgentes
                </span>
              )}
            </div>
            <button onClick={() => navigate('/taller')} style={{ fontSize: 11, color: 'var(--green-600)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
              Ver todas →
            </button>
          </div>
          {(stats?.talleres ?? []).map(t => (
            <TallerBar key={t.tipo} {...t} max={maxTaller} />
          ))}
        </SectionCard>

        <SectionCard title="Bodega" icon="warehouse">
          <StockRow
            label="Bodega Inventario"
            icon="warehouse"
            critico={inv.critico ?? 0}
            sinStock={inv.sinStock ?? 0}
            onClick={() => navigate('/bodega')}
          />
          <StockRow
            label="Bodega Taller"
            icon="box"
            critico={tal.critico ?? 0}
            sinStock={tal.sinStock ?? 0}
            onClick={() => navigate('/bodega?tab=taller')}
          />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
          <ActionRow icon="plusCircle" label="Ingreso Mercadería" onClick={() => navigate('/bodega/nuevo')} />
          <ActionRow icon="tag" label="Consulta Precios" onClick={() => navigate('/bodega')} />
        </SectionCard>

        <SectionCard title="Ventas" icon="shoppingCart">
          <ActionRow icon="grid" label="Matriz Ventas" onClick={() => navigate('/ventas')} />
          <ActionRow
            icon="dollarSign"
            label="Ventas No Pagadas"
            badge={isLoading ? '…' : stats.ventas.noPagadas}
            badgeTone="red"
            onClick={() => navigate('/ventas')}
          />
          <ActionRow
            icon="truck"
            label="Pendientes Entrega"
            badge={isLoading ? '…' : stats.ventas.pendienteEntrega}
            badgeTone="blue"
            onClick={() => navigate('/ventas')}
          />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
          <ActionRow icon="clipboard" label="Licitaciones / Convenio Marco" onClick={() => navigate('/licitaciones')} />
          <ActionRow icon="plusCircle" label="Nueva Venta" onClick={() => navigate('/ventas/nueva')} />
        </SectionCard>

        <SectionCard title="Accesos Rápidos" icon="zap">
          <ActionRow icon="users" label="Clientes" onClick={() => navigate('/clientes')} />
          <ActionRow icon="creditCard" label="Caja" onClick={() => navigate('/caja')} />
          <ActionRow icon="dollarSign" label="Cobranza" onClick={() => navigate('/cobranza')} />
          <ActionRow icon="fileText" label="Nueva ODT" onClick={() => navigate('/taller/nueva')} />
          <ActionRow icon="layers" label="Nueva Venta Sala" onClick={() => navigate('/ventas/nueva')} />
          <ActionRow icon="history" label="Historial Taller" onClick={() => navigate('/taller')} />
        </SectionCard>
      </div>

      <div style={{ marginTop: 28, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Plastimar ERP · Sucursal 5 Oriente</span>
        {!isLoading && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {(inv.total ?? 0).toLocaleString('es-CL')} productos en inventario · {(tal.total ?? 0).toLocaleString('es-CL')} en taller
          </span>
        )}
      </div>
    </main>
  )
}
