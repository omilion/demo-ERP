import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Tabs } from '../../components/shared'
import { useVentas } from '../../api/ventas'

const TABS = [
  { id: 'all',           label: 'Todas' },
  { id: 'Licitación',    label: 'Licitaciones' },
  { id: 'Convenio Marco', label: 'Convenio Marco' },
]

const ESTADO_TONE = {
  'Activa':      'blue',
  'Completada':  'green',
  'En proceso':  'blue',
  'Cerrada':     'neutral',
  'Nula':        'red',
}

export default function LicitacionesPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const params = {}
  if (tab !== 'all') params.tipo = tab
  if (debouncedSearch) params.search = debouncedSearch

  const { data: result = { items: [], total: 0 }, isLoading } = useVentas(params)
  const ventas = result.items ?? []
  const total = result.total ?? 0

  const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

  const montoTotal = ventas.reduce((s, v) => s + (v.total || 0), 0)
  const completadas = ventas.filter(v => v.estado === 'Completada' || v.estado === 'Cerrada').length
  const activas = ventas.filter(v => v.estado === 'Activa' || v.estado === 'En proceso').length

  const cols = [
    {
      key: 'id', label: 'N° Interno',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--green-700)' }}>{v}</span>
    },
    {
      key: 'licitacion', label: 'ID Licitación / OC',
      render: v => v
        ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v}</span>
        : <span style={{ color: 'var(--text-3)' }}>—</span>
    },
    {
      key: 'cliente', label: 'Organismo / Cliente', wrap: true,
      render: v => (
        <div style={{ maxWidth: 220 }}>
          <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v?.nombre || '—'}</div>
          {v?.rut && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{v.rut}</div>}
        </div>
      )
    },
    {
      key: 'tipo', label: 'Tipo',
      render: v => <Badge tone={v === 'Licitación' ? 'blue' : 'neutral'}>{v}</Badge>
    },
    {
      key: 'total', label: 'Monto', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13 }}>{fmt(v)}</span>
    },
    {
      key: 'estadoPago', label: 'Pago',
      render: v => {
        const tone = v === 'Pagada' ? 'green' : v === 'Parcial' ? 'amber' : 'red'
        return <Badge tone={tone}>{v}</Badge>
      }
    },
    {
      key: 'estadoEntrega', label: 'Entrega',
      render: v => {
        const tone = v === 'Entregada' ? 'green' : v === 'En despacho' ? 'blue' : v === 'Parcial' ? 'amber' : 'gray'
        return <Badge tone={tone}>{v}</Badge>
      }
    },
    {
      key: 'estado', label: 'Estado',
      render: v => <Badge tone={ESTADO_TONE[v] || 'gray'}>{v}</Badge>
    },
    {
      key: 'createdAt', label: 'Fecha',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{new Date(v).toLocaleDateString('es-CL')}</span>
    },
    {
      key: 'creadorNombre', label: 'Vendedor',
      render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span>
    },
    {
      key: '_acc', label: '',
      render: (_, row) => (
        <button
          onClick={e => { e.stopPropagation(); navigate('/ventas/' + row.id + '/editar') }}
          style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}
        >
          Ver
        </button>
      )
    },
  ]

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Licitaciones y Convenio Marco"
        subtitle={`${total.toLocaleString('es-CL')} registros en Mercado Público`}
        breadcrumb={['Inicio', 'Ventas', 'Licitaciones']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm">Exportar</Btn>
          <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/ventas/nueva')}>Nueva Licitación</Btn>
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total" value={total.toLocaleString('es-CL')} icon="clipboard" sublabel="Licitaciones y convenios" />
        <KpiCard label="Activas / En proceso" value={activas} icon="refreshCw" tone="blue" sublabel="En curso" />
        <KpiCard label="Completadas" value={completadas} icon="check" tone="neutral" sublabel="Cerradas" />
        <KpiCard label="Monto total" value={'$' + (montoTotal / 1_000_000).toFixed(1) + 'M'} icon="dollarSign" sublabel="Suma de todas las licitaciones" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setSearch('') }} />
          <SearchBar placeholder="Buscar organismo, ID licitación…" value={search} onChange={setSearch} style={{ width: 280, marginBottom: 10 }} />
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={ventas} onRowClick={row => navigate('/ventas/' + row.id + '/editar')} emptyMessage="Sin licitaciones registradas" />
        }
      </div>
    </main>
  )
}
