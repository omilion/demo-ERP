import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn, Icon, KpiCard, PageHeader, Table, Tabs } from '../../components/shared'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { downloadFromBackend } from '../../utils/csv'
import {
  useReporteGerencialCobranzaCaja,
  useReporteGerencialLicitaciones,
  useReporteGerencialOperaciones,
  useReporteGerencialStock,
  useReporteGerencialVentas,
  useReporteCaja,
  useReporteCobranza,
  useReporteDespachos,
  useReporteLicitaciones,
  useReporteOdts,
  useReporteStockCritico,
  useReporteVentas,
} from '../../api/reportesGerenciales'

const money = value => '$' + Number(value || 0).toLocaleString('es-CL')
const num = value => Number(value || 0).toLocaleString('es-CL')
const date = value => value ? new Date(value).toLocaleDateString('es-CL') : '-'
const norm = value => String(value || '').toLowerCase().trim()

function currentYearRange() {
  const year = new Date().getFullYear()
  return { desde: `${year}-01-01`, hasta: `${year}-12-31` }
}

function inRange(value, desde, hasta) {
  if (!value) return true
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return true
  if (desde && time < new Date(`${desde}T00:00:00`).getTime()) return false
  if (hasta && time > new Date(`${hasta}T23:59:59`).getTime()) return false
  return true
}

function selectInputStyle(minWidth = 150) {
  return {
    minWidth,
    minHeight: 38,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: '#fff',
    color: 'var(--text-1)',
    fontSize: 13,
    fontFamily: 'inherit',
  }
}

function Panel({ title, icon, children, action }) {
  return (
    <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'oklch(0.985 0.004 155)' }}>
        <Icon name={icon} size={15} color="var(--green-700)" />
        <h2 style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</h2>
        {action}
      </header>
      <div style={{ padding: 16 }}>{children}</div>
    </section>
  )
}

function LoadingBlock({ text = 'Cargando datos...' }) {
  return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>{text}</div>
}

function ErrorBlock({ text = 'No fue posible cargar esta seccion.' }) {
  return <div style={{ padding: 24, color: 'var(--red)', fontSize: 13, textAlign: 'center' }}>{text}</div>
}

function NoPermissionBlock({ text = 'Sin permiso para ver esta informacion.' }) {
  return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>{text}</div>
}

function EmptyBlock({ text = 'Sin datos para los filtros aplicados.' }) {
  return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>{text}</div>
}

const statusText = {
  noPermission: 'Sin permiso',
  loading: 'Cargando...',
  error: 'Error',
}

function combinedProblem(allowed, queries) {
  if (!allowed) return 'noPermission'
  if (queries.some(query => query.data)) return null
  if (queries.some(query => query.isError)) return 'error'
  return 'loading'
}

function statusValue(problem, value, format = num) {
  return problem ? statusText[problem] : format(value)
}

function statusSublabel(problem, readyText) {
  if (problem === 'noPermission') return 'acceso restringido'
  if (problem === 'loading') return 'esperando datos'
  if (problem === 'error') return 'fuente no disponible'
  return readyText
}

function statusTone(problem, readyTone = 'neutral') {
  if (problem === 'error') return 'red'
  return problem ? 'neutral' : readyTone
}

function statusCount(problem, value) {
  return problem ? '-' : value
}

function QueryBlock({ problem, children }) {
  if (problem === 'noPermission') return <NoPermissionBlock />
  if (problem === 'error') return <ErrorBlock />
  if (problem === 'loading') return <LoadingBlock />
  return children
}

function GroupList({ rows, labelKey = 'label', valueKey = 'value', format = num }) {
  if (!rows.length) return <EmptyBlock />
  const max = Math.max(...rows.map(row => Number(row[valueKey] || 0)), 1)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.slice(0, 7).map(row => (
        <div key={row[labelKey]} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(80px, auto)', gap: 12, alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-2)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[labelKey] || 'Sin dato'}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--green-50)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(4, (Number(row[valueKey] || 0) / max) * 100)}%`, height: '100%', background: 'var(--green-600)' }} />
            </div>
          </div>
          <strong style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-1)' }}>{format(row[valueKey])}</strong>
        </div>
      ))}
    </div>
  )
}

