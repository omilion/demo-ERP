import { useMemo, useState } from 'react'
import { Badge, Btn, KpiCard, PageHeader, Pager, SearchBar, Table } from '../../components/shared'
import { useComisionesMeta } from '../../api/admin'
import { useUsuarios } from '../../api/usuarios'
import { useReporteComisiones } from '../../api/reportesGerenciales'
import { downloadFromBackend } from '../../utils/csv'

const DEFAULT_TIPOS = ['Todos', 'Venta sala', 'Venta directa', 'Normal', 'Venta Web', 'Convenio Marco', 'Licitaci\u00f3n']
const money = value => Number(value || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const num = value => Number(value || 0).toLocaleString('es-CL')
const pct = value => value === null || value === undefined ? '-' : `${Number(value || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 })}%`
const date = value => value ? new Date(value).toLocaleDateString('es-CL') : '-'

function currentMonthRange() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const last = new Date(year, now.getMonth() + 1, 0).getDate()
  return { desde: `${year}-${month}-01`, hasta: `${year}-${month}-${String(last).padStart(2, '0')}` }
}

function cleanParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined))
}

function summaryRows(bucket = {}) {
  return Object.entries(bucket)
    .map(([label, item]) => ({ label, ...item }))
    .sort((a, b) => Number(b.totalComision || 0) - Number(a.totalComision || 0))
}

export default function ReportesComisionesPage() {
  const initialRange = useMemo(() => currentMonthRange(), [])
  const [filters, setFilters] = useState({
    desde: initialRange.desde,
    hasta: initialRange.hasta,
    cobroDesde: '',
    cobroHasta: '',
    tipoVenta: '',
    vendedorId: '',
    vendedor: '',
    estadoPago: '',
  })
  const [page, setPage] = useState(1)
  const limit = 100
  const offset = (page - 1) * limit
  const metaQuery = useComisionesMeta()
  const { data: usuarios = [] } = useUsuarios()

  const params = useMemo(() => cleanParams({
    ...filters,
    limit,
    offset,
  }), [filters, offset])
  const reportQuery = useReporteComisiones(params)
  const data = reportQuery.data || { rows: [], pagination: { total: 0, limit, offset: 0 }, totales: {}, byVendedor: {}, byTipo: {} }
  const rows = data.rows || []
  const total = data.pagination?.total || 0
  const pages = Math.max(1, Math.ceil(total / limit))
  const tiposVenta = metaQuery.data?.tiposVenta || DEFAULT_TIPOS
  const vendedores = usuarios.filter(user => user.role === 'vendedor' && user.activo !== false)
  const byVendedor = summaryRows(data.byVendedor)
  const byTipo = summaryRows(data.byTipo)

  const updateFilter = (key, value) => {
    setFilters(current => ({ ...current, [key]: value }))
    setPage(1)
  }

  const resetFilters = () => {
    setFilters({ desde: initialRange.desde, hasta: initialRange.hasta, cobroDesde: '', cobroHasta: '', tipoVenta: '', vendedorId: '', vendedor: '', estadoPago: '' })
    setPage(1)
  }

  const exportCsv = () => {
    const exportParams = cleanParams(filters)
    downloadFromBackend('/reportes/export/comisiones', `comisiones_${new Date().toISOString().slice(0, 10)}.csv`, exportParams)
  }

  const columns = [
    { key: 'nInterno', label: 'N Interno', required: true, render: v => <span style={mono}>{v || '-'}</span> },
    { key: 'fecha', label: 'Fecha', render: v => date(v) },
    { key: 'tipoVenta', label: 'Tipo', render: v => <Badge tone="blue">{v || '-'}</Badge> },
    { key: 'vendedorNombre', label: 'Vendedor', render: v => v || '-' },
    { key: 'totalVendido', label: 'Vendido', align: 'right', render: v => <span style={mono}>{money(v)}</span> },
    { key: 'totalCobrado', label: 'Cobrado', align: 'right', render: v => <span style={mono}>{money(v)}</span> },
    { key: 'baseRegla', label: 'Base', render: v => v ? <Badge tone={v === 'COBRADO' ? 'amber' : 'green'}>{v === 'COBRADO' ? 'Cobrado' : 'Vendido'}</Badge> : <Badge tone="gray">Sin regla</Badge> },
    { key: 'porcentajeAplicado', label: '%', align: 'right', render: v => <span style={mono}>{pct(v)}</span> },
    { key: 'comisionEstimada', label: 'Comision', align: 'right', required: true, render: v => <strong style={{ ...mono, color: 'var(--green-700)' }}>{money(v)}</strong> },
    { key: 'reglaNombre', label: 'Regla', render: v => v || <span style={muted}>Sin regla</span> },
    { key: 'reglaScope', label: 'Alcance', render: v => scopeBadge(v) },
    { key: 'estadoPago', label: 'Pago', render: v => <Badge tone={v === 'Pagada' ? 'green' : v === 'Parcial' ? 'amber' : 'gray'}>{v || '-'}</Badge> },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Comisiones"
        subtitle="Ventas y comision estimada por vendedor"
        breadcrumb={['Inicio', 'Reportes', 'Comisiones']}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="secondary" icon="download" size="sm" onClick={exportCsv}>Exportar CSV</Btn>
            <Btn variant="secondary" icon="refreshCw" size="sm" onClick={resetFilters}>Limpiar filtros</Btn>
          </div>
        }
      />

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10, marginBottom: 18 }}>
        <FilterLabel label="Venta desde"><input type="date" value={filters.desde} onChange={event => updateFilter('desde', event.target.value)} style={controlStyle} /></FilterLabel>
        <FilterLabel label="Venta hasta"><input type="date" value={filters.hasta} onChange={event => updateFilter('hasta', event.target.value)} style={controlStyle} /></FilterLabel>
        <FilterLabel label="Cobro desde"><input type="date" value={filters.cobroDesde} onChange={event => updateFilter('cobroDesde', event.target.value)} style={controlStyle} /></FilterLabel>
        <FilterLabel label="Cobro hasta"><input type="date" value={filters.cobroHasta} onChange={event => updateFilter('cobroHasta', event.target.value)} style={controlStyle} /></FilterLabel>
        <FilterLabel label="Tipo venta">
          <select value={filters.tipoVenta} onChange={event => updateFilter('tipoVenta', event.target.value)} style={controlStyle}>
            <option value="">Todos</option>
            {tiposVenta.filter(item => item !== 'Todos').map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </FilterLabel>
        <FilterLabel label="Vendedor">
          <select value={filters.vendedorId} onChange={event => updateFilter('vendedorId', event.target.value)} style={controlStyle}>
            <option value="">Todos</option>
            {vendedores.map(vendedor => <option key={vendedor.id} value={vendedor.id}>{vendedor.nombre || vendedor.email}</option>)}
          </select>
        </FilterLabel>
        <FilterLabel label="Estado pago">
          <select value={filters.estadoPago} onChange={event => updateFilter('estadoPago', event.target.value)} style={controlStyle}>
            <option value="">Todos</option>
            <option value="No pagada">No pagada</option>
            <option value="Parcial">Parcial</option>
            <option value="Pagada">Pagada</option>
          </select>
        </FilterLabel>
      </section>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <SearchBar placeholder="Buscar vendedor por nombre" value={filters.vendedor} onChange={value => updateFilter('vendedor', value)} style={{ width: 320 }} />
        {reportQuery.isFetching && <Badge tone="blue">Actualizando</Badge>}
        {reportQuery.isError && <Badge tone="red">Reporte no disponible</Badge>}
      </div>

      <div className="kpi-strip">
        <KpiCard label="Ventas" value={num(data.totales?.count || 0)} icon="shoppingCart" sublabel={`${num(total)} registros filtrados`} />
        <KpiCard label="Total vendido" value={money(data.totales?.totalVendido)} icon="dollarSign" tone="blue" sublabel="Base venta" />
        <KpiCard label="Total cobrado" value={money(data.totales?.totalCobrado)} icon="creditCard" tone="amber" sublabel="Caja real no referencial" />
        <KpiCard label="Comision estimada" value={money(data.totales?.totalComision)} icon="barChart2" tone="neutral" sublabel="Segun reglas activas" />
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(260px, 0.6fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {reportQuery.isLoading ? (
            <div style={emptyState}>Cargando comisiones...</div>
          ) : reportQuery.isError ? (
            <div style={emptyState}>No fue posible cargar el reporte</div>
          ) : (
            <>
              <Table columns={columns} rows={rows} emptyMessage="Sin ventas con los filtros aplicados" stickyHeader keyboard ariaLabel="Reporte de comisiones" getRowKey={row => row.ordenId} />
              <Pager page={page} pages={pages} total={total} limit={limit} shown={rows.length} onChange={setPage} disabled={reportQuery.isFetching} />
            </>
          )}
        </div>

        <aside style={{ display: 'grid', gap: 14 }}>
          <SummaryPanel title="Por vendedor" rows={byVendedor} />
          <SummaryPanel title="Por tipo de venta" rows={byTipo} />
        </aside>
      </section>
    </main>
  )
}

