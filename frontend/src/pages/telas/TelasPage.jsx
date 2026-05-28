import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, SearchBar, Table } from '../../components/shared'
import { useTelas } from '../../api/telas'

export default function TelasPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const params = {}
  if (debouncedSearch) params.search = debouncedSearch

  const { data: result = { items: [], total: 0 }, isLoading } = useTelas(params)
  const telas = result.items ?? []
  const total = result.total ?? 0

  const stockTotal = telas.reduce((s, t) => s + (t.stock || 0), 0)
  const sinStock = telas.filter(t => (t.stock || 0) <= 0).length

  const cols = [
    { key: 'codigo', label: 'Código',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--green-700)' }}>{v}</span> },
    { key: 'tipo', label: 'Tipo',
      render: v => v ? <Badge tone="neutral">{v}</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'nombre', label: 'Nombre',
      render: v => <span style={{ fontSize: 13 }}>{v || '—'}</span> },
    { key: 'ubicacion', label: 'Ubicación',
      render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span> },
    { key: 'stock', label: 'Stock', align: 'right',
      render: v => {
        const n = v || 0
        const tone = n <= 0 ? 'red' : n < 5 ? 'amber' : 'green'
        return <Badge tone={tone}><span style={{ fontFamily: "'DM Mono', monospace" }}>{n.toFixed(2)}</span></Badge>
      } },
    { key: '_acc', label: '',
      render: (_, row) => (
        <button
          onClick={e => { e.stopPropagation(); navigate('/telas/' + row.id) }}
          style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}
        >Ver</button>
      ) },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Telas"
        subtitle={`${total.toLocaleString('es-CL')} telas en catálogo`}
        breadcrumb={['Inicio', 'Taller', 'Telas']}
      />
      <div className="kpi-strip">
        <KpiCard label="Total telas" value={total} icon="layers" sublabel="En catálogo" />
        <KpiCard label="Stock total" value={stockTotal.toFixed(1)} icon="package" tone="blue" sublabel="Suma metros" />
        <KpiCard label="Sin stock" value={sinStock} icon="alertTriangle" tone="amber" sublabel="Requieren reposición" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <SearchBar placeholder="Buscar código, tipo, nombre…" value={search} onChange={setSearch} style={{ width: 320 }} />
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={telas} onRowClick={row => navigate('/telas/' + row.id)} emptyMessage="Sin telas" ariaLabel="Telas" getRowKey={row => row.id} />
        }
      </div>
    </main>
  )
}
