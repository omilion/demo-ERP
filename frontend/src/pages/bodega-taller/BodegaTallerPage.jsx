import { useState, useEffect, useRef } from 'react'
import { Badge, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { useBodegaTaller } from '../../api/bodegaTaller'

const TABS = [
  { id: 'all',          label: 'Todos' },
  { id: 'true',         label: 'Stock crítico' },
]

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

export default function BodegaTallerPage() {
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
  if (debouncedSearch) params.search = debouncedSearch
  if (tab === 'true') params.stockCritico = 'true'

  const { data: result = { items: [], total: 0, limit: 200 }, isLoading } = useBodegaTaller(params)
  const items = result.items ?? []
  const total = result.total ?? 0
  const limit = result.limit ?? 200
  const pages = Math.max(1, Math.ceil(total / limit))

  const criticos = items.filter(i => i.stock <= i.stockCritico).length

  const cols = [
    { key: 'codigoInterno', label: 'Código',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--green-700)' }}>{v}</span> },
    { key: 'nombre', label: 'Nombre', wrap: true,
      render: v => <span style={{ fontSize: 13 }}>{v}</span> },
    { key: 'unidadMedida', label: 'Unidad',
      render: v => v ? <Badge tone="neutral">{v}</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'stock', label: 'Stock', align: 'right',
      render: (v, row) => {
        const tone = v <= 0 ? 'red' : v <= row.stockCritico ? 'amber' : 'green'
        return <Badge tone={tone}><span style={{ fontFamily: "'DM Mono', monospace" }}>{(v || 0).toFixed(2)}</span></Badge>
      } },
    { key: 'stockCritico', label: 'Crítico', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{(v || 0).toFixed(2)}</span> },
    { key: 'precio', label: 'Precio', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(v)}</span> },
    { key: 'codigoBarra', label: 'Cód. barra',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-3)' }}>{v}</span> : <span style={{ color: 'var(--text-3)' }}>—</span> },
  ]

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Bodega Taller"
        subtitle={`${total.toLocaleString('es-CL')} materiales de taller`}
        breadcrumb={['Inicio', 'Taller', 'Bodega']}
      />
      <div className="kpi-strip">
        <KpiCard label="Total materiales" value={total} icon="box" sublabel="En catálogo" />
        <KpiCard label="En página" value={items.length} icon="list" sublabel={`Página ${page} de ${pages}`} />
        <KpiCard label="Stock crítico" value={criticos} icon="alertTriangle" tone="amber" sublabel="Bajo umbral" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1) }} />
          <SearchBar placeholder="Buscar código, nombre…" value={search} onChange={setSearch} style={{ width: 280, marginBottom: 10 }} />
        </div>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>‹ Anterior</button>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page >= pages ? 'not-allowed' : 'pointer' }}>Siguiente ›</button>
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={items} emptyMessage="Sin materiales" />
        }
      </div>
    </main>
  )
}