function filterVentas(items, filters) {
  const vendedor = norm(filters.vendedor)
  const cliente = norm(filters.cliente)
  return items.filter(item => {
    if (!inRange(item.createdAt, filters.desde, filters.hasta)) return false
    if (filters.tipo && item.tipo !== filters.tipo) return false
    if (vendedor && !norm(item.creadorNombre).includes(vendedor)) return false
    const clienteText = [item.cliente?.razonSocial, item.cliente?.nombre, item.rutCliente, item.observaciones].map(norm).join(' ')
    if (cliente && !clienteText.includes(cliente)) return false
    return true
  })
}

function sumBy(items, keyFn, valueFn) {
  const map = new Map()
  for (const item of items) {
    const key = keyFn(item) || 'Sin dato'
    map.set(key, (map.get(key) || 0) + Number(valueFn(item) || 0))
  }
  return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

export default function ReportesGerencialesPage() {
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const initialRange = useMemo(() => currentYearRange(), [])
  const [filters, setFilters] = useState({
    desde: initialRange.desde,
    hasta: initialRange.hasta,
    tipo: '',
    vendedor: '',
    cliente: '',
  })
  const [active, setActive] = useState('resumen')

  const perms = {
    ventas: can(user, 'ventas'),
    caja: can(user, 'caja'),
    cobranza: can(user, 'ventas') || can(user, 'cobranza'),
    stock: can(user, 'bodega'),
    licitaciones: can(user, 'licitaciones') || can(user, 'ventas'),
    taller: can(user, 'taller'),
    despacho: can(user, 'despacho'),
  }

  const year = filters.desde ? new Date(`${filters.desde}T00:00:00`).getFullYear() : undefined
  const periodParams = {
    desde: filters.desde || undefined,
    hasta: filters.hasta || undefined,
  }
  const ventasGerencialQuery = useReporteGerencialVentas({
    ...periodParams,
    tipo: filters.tipo || undefined,
    vendedor: filters.vendedor || undefined,
    cliente: filters.cliente || undefined,
  }, perms.ventas)
  const cobranzaCajaGerencialQuery = useReporteGerencialCobranzaCaja(periodParams, perms.caja && perms.cobranza)
  const stockGerencialQuery = useReporteGerencialStock(periodParams, perms.stock)
  const licitacionesGerencialQuery = useReporteGerencialLicitaciones(periodParams, perms.licitaciones)
  const operacionesGerencialQuery = useReporteGerencialOperaciones(periodParams, perms.taller && perms.despacho)
  const ventasQuery = useReporteVentas({ tipo: filters.tipo || undefined, scope: 'operacional' }, perms.ventas)
  const cajaQuery = useReporteCaja({ year }, perms.caja)
  const cobranzaQuery = useReporteCobranza({ search: filters.cliente || undefined }, perms.cobranza)
  const stockQuery = useReporteStockCritico(perms.stock)
  const licitacionesQuery = useReporteLicitaciones({
    fechaDesde: filters.desde || undefined,
    fechaHasta: filters.hasta || undefined,
    rutCliente: filters.cliente || undefined,
  }, perms.licitaciones)
  const odtsQuery = useReporteOdts({ fechaDesde: filters.desde || undefined, fechaHasta: filters.hasta || undefined }, perms.taller)
  const despachosQuery = useReporteDespachos({ desde: filters.desde || undefined, hasta: filters.hasta || undefined }, perms.despacho)

  const ventasProblem = combinedProblem(perms.ventas, [ventasGerencialQuery, ventasQuery])
  const cajaProblem = combinedProblem(perms.caja, [cobranzaCajaGerencialQuery, cajaQuery])
  const cobranzaProblem = combinedProblem(perms.cobranza, [cobranzaCajaGerencialQuery, cobranzaQuery])
  const stockProblem = combinedProblem(perms.stock, [stockGerencialQuery, stockQuery])
  const licitacionesProblem = combinedProblem(perms.licitaciones, [licitacionesGerencialQuery, licitacionesQuery])
  const operacionProblem = combinedProblem(perms.taller || perms.despacho, [operacionesGerencialQuery, odtsQuery, despachosQuery])

  const ventas = useMemo(() => filterVentas(ventasQuery.data?.items || [], filters), [ventasQuery.data, filters])
  const cajaItems = useMemo(() => (cajaQuery.data?.items || []).filter(item => inRange(item.fecha, filters.desde, filters.hasta)), [cajaQuery.data, filters])
  const odts = odtsQuery.data?.items || []
  const despachos = despachosQuery.data?.items || []
  const licitaciones = licitacionesQuery.data?.items || []
  const stockProductos = stockQuery.data?.productos || []
  const stockMateriales = stockQuery.data?.materiales || []

  const ventaTotal = Number(ventasGerencialQuery.data?.total ?? ventas.reduce((sum, item) => sum + Number(item.total || 0), 0))
  const ventaCount = Number(ventasGerencialQuery.data?.count ?? ventas.length)
  const ventaTicket = ventaCount ? ventaTotal / ventaCount : 0
  const ingresos = Number(cobranzaCajaGerencialQuery.data?.caja?.ingresos ?? cajaItems.filter(item => norm(item.tipo) === 'ingreso').reduce((sum, item) => sum + Number(item.monto || 0), 0))
  const egresos = Number(cobranzaCajaGerencialQuery.data?.caja?.egresos ?? cajaItems.filter(item => norm(item.tipo) === 'egreso').reduce((sum, item) => sum + Math.abs(Number(item.monto || 0)), 0))
  const cobranzaPendiente = Number(cobranzaCajaGerencialQuery.data?.cuentasPorCobrar?.porCobrar ?? cobranzaQuery.data?.stats?.pendiente ?? 0)
  const odtsPendientes = odts.filter(item => item.estado !== 'Terminada')
  const despachosPendientes = despachos.filter(item => !item.fechaEntrega || new Date(item.fechaEntrega) >= new Date())
  const licitacionesPendientes = licitaciones.filter(item => ['Pendiente', 'En proceso'].includes(item.estado))
  const stockCriticoTotal = Number(
    (stockGerencialQuery.data?.stockCritico?.totales?.productosCriticos ?? stockProductos.length) +
    (stockGerencialQuery.data?.stockCritico?.totales?.materialesCriticos ?? stockMateriales.length)
  )
  const pendientesOperacionTotal = Number(
    (operacionesGerencialQuery.data?.taller?.pendientes ?? odtsPendientes.length) +
    (operacionesGerencialQuery.data?.despachos?.pendientes ?? despachosPendientes.length)
  )

  const queries = [
    ventasGerencialQuery, cobranzaCajaGerencialQuery, stockGerencialQuery, licitacionesGerencialQuery, operacionesGerencialQuery,
    ventasQuery, cajaQuery, cobranzaQuery, stockQuery, licitacionesQuery, odtsQuery, despachosQuery,
  ]
  const isLoading = queries.some(query => query.isLoading && query.fetchStatus !== 'idle')
  const hasError = queries.some(query => query.isError)
  const licitacionesPendientesCount = Number(licitacionesGerencialQuery.data?.byResultado?.pendiente?.count ?? licitacionesPendientes.length)
  const riesgoProblem = stockProblem || licitacionesProblem

  const ventaPorTipo = sumBy(ventas, item => item.tipo, item => item.total)
  const ventaPorVendedor = sumBy(ventas, item => item.creadorNombre, item => item.total)
  const ventaPorCliente = sumBy(ventas, item => item.cliente?.razonSocial || item.cliente?.nombre || item.rutCliente, item => item.total)

  const updateFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }))
  const resetFilters = () => setFilters({ desde: initialRange.desde, hasta: initialRange.hasta, tipo: '', vendedor: '', cliente: '' })
  const exportGerencial = () => downloadFromBackend(
    '/reportes/export/gerencial',
    `reporte_gerencial_${new Date().toISOString().slice(0, 10)}.csv`,
    {
      desde: filters.desde || undefined,
      hasta: filters.hasta || undefined,
      tipo: filters.tipo || undefined,
      vendedor: filters.vendedor || undefined,
      cliente: filters.cliente || undefined,
    },
  )

  const tabs = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'ventas', label: 'Ventas', count: statusCount(ventasProblem, ventaCount || ventas.length) },
    { id: 'operacion', label: 'Operacion', count: statusCount(operacionProblem, pendientesOperacionTotal) },
    { id: 'riesgos', label: 'Riesgos', count: statusCount(riesgoProblem, stockCriticoTotal + licitacionesPendientesCount) },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Reporteria gerencial"
        subtitle="Vista filtrable de ventas, caja, cobranza, stock critico, licitaciones y pendientes operacionales."
        breadcrumb={['Inicio', 'Reportes']}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="secondary" icon="download" onClick={exportGerencial}>Exportar CSV</Btn>
            <Btn variant="secondary" icon="refreshCw" onClick={resetFilters}>Limpiar filtros</Btn>
          </div>
        }
      />

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          Desde
          <input type="date" value={filters.desde} onChange={e => updateFilter('desde', e.target.value)} style={selectInputStyle()} />
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          Hasta
          <input type="date" value={filters.hasta} onChange={e => updateFilter('hasta', e.target.value)} style={selectInputStyle()} />
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          Tipo venta
          <select value={filters.tipo} onChange={e => updateFilter('tipo', e.target.value)} style={selectInputStyle()}>
            <option value="">Todos</option>
            <option value="Venta sala">Venta sala</option>
            <option value="Venta directa">Venta directa</option>
            <option value="Convenio Marco">Convenio Marco</option>
            <option value="Licitación">Licitacion</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          Vendedor
          <input value={filters.vendedor} onChange={e => updateFilter('vendedor', e.target.value)} placeholder="Nombre" style={selectInputStyle()} />
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          Cliente / RUT
          <input value={filters.cliente} onChange={e => updateFilter('cliente', e.target.value)} placeholder="Cliente o RUT" style={selectInputStyle()} />
        </label>
      </section>

      {hasError && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 8, fontSize: 13 }}>Algunas fuentes no respondieron. Las secciones disponibles se muestran con los datos cargados.</div>}
      {isLoading && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--blue-bg)', color: 'var(--blue)', borderRadius: 8, fontSize: 13 }}>Actualizando reportes...</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 22 }}>
        <KpiCard label="Ventas periodo" value={statusValue(ventasProblem, ventaTotal, money)} sublabel={statusSublabel(ventasProblem, `${num(ventaCount)} operaciones`)} icon="shoppingCart" tone={statusTone(ventasProblem, 'blue')} />
        <KpiCard label="Ticket promedio" value={statusValue(ventasProblem, ventaTicket, money)} sublabel={statusSublabel(ventasProblem, 'sobre operaciones cargadas')} icon="barChart2" tone={statusTone(ventasProblem)} />
        <KpiCard label="CxC pendiente" value={statusValue(cobranzaProblem, cobranzaPendiente, money)} sublabel={statusSublabel(cobranzaProblem, `${num(cobranzaCajaGerencialQuery.data?.cuentasPorCobrar?.count || cobranzaQuery.data?.stats?.n_pendientes || 0)} docs`)} icon="creditCard" tone={statusTone(cobranzaProblem, 'amber')} />
        <KpiCard label="Caja neta" value={statusValue(cajaProblem, ingresos - egresos, money)} sublabel={statusSublabel(cajaProblem, `${money(ingresos)} ing. / ${money(egresos)} egr.`)} icon="dollarSign" tone={statusTone(cajaProblem)} />
        <KpiCard label="Stock critico" value={statusValue(stockProblem, stockCriticoTotal)} sublabel={statusSublabel(stockProblem, 'productos y materiales')} icon="alertTriangle" tone={statusTone(stockProblem, stockCriticoTotal ? 'red' : 'neutral')} />
        <KpiCard label="Pendientes operacion" value={statusValue(operacionProblem, pendientesOperacionTotal)} sublabel={statusSublabel(operacionProblem, 'taller y despachos')} icon="clock" tone={statusTone(operacionProblem, 'amber')} />
      </div>

      <Tabs tabs={tabs} active={active} onChange={setActive} />

      {active === 'resumen' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <Panel title="Ventas por tipo" icon="barChart2">
            <QueryBlock problem={combinedProblem(perms.ventas, [ventasQuery])}>
              <GroupList rows={ventaPorTipo} format={money} />
            </QueryBlock>
          </Panel>
          <Panel title="Caja y cobranza" icon="dollarSign">
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Ingresos caja</span><strong>{statusValue(cajaProblem, ingresos, money)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Egresos caja</span><strong>{statusValue(cajaProblem, egresos, money)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Cobrado historico</span><strong>{statusValue(cobranzaProblem, cobranzaQuery.data?.stats?.cobrado ?? cobranzaCajaGerencialQuery.data?.cuentasPorCobrar?.cobrado ?? 0, money)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Pendiente CxC</span><strong style={{ color: cobranzaProblem ? 'var(--text-3)' : 'var(--amber)' }}>{statusValue(cobranzaProblem, cobranzaPendiente, money)}</strong></div>
            </div>
          </Panel>
          <Panel title="Alertas activas" icon="alertTriangle">
            <div style={{ display: 'grid', gap: 9 }}>
              <button onClick={() => setActive('riesgos')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Stock critico</span><Badge tone={stockProblem ? 'gray' : stockCriticoTotal ? 'red' : 'green'}>{statusCount(stockProblem, stockCriticoTotal)}</Badge>
              </button>
              <button onClick={() => setActive('riesgos')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Licitaciones pendientes</span><Badge tone={licitacionesPendientesCount ? 'amber' : 'green'}>{statusCount(licitacionesProblem, licitacionesPendientesCount)}</Badge>
              </button>
              <button onClick={() => setActive('operacion')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Taller / despachos</span><Badge tone={pendientesOperacionTotal ? 'amber' : 'green'}>{statusCount(operacionProblem, pendientesOperacionTotal)}</Badge>
              </button>
            </div>
          </Panel>
        </div>
      )}

      {active === 'ventas' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          <Panel title="Por vendedor" icon="user">
            <QueryBlock problem={combinedProblem(perms.ventas, [ventasQuery])}>
              <GroupList rows={ventaPorVendedor} format={money} />
            </QueryBlock>
          </Panel>
          <Panel title="Por cliente" icon="users">
            <QueryBlock problem={combinedProblem(perms.ventas, [ventasQuery])}>
              <GroupList rows={ventaPorCliente} format={money} />
            </QueryBlock>
          </Panel>
          <Panel title="Ultimas ventas filtradas" icon="shoppingCart" action={<Badge tone="blue">{statusCount(combinedProblem(perms.ventas, [ventasQuery]), ventas.length)}</Badge>}>
            <QueryBlock problem={combinedProblem(perms.ventas, [ventasQuery])}>
              <Table
                columns={[
                  { key: 'nInterno', label: 'N interno' },
                  { key: 'createdAt', label: 'Fecha', render: value => date(value) },
                  { key: 'tipo', label: 'Tipo' },
                  { key: 'creadorNombre', label: 'Vendedor' },
                  { key: 'cliente', label: 'Cliente', render: (_, row) => row.cliente?.razonSocial || row.cliente?.nombre || row.rutCliente || '-' },
                  { key: 'total', label: 'Total', align: 'right', render: value => money(value) },
                ]}
                rows={ventas.slice(0, 12)}
                onRowClick={row => navigate(`/ventas/${row.id}`)}
                emptyMessage="Sin ventas para los filtros aplicados"
                ariaLabel="Ultimas ventas filtradas"
                getRowKey={row => row.id}
              />
            </QueryBlock>
          </Panel>
          <Panel title="Licitaciones" icon="clipboard" action={<Badge tone="amber">{statusCount(licitacionesProblem, licitacionesPendingCount(licitaciones))}</Badge>}>
            <QueryBlock problem={licitacionesProblem}>
              <Table
                columns={[
                  { key: 'idLicitacion', label: 'ID licit.' },
                  { key: 'fechaCreacion', label: 'Fecha', render: value => date(value) },
                  { key: 'rutCliente', label: 'RUT' },
                  { key: 'estado', label: 'Estado', render: value => <Badge tone={value === 'Adjudicada' ? 'green' : value === 'Rechazada' ? 'red' : 'amber'}>{value || '-'}</Badge> },
                  { key: 'nItems', label: 'Items', align: 'right' },
                ]}
                rows={licitaciones.slice(0, 12)}
                onRowClick={row => navigate(`/licitaciones/${row.id}`)}
                emptyMessage="Sin licitaciones para el periodo"
                ariaLabel="Licitaciones del periodo"
                getRowKey={row => row.id}
              />
            </QueryBlock>
          </Panel>
        </div>
      )}

      {active === 'operacion' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          <Panel title="OT pendientes" icon="wrench" action={<Badge tone="amber">{statusCount(combinedProblem(perms.taller, [odtsQuery]), odtsPendientes.length)}</Badge>}>
            <QueryBlock problem={combinedProblem(perms.taller, [odtsQuery])}>
              <Table
                columns={[
                  { key: 'id', label: 'OT' },
                  { key: 'createdAt', label: 'Fecha', render: value => date(value) },
                  { key: 'clienteNombre', label: 'Cliente', wrap: true },
                  { key: 'estado', label: 'Estado', render: value => <Badge tone={value === 'Prioritaria' ? 'red' : 'amber'}>{value || '-'}</Badge> },
                  { key: 'tipo', label: 'Tipo' },
                ]}
                rows={odtsPendientes.slice(0, 14)}
                onRowClick={row => navigate(`/taller/${row.id}`)}
                emptyMessage="Sin OT pendientes"
                ariaLabel="OT pendientes"
                getRowKey={row => row.id}
              />
            </QueryBlock>
          </Panel>
          <Panel title="Despachos pendientes" icon="truck" action={<Badge tone="amber">{statusCount(combinedProblem(perms.despacho, [despachosQuery]), despachosPendientes.length)}</Badge>}>
            <QueryBlock problem={combinedProblem(perms.despacho, [despachosQuery])}>
              <Table
                columns={[
                  { key: 'interno', label: 'N interno' },
                  { key: 'fechaEntrega', label: 'Entrega', render: value => date(value) },
                  { key: 'contacto', label: 'Contacto', wrap: true },
                  { key: 'comuna', label: 'Comuna' },
                  { key: 'transporte', label: 'Transporte' },
                ]}
                rows={despachosPendientes.slice(0, 14)}
                onRowClick={() => navigate('/despachos')}
                emptyMessage="Sin despachos pendientes"
                ariaLabel="Despachos pendientes"
                getRowKey={(row, index) => row.id || row.interno || index}
              />
            </QueryBlock>
          </Panel>
        </div>
      )}

      {active === 'riesgos' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          <Panel title="Productos con stock critico" icon="package" action={<Badge tone={stockProblem ? 'gray' : stockProductos.length ? 'red' : 'green'}>{statusCount(stockProblem, stockProductos.length)}</Badge>}>
            <QueryBlock problem={stockProblem}>
              <Table
                columns={[
                  { key: 'codigoInterno', label: 'Codigo' },
                  { key: 'nombre', label: 'Producto', wrap: true },
                  { key: 'stock', label: 'Stock', align: 'right' },
                  { key: 'stockCritico', label: 'Critico', align: 'right' },
                  { key: 'bodega', label: 'Bodega' },
                ]}
                rows={stockProductos.slice(0, 14)}
                onRowClick={() => navigate('/bodega')}
                emptyMessage="Sin productos criticos"
                ariaLabel="Productos con stock critico"
                getRowKey={(row, index) => row.id || row.codigoInterno || index}
              />
            </QueryBlock>
          </Panel>
          <Panel title="Materiales de taller criticos" icon="warehouse" action={<Badge tone={stockProblem ? 'gray' : stockMateriales.length ? 'red' : 'green'}>{statusCount(stockProblem, stockMateriales.length)}</Badge>}>
            <QueryBlock problem={stockProblem}>
              <Table
                columns={[
                  { key: 'codigoInterno', label: 'Codigo' },
                  { key: 'nombre', label: 'Material', wrap: true },
                  { key: 'stock', label: 'Stock', align: 'right' },
                  { key: 'stockCritico', label: 'Critico', align: 'right' },
                  { key: 'precio', label: 'Precio', align: 'right', render: value => money(value) },
                ]}
                rows={stockMateriales.slice(0, 14)}
                onRowClick={() => navigate('/bodega-taller')}
                emptyMessage="Sin materiales criticos"
                ariaLabel="Materiales de taller criticos"
                getRowKey={(row, index) => row.id || row.codigoInterno || index}
              />
            </QueryBlock>
          </Panel>
        </div>
      )}
    </main>
  )
}

function licitacionesPendingCount(items) {
  return items.filter(item => ['Pendiente', 'En proceso'].includes(item.estado)).length
}
