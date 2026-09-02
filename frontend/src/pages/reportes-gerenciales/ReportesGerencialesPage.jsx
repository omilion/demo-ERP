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

function toInputDate(value) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function rangeForPreset(preset, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (preset === 'mes') return { desde: toInputDate(new Date(end.getFullYear(), end.getMonth(), 1)), hasta: toInputDate(end) }
  if (preset === 'trimestre') {
    const firstMonth = Math.floor(end.getMonth() / 3) * 3
    return { desde: toInputDate(new Date(end.getFullYear(), firstMonth, 1)), hasta: toInputDate(end) }
  }
  if (preset === 'l12m') return { desde: toInputDate(new Date(end.getFullYear(), end.getMonth() - 11, 1)), hasta: toInputDate(end) }
  return { desde: toInputDate(new Date(end.getFullYear(), 0, 1)), hasta: toInputDate(end) }
}

function formatUpdatedAt(value) {
  if (!value) return 'pendiente de carga'
  return new Date(value).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
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

function BarChart({ title, values, format = money, color = 'var(--green-600)' }) {
  const rows = Object.entries(values || {}).map(([label, value]) => ({ label, value: Number(value?.total ?? value ?? 0) })).slice(-12)
  if (!rows.length) return <EmptyBlock />
  const max = Math.max(...rows.map(row => row.value), 1)
  return (
    <div aria-label={title} style={{ display: 'grid', gridTemplateColumns: `repeat(${rows.length}, minmax(26px, 1fr))`, gap: 8, alignItems: 'end', minHeight: 190, paddingTop: 12 }}>
      {rows.map(row => (
        <div key={row.label} title={`${row.label}: ${format(row.value)}`} style={{ minWidth: 0, display: 'grid', gap: 6, justifyItems: 'center' }}>
          <strong style={{ color: 'var(--text-2)', fontSize: 10, fontFamily: "'DM Mono', monospace" }}>{format(row.value)}</strong>
          <div style={{ width: '100%', minHeight: 8, height: `${Math.max(8, Math.round((row.value / max) * 112))}px`, background: color, borderRadius: '5px 5px 2px 2px' }} />
          <span style={{ color: 'var(--text-3)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', whiteSpace: 'nowrap' }}>{row.label}</span>
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

function metricRows(bucket = {}) {
  return Object.entries(bucket)
    .map(([label, metric]) => ({ label, value: Number(metric?.total || 0), count: Number(metric?.count || 0) }))
    .sort((a, b) => b.value - a.value)
}

export default function ReportesGerencialesPage() {
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const initialRange = useMemo(() => rangeForPreset('ytd'), [])
  const [filters, setFilters] = useState({
    desde: initialRange.desde,
    hasta: initialRange.hasta,
    tipo: '',
    vendedor: '',
    cliente: '',
  })
  const [active, setActive] = useState('resumen')
  const [preset, setPreset] = useState('ytd')

  const perms = {
    ventas: can(user, 'ventas'),
    caja: can(user, 'caja'),
    cobranza: can(user, 'ventas') || can(user, 'cobranza'),
    stock: can(user, 'bodega'),
    licitaciones: can(user, 'licitaciones') || can(user, 'ventas'),
    taller: can(user, 'taller'),
    despacho: can(user, 'despacho'),
  }

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
  // La apertura del panel no debe pedir doce listados a la vez al VPS. Los cinco
  // agregados anteriores resuelven los KPI; el detalle se carga al abrir su pestaña.
  const ventasQuery = useReporteVentas({ tipo: filters.tipo || undefined, scope: 'operacional' }, perms.ventas && active === 'ventas')
  const stockQuery = useReporteStockCritico(perms.stock && active === 'riesgos')
  const licitacionesQuery = useReporteLicitaciones({
    fechaDesde: filters.desde || undefined,
    fechaHasta: filters.hasta || undefined,
    rutCliente: filters.cliente || undefined,
  }, perms.licitaciones && active === 'ventas')
  const odtsQuery = useReporteOdts({ fechaDesde: filters.desde || undefined, fechaHasta: filters.hasta || undefined }, perms.taller && active === 'operacion')
  const despachosQuery = useReporteDespachos({ desde: filters.desde || undefined, hasta: filters.hasta || undefined }, perms.despacho && active === 'operacion')

  const ventasGerencialProblem = combinedProblem(perms.ventas, [ventasGerencialQuery])
  const cajaProblem = combinedProblem(perms.caja, [cobranzaCajaGerencialQuery])
  const cobranzaProblem = combinedProblem(perms.cobranza, [cobranzaCajaGerencialQuery])
  const stockProblem = combinedProblem(perms.stock, [stockGerencialQuery])
  const licitacionesProblem = combinedProblem(perms.licitaciones, [licitacionesGerencialQuery])
  const operacionProblem = combinedProblem(perms.taller && perms.despacho, [operacionesGerencialQuery])
  const ventasDetailProblem = combinedProblem(perms.ventas, [ventasQuery])
  const licitacionesDetailProblem = combinedProblem(perms.licitaciones, [licitacionesQuery])
  const odtsDetailProblem = combinedProblem(perms.taller, [odtsQuery])
  const despachosDetailProblem = combinedProblem(perms.despacho, [despachosQuery])
  const stockDetailProblem = combinedProblem(perms.stock, [stockQuery])

  const ventas = useMemo(() => filterVentas(ventasQuery.data?.items || [], filters), [ventasQuery.data, filters])
  const odts = odtsQuery.data?.items || []
  const despachos = despachosQuery.data?.items || []
  const licitaciones = licitacionesQuery.data?.items || []
  const stockProductos = stockQuery.data?.productos || []
  const stockMateriales = stockQuery.data?.materiales || []

  const ventaTotal = Number(ventasGerencialQuery.data?.total ?? ventas.reduce((sum, item) => sum + Number(item.total || 0), 0))
  const ventaCount = Number(ventasGerencialQuery.data?.count ?? ventas.length)
  const ventaTicket = ventaCount ? ventaTotal / ventaCount : 0
  const ingresos = Number(cobranzaCajaGerencialQuery.data?.caja?.ingresos || 0)
  const egresos = Number(cobranzaCajaGerencialQuery.data?.caja?.egresos || 0)
  const cobranzaPendiente = Number(cobranzaCajaGerencialQuery.data?.cuentasPorCobrar?.porCobrar || 0)
  const odtsPendientes = odts.filter(item => item.estado !== 'Terminada')
  const despachosPendientes = despachos.filter(item => !item.fechaEntrega || new Date(item.fechaEntrega) >= new Date())
  const licitacionesPendientes = licitaciones.filter(item => ['Pendiente', 'En proceso'].includes(item.estado))
  const stockCriticoTotal = Number(
    (stockGerencialQuery.data?.stockCritico?.totales?.productosCriticos || 0) +
    (stockGerencialQuery.data?.stockCritico?.totales?.materialesCriticos || 0)
  )
  const pendientesOperacionTotal = Number(
    (operacionesGerencialQuery.data?.taller?.pendientes || 0) +
    (operacionesGerencialQuery.data?.despachos?.pendientes || 0)
  )

  const queries = [
    ventasGerencialQuery, cobranzaCajaGerencialQuery, stockGerencialQuery, licitacionesGerencialQuery, operacionesGerencialQuery,
  ]
  const isLoading = queries.some(query => query.isLoading && query.fetchStatus !== 'idle')
  const hasError = queries.some(query => query.isError)
  const licitacionesPendientesCount = Number(licitacionesGerencialQuery.data?.byResultado?.pendiente?.count ?? licitacionesPendientes.length)
  const riesgoProblem = stockProblem || licitacionesProblem

  // RUT, correo y codigo de vendedor no son una identidad comun. Estos
  // rankings se limitan a ordenes internas hasta normalizar las tres fuentes.
  const ordenesInternas = ventasGerencialQuery.data?.desgloses?.ordenesInternas || {}
  const ventaPorTipo = metricRows(ordenesInternas.byTipo)
  const ventaPorVendedor = metricRows(ordenesInternas.byVendedor)
  const ventaPorCliente = metricRows(ordenesInternas.byCliente)
  const advertenciasVentas = ventasGerencialQuery.data?.advertencias || []

  const updateFilter = (key, value) => {
    if (key === 'desde' || key === 'hasta') setPreset('personalizado')
    setFilters(current => ({ ...current, [key]: value }))
  }
  const applyPreset = nextPreset => {
    const range = rangeForPreset(nextPreset)
    setPreset(nextPreset)
    setFilters(current => ({ ...current, ...range }))
  }
  const resetFilters = () => {
    setPreset('ytd')
    setFilters({ ...rangeForPreset('ytd'), tipo: '', vendedor: '', cliente: '' })
  }
  const exportGerencial = () => downloadFromBackend(
    '/reportes/export/gerencial.xlsx',
    `reporte_gerencial_${new Date().toISOString().slice(0, 10)}.xlsx`,
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
    { id: 'ventas', label: 'Comercial', count: statusCount(ventasGerencialProblem, ventaCount) },
    { id: 'operacion', label: 'Operacion', count: statusCount(operacionProblem, pendientesOperacionTotal) },
    { id: 'finanzas', label: 'Finanzas', count: statusCount(cobranzaProblem, cobranzaCajaGerencialQuery.data?.cuentasPorCobrar?.count || 0) },
    { id: 'riesgos', label: 'Riesgos', count: statusCount(riesgoProblem, stockCriticoTotal + licitacionesPendientesCount) },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Actividad comercial y operativa"
        subtitle="Seguimiento filtrable de operaciones, caja, cobranza, stock, licitaciones y pendientes. No reemplaza indicadores financieros certificados."
        breadcrumb={['Inicio', 'Reportes']}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="secondary" icon="download" onClick={exportGerencial}>Exportar Excel</Btn>
            <Btn variant="secondary" icon="refreshCw" onClick={resetFilters}>Limpiar filtros</Btn>
          </div>
        }
      />

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, marginRight: 2 }}>Período</span>
          {[
            ['mes', 'Mes'],
            ['trimestre', 'Trimestre'],
            ['ytd', 'Año a la fecha'],
            ['l12m', 'Últimos 12 meses'],
          ].map(([value, label]) => (
            <button key={value} type="button" onClick={() => applyPreset(value)} aria-pressed={preset === value} style={{ minHeight: 30, padding: '5px 9px', borderRadius: 7, border: `1px solid ${preset === value ? 'var(--green-600)' : 'var(--border)'}`, background: preset === value ? 'var(--green-50)' : '#fff', color: preset === value ? 'var(--green-700)' : 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              {label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>Agregados actualizados: {formatUpdatedAt(Math.max(ventasGerencialQuery.dataUpdatedAt || 0, cobranzaCajaGerencialQuery.dataUpdatedAt || 0, stockGerencialQuery.dataUpdatedAt || 0, licitacionesGerencialQuery.dataUpdatedAt || 0, operacionesGerencialQuery.dataUpdatedAt || 0))}</span>
        </div>
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
      {advertenciasVentas.map(aviso => (
        <div key={aviso.tipo} role="status" style={{ marginBottom: 12, padding: '10px 14px', background: '#fff8e1', color: '#8a5200', border: '1px solid #f2d08a', borderRadius: 8, fontSize: 13 }}>
          <strong>Lectura no certificada:</strong> {aviso.detalle}. Finanzas y Comercial deben definir si estas cotizaciones forman parte del indicador comercial.
        </div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 22 }}>
        <KpiCard label="Actividad comercial" value={statusValue(ventasGerencialProblem, ventaTotal, money)} sublabel={statusSublabel(ventasGerencialProblem, `${num(ventaCount)} operaciones`)} icon="shoppingCart" tone={statusTone(ventasGerencialProblem, 'blue')} />
        <KpiCard label="Ticket operativo" value={statusValue(ventasGerencialProblem, ventaTicket, money)} sublabel={statusSublabel(ventasGerencialProblem, 'sobre operaciones cargadas')} icon="barChart2" tone={statusTone(ventasGerencialProblem)} />
        <KpiCard label="CxC pendiente" value={statusValue(cobranzaProblem, cobranzaPendiente, money)} sublabel={statusSublabel(cobranzaProblem, `${num(cobranzaCajaGerencialQuery.data?.cuentasPorCobrar?.count || 0)} docs`)} icon="creditCard" tone={statusTone(cobranzaProblem, 'amber')} />
        <KpiCard label="Caja neta" value={statusValue(cajaProblem, ingresos - egresos, money)} sublabel={statusSublabel(cajaProblem, `${money(ingresos)} ing. / ${money(egresos)} egr.`)} icon="dollarSign" tone={statusTone(cajaProblem)} />
        <KpiCard label="Stock critico" value={statusValue(stockProblem, stockCriticoTotal)} sublabel={statusSublabel(stockProblem, 'productos y materiales')} icon="alertTriangle" tone={statusTone(stockProblem, stockCriticoTotal ? 'red' : 'neutral')} />
        <KpiCard label="Pendientes operacion" value={statusValue(operacionProblem, pendientesOperacionTotal)} sublabel={statusSublabel(operacionProblem, 'taller y despachos')} icon="clock" tone={statusTone(operacionProblem, 'amber')} />
      </div>

      <Tabs tabs={tabs} active={active} onChange={setActive} />

      {active === 'resumen' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <Panel title="Ordenes internas por tipo" icon="barChart2" action={<Badge tone="gray">sin web ni licitaciones</Badge>}>
            <QueryBlock problem={ventasGerencialProblem}>
              <GroupList rows={ventaPorTipo} format={money} />
            </QueryBlock>
          </Panel>
          <Panel title="Caja y cobranza" icon="dollarSign">
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Ingresos caja</span><strong>{statusValue(cajaProblem, ingresos, money)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Egresos caja</span><strong>{statusValue(cajaProblem, egresos, money)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Cobrado historico</span><strong>{statusValue(cobranzaProblem, cobranzaCajaGerencialQuery.data?.cuentasPorCobrar?.cobrado || 0, money)}</strong></div>
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
          <Panel title="Tendencia y comparativo de actividad" icon="trendingUp">
            <QueryBlock problem={ventasGerencialProblem}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
                <div><div style={{ color: 'var(--text-3)', fontSize: 11 }}>Vs. período anterior</div><strong style={{ color: Number(ventasGerencialQuery.data?.comparativo?.variacionVentas || 0) < 0 ? 'var(--red)' : 'var(--green-700)', fontSize: 18 }}>{ventasGerencialQuery.data?.comparativo?.variacionVentas == null ? '-' : `${(ventasGerencialQuery.data.comparativo.variacionVentas * 100).toFixed(1)}%`}</strong></div>
                <div><div style={{ color: 'var(--text-3)', fontSize: 11 }}>Ventas período anterior</div><strong style={{ fontSize: 16 }}>{money(ventasGerencialQuery.data?.comparativo?.periodoAnterior?.total)}</strong></div>
              </div>
              <BarChart title="Tendencia de actividad comercial" values={ventasGerencialQuery.data?.byPeriodo} />
            </QueryBlock>
          </Panel>
          <Panel title="Ordenes internas por vendedor" icon="user" action={<Badge tone="gray">sin web ni licitaciones</Badge>}>
            <QueryBlock problem={ventasGerencialProblem}>
              <GroupList rows={ventaPorVendedor} format={money} />
            </QueryBlock>
          </Panel>
          <Panel title="Ordenes internas por cliente" icon="users" action={<Badge tone="gray">sin web ni licitaciones</Badge>}>
            <QueryBlock problem={ventasGerencialProblem}>
              <GroupList rows={ventaPorCliente} format={money} />
            </QueryBlock>
          </Panel>
          <Panel title="Ultimas ventas filtradas" icon="shoppingCart" action={<Badge tone="blue">{statusCount(ventasDetailProblem, ventas.length)}</Badge>}>
            <QueryBlock problem={ventasDetailProblem}>
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
          <Panel title="Licitaciones" icon="clipboard" action={<Badge tone="amber">{statusCount(licitacionesDetailProblem, licitacionesPendingCount(licitaciones))}</Badge>}>
            <QueryBlock problem={licitacionesDetailProblem}>
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
          <Panel title="Cumplimiento operacional" icon="alertTriangle">
            <QueryBlock problem={operacionProblem}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>OT vencidas</span><Badge tone={operacionesGerencialQuery.data?.taller?.vencidas ? 'red' : 'green'}>{operacionesGerencialQuery.data?.taller?.vencidas || 0}</Badge></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>OT en riesgo (próximos 7 días)</span><Badge tone={operacionesGerencialQuery.data?.taller?.enRiesgo ? 'amber' : 'green'}>{operacionesGerencialQuery.data?.taller?.enRiesgo || 0}</Badge></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Despachos vencidos</span><Badge tone={operacionesGerencialQuery.data?.despachos?.vencidos ? 'red' : 'green'}>{operacionesGerencialQuery.data?.despachos?.vencidos || 0}</Badge></div>
              </div>
            </QueryBlock>
          </Panel>
          <Panel title="OT pendientes" icon="wrench" action={<Badge tone="amber">{statusCount(odtsDetailProblem, odtsPendientes.length)}</Badge>}>
            <QueryBlock problem={odtsDetailProblem}>
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
          <Panel title="Despachos pendientes" icon="truck" action={<Badge tone="amber">{statusCount(despachosDetailProblem, despachosPendientes.length)}</Badge>}>
            <QueryBlock problem={despachosDetailProblem}>
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

      {active === 'finanzas' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          <Panel title="Cobranza por antigüedad" icon="creditCard">
            <QueryBlock problem={cobranzaProblem}>
              <GroupList
                rows={Object.entries(cobranzaCajaGerencialQuery.data?.cuentasPorCobrar?.antiguedad || {}).map(([label, value]) => ({ label: `${label} días`, value: value.total, count: value.count }))}
                format={money}
              />
            </QueryBlock>
          </Panel>
          <Panel title="Caja del período" icon="dollarSign">
            <QueryBlock problem={cajaProblem}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Ingresos</span><strong>{money(ingresos)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Egresos</span><strong>{money(egresos)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border)' }}><span>Neto</span><strong>{money(ingresos - egresos)}</strong></div>
              </div>
            </QueryBlock>
          </Panel>
        </div>
      )}

      {active === 'riesgos' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          <Panel title="Productos con stock critico" icon="package" action={<Badge tone={stockDetailProblem ? 'gray' : stockProductos.length ? 'red' : 'green'}>{statusCount(stockDetailProblem, stockProductos.length)}</Badge>}>
            <QueryBlock problem={stockDetailProblem}>
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
          <Panel title="Materiales de taller criticos" icon="warehouse" action={<Badge tone={stockDetailProblem ? 'gray' : stockMateriales.length ? 'red' : 'green'}>{statusCount(stockDetailProblem, stockMateriales.length)}</Badge>}>
            <QueryBlock problem={stockDetailProblem}>
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
