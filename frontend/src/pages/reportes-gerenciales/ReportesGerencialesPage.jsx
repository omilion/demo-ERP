import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn, Icon, KpiCard, PageHeader, Table, Tabs } from '../../components/shared'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { downloadFromBackend } from '../../utils/csv'
import {
  useReporteGerencialResumen,
  useReporteGerencialFiltros,
  useReporteComercialGerencial,
  useReporteOperacionGerencial,
  useReporteFinanzasGerencial,
  useReporteRiesgosGerencial,
  useReporteDespachos,
  useReporteLicitaciones,
  useReporteOdts,
  useReporteStockCritico,
  useReporteVentas,
} from '../../api/reportesGerenciales'
import { useClientes } from '../../api/clientes'

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

function ClienteAutocomplete({ value, onTextChange, onSelect, enabled }) {
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value.trim()), 250)
    return () => clearTimeout(timeout)
  }, [value])

  useEffect(() => {
    const onOutside = event => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const searchable = enabled && debounced.length >= 2
  const { data, isFetching } = useClientes({ search: debounced, limit: 8 }, { enabled: searchable })
  const resultados = searchable ? (data?.items || []) : []

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={event => { onTextChange(event.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}
        placeholder={enabled ? 'Buscar por RUT o razón social' : 'Sin permiso para consultar clientes'}
        disabled={!enabled}
        aria-label="Buscar cliente por RUT o razón social"
        aria-autocomplete="list"
        aria-expanded={open && searchable}
        style={{ ...selectInputStyle(), width: '100%', minWidth: 0, boxSizing: 'border-box', opacity: enabled ? 1 : 0.6 }}
      />
      {open && searchable && (
        <div role="listbox" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30, overflowY: 'auto', maxHeight: 260, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px oklch(0 0 0 / .12)' }}>
          {isFetching && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-3)' }}>Buscando clientes...</div>}
          {!isFetching && !resultados.length && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-3)' }}>Sin coincidencias</div>}
          {resultados.map(item => {
            const nombre = item.razonSocial || item.nombre || 'Sin razón social'
            return <button key={item.id} type="button" role="option" onMouseDown={event => event.preventDefault()} onClick={() => { onSelect(item); setOpen(false) }} style={{ display: 'block', width: '100%', padding: '9px 10px', border: 0, borderBottom: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>{nombre}</span>
              <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: 'var(--text-3)' }}>{item.rut || 'Sin RUT'}</span>
            </button>
          })}
        </div>
      )}
    </div>
  )
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

function GroupList({ rows, labelKey = 'label', valueKey = 'value', format = num, onRowClick }) {
  if (!rows.length) return <EmptyBlock />
  const max = Math.max(...rows.map(row => Number(row[valueKey] || 0)), 1)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.slice(0, 7).map(row => {
        const content = <>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-2)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[labelKey] || 'Sin dato'}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--green-50)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(4, (Number(row[valueKey] || 0) / max) * 100)}%`, height: '100%', background: 'var(--green-600)' }} />
            </div>
          </div>
          <strong style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-1)' }}>{format(row[valueKey])}</strong>
        </>
        const style = { display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(80px, auto)', gap: 12, alignItems: 'center', width: '100%', padding: onRowClick ? '5px 6px' : 0, border: 0, borderRadius: 7, background: 'transparent', textAlign: 'left', cursor: onRowClick ? 'pointer' : 'default' }
        return onRowClick
          ? <button key={row[labelKey]} type="button" onClick={() => onRowClick(row)} style={style}>{content}</button>
          : <div key={row[labelKey]} style={style}>{content}</div>
      })}
    </div>
  )
}

function BarChart({ title, values, format = money, color = 'var(--green-600)', maxPoints = 12 }) {
  const rows = Object.entries(values || {}).map(([label, value]) => ({ label, value: Number(value?.total ?? value ?? 0) })).slice(-maxPoints)
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

function percent(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${(Number(value) * 100).toFixed(digits)}%`
}

function Delta({ value }) {
  if (value == null || !Number.isFinite(Number(value))) return <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Sin base comparable</span>
  const positive = Number(value) >= 0
  return <span style={{ color: positive ? 'var(--green-700)' : 'var(--red)', fontSize: 12, fontWeight: 700 }}>{positive ? '+' : ''}{percent(value)}</span>
}

function CommercialMetric({ label, value, detail, delta, tone = 'green' }) {
  const accent = tone === 'amber' ? 'var(--amber)' : tone === 'red' ? 'var(--red)' : 'var(--green-600)'
  return <article style={{ minWidth: 0, padding: '14px 15px', background: '#fff', border: '1px solid var(--border)', borderTop: `3px solid ${accent}`, borderRadius: 10, boxShadow: 'var(--shadow-sm)' }}>
    <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.35 }}>{label}</div>
    <div style={{ marginTop: 6, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace", fontSize: 21, fontWeight: 800, letterSpacing: -0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 7, minHeight: 16, color: 'var(--text-3)', fontSize: 11 }}><span>{detail}</span>{delta !== undefined && <Delta value={delta} />}</div>
  </article>
}

function compactDate(value) {
  if (!value) return '—'
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function groupCommercialTrend(points = [], desde, hasta) {
  const start = new Date(`${desde}T12:00:00`)
  const end = new Date(`${hasta}T12:00:00`)
  const days = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
    ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
    : points.length
  const group = days <= 31 ? 'day' : days <= 180 ? 'week' : 'month'
  const buckets = new Map()

  const addBucket = (key, label) => buckets.set(key, { label, value: 0 })
  if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())) {
    if (group === 'day') {
      for (let dateValue = new Date(start); dateValue <= end; dateValue.setDate(dateValue.getDate() + 1)) {
        const key = toInputDate(dateValue)
        addBucket(key, dateValue.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }))
      }
    } else if (group === 'week') {
      const totalWeeks = Math.ceil(days / 7)
      for (let week = 0; week < totalWeeks; week += 1) {
        const weekStart = new Date(start)
        weekStart.setDate(start.getDate() + week * 7)
        addBucket(String(week).padStart(3, '0'), `Sem. ${weekStart.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}`)
      }
    } else {
      const firstMonth = new Date(start.getFullYear(), start.getMonth(), 1)
      const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1)
      for (let dateValue = new Date(firstMonth); dateValue <= lastMonth; dateValue.setMonth(dateValue.getMonth() + 1)) {
        const key = `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}`
        addBucket(key, dateValue.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }))
      }
    }
  }

  points.forEach(point => {
    const value = Number(point.ventas || 0)
    const dateValue = new Date(`${point.label}T12:00:00`)
    if (Number.isNaN(dateValue.getTime())) return
    let key
    let label
    if (group === 'day') {
      key = point.label
      label = dateValue.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
    } else if (group === 'week') {
      const diff = Math.max(0, Math.floor((dateValue.getTime() - start.getTime()) / 86_400_000))
      const week = Math.floor(diff / 7)
      const weekStart = new Date(start)
      weekStart.setDate(start.getDate() + week * 7)
      key = String(week).padStart(3, '0')
      label = `Sem. ${weekStart.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}`
    } else {
      key = point.label.slice(0, 7)
      label = dateValue.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' })
    }
    const current = buckets.get(key) || { label, value: 0 }
    current.value += value
    buckets.set(key, current)
  })

  const rows = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value)
  return {
    rows,
    groupLabel: group === 'day' ? 'día' : group === 'week' ? 'semana' : 'mes',
    maxPoints: group === 'day' ? 31 : group === 'week' ? 27 : 12,
  }
}

