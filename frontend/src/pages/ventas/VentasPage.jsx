import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon, Badge, PageHeader, Btn, SearchBar, Table, Tabs, StatusDot } from '../../components/shared'
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
  licitacion:   { tipo: 'licitacion-convenio' },
}

const URL_FILTERS = {
  no_pagadas: 'no_pagada',
  no_pagada: 'no_pagada',
  pendiente_entrega: 'pend_entrega',
  pend_entrega: 'pend_entrega',
  web: 'web',
  licitacion: 'licitacion',
}

const todayIso = () => {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export default function VentasPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialFiltro = URL_FILTERS[searchParams.get('filtro')] || 'all'
  const initialSearch = searchParams.get('search') || ''
  const { user } = useAuthStore()
  const canWriteVentas = can(user, 'ventas', 'write')
  const [tab, setTab] = useState(initialFiltro)
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [pageState, setPageState] = useState({ key: '', page: 1 })
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const filterParams = { ...TAB_PARAMS[tab] }
  if (debouncedSearch) filterParams.search = debouncedSearch
  const filterKey = JSON.stringify(filterParams)
  const page = pageState.key === filterKey ? pageState.page : 1
  const setPagerPage = nextPage => setPageState({ key: filterKey, page: nextPage })
  const apiParams = { ...filterParams, page: String(page) }
  const exportParams = { ...filterParams }
  if (tab === 'hoy') {
    const today = todayIso()
    exportParams.desde = today
    exportParams.hasta = today
  }

  const { data: result = { items: [], total: 0, limit: 100 }, isLoading } = useVentas(apiParams)
  const ventas = result.items ?? []
  const total = result.total ?? 0
  const LIMIT = result.limit ?? 100
  const pages = result.pages ?? Math.max(1, Math.ceil(total / LIMIT))
  // For hoy filter (client-side, small set)
  const today = new Date().toLocaleDateString('es-CL')
  const filtered = tab === 'hoy'
    ? ventas.filter(v => new Date(v.createdAt).toLocaleDateString('es-CL') === today)
    : ventas

  const fmt = n => '$' + (n || 0).toLocaleString('es-CL')
  const openVenta = row => navigate(`/ventas/${encodeURIComponent(String(row.id))}`)

  const detailHeadCell = { padding: '3px 4px', borderRight: '1px solid oklch(1 0 0 / 0.25)', lineHeight: 1.1 }
  const detailCell = { padding: '4px', fontSize: 7, borderRight: '1px solid var(--border)', lineHeight: 1.15 }

  const renderDetalle = row => {
    const list = row.items || []
    if (!list.length) return <span style={{ color: 'var(--text-3)' }}>-</span>
    return (
      <div style={{ width: '100%', minWidth: 320, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '24px minmax(200px, 1fr) 60px', background: 'var(--text-2)', color: '#fff', fontSize: 7, fontWeight: 700 }}>
          <span style={detailHeadCell}>Cant.</span>
          <span style={detailHeadCell}>Producto</span>
          <span style={{ ...detailHeadCell, textAlign: 'right' }}>Total</span>
        </div>
        {list.map((item, idx) => {
          const nombre = item.nombre ?? item.producto?.nombre ?? item.descripcion ?? 'Item'
          const cant = item.cantidad || 0
          const pu = Number(item.precioUnitario ?? item.precio) || 0
          const tot = cant * pu
          return (
            <div key={item.id || idx} style={{ display: 'grid', gridTemplateColumns: '24px minmax(200px, 1fr) 60px', borderTop: '1px solid var(--border)' }}>
              <span style={detailCell}>{cant}</span>
              <span style={{ ...detailCell, whiteSpace: 'normal', overflowWrap: 'anywhere', fontWeight: 600, lineHeight: 1.15 }}>{nombre}</span>
              <span style={{ ...detailCell, textAlign: 'right', fontFamily: "'DM Mono', monospace" }}>{fmt(tot)}</span>
            </div>
          )
        })}
      </div>
    )
  }

  const cols = [
    { key: 'id', label: 'Nro. Interno', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v}</span> },
    { key: 'cliente', label: 'Cliente', wrap: true, render: v => (
      <div style={{ maxWidth: 200 }}>
        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v?.nombre || '-'}</div>
        {v?.rut && <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>{v.rut}</div>}
      </div>
    )},
    { key: 'tipo', label: 'Tipo', render: v => <Badge tone={v === 'Licitación' ? 'blue' : v === 'Convenio Marco' ? 'neutral' : 'gray'}>{v}</Badge> },
    { key: 'total', label: 'Total', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(v)}</span> },
    { key: 'abono', label: 'Abono', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: v > 0 ? 'var(--green-600)' : 'var(--text-3)' }}>{fmt(v)}</span> },
    { key: 'estadoPago', label: 'Pago', render: v => <StatusDot status={v} /> },
    { key: 'estadoEntrega', label: 'Entrega', render: v => <StatusDot status={v} /> },
    { key: 'licitacion', label: 'Licitacion / OC', render: v => v
      ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-2)' }}>{v}</span>
      : <span style={{ color: 'var(--text-3)' }}>-</span>
    },
    { key: 'guias', label: 'Guia', render: v => v
      ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--green-700)' }}>#{v}</span>
      : <span style={{ color: 'var(--text-3)' }}>-</span>
    },
    { key: 'regionDespacho', label: 'Región Desp.', render: (_, row) => {
      const partes = [row.regionDespacho, row.ciudadDespacho].filter(Boolean)
      return <span style={{ fontSize: 12, color: partes.length ? 'var(--text-2)' : 'var(--text-3)' }}>{partes.join(' · ') || '—'}</span>
    } },
    { key: 'createdAt', label: 'Fecha', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{new Date(v).toLocaleDateString('es-CL')}</span> },
    { key: 'creadorNombre', label: 'Vendedor', render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '-'}</span> },
    { key: 'items', label: 'Detalle', width: 320, wrap: true, render: (_, row) => renderDetalle(row) },
    { key: '_actions', label: '', render: (_, row) => (
      <button onClick={e => { e.stopPropagation(); openVenta(row) }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}>Ver</button>
    )},
  ]

  const toolbarExtra = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', flexWrap: 'wrap' }}>
      <Tabs tabs={FILTER_TABS} active={tab} onChange={t => { setTab(t); setSearch('') }} style={{ marginBottom: 0 }} />
      <SearchBar placeholder="Buscar Nro., vendedor, licitacion u OC..." value={search} onChange={setSearch} style={{ width: 280 }} />
    </div>
  )

  return (
    <main className="page page-wide">
      <PageHeader
        title="Matriz Ventas"
        subtitle={`${total.toLocaleString('es-CL')} ventas en total`}
        breadcrumb={['Inicio', 'Ventas', 'Matriz Ventas']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm"
            onClick={() => downloadFromBackend('/reportes/export/ventas', `ventas_${todayIso()}.csv`, exportParams)}
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
        {isLoading
          ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
          : <Table
              columns={cols}
              rows={filtered}
              onRowDoubleClick={openVenta}
              emptyMessage="Sin ventas"
              ariaLabel="Ventas"
              getRowKey={row => row.id}
              toolbarExtra={toolbarExtra}
              pager={{ page, pages, total, limit: LIMIT, shown: filtered.length, onChange: setPagerPage, disabled: isLoading }}
            />
        }
      </div>
    </main>
  )
}
