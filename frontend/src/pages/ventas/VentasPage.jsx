import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Badge, PageHeader, Btn, SearchBar, Table, Tabs, StatusDot } from '../../components/shared'
import { ViewVentaPanel } from '../../components/forms/ViewVentaPanel'
import { useVentas } from '../../api/ventas'


const FILTER_TABS = [
  { id: 'all', label: 'Todas' },
  { id: 'hoy', label: 'Hoy' },
  { id: 'no_pagada', label: 'No Pagadas' },
  { id: 'pend_entrega', label: 'Pend. Entrega' },
  { id: 'entregada', label: 'Entregadas' },
  { id: 'licitacion', label: 'Lic. / Convenio' },
]

export default function VentasPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const { data: ventas = [], isLoading } = useVentas()

  const today = new Date().toLocaleDateString('es-CL')

  const filtered = ventas.filter(v => {
    if (tab === 'no_pagada') return v.estadoPago === 'No pagada'
    if (tab === 'pend_entrega') return v.estadoEntrega === 'Pendiente entrega'
    if (tab === 'entregada') return v.estadoEntrega === 'Entregada'
    if (tab === 'licitacion') return v.tipo === 'Licitación' || v.tipo === 'Convenio Marco'
    if (tab === 'hoy') return new Date(v.createdAt).toLocaleDateString('es-CL') === today
    return true
  }).filter(v => !search ||
    (v.cliente?.nombre || '').toLowerCase().includes(search.toLowerCase()) ||
    String(v.id).includes(search) ||
    (v.cliente?.rut || '').includes(search)
  )

  const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

  const noPagedas = ventas.filter(v => v.estadoPago === 'No pagada').length
  const pendEntrega = ventas.filter(v => v.estadoEntrega === 'Pendiente entrega').length
  const totalMes = ventas.reduce((s, v) => s + (v.total || 0), 0)
  const licitaciones = ventas.filter(v => v.tipo === 'Licitación').length

  const cols = [
    { key: 'id', label: 'N° Interno', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v}</span> },
    { key: 'cliente', label: 'Cliente', wrap: true, render: v => <span style={{ maxWidth: 220, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{v?.nombre}</span> },
    { key: 'tipo', label: 'Tipo', render: v => <Badge tone={v === 'Licitación' ? 'blue' : v === 'Convenio Marco' ? 'neutral' : 'gray'}>{v}</Badge> },
    { key: 'total', label: 'Total', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(v)}</span> },
    { key: 'abono', label: 'Abono', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: v > 0 ? 'var(--green-600)' : 'var(--text-3)' }}>{fmt(v)}</span> },
    { key: 'estadoPago', label: 'Pago', render: v => <StatusDot status={v} /> },
    { key: 'estadoEntrega', label: 'Entrega', render: v => <StatusDot status={v} /> },
    { key: 'licitacion', label: 'Licitación / N° OC', render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-2)' }}>{v}</span> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'guias', label: 'Guía', render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--green-700)' }}>#{v}</span> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'createdAt', label: 'Fecha', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{new Date(v).toLocaleDateString('es-CL')}</span> },
    { key: 'creadorNombre', label: 'Vendedor' },
    { key: '_actions', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={e => { e.stopPropagation(); setSelected(row) }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}>Ver</button>
      </div>
    )},
  ]

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Matriz Ventas"
        subtitle={`${filtered.length} ventas · Sucursal 5 Oriente`}
        breadcrumb={['Inicio', 'Ventas', 'Matriz Ventas']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm">Excel</Btn>
          <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/ventas/nueva')}>Nueva Venta</Btn>
        </>}
      />

      <div className="kpi-strip">
        {[
          { label: 'No Pagadas', value: noPagedas, icon: 'dollarSign' },
          { label: 'Pend. Entrega', value: pendEntrega, icon: 'truck' },
          { label: 'Total mes', value: fmt(totalMes), icon: 'barChart2' },
          { label: 'Licitaciones activas', value: licitaciones, icon: 'clipboard' },
        ].map((k, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
            background: '#fff', borderRadius: 9, border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <span style={{ color: 'var(--green-600)' }}><Icon name={k.icon} size={15} /></span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 16, color: 'var(--text-1)' }}>{typeof k.value === 'number' ? k.value.toLocaleString('es-CL') : k.value}</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{k.label}</span>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Tabs tabs={FILTER_TABS} active={tab} onChange={setTab} />
            <SearchBar placeholder="Buscar cliente, N° o RUT…" value={search} onChange={setSearch} style={{ width: 260 }} />
          </div>
        </div>
        {isLoading
          ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={filtered} onRowClick={row => setSelected(row)} />
        }
      </div>

      {selected && <ViewVentaPanel venta={selected} onClose={() => setSelected(null)} onEdit={() => { navigate('/ventas/' + selected.id + '/editar'); setSelected(null) }} />}
    </main>
  )
}