function CommercialDashboard({ data, navigate }) {
  const kpis = data?.kpis || {}
  const margin = kpis.margen || { visible: false }
  const inventory = kpis.inventario || { visible: false }
  const hasMarginCoverage = margin.visible && Number(margin.coberturaVentasPct || 0) > 0
  const hasInventoryCostCoverage = inventory.visible && Number(inventory.coberturaValorizacionPct || 0) > 0
  const trend = groupCommercialTrend(data?.tendencia, data?.filtros?.desde, data?.filtros?.hasta)
  const tendencia = Object.fromEntries(trend.rows.map(row => [row.label, row.value]))
  const canales = (data?.rankings?.canales || []).map(row => ({ label: row.label, value: row.ventas, count: row.ordenes }))
  const vendedores = data?.rankings?.vendedores || []
  const clientes = data?.rankings?.clientes || []
  const productos = data?.rankings?.productos || []
  const cobertura = data?.rankings?.coberturaInventario || []
  const sinVenta = data?.inventario?.sinVentaPeriodo || []
  const previous = kpis.comparativos?.periodoAnterior || {}
  const year = kpis.comparativos?.mismoPeriodoAnoAnterior || {}

  return <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
    <div role="status" style={{ padding: '10px 14px', border: '1px solid #bae6fd', borderRadius: 8, background: '#f0f9ff', color: '#075985', fontSize: 13 }}>
      <strong>Lectura comercial:</strong> {data.meta?.mensajeEstado}
    </div>

    <section aria-label="Indicadores comerciales" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
      <CommercialMetric label="Ventas de órdenes" value={money(kpis.ventas)} detail={`${num(kpis.ordenes)} órdenes`} delta={previous.variacionVentas} tone="green" />
      <CommercialMetric label="Unidades vendidas" value={num(kpis.unidades)} detail="líneas registradas" tone="green" />
      <CommercialMetric label="Ticket promedio" value={money(kpis.ticketPromedio)} detail="por orden" tone="green" />
      <CommercialMetric label="Margen estimado" value={hasMarginCoverage ? money(margin.monto) : margin.visible ? 'Sin costo' : 'Restringido'} detail={hasMarginCoverage ? `${percent(margin.pct)} · cobertura ${percent(margin.coberturaVentasPct, 0)}` : margin.visible ? 'sin costo trazable en las líneas' : 'requiere permiso de costos'} tone={hasMarginCoverage && Number(margin.pct || 0) < 0 ? 'red' : 'amber'} />
      <CommercialMetric label="Clientes recurrentes" value={num(kpis.clientesRecurrentesPeriodo)} detail={`${percent(kpis.tasaRecompraPeriodo)} de ${num(kpis.clientesUnicos)} clientes`} tone="green" />
      <CommercialMetric label="Stock sin venta" value={hasInventoryCostCoverage ? num(inventory.sinVentaPeriodo) : inventory.visible ? 'Sin costo' : 'Restringido'} detail={hasInventoryCostCoverage ? 'ítems de mayor valor estimado' : inventory.visible ? 'sin valorización trazable' : 'requiere permiso de bodega'} tone={hasInventoryCostCoverage && inventory.sinVentaPeriodo ? 'amber' : 'green'} />
    </section>

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.1fr) minmax(280px, .9fr)', gap: 16 }}>
      <Panel title="Tendencia de ventas" icon="trendingUp" action={<Badge tone="blue">por {trend.groupLabel}</Badge>}>
        <div style={{ marginBottom: 8, color: 'var(--text-3)', fontSize: 12, lineHeight: 1.4 }}>
          Ventas netas de órdenes creadas entre <strong>{compactDate(data?.filtros?.desde)}</strong> y <strong>{compactDate(data?.filtros?.hasta)}</strong>, agrupadas por {trend.groupLabel}. Cada barra representa todo ese bloque de tiempo.
        </div>
        <BarChart title={`Tendencia de ventas por ${trend.groupLabel}`} values={tendencia} maxPoints={trend.maxPoints} />
      </Panel>
      <Panel title="Comparativo de crecimiento" icon="barChart2">
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ paddingBottom: 13, borderBottom: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Período anterior equivalente</div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 5 }}><strong style={{ fontSize: 20 }}>{money(previous.ventas)}</strong><Delta value={previous.variacionVentas} /></div>
            <div style={{ marginTop: 3, color: 'var(--text-3)', fontSize: 12 }}>{compactDate(previous.rango?.desde)} — {compactDate(previous.rango?.hasta)} · {num(previous.ordenes)} órdenes</div>
            <div style={{ marginTop: 3, color: 'var(--text-3)', fontSize: 11, lineHeight: 1.35 }}>{previous.criterio}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Mismo período año anterior</div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 5 }}><strong style={{ fontSize: 20 }}>{money(year.ventas)}</strong><Delta value={year.variacionVentas} /></div>
            <div style={{ marginTop: 3, color: 'var(--text-3)', fontSize: 12 }}>{compactDate(year.rango?.desde)} — {compactDate(year.rango?.hasta)} · {num(year.ordenes)} órdenes</div>
            <div style={{ marginTop: 3, color: 'var(--text-3)', fontSize: 11, lineHeight: 1.35 }}>{year.criterio}</div>
          </div>
        </div>
      </Panel>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
      <Panel title="Canales / tipo de venta" icon="shoppingCart">
        <GroupList rows={canales} format={money} />
      </Panel>
      <Panel title="Desempeño por vendedor" icon="user" action={<Badge tone="gray">órdenes internas</Badge>}>
        <Table
          columns={[
            { key: 'label', label: 'Vendedor', wrap: true },
            { key: 'ordenes', label: 'Órdenes', align: 'right' },
            { key: 'unidades', label: 'Unid.', align: 'right' },
            { key: 'ventas', label: 'Ventas', align: 'right', render: value => money(value) },
          ]}
          rows={vendedores}
          emptyMessage="Sin órdenes para los filtros aplicados"
          ariaLabel="Desempeño por vendedor"
          getRowKey={row => row.label}
        />
      </Panel>
      <Panel title="Productos con mayor salida" icon="package" action={<Badge tone="gray">monto y unidades</Badge>}>
        <Table
          columns={[
            { key: 'nombre', label: 'Producto', wrap: true },
            { key: 'categoria', label: 'Categoría', wrap: true },
            { key: 'unidades', label: 'Unid.', align: 'right' },
            { key: 'ventas', label: 'Ventas', align: 'right', render: value => money(value) },
            ...(margin.visible ? [{ key: 'margenPct', label: 'Margen est.', align: 'right', render: value => percent(value) }] : []),
          ]}
          rows={productos}
          onRowClick={row => row.productoId && navigate(`/productos/${row.productoId}`)}
          emptyMessage="Sin productos vendidos para los filtros aplicados"
          ariaLabel="Productos más vendidos"
          getRowKey={row => row.productoId || row.codigo || row.nombre}
        />
      </Panel>
      <Panel title="Clientes con mayor actividad" icon="users" action={<Badge tone="gray">período actual</Badge>}>
        <Table
          columns={[
            { key: 'nombre', label: 'Cliente', wrap: true },
            { key: 'ordenes', label: 'Órdenes', align: 'right' },
            { key: 'unidades', label: 'Unid.', align: 'right' },
            { key: 'ventas', label: 'Ventas', align: 'right', render: value => money(value) },
          ]}
          rows={clientes}
          emptyMessage="Sin permiso o sin clientes identificados para el período"
          ariaLabel="Clientes con mayor actividad"
          getRowKey={row => row.nombre}
        />
      </Panel>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
      <Panel title="Cobertura de inventario sobre productos vendidos" icon="warehouse">
        {hasInventoryCostCoverage ? <Table
          columns={[
            { key: 'nombre', label: 'Producto', wrap: true },
            { key: 'stock', label: 'Stock', align: 'right' },
            { key: 'unidades', label: 'Unid. vendidas', align: 'right' },
            { key: 'diasCobertura', label: 'Días cobertura', align: 'right', render: value => value == null ? '—' : `${Math.round(value)} d` },
          ]}
          rows={cobertura}
          emptyMessage="No hay productos con venta y stock disponible en el período"
          ariaLabel="Cobertura de inventario"
          getRowKey={row => row.productoId || row.codigo || row.nombre}
        /> : <EmptyBlock text={inventory.visible ? 'No hay costo trazable suficiente para calcular cobertura de inventario.' : 'La cobertura y costos están restringidos a roles con permiso de Bodega.'} />}
      </Panel>
      <Panel title="Inventario sin venta en el período" icon="alertTriangle" action={hasInventoryCostCoverage ? <Badge tone={sinVenta.length ? 'amber' : 'green'}>{sinVenta.length}</Badge> : null}>
        {hasInventoryCostCoverage ? <Table
          columns={[
            { key: 'nombre', label: 'Producto', wrap: true },
            { key: 'stock', label: 'Stock', align: 'right' },
            { key: 'valor', label: 'Valor est.', align: 'right', render: value => money(value) },
          ]}
          rows={sinVenta}
          onRowClick={row => navigate(`/productos/${row.productoId}`)}
          emptyMessage="No hay stock valorizado sin venta para el período"
          ariaLabel="Inventario sin venta durante el período"
          getRowKey={row => row.productoId}
        /> : <EmptyBlock text={inventory.visible ? 'No hay costo trazable suficiente para valorar inventario sin venta.' : 'La valorización de inventario está restringida a roles con permiso de Bodega.'} />}
      </Panel>
    </div>

    <Panel title="Datos pendientes de gobierno comercial" icon="alertTriangle">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        {(data.brechas || []).map(brecha => <div key={brecha.codigo} style={{ padding: 12, borderRadius: 8, border: '1px solid #f2d08a', background: '#fffaf0' }}><strong style={{ fontSize: 13 }}>{brecha.titulo}</strong><div style={{ marginTop: 5, color: 'var(--text-2)', fontSize: 12, lineHeight: 1.45 }}>{brecha.detalle}</div></div>)}
      </div>
    </Panel>
  </div>
}

