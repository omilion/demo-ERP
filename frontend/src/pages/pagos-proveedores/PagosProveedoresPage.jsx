import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { usePagosProveedores } from '../../api/pagosProveedores'

const TABS = [
  { id: 'all',       label: 'Todos' },
  { id: 'Pendiente', label: 'Pendientes' },
  { id: 'Pagado',    label: 'Pagados' },
  { id: 'Vencido',   label: 'Vencidos' },
]

const ESTADO_TONE = {
  'Pendiente': 'amber', 'Pagado': 'green', 'Vencido': 'red', 'Anulado': 'neutral',
}

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

export default function PagosProveedoresPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const params = { page: String(page) }
  if (tab !== 'all') params.estado = tab
  if (debouncedSearch) params.search = debouncedSearch

  const { data: result = { items: [], total: 0, limit: 100 }, isLoading } = usePagosProveedores(params)
  const items = result.items ?? []
  const total = result.total ?? 0
  const limit = result.limit ?? 100
  const pages = Math.max(1, Math.ceil(total / limit))

  const cols = [
    { key: 'nDoc', label: 'N° Doc',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v || '—'}</span> },
    { key: 'documento', label: 'Tipo',
      render: v => v ? <Badge tone="neutral">{v}</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'proveedor', label: 'Proveedor', wrap: true,
      render: v => v
        ? <div style={{ maxWidth: 240 }}>
            <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nombre}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{v.rut || '—'}</div>
          </div>
        : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'fechaDoc', label: 'Fecha doc',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v ? new Date(v).toLocaleDateString('es-CL') : '—'}</span> },
    { key: 'fechaVencimiento', label: 'Vencimiento',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-2)' }}>{v ? new Date(v).toLocaleDateString('es-CL') : '—'}</span> },
    { key: 'fechaPago', label: 'Pago',
      render: v => v
        ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--green-700)' }}>{new Date(v).toLocaleDateString('es-CL')}</span>
        : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'total', label: 'Total', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmt(v)}</span> },
    { key: 'estado', label: 'Estado',
      render: v => <Badge tone={ESTADO_TONE[v] || 'gray'}>{v}</Badge> },
    { key: 'nc', label: 'NC',
      render: (v, row) => v ? <Badge tone="amber">{row.ncNumero || 'Sí'}</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: '_acc', label: '',
      render: (_, row) => (
        <button
          onClick={e => { e.stopPropagation(); navigate('/pagos-proveedores/' + row.id) }}
          style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}
        >Ver</button>
      ) },
  ]

  const montoTotal = items.reduce((s, i) => s + (i.total || 0), 0)
  const pendientes = items.filter(i => i.estado === 'Pendiente').length

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Pagos a Proveedores"
        subtitle={`${total.toLocaleString('es-CL')} pagos registrados`}
        breadcrumb={['Inicio', 'Proveedores', 'Pagos']}
      />
      <div className="kpi-strip">
        <KpiCard label="Total pagos" value={total.toLocaleString('es-CL')} icon="creditCard" sublabel="Histórico" />
        <KpiCard label="En página" value={items.length} icon="list" sublabel={`Página ${page} de ${pages}`} />
        <KpiCard label="Pendientes (página)" value={pendientes} icon="clock" tone="amber" sublabel="Por pagar" />
        <KpiCard label="Monto página" value={fmt(montoTotal)} icon="dollarSign" tone="blue" sublabel="Suma página" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1); setSearch('') }} />
          <SearchBar placeholder="Buscar N° doc, código…" value={search} onChange={setSearch} style={{ width: 280, marginBottom: 10 }} />
        </div>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>‹ Anterior</button>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page >= pages ? 'not-allowed' : 'pointer' }}>Siguiente ›</button>
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={items} onRowClick={row => navigate('/pagos-proveedores/' + row.id)} emptyMessage="Sin pagos" />
        }
      </div>
    </main>
  )
}
