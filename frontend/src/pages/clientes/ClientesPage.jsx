import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table } from '../../components/shared'
import { ViewClientePanel } from '../../components/forms/FormCliente'
import { useClientes } from '../../api/clientes'

export default function ClientesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState('all')
  const [selected, setSelected] = useState(null)

  const { data: clientes = [], isLoading } = useClientes()

  if (isLoading) return <main style={{ padding: 24 }}><p>Cargando...</p></main>

  const shown = clientes
    .filter(c => tipoFilter === 'all' || c.tipo === tipoFilter)
    .filter(c => !search || c.nombre.toLowerCase().includes(search.toLowerCase()) || c.rut.includes(search) || (c.ciudad || '').toLowerCase().includes(search.toLowerCase()))

  const tipos = [...new Set(clientes.map(c => c.tipo).filter(Boolean))]
  const fmt = n => '$' + n.toLocaleString('es-CL')

  const cols = [
    { key: 'rut', label: 'RUT', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v}</span> },
    { key: 'nombre', label: 'Cliente', wrap: true, render: v => <span style={{ fontWeight: 500, fontSize: 13 }}>{v}</span> },
    { key: 'ciudad', label: 'Ciudad' },
    { key: 'tipo', label: 'Tipo', render: v => {
      const tone = { Institucional: 'blue', Municipal: 'neutral', Gobierno: 'neutral', Distribuidor: 'amber', Empresa: 'gray' }[v] || 'gray'
      return <Badge tone={tone}>{v}</Badge>
    }},
    { key: 'limiteCredito', label: 'Límite crédito', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v != null ? fmt(v) : '—'}</span> },
    { key: 'saldo', label: 'Saldo deuda', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: v > 0 ? 700 : 400, color: v > 0 ? 'var(--red)' : 'var(--text-3)', fontSize: 12 }}>{v > 0 ? fmt(v) : '—'}</span> },
    { key: 'email', label: 'Email', render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v}</span> },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={e => { e.stopPropagation(); setSelected(row) }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}>Ver</button>
        <button onClick={e => { e.stopPropagation(); navigate('/clientes/' + row.id + '/editar') }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)', fontWeight: 500 }}>Editar</button>
      </div>
    )},
  ]

  const deudaTotal = clientes.reduce((s, c) => s + (c.saldo || 0), 0)

  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      <PageHeader title="Clientes" subtitle={`${shown.length} de ${clientes.length} clientes`} breadcrumb={['Inicio', 'Clientes']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm">Exportar</Btn>
          <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/clientes/nuevo')}>Nuevo Cliente</Btn>
        </>}
      />
      <div className="kpi-strip">
        <KpiCard label="Total clientes" value={clientes.length} icon="users" sublabel="Registrados en el sistema" />
        <KpiCard label="Con deuda activa" value={clientes.filter(c => c.saldo > 0).length} icon="dollarSign" tone="red" sublabel="Saldo pendiente" />
        <KpiCard label="Deuda total" value={'$' + (deudaTotal / 1_000_000).toFixed(1) + 'M'} icon="barChart2" tone="amber" sublabel="Suma de saldos" />
        <KpiCard label="Institucional / Gob." value={clientes.filter(c => ['Institucional', 'Gobierno', 'Municipal'].includes(c.tipo)).length} icon="clipboard" sublabel="Clientes públicos" />
      </div>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {['all', ...tipos].map(t => (
              <button key={t} onClick={() => setTipoFilter(t)} style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: tipoFilter === t ? 'var(--green-900)' : '#fff',
                color: tipoFilter === t ? '#fff' : 'var(--text-2)',
                border: `1px solid ${tipoFilter === t ? 'var(--green-900)' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}>{t === 'all' ? 'Todos' : t}</button>
            ))}
          </div>
          <SearchBar placeholder="Buscar por nombre, RUT o ciudad…" value={search} onChange={setSearch} style={{ width: 280 }} />
        </div>
        <Table columns={cols} rows={shown} />
      </div>
      {selected && <ViewClientePanel cliente={selected} onClose={() => setSelected(null)} onEdit={() => { navigate('/clientes/' + selected.id + '/editar'); setSelected(null) }} />}
    </main>
  )
}