function ScopeBanner({ title, children }) {
  return <div role="status" style={{ padding: '10px 14px', border: '1px solid #bae6fd', borderRadius: 8, background: '#f0f9ff', color: '#075985', fontSize: 13, lineHeight: 1.45 }}>
    <strong>{title}:</strong> {children}
  </div>
}

function OperationalDashboard({ data, navigate }) {
  const kpis = data?.kpis || {}
  const buildTrend = key => groupCommercialTrend((data?.tendencia || []).map(point => ({ label: point.label, ventas: point[key] })), data?.filtros?.desde, data?.filtros?.hasta)
  const trendOtIngresos = buildTrend('ingresos')
  const trendOtTerminadas = buildTrend('terminadas')
  const trendDespachos = buildTrend('despachosIngresados')
  const trendEntregas = buildTrend('entregas')
  const valuesFor = trend => Object.fromEntries(trend.rows.map(row => [row.label, row.value]))
  const estados = data?.estadoOdt || []
  const prioridades = data?.prioridadOdt || []
  const antiguedad = data?.antiguedadBacklog || []
  const despacho = data?.analisisDespachos || {}
  const cycle = kpis.cicloPromedioHoras == null ? 'Sin dato' : `${Math.round(kpis.cicloPromedioHoras)} h`

  return <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
    <ScopeBanner title="Lectura operacional">{data?.meta?.mensajeEstado}</ScopeBanner>
    <section aria-label="Indicadores operacionales" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      <CommercialMetric label="Backlog actual" value={num(kpis.backlog)} detail="OT no cerradas ahora" tone={kpis.backlog ? 'amber' : 'green'} />
      <CommercialMetric label="OT vencidas" value={num(kpis.vencidas)} detail={`${num(kpis.enRiesgo)} en riesgo · ${num(kpis.sinCompromiso)} sin compromiso`} tone={kpis.vencidas ? 'red' : kpis.enRiesgo ? 'amber' : 'green'} />
      <CommercialMetric label="Tasa de cierre" value={percent(kpis.tasaCierre)} detail="terminadas / OT ingresadas; no es OTIF" tone="green" />
      <CommercialMetric label="Ciclo promedio OT" value={cycle} detail="inicio o creación hasta término" tone={kpis.cicloPromedioHoras == null ? 'amber' : 'green'} />
      <CommercialMetric label="Despachos ingresados" value={num(kpis.despachosIngresados)} detail="creados en el período" tone="green" />
      <CommercialMetric label="Entregas registradas" value={num(kpis.entregas)} detail={`${percent(kpis.relacionEntregasVsIngresos)} vs. ingresos; no confirma recepción`} tone="green" />
      <CommercialMetric label="Incidencias / multas" value={`${num(kpis.despachosConIncidencia)} / ${num(kpis.despachosConMulta)}`} detail={`${num(kpis.despachosParciales)} despachos parciales`} tone={kpis.despachosConIncidencia || kpis.despachosConMulta ? 'red' : kpis.despachosParciales ? 'amber' : 'green'} />
      <CommercialMetric label="Pendientes de despacho" value={num(kpis.despachosPendientes)} detail="estado actual, fuera del corte histórico" tone={kpis.despachosPendientes ? 'amber' : 'green'} />
    </section>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
      <Panel title="Flujo de órdenes de taller" icon="trendingUp" action={<Badge tone="blue">por {trendOtIngresos.groupLabel}</Badge>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}><div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>Ingresadas</div><strong>{num(kpis.ingresos)}</strong></div><div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>Terminadas</div><strong>{num(kpis.terminadas)}</strong></div></div>
        <BarChart title="OT ingresadas" values={valuesFor(trendOtIngresos)} format={num} maxPoints={trendOtIngresos.maxPoints} />
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}><div style={{ marginBottom: 4, color: 'var(--text-3)', fontSize: 11 }}>OT terminadas en el mismo rango</div><BarChart title="OT terminadas" values={valuesFor(trendOtTerminadas)} format={num} color="var(--blue)" maxPoints={trendOtTerminadas.maxPoints} /></div>
      </Panel>
      <Panel title="Backlog y envejecimiento" icon="wrench">
        <GroupList rows={estados} format={num} />
        {!!antiguedad.length && <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}><div style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>Antigüedad desde ingreso</div><GroupList rows={antiguedad} format={num} /></div>}
        {!!prioridades.length && <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}><div style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>Por prioridad</div><GroupList rows={prioridades} format={num} /></div>}
      </Panel>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
      <Panel title="Flujo de despachos" icon="truck" action={<Badge tone="blue">por {trendDespachos.groupLabel}</Badge>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}><div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>Ingresados</div><strong>{num(kpis.despachosIngresados)}</strong></div><div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>Entregas registradas</div><strong>{num(kpis.entregas)}</strong></div></div>
        <BarChart title="Despachos ingresados" values={valuesFor(trendDespachos)} format={num} maxPoints={trendDespachos.maxPoints} />
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}><div style={{ marginBottom: 4, color: 'var(--text-3)', fontSize: 11 }}>Entregas registradas en el mismo rango</div><BarChart title="Entregas registradas" values={valuesFor(trendEntregas)} format={num} color="var(--blue)" maxPoints={trendEntregas.maxPoints} /></div>
      </Panel>
      <Panel title="Distribución de despachos ingresados" icon="barChart2">
        <div style={{ display: 'grid', gap: 16 }}><div><div style={{ marginBottom: 7, fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>Por tipo / canal</div><GroupList rows={despacho.porTipo || []} format={num} /></div><div style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}><div style={{ marginBottom: 7, fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>Por transporte</div><GroupList rows={despacho.porTransporte || []} format={num} /></div><div style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}><div style={{ marginBottom: 7, fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>Principales comunas</div><GroupList rows={despacho.porComuna || []} format={num} /></div></div>
      </Panel>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
      <Panel title="OT que requieren atención" icon="alertTriangle" action={<Badge tone={kpis.vencidas ? 'red' : 'green'}>{num(kpis.vencidas)}</Badge>}>
        <Table
          columns={[
            { key: 'id', label: 'OT' }, { key: 'clienteNombre', label: 'Cliente', wrap: true },
            { key: 'estado', label: 'Estado' }, { key: 'prioridad', label: 'Prioridad' },
            { key: 'compromiso', label: 'Compromiso', render: value => date(value) },
            { key: 'diasAtraso', label: 'Atraso', align: 'right', render: value => value == null ? 'Sin fecha' : value > 0 ? `${value} d` : 'En plazo' },
          ]}
          rows={data?.backlog || []} onRowClick={row => navigate(`/taller/${row.id}`)} emptyMessage="Sin OT abiertas" ariaLabel="Backlog de órdenes de taller" getRowKey={row => row.id}
        />
      </Panel>
      <Panel title="Despachos pendientes actuales" icon="truck" action={<Badge tone={kpis.despachosPendientes ? 'amber' : 'green'}>{num(kpis.despachosPendientes)}</Badge>}>
        <Table
          columns={[
            { key: 'interno', label: 'N° interno' }, { key: 'contacto', label: 'Contacto', wrap: true },
            { key: 'comuna', label: 'Comuna' }, { key: 'transporte', label: 'Transporte' },
            { key: 'fechaInterno', label: 'Ingreso', render: value => date(value) },
          ]}
          rows={data?.despachos || []} onRowClick={() => navigate('/despachos')} emptyMessage="Sin despachos pendientes" ariaLabel="Despachos pendientes" getRowKey={row => row.id}
        />
      </Panel>
    </div>
    <GovernanceGaps items={data?.brechas} />
  </div>
}

function FinanceDashboard({ data, navigate }) {
  const kpis = data?.kpis || {}
  const comparison = kpis.comparativoFlujo || {}
  const trend = groupCommercialTrend((data?.tendencia || []).map(point => ({ label: point.label, ventas: point.ingresos })), data?.filtros?.desde, data?.filtros?.hasta)
  const trendValues = Object.fromEntries(trend.rows.map(row => [row.label, row.value]))
  const aging = (data?.antiguedad || []).map(item => ({ label: item.label, value: item.monto, count: item.documentos }))

  return <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
    <ScopeBanner title="Lectura financiera">{data?.meta?.mensajeEstado}</ScopeBanner>
    <section aria-label="Indicadores financieros operacionales" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 12 }}>
      <CommercialMetric label="Ingresos de caja" value={money(kpis.ingresos)} detail="movimientos en el período" tone="green" />
      <CommercialMetric label="Egresos de caja" value={money(kpis.egresos)} detail="movimientos en el período" tone={kpis.egresos ? 'amber' : 'green'} />
      <CommercialMetric label="Flujo neto" value={money(kpis.flujoNeto)} detail="ingresos menos egresos" delta={comparison.variacion} tone={kpis.flujoNeto < 0 ? 'red' : 'green'} />
      <CommercialMetric label="CxC pendiente registrada" value={money(kpis.carteraPendienteRegistrada)} detail={`${num(kpis.documentosPendientes)} documentos con estado pendiente`} tone={kpis.documentosPendientes ? 'amber' : 'green'} />
      <CommercialMetric label="Documentos emitidos" value={num(kpis.documentosEmitidos)} detail="fecha factura del período" tone="green" />
    </section>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.1fr) minmax(280px, .9fr)', gap: 16 }}>
      <Panel title="Ingresos de caja" icon="trendingUp" action={<Badge tone="blue">por {trend.groupLabel}</Badge>}>
        <div style={{ marginBottom: 8, color: 'var(--text-3)', fontSize: 12 }}>Ingresos registrados por fecha de movimiento; no representa facturación ni saldo bancario.</div>
        <BarChart title="Ingresos de caja por período" values={trendValues} maxPoints={trend.maxPoints} />
      </Panel>
      <Panel title="Comparativo de flujo" icon="barChart2">
        <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Período anterior equivalente</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginTop: 7 }}><strong style={{ fontSize: 22 }}>{money(comparison.flujoNeto)}</strong><Delta value={comparison.variacion} /></div>
        <div style={{ marginTop: 5, color: 'var(--text-3)', fontSize: 12 }}>{compactDate(comparison.rango?.desde)} — {compactDate(comparison.rango?.hasta)}</div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12, lineHeight: 1.45 }}>{comparison.rango?.criterio}</div>
      </Panel>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
      <Panel title="Cartera por antigüedad" icon="creditCard"><GroupList rows={aging} format={money} /></Panel>
      <Panel title="Ingresos por medio de pago" icon="dollarSign"><GroupList rows={data?.mediosPago || []} format={money} /></Panel>
      <Panel title="Documentos pendientes más antiguos" icon="alertTriangle">
        <Table columns={[
          { key: 'interno', label: 'Interno' }, { key: 'cliente', label: 'Cliente', wrap: true }, { key: 'rut', label: 'RUT' },
          { key: 'fechaFactura', label: 'Factura', render: value => date(value) }, { key: 'valorFactura', label: 'Valor', align: 'right', render: value => money(value) },
        ]} rows={data?.cartera || []} onRowClick={() => navigate('/cobranza')} emptyMessage="Sin documentos pendientes" ariaLabel="Cartera pendiente" getRowKey={row => row.id} />
      </Panel>
    </div>
    <GovernanceGaps items={data?.brechas} />
  </div>
}

