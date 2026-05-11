import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, KpiCard, SectionCard, ActionRow, PageHeader, Badge } from '../../components/shared'

const TallerRow = ({ name, pending, priority, navigate }) => {
  const [hov, setHov] = useState(false)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={() => navigate('/taller')} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 8,
      cursor: 'pointer', background: hov ? 'var(--green-50)' : 'transparent',
      border: `1px solid ${hov ? 'var(--green-100)' : 'transparent'}`, transition: 'all 0.14s', marginBottom: 2,
    }}>
      <span style={{ color: 'var(--green-600)', flexShrink: 0 }}><Icon name="tool" size={14} /></span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{name}</span>
      <div style={{ display: 'flex', gap: 5 }}>
        <Badge tone="amber">{pending.toLocaleString('es-CL')}</Badge>
        <Badge tone="red">{priority.toLocaleString('es-CL')}</Badge>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()

  const talleres = [
    { name: 'Taller General', pending: 4999, priority: 4995 },
    { name: 'Espumas', pending: 4639, priority: 4636 },
    { name: 'Confecciones', pending: 4835, priority: 4832 },
    { name: 'Madera', pending: 235, priority: 235 },
  ]
  const totalOTs = talleres.reduce((a, t) => a + t.pending, 0)

  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      <PageHeader title="Panel de Control" subtitle="Visión general de operaciones · Sucursal 5 Oriente" breadcrumb={['Inicio', 'Dashboard']} />

      <div className="kpi-strip">
        <KpiCard label="Stock Crítico — Inventario" value={14552} icon="alertTriangle" tone="amber" sublabel="Productos bajo mínimo" onClick={() => navigate('/bodega')} />
        <KpiCard label="Stock Crítico — Taller" value={305} icon="alertTriangle" tone="amber" sublabel="Insumos bajo mínimo" onClick={() => navigate('/bodega')} />
        <KpiCard label="Ventas No Pagadas" value={140} icon="dollarSign" tone="red" sublabel="Gestión cobranza requerida" onClick={() => navigate('/ventas')} />
        <KpiCard label="Pendientes Entrega" value={45} icon="truck" tone="blue" sublabel="Órdenes por despachar" onClick={() => navigate('/ventas')} />
        <KpiCard label="OTs Pendientes" value={totalOTs} icon="wrench" sublabel="Órdenes de trabajo abiertas" onClick={() => navigate('/taller')} />
      </div>

      <div className="dash-grid">
        <SectionCard title="Bodega" icon="warehouse">
          <ActionRow icon="warehouse" label="Mantención Bodega Inventario y Web" onClick={() => navigate('/bodega')} />
          <ActionRow icon="alertTriangle" label="Stock Crítico — Inventario" badge={14552} badgeTone="amber" onClick={() => navigate('/bodega')} />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
          <ActionRow icon="box" label="Mantención Bodega Taller" onClick={() => navigate('/bodega')} />
          <ActionRow icon="alertTriangle" label="Stock Crítico — Taller" badge={305} badgeTone="amber" onClick={() => navigate('/bodega')} />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
          <ActionRow icon="plusCircle" label="Ingreso Mercadería / Boleta" onClick={() => navigate('/bodega')} />
        </SectionCard>

        <SectionCard title="Estado Talleres" icon="tool">
          <div style={{ padding: '4px 14px 6px', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)' }}>Taller</span>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'oklch(0.48 0.14 68)', minWidth: 64, textAlign: 'right' }}>Pendientes</span>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--red)', minWidth: 64, textAlign: 'right' }}>Prioritarias</span>
          </div>
          {talleres.map(t => <TallerRow key={t.name} {...t} navigate={navigate} />)}
        </SectionCard>

        <SectionCard title="Ventas" icon="shoppingCart">
          <ActionRow icon="grid" label="Matriz Ventas" onClick={() => navigate('/ventas')} />
          <ActionRow icon="dollarSign" label="Ventas No Pagadas" badge={140} badgeTone="red" onClick={() => navigate('/ventas')} />
          <ActionRow icon="truck" label="Ventas Pendientes Entrega" badge={45} badgeTone="blue" onClick={() => navigate('/ventas')} />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />
          <ActionRow icon="clipboard" label="Licitaciones Cotizadas" onClick={() => navigate('/licitaciones')} />
          <ActionRow icon="tag" label="Consulta Precios" onClick={() => navigate('/bodega')} />
        </SectionCard>

        <SectionCard title="Accesos Rápidos" icon="zap">
          <ActionRow icon="users" label="Clientes" onClick={() => navigate('/clientes')} />
          <ActionRow icon="creditCard" label="Caja" onClick={() => navigate('/caja')} />
          <ActionRow icon="dollarSign" label="Cobranza" onClick={() => navigate('/cobranza')} />
          <ActionRow icon="fileText" label="Venta Sala" onClick={() => navigate('/ventas')} />
          <ActionRow icon="layers" label="Venta Web" onClick={() => navigate('/ventas')} />
          <ActionRow icon="history" label="Historial Movimientos" onClick={() => navigate('/taller')} />
        </SectionCard>
      </div>

      <div style={{ marginTop: 28, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Plastimar ERP · Sucursal 5 Oriente</span>
      </div>
    </main>
  )
}
