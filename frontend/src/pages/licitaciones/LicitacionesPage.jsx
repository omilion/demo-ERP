import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table } from '../../components/shared'
import { useCotizaciones } from '../../api/cotizaciones'

const ESTADO_TONE = {
  'Pendiente':    'amber',
  'Adjudicada':   'green',
  'Cerrada':      'neutral',
  'Rechazada':    'red',
  'En proceso':   'blue',
}

export default function LicitacionesPage() {
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

  const { data: result = { items: [], total: 0, limit: 100 }, isLoading } = useCotizaciones(params)
  const cotizaciones = result.items ?? []
  const total = result.total ?? 0
  const limit = result.limit ?? 100
  const pages = Math.max(1, Math.ceil(total / limit))

  const cols = [
    {
      key: 'idLicitacion', label: 'ID Licitación',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 12, color: 'var(--green-700)' }}>{v || '—'}</span>
    },
    {
      key: 'rutCliente', label: 'RUT Organismo',
      render: v => v
        ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v}</span>
        : <span style={{ color: 'var(--text-3)' }}>—</span>
    },
    {
      key: 'referencia', label: 'Referencia', wrap: true,
      render: v => <span style={{ fontSize: 13, maxWidth: 240, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '—'}</span>
    },
    {
      key: 'ordenCompra', label: 'OC',
      render: v => v
        ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-2)' }}>{v}</span>
        : <span style={{ color: 'var(--text-3)' }}>—</span>
    },
    {
      key: 'plazo', label: 'Plazo',
      render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span>
    },
    {
      key: 'estado', label: 'Estado',
      render: v => <Badge tone={ESTADO_TONE[v] || 'gray'}>{v}</Badge>
    },
    {
      key: 'fechaCreacion', label: 'Fecha',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{v ? new Date(v).toLocaleDateString('es-CL') : '—'}</span>
    },
    {
      key: 'usuario', label: 'Vendedor',
      render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span>
    },
    {
      key: '_acc', label: '',
      render: (_, row) => (
        <button
          onClick={e => { e.stopPropagation(); navigate('/licitaciones/' + row.id) }}
          style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}
        >
          Ver
        </button>
      )
    },
  ]

  const pendientes = cotizaciones.filter(c => c.estado === 'Pendiente' || c.estado === 'En proceso').length
  const adjudicadas = cotizaciones.filter(c => c.estado === 'Adjudicada').length

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Cotizaciones de Licitación"
        subtitle={`${total.toLocaleString('es-CL')} cotizaciones a organismos públicos`}
        breadcrumb={['Inicio', 'Ventas', 'Licitaciones']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm">Exportar</Btn>
          <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/licitaciones/nueva')}>Nueva Cotización</Btn>
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total cotizaciones" value={total.toLocaleString('es-CL')} icon="clipboard" sublabel="Histórico" />
        <KpiCard label="En página" value={cotizaciones.length} icon="list" tone="neutral" sublabel={`Página ${page} de ${pages}`} />
        <KpiCard label="Pendientes" value={pendientes} icon="clock" tone="amber" sublabel="En revisión" />
        <KpiCard label="Adjudicadas" value={adjudicadas} icon="check" tone="blue" sublabel="Ganadas" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <SearchBar placeholder="Buscar ID licitación, OC, referencia…" value={search} onChange={setSearch} style={{ width: 320 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>‹ Anterior</button>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page >= pages ? 'not-allowed' : 'pointer' }}>Siguiente ›</button>
          </div>
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={cotizaciones} onRowClick={row => navigate('/licitaciones/' + row.id)} emptyMessage="Sin cotizaciones registradas" />
        }
      </div>
    </main>
  )
}