function RisksDashboard({ data, navigate }) {
  const kpis = data?.kpis || {}
  const productRows = data?.stock?.productos || []
  const materialRows = data?.stock?.materiales || []
  return <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
    <ScopeBanner title="Lectura de riesgos">{data?.meta?.mensajeEstado}</ScopeBanner>
    <section aria-label="Indicadores de riesgo" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 12 }}>
      <CommercialMetric label="Productos críticos" value={num(kpis.productosCriticos)} detail="stock actual bajo umbral" tone={kpis.productosCriticos ? 'red' : 'green'} />
      <CommercialMetric label="Materiales críticos" value={num(kpis.materialesCriticos)} detail="bodega de taller actual" tone={kpis.materialesCriticos ? 'red' : 'green'} />
      <CommercialMetric label="Lotes no aprobados" value={num(kpis.lotesBloqueados)} detail="con disponibilidad en stock" tone={kpis.lotesBloqueados ? 'red' : 'green'} />
      <CommercialMetric label="Excepciones abiertas" value={num(kpis.excepcionesAbiertas)} detail={`${num(kpis.excepcionesVencidas)} vencidas`} tone={kpis.excepcionesVencidas ? 'red' : kpis.excepcionesAbiertas ? 'amber' : 'green'} />
      <CommercialMetric label="Licitaciones pendientes" value={num(kpis.licitacionesPendientes)} detail={money(kpis.montoLicitacionesPendientes) + ' potencial'} tone={kpis.licitacionesPendientes ? 'amber' : 'green'} />
      <CommercialMetric label="Umbrales sin configurar" value={num(kpis.umbralesSinConfigurar)} detail="SKUs sin stock crítico" tone={kpis.umbralesSinConfigurar ? 'amber' : 'green'} />
    </section>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(410px, 1fr))', gap: 16 }}>
      <Panel title="Productos con stock crítico" icon="package" action={<Badge tone={productRows.length ? 'red' : 'green'}>{productRows.length}</Badge>}>
        <Table columns={[
          { key: 'codigoInterno', label: 'Código' }, { key: 'nombre', label: 'Producto', wrap: true }, { key: 'stock', label: 'Stock', align: 'right' }, { key: 'stockCritico', label: 'Umbral', align: 'right' },
        ]} rows={productRows} onRowClick={() => navigate('/bodega')} emptyMessage="Sin productos críticos" ariaLabel="Productos con stock crítico" getRowKey={row => row.id} />
      </Panel>
      <Panel title="Materiales de taller críticos" icon="warehouse" action={<Badge tone={materialRows.length ? 'red' : 'green'}>{materialRows.length}</Badge>}>
        <Table columns={[
          { key: 'codigoInterno', label: 'Código' }, { key: 'nombre', label: 'Material', wrap: true }, { key: 'stock', label: 'Stock', align: 'right' }, { key: 'stockCritico', label: 'Umbral', align: 'right' },
        ]} rows={materialRows} onRowClick={() => navigate('/bodega-taller')} emptyMessage="Sin materiales críticos" ariaLabel="Materiales con stock crítico" getRowKey={row => row.id} />
      </Panel>
      <Panel title="Lotes de calidad no aprobada" icon="alertTriangle" action={<Badge tone={kpis.lotesBloqueados ? 'red' : 'green'}>{num(kpis.lotesBloqueados)}</Badge>}>
        <Table columns={[
          { key: 'codigo', label: 'Lote' }, { key: 'item', label: 'Material', wrap: true, render: value => value?.nombre || '—' }, { key: 'estadoCalidad', label: 'Calidad' }, { key: 'cantidadDisponible', label: 'Disponible', align: 'right' },
        ]} rows={data?.lotes || []} onRowClick={() => navigate('/bodega-taller')} emptyMessage="Sin lotes observados o rechazados" ariaLabel="Lotes de calidad no aprobada" getRowKey={row => row.id} />
      </Panel>
      <Panel title="Excepciones abiertas" icon="clipboard" action={<Badge tone={kpis.excepcionesVencidas ? 'red' : 'amber'}>{num(kpis.excepcionesAbiertas)}</Badge>}>
        <Table columns={[
          { key: 'regla', label: 'Regla', wrap: true, render: value => value?.nombre || 'Sin regla' }, { key: 'severidad', label: 'Severidad' }, { key: 'estado', label: 'Estado' }, { key: 'venceAt', label: 'Vence', render: value => date(value) },
        ]} rows={data?.excepciones || []} onRowClick={row => row.ordenId && navigate(`/ventas/${row.ordenId}`)} emptyMessage="Sin excepciones abiertas o sin permiso comercial" ariaLabel="Excepciones abiertas" getRowKey={row => row.id} />
      </Panel>
    </div>
    <GovernanceGaps items={data?.brechas} />
  </div>
}

