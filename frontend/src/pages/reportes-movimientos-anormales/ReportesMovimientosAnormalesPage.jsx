import { useMemo, useState } from 'react'
import { Badge, Btn, KpiCard, PageHeader, Pager, Table } from '../../components/shared'
import { useReporteMovimientosAnormales } from '../../api/reportesGerenciales'
import { downloadFromBackend } from '../../utils/csv'

const num = value => Number(value || 0).toLocaleString('es-CL')
const date = value => value ? new Date(value).toLocaleDateString('es-CL') : '-'

function cleanParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined))
}

function defaultRange() {
  const hasta = new Date()
  const desde = new Date(hasta.getTime() - 365 * 24 * 60 * 60 * 1000)
  return { desde: desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) }
}

const MOTIVO_LABEL = {
  codigo: 'Código distinto',
  nombre: 'Nombre distinto',
  codigo_y_nombre: 'Código y nombre distintos',
}

export default function ReportesMovimientosAnormalesPage() {
  const initialRange = useMemo(() => defaultRange(), [])
  const [filters, setFilters] = useState({ desde: initialRange.desde, hasta: initialRange.hasta, soloLicitacion: false })
  const [page, setPage] = useState(1)
  const limit = 100
  const offset = (page - 1) * limit

  const params = useMemo(() => cleanParams({ ...filters, soloLicitacion: filters.soloLicitacion ? 'true' : '', limit, offset }), [filters, offset])
  const query = useReporteMovimientosAnormales(params)
  const data = query.data || { items: [], pager: { total: 0 }, resumen: {} }
  const rows = data.items || []
  const total = data.pager?.total || 0
  const pages = Math.max(1, Math.ceil(total / limit))

  const updateFilter = (key, value) => {
    setFilters(current => ({ ...current, [key]: value }))
    setPage(1)
  }

  const exportCsv = () => {
    downloadFromBackend('/reportes/export/movimientos-anormales', `movimientos_anormales_${new Date().toISOString().slice(0, 10)}.csv`, cleanParams({ ...filters, soloLicitacion: filters.soloLicitacion ? 'true' : '' }))
  }

  const columns = [
    { key: 'nInterno', label: 'N Interno', required: true, render: v => <span style={mono}>{v || '-'}</span> },
    { key: 'fechaOrden', label: 'Fecha', render: v => date(v) },
    { key: 'tipo', label: 'Tipo', render: v => <Badge tone={String(v || '').toLowerCase().startsWith('licitaci') ? 'amber' : 'blue'}>{v || '-'}</Badge> },
    { key: 'licitacion', label: 'Licitación', render: v => v || '-' },
    {
      key: 'codigoDeclarado', label: 'Declarado en la venta', required: true, render: (v, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v}</div>
          {row.nombreDeclarado && <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{row.nombreDeclarado}</div>}
        </div>
      ),
    },
    {
      key: 'codigoReal', label: 'Producto real (rebaja stock)', required: true, render: (v, row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--green-700)' }}>{v}</div>
          <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{row.nombreReal}</div>
        </div>
      ),
    },
    { key: 'cantidad', label: 'Cant.', align: 'right', render: v => <span style={mono}>{num(v)}</span> },
    { key: 'stockActual', label: 'Stock hoy', align: 'right', render: v => <span style={mono}>{num(v)}</span> },
    { key: 'motivo', label: 'Motivo', render: v => <Badge tone="red">{MOTIVO_LABEL[v] || v}</Badge> },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Movimientos de Stock Anormales"
        subtitle="Ventas registradas bajo un código distinto al del producto real que rebajó el inventario (licitaciones, paquetes consolidados)"
        breadcrumb={['Inicio', 'Reportes', 'Movimientos anormales']}
        actions={<Btn variant="secondary" icon="download" size="sm" onClick={exportCsv}>Exportar CSV</Btn>}
      />

      <div style={{ padding: '10px 12px', marginBottom: 16, borderRadius: 8, background: 'var(--bg)', color: 'var(--text-2)', fontSize: 13 }}>
        El vínculo real de cada línea de venta es el <strong>ID de producto</strong>, no el código o nombre que haya quedado escrito en la venta. Esta vista compara ambos y muestra los casos donde no coinciden — el stock del "producto real" es el que efectivamente bajó.
      </div>

      <section style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18, alignItems: 'flex-end' }}>
        <FilterLabel label="Desde"><input type="date" value={filters.desde} onChange={event => updateFilter('desde', event.target.value)} style={controlStyle} /></FilterLabel>
        <FilterLabel label="Hasta"><input type="date" value={filters.hasta} onChange={event => updateFilter('hasta', event.target.value)} style={controlStyle} /></FilterLabel>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, height: 38 }}>
          <input type="checkbox" checked={filters.soloLicitacion} onChange={event => updateFilter('soloLicitacion', event.target.checked)} />
          Solo licitaciones
        </label>
        {query.isFetching && <Badge tone="blue">Actualizando</Badge>}
        {query.isError && <Badge tone="red">Reporte no disponible</Badge>}
      </section>

      <div className="kpi-strip">
        <KpiCard label="Casos" value={num(data.resumen?.totalCasos)} icon="alertTriangle" tone="red" sublabel="Líneas con código/nombre distinto al producto real" />
        <KpiCard label="Ventas afectadas" value={num(data.resumen?.totalOrdenes)} icon="fileText" tone="amber" />
        <KpiCard label="Licitaciones afectadas" value={num(data.resumen?.totalLicitaciones)} icon="briefcase" tone="neutral" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {query.isLoading ? (
          <div style={emptyState}>Cargando...</div>
        ) : query.isError ? (
          <div style={emptyState}>No fue posible cargar el reporte</div>
        ) : (
          <>
            <Table columns={columns} rows={rows} emptyMessage="Sin descuadres en el rango seleccionado" stickyHeader keyboard ariaLabel="Movimientos de stock anormales" getRowKey={row => row.ordenItemId} />
            <Pager page={page} pages={pages} total={total} limit={limit} shown={rows.length} onChange={setPage} disabled={query.isFetching} />
          </>
        )}
      </div>
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

const mono = { fontFamily: "'DM Mono', monospace", fontSize: 12 }
const controlStyle = { minHeight: 38, border: '1px solid var(--border)', borderRadius: 8, background: '#fff', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, padding: '0 10px' }
const emptyState = { padding: 48, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }
