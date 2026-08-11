import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast, confirmDialog } from '../../store/notif'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table } from '../../components/shared'
import { useCotizaciones, useReportesLicitaciones, useCrearVentaDesdeLicitacion } from '../../api/cotizaciones'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { plazoLabel } from '../../utils/licitacionFields'

const ESTADO_TONE = {
  'Pendiente':    'amber',
  'Adjudicada':   'green',
  'No Adjudicada': 'red',
  'Cerrada':      'neutral',
  'Rechazada':    'red',
  'En proceso':   'blue',
}
const ESTADOS = ['', 'Pendiente', 'En proceso', 'Adjudicada', 'No Adjudicada', 'Rechazada', 'Cerrada']

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

const detailHeadCell = { padding: '3px 4px', borderRight: '1px solid oklch(1 0 0 / 0.25)', lineHeight: 1.1 }
const detailCell = { padding: '4px', fontSize: 7, borderRight: '1px solid var(--border)', lineHeight: 1.15 }

function exportCsv(rows) {
  const headers = ['ID Licitación', 'RUT Cliente', 'Referencia', 'OC', 'Plazo', 'Estado', 'Fecha', 'Vendedor', 'Obs']
  const escape = v => {
    const s = (v ?? '').toString().replace(/"/g, '""')
    return /[",\n;]/.test(s) ? `"${s}"` : s
  }
  const lines = [headers.join(';')]
  for (const r of rows) {
    lines.push([
      r.idLicitacion, r.rutCliente, r.referencia, r.ordenCompra, plazoLabel(r),
      r.estado, r.fechaCreacion ? new Date(r.fechaCreacion).toLocaleDateString('es-CL') : '',
      r.usuario, r.obs,
    ].map(escape).join(';'))
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `licitaciones-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function LicitacionesPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canWriteVentas = can(user, 'ventas', 'write')
  const canReadVentas = can(user, 'ventas', 'read')
  const canWriteLicitaciones = can(user, 'licitaciones', 'write')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [estado, setEstado] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [page, setPage] = useState(1)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const params = { page: String(page) }
  if (debouncedSearch) params.search = debouncedSearch
  if (estado) params.estado = estado
  if (fechaDesde) params.fechaDesde = fechaDesde
  if (fechaHasta) params.fechaHasta = fechaHasta

  const { data: result = { items: [], total: 0, limit: 100 }, isLoading } = useCotizaciones(params)
  const crearVenta = useCrearVentaDesdeLicitacion()
  const reportesParams = {}
  if (fechaDesde) reportesParams.fechaDesde = fechaDesde
  if (fechaHasta) reportesParams.fechaHasta = fechaHasta
  if (!fechaDesde && !fechaHasta) reportesParams.todosEstados = 'true'
  const { data: reportes } = useReportesLicitaciones(reportesParams)

  const cotizaciones = result.items ?? []
  const total = result.total ?? 0
  const limit = result.limit ?? 100
  const pages = Math.max(1, Math.ceil(total / limit))

  const porEstado = reportes?.stats?.porEstado || {}
  const totalAdjudicado = reportes?.stats?.totalAdjudicado || 0
  const pendientesTot = (porEstado['Pendiente'] || 0) + (porEstado['En proceso'] || 0)
  const adjudicadasTot = porEstado['Adjudicada'] || 0

  const renderDetalle = row => {
    const list = row.detalleProductos || []
    if (!list.length) return <span style={{ color: 'var(--text-3)' }}>-</span>
    return (
      <div style={{ width: '100%', minWidth: 320, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '24px minmax(200px, 1fr) 60px', background: 'var(--text-2)', color: '#fff', fontSize: 7, fontWeight: 700 }}>
          <span style={detailHeadCell}>Cant.</span>
          <span style={detailHeadCell}>Producto</span>
          <span style={{ ...detailHeadCell, textAlign: 'right' }}>Total</span>
        </div>
        {list.map(item => (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '24px minmax(200px, 1fr) 60px', borderTop: '1px solid var(--border)' }}>
            <span style={detailCell}>{item.cantidad || 0}</span>
            <span style={{ ...detailCell, whiteSpace: 'normal', overflowWrap: 'anywhere', fontWeight: 600, lineHeight: 1.15 }}>{item.nombre || item.codigoInterno || 'Item'}</span>
            <span style={{ ...detailCell, textAlign: 'right', fontFamily: "'DM Mono', monospace" }}>{fmt(item.total)}</span>
          </div>
        ))}
      </div>
    )
  }

  const cols = [
    { key: 'idLicitacion', label: 'ID Licitación',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 12, color: 'var(--green-700)' }}>{v || '—'}</span> },
    { key: 'rutCliente', label: 'RUT Organismo',
      render: v => v
        ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v}</span>
        : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'referencia', label: 'Referencia', wrap: true,
      render: v => <span style={{ fontSize: 13, maxWidth: 240, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '—'}</span> },
    { key: 'ordenCompra', label: 'OC',
      render: v => v
        ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-2)' }}>{v}</span>
        : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'plazo', label: 'Plazo',
      render: (_, row) => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{plazoLabel(row)}</span> },
    { key: 'estado', label: 'Estado',
      render: v => <Badge tone={ESTADO_TONE[v] || 'gray'}>{v}</Badge> },
    { key: 'fechaCreacion', label: 'Fecha',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{v ? new Date(v).toLocaleDateString('es-CL') : '—'}</span> },
    { key: 'usuario', label: 'Vendedor',
      render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span> },
    { key: 'detalleProductos', label: 'Detalle', width: 320, wrap: true, render: (_, row) => renderDetalle(row) },
    { key: '_acc', label: '',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={e => { e.stopPropagation(); navigate('/licitaciones/' + row.id) }}
            style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}
          >Ver</button>
          {canWriteLicitaciones && canWriteVentas && row.estado === 'Adjudicada' && !row.ordenId && (
            <button
              onClick={async e => {
                e.stopPropagation()
                if (!(await confirmDialog({ title: 'Crear venta', detail: `¿Crear venta desde licitación ${row.idLicitacion || row.id}?` }))) return
                crearVenta.mutate(row.id, {
                  onSuccess: (data) => {
                    const ordenId = data?.orden?.id || data?.ordenId
                    if (ordenId) navigate(`/ventas/${ordenId}/editar`)
                  },
                  onError: e => toast.error(e.response?.data?.error || 'Error al crear venta'),
                })
              }}
              disabled={crearVenta.isPending}
              style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--green-700)', background: 'var(--green-700)', cursor: 'pointer', color: '#fff', fontWeight: 500 }}
              title="Crear orden de venta desde adjudicación"
            >Crear venta</button>
          )}
          {canReadVentas && row.ordenId && (
            <button
              onClick={e => { e.stopPropagation(); navigate(`/ventas/${row.ordenId}`) }}
              style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--blue, #2563eb)', fontWeight: 500 }}
              title="Ver venta vinculada"
            >Venta</button>
          )}
        </div>
      ) },
  ]

  const handleExport = () => {
    const source = reportes?.items?.length ? reportes.items : cotizaciones
    if (!source.length) { toast.warning('Nada para exportar'); return }
    exportCsv(source)
  }

  const toolbarExtra = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <SearchBar placeholder="Buscar ID licitación, OC, referencia…" value={search} onChange={setSearch} style={{ width: 280 }} />
      <select value={estado} onChange={e => { setEstado(e.target.value); setPage(1) }} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }}>
        {ESTADOS.map(s => <option key={s} value={s}>{s || 'Todos los estados'}</option>)}
      </select>
      <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPage(1) }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }} />
      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>a</span>
      <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPage(1) }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }} />
      {(estado || fechaDesde || fechaHasta) && (
        <button onClick={() => { setEstado(''); setFechaDesde(''); setFechaHasta('') }} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)' }}>Limpiar</button>
      )}
    </div>
  )

  return (
    <main className="page page-wide">
      <PageHeader
        title="Cotizaciones de Licitación"
        subtitle={`${total.toLocaleString('es-CL')} cotizaciones a organismos públicos`}
        breadcrumb={['Inicio', 'Ventas', 'Licitaciones']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm" onClick={handleExport}>Exportar</Btn>
          {canWriteLicitaciones && <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/licitaciones/nueva')}>Nueva Cotización</Btn>}
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total cotizaciones" value={total.toLocaleString('es-CL')} icon="clipboard" sublabel="Histórico" />
        <KpiCard label="Pendientes" value={pendientesTot} icon="clock" tone="amber" sublabel="En revisión / Proceso" />
        <KpiCard label="Adjudicadas" value={adjudicadasTot} icon="check" tone="blue" sublabel="Ganadas" />
        <KpiCard label="Total adjudicado" value={fmt(totalAdjudicado)} icon="dollarSign" tone="green" sublabel="Suma cantAdj × precio" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table
              columns={cols}
              rows={cotizaciones}
              onRowClick={row => navigate('/licitaciones/' + row.id)}
              emptyMessage="Sin cotizaciones registradas"
              ariaLabel="Licitaciones"
              getRowKey={row => row.id}
              toolbarExtra={toolbarExtra}
              pager={{ page, pages, total, limit, shown: cotizaciones.length, onChange: setPage, disabled: isLoading }}
            />
        }
      </div>
    </main>
  )
}
