import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon, Badge, PageHeader, Btn, SearchBar, Table, Tabs, StatusDot } from '../../components/shared'
import { ViewVentaPanel } from '../../components/forms/ViewVentaPanel'
import { useVentas } from '../../api/ventas'
import { downloadFromBackend } from '../../utils/csv'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const FILTER_TABS = [
  { id: 'all',          label: 'Todas' },
  { id: 'hoy',          label: 'Hoy' },
  { id: 'no_pagada',    label: 'No Pagadas' },
  { id: 'pend_entrega', label: 'Pend. Entrega' },
  { id: 'web',          label: 'Web' },
  { id: 'licitacion',   label: 'Lic. / Convenio' },
]

const TAB_PARAMS = {
  no_pagada:    { estadoPago: 'No pagada' },
  pend_entrega: { estadoEntrega: 'Pendiente entrega' },
  web:           { tipo: 'Venta Web' },
  licitacion:   { tipo: 'Licitación' },
}

const URL_FILTERS = {
  no_pagadas: 'no_pagada',
  no_pagada: 'no_pagada',
  pendiente_entrega: 'pend_entrega',
  pend_entrega: 'pend_entrega',
  web: 'web',
  licitacion: 'licitacion',
}

export default function VentasPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialFiltro = URL_FILTERS[searchParams.get('filtro')] || 'all'
  const initialSearch = searchParams.get('search') || ''
  const { user } = useAuthStore()
  const canWriteVentas = can(user, 'ventas', 'write')
  const canDeleteVentas = can(user, 'ventas', 'delete')
  const [tab, setTab] = useState(initialFiltro)
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const apiParams = { ...TAB_PARAMS[tab] }
  if (debouncedSearch) apiParams.search = debouncedSearch

  const { data: result = { items: [], total: 0, limit: 100 }, isLoading } = useVentas(apiParams)
  const ventas = result.items ?? []
  const total = result.total ?? 0
  const LIMIT = result.limit ?? 100

  // For hoy filter (client-side, small set)
  const today = new Date().toLocaleDateString('es-CL')
  const filtered = tab === 'hoy'
    ? ventas.filter(v => new Date(v.createdAt).toLocaleDateString('es-CL') === today)
    : ventas

  const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

  const cols = [
    { key: 'id', label: 'N° Interno', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v}</span> },
    { key: 'cliente', label: 'Cliente', wrap: true, render: v => (
      <div style={{ maxWidth: 200 }}>
        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v?.nombre || '—'}</div>
        {v?.rut && <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>{v.rut}</div>}
      </div>
    )},
    { key: 'tipo', label: 'Tipo', render: v => <Badge tone={v === 'Licitación' ? 'blue' : v === 'Convenio Marco' ? 'neutral' : 'gray'}>{v}</Badge> },
    { key: 'total', label: 'Total', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(v)}</span> },
    { key: 'abono', label: 'Abono', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: v > 0 ? 'var(--green-600)' : 'var(--text-3)' }}>{fmt(v)}</span> },
    { key: 'estadoPago', label: 'Pago', render: v => <StatusDot status={v} /> },
    { key: 'estadoEntrega', label: 'Entrega', render: v => <StatusDot status={v} /> },
    { key: 'licitacion', label: 'Licitación / OC', render: v => v
      ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-2)' }}>{v}</span>
      : <span style={{ color: 'var(--text-3)' }}>—</span>
    },
    { key: 'guias', label: 'Guía', render: v => v
      ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--green-700)' }}>#{v}</span>
      : <span style={{ color: 'var(--text-3)' }}>—</span>
    },
    { key: 'createdAt', label: 'Fecha', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{new Date(v).toLocaleDateString('es-CL')}</span> },
    { key: 'creadorNombre', label: 'Vendedor', render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span> },
    { key: '_actions', label: '', render: (_, row) => (
      <button onClick={e => { e.stopPropagation(); setSelected(row) }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}>Ver</button>
    )},
  ]

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Matriz Ventas"
        subtitle={`${total.toLocaleString('es-CL')} ventas en total`}
        breadcrumb={['Inicio', 'Ventas', 'Matriz Ventas']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm"
            onClick={() => downloadFromBackend('/reportes/export/ventas', `ventas_${new Date().toISOString().slice(0, 10)}.csv`)}
          >Exportar CSV</Btn>
          {canWriteVentas && <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/ventas/nueva')}>Nueva Venta</Btn>}
        </>}
      />

      <div className="kpi-strip">
        {[
          { label: 'Total ventas', value: total.toLocaleString('es-CL'), icon: 'barChart2' },
          { label: 'Mostrando', value: ventas.length, icon: 'list' },
        ].map((k, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#fff', borderRadius: 9, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <span style={{ color: 'var(--green-600)' }}><Icon name={k.icon} size={15} /></span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 16, color: 'var(--text-1)' }}>{k.value}</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{k.label}</span>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Tabs tabs={FILTER_TABS} active={tab} onChange={t => { setTab(t); setSearch('') }} />
            <SearchBar placeholder="Buscar N°, vendedor, licitación…" value={search} onChange={setSearch} style={{ width: 280 }} />
          </div>
        </div>
        {total > LIMIT && (
          <div style={{ padding: '7px 16px', background: 'var(--amber-bg, #fffbeb)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)' }}>
            Mostrando las {LIMIT} más recientes de {total.toLocaleString('es-CL')}. Use el buscador o los filtros para encontrar ventas específicas.
          </div>
        )}
        {isLoading
          ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={filtered} onRowClick={row => setSelected(row)} />
        }
      </div>

      {selected && <ViewVentaPanel venta={selected} canWrite={canWriteVentas} canDelete={canDeleteVentas} onClose={() => setSelected(null)} onEdit={() => { navigate('/ventas/' + selected.id + '/editar'); setSelected(null) }} />}
    </main>
  )
}
