import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, SearchBar, Table } from '../../components/shared'
import { useOrdenesCompra } from '../../api/ordenesCompra'

const ESTADO_TONE = {
  'Procesada':  'green', 'Pendiente':  'amber', 'Entregada': 'green',
  'Anulada':    'red',   'En proceso': 'blue',
}

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

export default function OrdenesCompraPage() {
  const navigate = useNavigate()
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
  if (debouncedSearch) params.search = debouncedSearch

  const { data: result = { items: [], total: 0, limit: 100 }, isLoading } = useOrdenesCompra(params)
  const items = result.items ?? []
  const total = result.total ?? 0
  const limit = result.limit ?? 100
  const pages = Math.max(1, Math.ceil(total / limit))

  const cols = [
    { key: 'nCompra', label: 'N° Compra',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--green-700)' }}>{v}</span> },
    { key: 'fechaHora', label: 'Fecha',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{v ? new Date(v).toLocaleString('es-CL') : '—'}</span> },
    { key: 'emailComprador', label: 'Email comprador', wrap: true,
      render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'total', label: 'Total', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmt(v)}</span> },
    { key: 'canal', label: 'Canal',
      render: v => v ? <Badge tone="neutral">{v}</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'tipoDocumento', label: 'Doc',
      render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'codigoVendedor', label: 'Vendedor',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v}</span> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'estadoCompra', label: 'Estado',
      render: v => v ? <Badge tone={ESTADO_TONE[v] || 'gray'}>{v}</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: '_acc', label: '',
      render: (_, row) => (
        <button
          onClick={e => { e.stopPropagation(); navigate('/ordenes-compra/' + row.id) }}
          style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}
        >Ver</button>
      ) },
  ]

  const montoTotal = items.reduce((s, i) => s + (i.total || 0), 0)

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Órdenes de Compra Online"
        subtitle={`${total.toLocaleString('es-CL')} órdenes desde el sitio web`}
        breadcrumb={['Inicio', 'Ventas', 'OC Online']}
      />
      <div className="kpi-strip">
        <KpiCard label="Total OC" value={total.toLocaleString('es-CL')} icon="shoppingCart" sublabel="Histórico" />
        <KpiCard label="En página" value={items.length} icon="list" sublabel={`Página ${page} de ${pages}`} />
        <KpiCard label="Monto página" value={fmt(montoTotal)} icon="dollarSign" tone="blue" sublabel="Suma página actual" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <SearchBar placeholder="Buscar N° compra, email…" value={search} onChange={setSearch} style={{ width: 320 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>‹ Anterior</button>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page >= pages ? 'not-allowed' : 'pointer' }}>Siguiente ›</button>
          </div>
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={items} onRowClick={row => navigate('/ordenes-compra/' + row.id)} emptyMessage="Sin órdenes" />
        }
      </div>
    </main>
  )
}
