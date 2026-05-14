import { useState, useEffect, useRef } from 'react'
import { Badge, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { useAccesos } from '../../api/accesos'

const TABS = [
  { id: 'all',    label: 'Todos' },
  { id: 'erp',    label: 'ERP' },
  { id: 'ventas', label: 'Ventas' },
]

export default function AccesosPage() {
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const params = { page: String(page) }
  if (tab !== 'all') params.origen = tab
  if (debouncedSearch) params.search = debouncedSearch

  const { data: result = { items: [], total: 0, limit: 200 }, isLoading } = useAccesos(params)
  const items = result.items ?? []
  const total = result.total ?? 0
  const limit = result.limit ?? 200
  const pages = Math.max(1, Math.ceil(total / limit))

  const cols = [
    { key: 'fecha', label: 'Fecha',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v ? new Date(v).toLocaleString('es-CL') : '—'}</span> },
    { key: 'usuario', label: 'Usuario',
      render: v => <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span> },
    { key: 'origen', label: 'Origen',
      render: v => <Badge tone={v === 'erp' ? 'blue' : 'neutral'}>{v}</Badge> },
    { key: 'estado', label: 'Acción',
      render: v => <span style={{ fontSize: 12 }}>{v}</span> },
    { key: 'ip', label: 'IP',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v}</span> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'userAgent', label: 'User-Agent',
      render: v => v ? <span style={{ fontSize: 10, color: 'var(--text-3)', maxWidth: 240, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span> : <span style={{ color: 'var(--text-3)' }}>—</span> },
  ]

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Accesos al Sistema"
        subtitle={`${total.toLocaleString('es-CL')} eventos registrados`}
        breadcrumb={['Inicio', 'Admin', 'Accesos']}
      />
      <div className="kpi-strip">
        <KpiCard label="Total eventos" value={total.toLocaleString('es-CL')} icon="key" sublabel="Histórico login" />
        <KpiCard label="En página" value={items.length} icon="list" sublabel={`Página ${page} de ${pages}`} />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1) }} />
          <SearchBar placeholder="Buscar usuario, acción…" value={search} onChange={setSearch} style={{ width: 280, marginBottom: 10 }} />
        </div>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>‹ Anterior</button>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page >= pages ? 'not-allowed' : 'pointer' }}>Siguiente ›</button>
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={items} emptyMessage="Sin accesos" />
        }
      </div>
    </main>
  )
}