function FilterLabel({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>
      {label}
      {children}
    </label>
  )
}

function SummaryPanel({ title, rows }) {
  return (
    <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <header style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'oklch(0.985 0.004 155)', fontSize: 12, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase' }}>{title}</header>
      <div style={{ padding: 12, display: 'grid', gap: 9 }}>
        {!rows.length && <div style={{ fontSize: 12, color: 'var(--text-3)', padding: 10 }}>Sin datos</div>}
        {rows.slice(0, 8).map(row => (
          <div key={row.label} style={{ display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{row.label}</span>
              <strong style={{ ...mono, color: 'var(--green-700)' }}>{money(row.totalComision)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--text-3)' }}>
              <span>{num(row.count)} ventas</span>
              <span>{money(row.totalVendido)} vendido</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function scopeBadge(scope) {
  const labels = {
    vendedor_tipo: 'Vendedor + tipo',
    vendedor_todos: 'Vendedor + todos',
    global_tipo: 'Global + tipo',
    global_todos: 'Global + todos',
  }
  return scope ? <Badge tone="gray">{labels[scope] || scope}</Badge> : <Badge tone="red">Sin regla</Badge>
}

const mono = { fontFamily: "'DM Mono', monospace", fontSize: 12 }
const muted = { color: 'var(--text-3)', fontSize: 12 }
const controlStyle = {
  minHeight: 38,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: '#fff',
  color: 'var(--text-1)',
  fontFamily: 'inherit',
  fontSize: 13,
  padding: '0 10px',
}
const emptyState = {
  padding: 48,
  textAlign: 'center',
  color: 'var(--text-3)',
  fontSize: 13,
}
