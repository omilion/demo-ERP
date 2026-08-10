import { confirmDialog } from '../../store/notif'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeleteCotizacion, useReportesLicitaciones } from '../../api/cotizaciones'
import { Badge, Btn, KpiCard, PageHeader, Pager, Table } from '../../components/shared'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { downloadFromBackend } from '../../utils/csv'

const ESTADOS = ['', 'Pendiente', 'Adjudicada', 'No Adjudicada', 'En proceso', 'Rechazada', 'Cerrada']
const ESTADO_TONE = {
  Pendiente: 'amber',
  Adjudicada: 'green',
  'No Adjudicada': 'red',
  Rechazada: 'red',
  Cerrada: 'gray',
  'En proceso': 'blue',
}

const today = () => new Date().toISOString().slice(0, 10)
const fmt = n => '$' + Number(n || 0).toLocaleString('es-CL')
const fmtDate = (value, withTime = false) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('es-CL', withTime ? { hour: '2-digit', minute: '2-digit' } : undefined)
}

function actionButtonStyle(color = 'var(--green-700)') {
  return {
    padding: '4px 8px',
    fontSize: 11,
    borderRadius: 5,
    border: '1px solid var(--border)',
    background: '#fff',
    cursor: 'pointer',
    color,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  }
}

export default function ReportesLicitacionesPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canWrite = can(user, 'licitaciones', 'write')
  const canDelete = can(user, 'licitaciones', 'delete')
  const canReadVentas = can(user, 'ventas', 'read')
  const deleteMut = useDeleteCotizacion()

  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [rutCliente, setRutCliente] = useState('')
  const [idLicitacion, setIdLicitacion] = useState('')
  const [estado, setEstado] = useState('Pendiente')
  const [page, setPage] = useState(1)
  const [printAll, setPrintAll] = useState(false)
  const limit = 20

  const params = useMemo(() => ({
    ...(fechaDesde ? { fechaDesde } : {}),
    ...(fechaHasta ? { fechaHasta } : {}),
    ...(rutCliente ? { rutCliente } : {}),
    ...(idLicitacion ? { idLicitacion } : {}),
    ...(estado ? { estado } : { todosEstados: 'true' }),
    page,
    limit,
  }), [estado, fechaDesde, fechaHasta, idLicitacion, page, rutCliente])

  const exportParams = useMemo(() => {
    const rest = { ...params }
    delete rest.page
    delete rest.limit
    return rest
  }, [params])

  const { data = { items: [], total: 0, limit, stats: {} }, isLoading } = useReportesLicitaciones(params)
  const printParams = useMemo(() => ({ ...exportParams, limit: 'all' }), [exportParams])
  const { data: printData, isFetching: isFetchingPrint } = useReportesLicitaciones(printParams, printAll)
  const items = data.items || []
  const displayItems = printAll && printData?.items ? printData.items : items
  const stats = data.stats || {}
  const pages = Math.max(1, Math.ceil((data.total || 0) / (data.limit || limit)))
  const porEstado = stats.porEstado || {}

  useEffect(() => {
    if (!printAll || isFetchingPrint || !printData) return
    const timer = setTimeout(() => {
      window.print()
      setPrintAll(false)
    }, 0)
    return () => clearTimeout(timer)
  }, [isFetchingPrint, printAll, printData])

  const setFilter = setter => value => {
    setter(value)
    setPage(1)
  }

  const clearFilters = () => {
    setFechaDesde('')
    setFechaHasta('')
    setRutCliente('')
    setIdLicitacion('')
    setEstado('Pendiente')
    setPage(1)
  }

  const exportar = formato => {
    downloadFromBackend(
      '/cotizaciones/reportes/export',
      `licitaciones_${formato}_${today()}.csv`,
      { ...exportParams, formato },
    )
  }

  const eliminar = async row => {
    if (!await confirmDialog({ title: 'Confirmar', detail: `Confirmo eliminacion de la licitacion ${row.idLicitacion || row.id}` })) return
    deleteMut.mutate(row.id)
  }

  const columns = [
    {
      key: '_ops',
      label: 'Operaciones',
      wrap: true,
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxWidth: 300 }}>
          <button type="button" style={actionButtonStyle()} onClick={event => { event.stopPropagation(); navigate(`/licitaciones/${row.id}`) }}>Ver Cotizacion</button>
          <button type="button" style={actionButtonStyle('var(--green-600)')} onClick={event => { event.stopPropagation(); navigate(`/licitaciones/${row.id}/ficha`) }}>Ficha Tec. y Eco.</button>
          {canReadVentas && row.ordenId && (
            <button type="button" style={actionButtonStyle('var(--blue)')} onClick={event => { event.stopPropagation(); navigate(`/ventas/${row.ordenId}`) }}>Ver Venta</button>
          )}
          {canDelete && !row.ordenId && (
            <button type="button" style={actionButtonStyle('var(--red)')} onClick={event => { event.stopPropagation(); eliminar(row) }} disabled={deleteMut.isPending}>Eliminar</button>
          )}
        </div>
      ),
    },
    { key: 'idLicitacion', label: 'ID', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v || '-'}</span> },
    { key: 'ordenCompra', label: 'Orden Compra', render: v => <span style={{ fontFamily: "'DM Mono', monospace" }}>{v || '-'}</span> },
    { key: 'detalle', label: 'Detalle', wrap: true, render: v => <span style={{ display: 'block', minWidth: 240, maxWidth: 380, whiteSpace: 'normal', lineHeight: 1.35 }}>{v || '-'}</span> },
    { key: 'fechaCreacion', label: 'Fecha Creacion', render: v => <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmtDate(v, true)}</span> },
    { key: 'fecha', label: 'Fecha Licitacion', render: v => <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmtDate(v)}</span> },
    { key: 'plazo', label: 'Plazo' },
    { key: 'totalNeto', label: 'Total Neto', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmt(v)}</span> },
    { key: 'iva', label: 'IVA', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(v)}</span> },
    { key: 'totalConIva', label: 'Total C/IVA', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{fmt(v)}</span> },
    { key: 'usuario', label: 'Creada por', render: v => v || '-' },
    { key: 'estado', label: 'Estado', render: v => <Badge tone={ESTADO_TONE[v] || 'gray'}>{v || '-'}</Badge> },
    { key: 'rutCliente', label: 'Cliente', render: v => <span style={{ fontFamily: "'DM Mono', monospace" }}>{v || '-'}</span> },
    { key: 'clienteRazonSocial', label: 'Razon Social', wrap: true, render: v => v || '-' },
  ]

  return (
    <main className="page page-wide">
      <style>{`
        @media print {
          nav, .no-print, .topbar { display: none !important; }
          main { max-width: none !important; padding: 0 !important; }
          .table-wrap { overflow: visible !important; }
          table { font-size: 9px !important; }
        }
      `}</style>

      <PageHeader
        title="Reportes Licitaciones"
        subtitle={`${Number(data.total || 0).toLocaleString('es-CL')} registros encontrados`}
        breadcrumb={['Inicio', 'Reportes', 'Licitaciones']}
        actions={<div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Btn variant="secondary" icon="download" size="sm" onClick={() => exportar('resumen')}>Excel Resumen</Btn>
          <Btn variant="secondary" icon="download" size="sm" onClick={() => exportar('detalle')}>Excel Detalle</Btn>
          <Btn variant="secondary" icon="printer" size="sm" onClick={() => setPrintAll(true)} disabled={isFetchingPrint}>
            {isFetchingPrint ? 'Preparando...' : 'PDF/Imprimir'}
          </Btn>
          {canWrite && <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/licitaciones/nueva')}>Cotizar Nueva Licitacion</Btn>}
        </div>}
      />

      <div className="kpi-strip no-print">
        <KpiCard label="Registros" value={data.total || 0} icon="clipboard" sublabel={estado || 'Todos los estados'} />
        <KpiCard label="Pendientes" value={porEstado.Pendiente || 0} icon="clock" tone="amber" onClick={() => { setEstado('Pendiente'); setPage(1) }} />
        <KpiCard label="Adjudicadas" value={porEstado.Adjudicada || 0} icon="check" tone="blue" onClick={() => { setEstado('Adjudicada'); setPage(1) }} />
        <KpiCard label="No adjudicadas" value={porEstado['No Adjudicada'] || porEstado.Rechazada || 0} icon="x" tone="red" onClick={() => { setEstado('No Adjudicada'); setPage(1) }} />
        <KpiCard label="Total C/IVA" value={fmt(stats.totalConIva || 0)} icon="dollarSign" tone="green" />
      </div>

      <div className="no-print" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <label style={labelStyle}>Fecha de Inicio<input type="date" value={fechaDesde} onChange={e => setFilter(setFechaDesde)(e.target.value)} style={inputStyle} /></label>
          <label style={labelStyle}>Fecha de Termino<input type="date" value={fechaHasta} onChange={e => setFilter(setFechaHasta)(e.target.value)} style={inputStyle} /></label>
          <label style={labelStyle}>Rut Cliente<input value={rutCliente} onChange={e => setFilter(setRutCliente)(e.target.value)} placeholder="Sin puntos ni guion" style={inputStyle} /></label>
          <label style={labelStyle}>ID Licitacion<input value={idLicitacion} onChange={e => setFilter(setIdLicitacion)(e.target.value)} placeholder="ID licitacion" style={inputStyle} /></label>
          <label style={labelStyle}>Estado<select value={estado} onChange={e => setFilter(setEstado)(e.target.value)} style={inputStyle}>
            {ESTADOS.map(s => <option key={s} value={s}>{s || 'Todos'}</option>)}
          </select></label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn variant="secondary" icon="clock" size="sm" onClick={() => { setEstado('Pendiente'); setPage(1) }}>Pendientes</Btn>
            <Btn variant="ghost" icon="x" size="sm" onClick={clearFilters}>Limpiar</Btn>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 10, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
          : <Table columns={columns} rows={displayItems} onRowClick={row => navigate(`/licitaciones/${row.id}`)} emptyMessage="No hay resultados" ariaLabel="Reporte de licitaciones" getRowKey={row => row.id} />
        }
        <div className="no-print">
          <Pager page={page} pages={pages} total={data.total || 0} limit={data.limit || limit} shown={items.length} onChange={setPage} disabled={isLoading} />
        </div>
      </div>
    </main>
  )
}

const labelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  fontSize: 11,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  fontWeight: 600,
}

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: '#fff',
  color: 'var(--text-1)',
  fontSize: 13,
  minHeight: 36,
}