function GovernanceGaps({ items = [] }) {
  if (!items.length) return null
  return <Panel title="Límites de interpretación" icon="alertTriangle"><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>{items.map(item => <div key={item.codigo} style={{ padding: 12, borderRadius: 8, border: '1px solid #f2d08a', background: '#fffaf0' }}><strong style={{ fontSize: 13 }}>{item.titulo}</strong><div style={{ marginTop: 5, color: 'var(--text-2)', fontSize: 12, lineHeight: 1.45 }}>{item.detalle}</div></div>)}</div></Panel>
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
    sucursalId: '',
  })
  const [clienteInput, setClienteInput] = useState('')
  const [active, setActive] = useState('resumen')
  const [preset, setPreset] = useState('ytd')

  const perms = {
    ventas: can(user, 'ventas'),
    caja: can(user, 'caja'),
    cobranza: can(user, 'cobranza'),
    stock: can(user, 'bodega'),
    licitaciones: can(user, 'licitaciones'),
    taller: can(user, 'taller'),
    despacho: can(user, 'despacho'),
    clientes: can(user, 'clientes'),
  }

  const periodParams = {
    desde: filters.desde || undefined,
    hasta: filters.hasta || undefined,
  }
  const summaryParams = {
    ...periodParams,
    tipo: filters.tipo || undefined,
    vendedor: filters.vendedor || undefined,
    cliente: filters.cliente || undefined,
    sucursalId: filters.sucursalId || undefined,
  }
  const canReadGerencial = perms.ventas || (perms.caja && perms.cobranza) || perms.stock || perms.licitaciones || (perms.taller && perms.despacho)
  const canReadFinanzas = perms.caja && perms.cobranza
  const filtrosGerencialesQuery = useReporteGerencialFiltros(canReadGerencial)
  const tiposVentaSistema = filtrosGerencialesQuery.data?.tiposVenta || []
  const vendedoresSistema = filtrosGerencialesQuery.data?.vendedores || []
  const sucursalesSistema = filtrosGerencialesQuery.data?.sucursales || []
  const tiposVentaDisponibles = useMemo(() => (
    filters.tipo && !tiposVentaSistema.includes(filters.tipo)
      ? [...tiposVentaSistema, filters.tipo]
      : tiposVentaSistema
  ), [filters.tipo, tiposVentaSistema])
  const resumenGerencialQuery = useReporteGerencialResumen(summaryParams, canReadGerencial)
  const comercialGerencialQuery = useReporteComercialGerencial(summaryParams, perms.ventas && active === 'ventas')
  const operacionGerencialV1Query = useReporteOperacionGerencial(periodParams, perms.taller && perms.despacho && active === 'operacion')
  const finanzasGerencialV1Query = useReporteFinanzasGerencial(periodParams, canReadFinanzas && active === 'finanzas')
  const riesgosGerencialV1Query = useReporteRiesgosGerencial(periodParams, (perms.stock || perms.licitaciones || perms.ventas) && active === 'riesgos')
  const seccionesGerenciales = resumenGerencialQuery.data?.secciones || {}
  // Las secciones comparten una sola respuesta y el mismo corte de datos. Se conserva
  // la forma de query para que las tarjetas sigan declarando carga/error por dominio.
  const ventasGerencialQuery = { ...resumenGerencialQuery, data: seccionesGerenciales.ventas }
  const cobranzaCajaGerencialQuery = { ...resumenGerencialQuery, data: seccionesGerenciales.cobranzaCaja }
  const stockGerencialQuery = { ...resumenGerencialQuery, data: seccionesGerenciales.stock }
  const licitacionesGerencialQuery = { ...resumenGerencialQuery, data: seccionesGerenciales.licitaciones }
  const operacionesGerencialQuery = { ...resumenGerencialQuery, data: seccionesGerenciales.operaciones }
  // La apertura del panel no debe pedir doce listados a la vez al VPS. Los cinco
  // agregados anteriores resuelven los KPI; el detalle se carga al abrir su pestaña.
  const ventasQuery = useReporteVentas({
    tipo: filters.tipo || undefined,
    desde: filters.desde || undefined,
    hasta: filters.hasta || undefined,
    creador: filters.vendedor || undefined,
    search: filters.cliente || undefined,
    scope: 'operacional',
  }, perms.ventas && active === 'ventas')
  const stockQuery = useReporteStockCritico(false)
  const licitacionesQuery = useReporteLicitaciones({
    fechaDesde: filters.desde || undefined,
    fechaHasta: filters.hasta || undefined,
    rutCliente: filters.cliente || undefined,
  }, perms.licitaciones && active === 'ventas')
  const odtsQuery = useReporteOdts({ fechaDesde: filters.desde || undefined, fechaHasta: filters.hasta || undefined }, false)
  const despachosQuery = useReporteDespachos({ desde: filters.desde || undefined, hasta: filters.hasta || undefined }, false)

  const ventasGerencialProblem = combinedProblem(perms.ventas, [ventasGerencialQuery])
  const cajaProblem = combinedProblem(canReadFinanzas, [cobranzaCajaGerencialQuery])
  const cobranzaProblem = combinedProblem(canReadFinanzas, [cobranzaCajaGerencialQuery])
  const stockProblem = combinedProblem(perms.stock, [stockGerencialQuery])
  const licitacionesProblem = combinedProblem(perms.licitaciones, [licitacionesGerencialQuery])
  const operacionProblem = combinedProblem(perms.taller && perms.despacho, [operacionesGerencialQuery])
  const ventasDetailProblem = combinedProblem(perms.ventas, [ventasQuery])
  const comercialProblem = combinedProblem(perms.ventas, [comercialGerencialQuery])
  const operacionV1Problem = combinedProblem(perms.taller && perms.despacho, [operacionGerencialV1Query])
  const finanzasV1Problem = combinedProblem(canReadFinanzas, [finanzasGerencialV1Query])
  const riesgosV1Problem = combinedProblem(perms.stock || perms.licitaciones || perms.ventas, [riesgosGerencialV1Query])
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

  const queries = [resumenGerencialQuery]
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
  const resumenMeta = resumenGerencialQuery.data?.meta

  const updateFilter = (key, value) => {
    if (key === 'desde' || key === 'hasta') setPreset('personalizado')
    setFilters(current => ({ ...current, [key]: value }))
  }
  const drillVentas = nextFilters => {
    if (Object.prototype.hasOwnProperty.call(nextFilters, 'cliente')) setClienteInput(nextFilters.cliente || '')
    setFilters(current => ({ ...current, ...nextFilters }))
    setActive('ventas')
  }
  const applyPreset = nextPreset => {
    const range = rangeForPreset(nextPreset)
    setPreset(nextPreset)
    setFilters(current => ({ ...current, ...range }))
  }
  const resetFilters = () => {
    setPreset('ytd')
    setClienteInput('')
    setFilters({ ...rangeForPreset('ytd'), tipo: '', vendedor: '', cliente: '', sucursalId: '' })
  }
  const exportGerencial = () => {
    const exports = {
      ventas: { path: '/reportes/export/comercial.xlsx', name: 'control_comercial' },
      operacion: { path: '/reportes/export/operacion.xlsx', name: 'control_operacional' },
      finanzas: { path: '/reportes/export/finanzas.xlsx', name: 'flujo_cobranza' },
      riesgos: { path: '/reportes/export/riesgos.xlsx', name: 'riesgos_operacionales' },
      resumen: { path: '/reportes/export/gerencial.xlsx', name: 'reporte_gerencial' },
    }
    const current = exports[active] || exports.resumen
    const appliedFilters = ['ventas', 'resumen'].includes(active) ? summaryParams : periodParams
    return downloadFromBackend(
      current.path,
      `${current.name}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      appliedFilters,
    )
  }

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
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>Agregados actualizados: {formatUpdatedAt(resumenGerencialQuery.dataUpdatedAt)}</span>
        </div>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          Desde
          <input type="date" value={filters.desde} onChange={e => updateFilter('desde', e.target.value)} style={selectInputStyle()} />
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          Hasta
          <input type="date" value={filters.hasta} onChange={e => updateFilter('hasta', e.target.value)} style={selectInputStyle()} />
        </label>
        {['ventas', 'resumen'].includes(active) && <>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          Tipo venta
          <select value={filters.tipo} onChange={e => updateFilter('tipo', e.target.value)} style={selectInputStyle()}>
            <option value="">Todos los tipos de venta</option>
            {filtrosGerencialesQuery.isLoading && <option disabled>Cargando tipos...</option>}
            {tiposVentaDisponibles.map(tipo => <option key={tipo} value={tipo}>{tipo}{tiposVentaSistema.includes(tipo) ? '' : ' (histórico)'}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          Vendedor
          <select value={filters.vendedor} onChange={e => updateFilter('vendedor', e.target.value)} disabled={!perms.ventas} style={{ ...selectInputStyle(), opacity: perms.ventas ? 1 : 0.6 }}>
            <option value="">Todos los vendedores</option>
            {filtrosGerencialesQuery.isLoading && <option disabled>Cargando vendedores...</option>}
            {vendedoresSistema.map(vendedor => <option key={vendedor.id} value={vendedor.nombre}>{vendedor.nombre}{vendedor.codigoVendedor ? ` · ${vendedor.codigoVendedor}` : ''}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          Sucursal
          <select value={filters.sucursalId} onChange={e => updateFilter('sucursalId', e.target.value)} disabled={!perms.ventas} style={{ ...selectInputStyle(), opacity: perms.ventas ? 1 : 0.6 }}>
            <option value="">Todas las sucursales</option>
            {filtrosGerencialesQuery.isLoading && <option disabled>Cargando sucursales...</option>}
            {sucursalesSistema.map(sucursal => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}{sucursal.comuna ? ` · ${sucursal.comuna}` : ''}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          Cliente / RUT
          <ClienteAutocomplete
            value={clienteInput}
            enabled={perms.clientes}
            onTextChange={value => {
              setClienteInput(value)
              updateFilter('cliente', value)
            }}
            onSelect={cliente => {
              const nombre = cliente.razonSocial || cliente.nombre || ''
              setClienteInput([cliente.rut, nombre].filter(Boolean).join(' · '))
              updateFilter('cliente', cliente.rut || nombre)
            }}
          />
        </label>
        </>}
      </section>

      {!['ventas', 'resumen'].includes(active) && <div style={{ margin: '-6px 0 14px', color: 'var(--text-3)', fontSize: 12 }}>
        En esta pestaña el filtro aplicable es solo el <strong>período</strong>. Los filtros comerciales se ocultan para no sugerir una segmentación que estas fuentes aún no comparten.
      </div>}

      {hasError && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 8, fontSize: 13 }}>Algunas fuentes no respondieron. Las secciones disponibles se muestran con los datos cargados.</div>}
      {isLoading && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--blue-bg)', color: 'var(--blue)', borderRadius: 8, fontSize: 13 }}>Actualizando reportes...</div>}
      {resumenMeta?.estado === 'operacional_no_certificado' && (
        <div role="status" style={{ marginBottom: 12, padding: '10px 14px', background: '#f0f9ff', color: '#075985', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 13 }}>
          <strong>Lectura operacional:</strong> {resumenMeta.mensajeEstado} Corte generado {formatUpdatedAt(resumenMeta.generadoEn)}.
        </div>
      )}
      {advertenciasVentas.map(aviso => (
        <div key={aviso.tipo} role="status" style={{ marginBottom: 12, padding: '10px 14px', background: '#fff8e1', color: '#8a5200', border: '1px solid #f2d08a', borderRadius: 8, fontSize: 13 }}>
          <strong>Lectura no certificada:</strong> {aviso.detalle}. Finanzas y Comercial deben definir si estas cotizaciones forman parte del indicador comercial.
        </div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 22 }}>
        {active === 'ventas' ? <>
          <KpiCard label="Ventas de órdenes" value={statusValue(comercialProblem, comercialGerencialQuery.data?.kpis?.ventas, money)} sublabel={statusSublabel(comercialProblem, `${num(comercialGerencialQuery.data?.kpis?.ordenes || 0)} órdenes`)} icon="shoppingCart" tone={statusTone(comercialProblem, 'blue')} />
          <KpiCard label="Unidades vendidas" value={statusValue(comercialProblem, comercialGerencialQuery.data?.kpis?.unidades)} sublabel={statusSublabel(comercialProblem, 'en el período filtrado')} icon="package" tone={statusTone(comercialProblem)} />
          <KpiCard label="Ticket promedio" value={statusValue(comercialProblem, comercialGerencialQuery.data?.kpis?.ticketPromedio, money)} sublabel={statusSublabel(comercialProblem, 'por orden')} icon="barChart2" tone={statusTone(comercialProblem)} />
          <KpiCard label="Margen estimado" value={comercialProblem ? statusValue(comercialProblem) : comercialGerencialQuery.data?.kpis?.margen?.visible ? Number(comercialGerencialQuery.data.kpis.margen.coberturaVentasPct || 0) > 0 ? money(comercialGerencialQuery.data.kpis.margen.monto) : 'Sin costo' : 'Restringido'} sublabel={comercialProblem ? statusSublabel(comercialProblem, '') : comercialGerencialQuery.data?.kpis?.margen?.visible ? Number(comercialGerencialQuery.data.kpis.margen.coberturaVentasPct || 0) > 0 ? `${percent(comercialGerencialQuery.data.kpis.margen.pct)} con costo trazable` : 'sin costo trazable' : 'requiere permiso de costos'} icon="trendingUp" tone={statusTone(comercialProblem, 'amber')} />
          <KpiCard label="Clientes recurrentes" value={statusValue(comercialProblem, comercialGerencialQuery.data?.kpis?.clientesRecurrentesPeriodo)} sublabel={statusSublabel(comercialProblem, `${percent(comercialGerencialQuery.data?.kpis?.tasaRecompraPeriodo)} en el período`)} icon="users" tone={statusTone(comercialProblem)} />
          <KpiCard label="Sin venta / stock" value={comercialProblem ? statusValue(comercialProblem) : comercialGerencialQuery.data?.kpis?.inventario?.visible ? Number(comercialGerencialQuery.data.kpis.inventario.coberturaValorizacionPct || 0) > 0 ? num(comercialGerencialQuery.data.kpis.inventario.sinVentaPeriodo) : 'Sin costo' : 'Restringido'} sublabel={comercialProblem ? statusSublabel(comercialProblem, '') : comercialGerencialQuery.data?.kpis?.inventario?.visible ? Number(comercialGerencialQuery.data.kpis.inventario.coberturaValorizacionPct || 0) > 0 ? 'ítems de mayor valor estimado' : 'sin valorización trazable' : 'requiere permiso de bodega'} icon="alertTriangle" tone={statusTone(comercialProblem, 'amber')} />
        </> : active === 'operacion' ? <>
          <KpiCard label="Backlog actual" value={statusValue(operacionV1Problem, operacionGerencialV1Query.data?.kpis?.backlog)} sublabel={statusSublabel(operacionV1Problem, 'OT no cerradas ahora')} icon="wrench" tone={statusTone(operacionV1Problem, 'amber')} />
          <KpiCard label="OT vencidas" value={statusValue(operacionV1Problem, operacionGerencialV1Query.data?.kpis?.vencidas)} sublabel={statusSublabel(operacionV1Problem, 'contra compromiso actual')} icon="alertTriangle" tone={statusTone(operacionV1Problem, 'red')} />
          <KpiCard label="Tasa de cierre" value={statusValue(operacionV1Problem, operacionGerencialV1Query.data?.kpis?.tasaCierre, percent)} sublabel={statusSublabel(operacionV1Problem, 'terminadas / OT ingresadas')} icon="trendingUp" tone={statusTone(operacionV1Problem)} />
          <KpiCard label="Ciclo promedio OT" value={operacionV1Problem ? statusValue(operacionV1Problem) : operacionGerencialV1Query.data?.kpis?.cicloPromedioHoras == null ? 'Sin dato' : `${Math.round(operacionGerencialV1Query.data.kpis.cicloPromedioHoras)} h`} sublabel={statusSublabel(operacionV1Problem, 'inicio o creación hasta término')} icon="clock" tone={statusTone(operacionV1Problem)} />
          <KpiCard label="Despachos ingresados" value={statusValue(operacionV1Problem, operacionGerencialV1Query.data?.kpis?.despachosIngresados)} sublabel={statusSublabel(operacionV1Problem, 'creados en el período')} icon="truck" tone={statusTone(operacionV1Problem)} />
          <KpiCard label="Entregas registradas" value={statusValue(operacionV1Problem, operacionGerencialV1Query.data?.kpis?.entregas)} sublabel={statusSublabel(operacionV1Problem, 'no confirma recepción')} icon="package" tone={statusTone(operacionV1Problem)} />
          <KpiCard label="Incidencias" value={statusValue(operacionV1Problem, operacionGerencialV1Query.data?.kpis?.despachosConIncidencia)} sublabel={statusSublabel(operacionV1Problem, `${num(operacionGerencialV1Query.data?.kpis?.despachosConMulta || 0)} multas`)} icon="alertTriangle" tone={statusTone(operacionV1Problem, 'red')} />
          <KpiCard label="Despachos pendientes" value={statusValue(operacionV1Problem, operacionGerencialV1Query.data?.kpis?.despachosPendientes)} sublabel={statusSublabel(operacionV1Problem, 'estado actual')} icon="truck" tone={statusTone(operacionV1Problem, 'amber')} />
        </> : active === 'finanzas' ? <>
          <KpiCard label="Ingresos de caja" value={statusValue(finanzasV1Problem, finanzasGerencialV1Query.data?.kpis?.ingresos, money)} sublabel={statusSublabel(finanzasV1Problem, 'movimientos del período')} icon="dollarSign" tone={statusTone(finanzasV1Problem)} />
          <KpiCard label="Egresos de caja" value={statusValue(finanzasV1Problem, finanzasGerencialV1Query.data?.kpis?.egresos, money)} sublabel={statusSublabel(finanzasV1Problem, 'movimientos del período')} icon="creditCard" tone={statusTone(finanzasV1Problem, 'amber')} />
          <KpiCard label="Flujo neto" value={statusValue(finanzasV1Problem, finanzasGerencialV1Query.data?.kpis?.flujoNeto, money)} sublabel={statusSublabel(finanzasV1Problem, 'no es saldo bancario')} icon="trendingUp" tone={statusTone(finanzasV1Problem)} />
          <KpiCard label="CxC pendiente registrada" value={statusValue(finanzasV1Problem, finanzasGerencialV1Query.data?.kpis?.carteraPendienteRegistrada, money)} sublabel={statusSublabel(finanzasV1Problem, `${num(finanzasGerencialV1Query.data?.kpis?.documentosPendientes || 0)} documentos`)} icon="alertTriangle" tone={statusTone(finanzasV1Problem, 'amber')} />
          <KpiCard label="Documentos emitidos" value={statusValue(finanzasV1Problem, finanzasGerencialV1Query.data?.kpis?.documentosEmitidos)} sublabel={statusSublabel(finanzasV1Problem, 'fecha factura del período')} icon="clipboard" tone={statusTone(finanzasV1Problem)} />
        </> : active === 'riesgos' ? <>
          <KpiCard label="Productos críticos" value={statusValue(riesgosV1Problem, riesgosGerencialV1Query.data?.kpis?.productosCriticos)} sublabel={statusSublabel(riesgosV1Problem, 'stock actual bajo umbral')} icon="package" tone={statusTone(riesgosV1Problem, 'red')} />
          <KpiCard label="Materiales críticos" value={statusValue(riesgosV1Problem, riesgosGerencialV1Query.data?.kpis?.materialesCriticos)} sublabel={statusSublabel(riesgosV1Problem, 'bodega de taller actual')} icon="warehouse" tone={statusTone(riesgosV1Problem, 'red')} />
          <KpiCard label="Lotes no aprobados" value={statusValue(riesgosV1Problem, riesgosGerencialV1Query.data?.kpis?.lotesBloqueados)} sublabel={statusSublabel(riesgosV1Problem, 'con disponibilidad')} icon="alertTriangle" tone={statusTone(riesgosV1Problem, 'red')} />
          <KpiCard label="Excepciones vencidas" value={statusValue(riesgosV1Problem, riesgosGerencialV1Query.data?.kpis?.excepcionesVencidas)} sublabel={statusSublabel(riesgosV1Problem, `${num(riesgosGerencialV1Query.data?.kpis?.excepcionesAbiertas || 0)} abiertas`)} icon="clock" tone={statusTone(riesgosV1Problem, 'amber')} />
          <KpiCard label="Licitaciones pendientes" value={statusValue(riesgosV1Problem, riesgosGerencialV1Query.data?.kpis?.licitacionesPendientes)} sublabel={statusSublabel(riesgosV1Problem, money(riesgosGerencialV1Query.data?.kpis?.montoLicitacionesPendientes || 0) + ' potencial')} icon="clipboard" tone={statusTone(riesgosV1Problem, 'amber')} />
          <KpiCard label="Umbrales sin configurar" value={statusValue(riesgosV1Problem, riesgosGerencialV1Query.data?.kpis?.umbralesSinConfigurar)} sublabel={statusSublabel(riesgosV1Problem, 'SKU sin stock crítico')} icon="settings" tone={statusTone(riesgosV1Problem, 'amber')} />
        </> : <>
        <KpiCard label="Actividad comercial" value={statusValue(ventasGerencialProblem, ventaTotal, money)} sublabel={statusSublabel(ventasGerencialProblem, `${num(ventaCount)} operaciones`)} icon="shoppingCart" tone={statusTone(ventasGerencialProblem, 'blue')} onClick={perms.ventas ? () => setActive('ventas') : undefined} />
        <KpiCard label="Ticket operativo" value={statusValue(ventasGerencialProblem, ventaTicket, money)} sublabel={statusSublabel(ventasGerencialProblem, 'sobre operaciones cargadas')} icon="barChart2" tone={statusTone(ventasGerencialProblem)} onClick={perms.ventas ? () => setActive('ventas') : undefined} />
        <KpiCard label="CxC pendiente" value={statusValue(cobranzaProblem, cobranzaPendiente, money)} sublabel={statusSublabel(cobranzaProblem, `${num(cobranzaCajaGerencialQuery.data?.cuentasPorCobrar?.count || 0)} docs`)} icon="creditCard" tone={statusTone(cobranzaProblem, 'amber')} onClick={canReadFinanzas ? () => navigate('/cobranza') : undefined} />
        <KpiCard label="Caja neta" value={statusValue(cajaProblem, ingresos - egresos, money)} sublabel={statusSublabel(cajaProblem, `${money(ingresos)} ing. / ${money(egresos)} egr.`)} icon="dollarSign" tone={statusTone(cajaProblem)} onClick={canReadFinanzas ? () => navigate('/caja') : undefined} />
        <KpiCard label="Stock critico" value={statusValue(stockProblem, stockCriticoTotal)} sublabel={statusSublabel(stockProblem, 'productos y materiales')} icon="alertTriangle" tone={statusTone(stockProblem, stockCriticoTotal ? 'red' : 'neutral')} onClick={perms.stock ? () => setActive('riesgos') : undefined} />
        <KpiCard label="Pendientes operacion" value={statusValue(operacionProblem, pendientesOperacionTotal)} sublabel={statusSublabel(operacionProblem, 'taller y despachos')} icon="clock" tone={statusTone(operacionProblem, 'amber')} onClick={perms.taller && perms.despacho ? () => setActive('operacion') : undefined} />
        </>}
      </div>

      <Tabs tabs={tabs} active={active} onChange={setActive} />

      {active === 'resumen' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <Panel title="Ordenes internas por tipo" icon="barChart2" action={<Badge tone="gray">sin web ni licitaciones</Badge>}>
            <QueryBlock problem={ventasGerencialProblem}>
              <GroupList rows={ventaPorTipo} format={money} onRowClick={row => drillVentas({ tipo: row.label })} />
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
        <QueryBlock problem={comercialProblem}>
          <CommercialDashboard data={comercialGerencialQuery.data} navigate={navigate} />
        </QueryBlock>
      )}

      {false && active === 'ventas' && (
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
              <GroupList rows={ventaPorVendedor} format={money} onRowClick={row => drillVentas({ vendedor: row.label })} />
            </QueryBlock>
          </Panel>
          <Panel title="Ordenes internas por cliente" icon="users" action={<Badge tone="gray">sin web ni licitaciones</Badge>}>
            <QueryBlock problem={ventasGerencialProblem}>
              <GroupList rows={ventaPorCliente} format={money} onRowClick={row => drillVentas({ cliente: row.label })} />
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
        <QueryBlock problem={operacionV1Problem}>
          <OperationalDashboard data={operacionGerencialV1Query.data} navigate={navigate} />
        </QueryBlock>
      )}

      {false && active === 'operacion' && (
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
        <QueryBlock problem={finanzasV1Problem}>
          <FinanceDashboard data={finanzasGerencialV1Query.data} navigate={navigate} />
        </QueryBlock>
      )}

      {false && active === 'finanzas' && (
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
        <QueryBlock problem={riesgosV1Problem}>
          <RisksDashboard data={riesgosGerencialV1Query.data} navigate={navigate} />
        </QueryBlock>
      )}

      {false && active === 'riesgos' && (
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
