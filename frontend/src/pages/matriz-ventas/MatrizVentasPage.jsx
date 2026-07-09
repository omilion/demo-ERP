import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { FormField, Input } from '../../components/forms'
import { useMatrizVentas, useMatrizTotales } from '../../api/matrizVentas'
import { useAnularVenta } from '../../api/ventas'
import { useAuthStore } from '../../store/auth'
import { downloadFromBackend } from '../../utils/csv'
import { can, ventaPath } from '../../utils/permissions'

const TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'venta-sala', label: 'Venta sala' },
  { id: 'venta-web', label: 'Venta web' },
  { id: 'convenio-marco', label: 'Convenio marco' },
  { id: 'licitacion', label: 'Licitaciones' },
]

const QUICK_FILTERS = [
  { id: 'ventasHoy', label: 'Ventas hoy' },
  { id: 'noPagada', label: 'No pagadas' },
  { id: 'pendienteEntrega', label: 'Pendiente entrega' },
  { id: 'entregada', label: 'Entregadas no pagadas' },
]

const ESTADO_PAGO_OPTS = ['', 'No pagada', 'Pagada', 'Parcial']
const ESTADO_ENTREGA_OPTS = ['', 'Pendiente entrega', 'En despacho', 'Entregada', 'Parcial']
const EXPORTS = [
  { formato: 'resumen', label: 'Resumen' },
  { formato: 'detalle-productos', label: 'Detalle productos' },
  { formato: 'guias', label: 'Guias' },
  { formato: 'ndnc', label: 'NC/ND' },
]

const todayIso = () => new Date().toISOString().slice(0, 10)
const fmt = n => '$' + (n || 0).toLocaleString('es-CL')
const mono = { fontFamily: "'DM Mono', monospace" }

function getInitialQuick(searchParams) {
  if (searchParams.get('no_pagada') || searchParams.get('noPagada')) return 'noPagada'
  if (searchParams.get('pendiente_entrega') || searchParams.get('pendienteEntrega')) return 'pendienteEntrega'
  if (searchParams.get('entregada')) return 'entregada'
  if (searchParams.get('ventasHoy')) return 'ventasHoy'
  return ''
}

export default function MatrizVentasPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const user = useAuthStore(s => s.user)
  const canDeleteVentas = can(user, 'ventas', 'delete')
  const anularVenta = useAnularVenta()

  const [tab, setTab] = useState(searchParams.get('tipo') || 'all')
  const [quick, setQuick] = useState(getInitialQuick(searchParams))
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [desde, setDesde] = useState(searchParams.get('desde') || '')
  const [hasta, setHasta] = useState(searchParams.get('hasta') || '')
  const [estadoPago, setEstadoPago] = useState(searchParams.get('estadoPago') || '')
  const [estadoEntrega, setEstadoEntrega] = useState(searchParams.get('estadoEntrega') || '')
  const [scope, setScope] = useState(searchParams.get('scope') || 'operacional')
  const [page, setPage] = useState(1)

  const setFilter = setter => value => {
    setter(value)
    setPage(1)
  }

  const params = { page: String(page), scope }
  if (tab !== 'all') params.tipo = tab
  if (quick) params[quick] = '1'
  if (search) params.search = search
  if (desde) params.desde = desde
  if (hasta) params.hasta = hasta
  if (estadoPago) params.estadoPago = estadoPago
  if (estadoEntrega) params.estadoEntrega = estadoEntrega

  // Forward legacy URL params if present (for backward compatibility / deep links)
  for (const key of ['rut', 'nombre', 'oc', 'idLicitacion', 'nInterno', 'odt', 'guia', 'nc', 'nd']) {
    const val = searchParams.get(key)
    if (val) params[key] = val
  }

  const totalParams = { ...params }
  delete totalParams.page

  const { data = { items: [], total: 0, limit: 100, totalMonto: 0 }, isLoading } = useMatrizVentas(params)
  const { data: tot } = useMatrizTotales(totalParams)

  const total = data.total ?? 0
  const LIMIT = data.limit ?? 100
  const pages = Math.max(1, Math.ceil(total / LIMIT))
  const suffix = todayIso()
  const hasUserFilters = Boolean(
    tab !== 'all' || quick || search || desde || hasta ||
    estadoPago || estadoEntrega || scope !== 'operacional'
  )
  const paginationControls = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', width: '100%' }}>
      <Tabs 
        tabs={TABS} 
        active={tab} 
        onChange={t => { setTab(t); setPage(1) }} 
        style={{ marginBottom: 0, borderBottom: 'none', gap: 1 }} 
      />
      <SearchBar
        placeholder="Buscar por cliente, ODT, guía, OC..."
        value={search}
        onChange={setFilter(setSearch)}
        style={{ width: 220 }}
      />
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={pagerBtn(page <= 1)}>Anterior</button>
        <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: "'DM Mono', monospace", minWidth: 46, textAlign: 'center' }}>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={pagerBtn(page >= pages)}>Siguiente</button>
        <button
          disabled={!hasUserFilters || isLoading}
          onClick={() => exportar('resumen')}
          style={exportFilteredBtn(!hasUserFilters || isLoading)}
          title={hasUserFilters ? 'Exporta todos los resultados filtrados, no solo esta pagina' : 'Aplica un filtro para activar este export'}
        >
          Exportar
        </button>
      </div>
    </div>
  )

  function openVenta(row) {
    if (row.fuente === 'orden') navigate(ventaPath(row.id, user))
    else if (row.fuente === 'licitacion') navigate(`/licitaciones/${row.id}`)
    else if (row.fuente === 'oc-online') navigate('/ordenes-compra')
  }

  async function eliminarFila(row) {
    if (row.fuente !== 'orden') { toast.warning('Solo se pueden eliminar ordenes desde aqui'); return }
    if (!await confirmDialog({ title: 'Confirmar', detail: `Anular venta N ${row.nInterno ?? row.id}? Esta accion usa el flujo auditado.`, tone: 'danger' })) return
    anularVenta.mutate(row.id, {
      onError: e => toast.error(e.response?.data?.error || 'Error al anular'),
    })
  }

  function limpiarFiltros() {
    setQuick('')
    setSearch('')
    setDesde('')
    setHasta('')
    setEstadoPago('')
    setEstadoEntrega('')
    setScope('operacional')
    setPage(1)
  }

  function aplicarQuick(value) {
    setQuick(q => q === value ? '' : value)
    setPage(1)
  }

  function exportar(formato) {
    const exportParams = { ...params, page: undefined, formato }
    downloadFromBackend('/matriz-ventas/export', `matriz_ventas_${formato}_${suffix}.csv`, exportParams)
  }

  const toneEntrega = v => v === 'Entregada' ? 'green' : v === 'Parcial' ? 'amber' : v === 'En despacho' ? 'blue' : 'gray'
  const formatDate = value => value ? new Date(value).toLocaleDateString('es-CL') : '-'
  const formatDateTime = value => value
    ? new Date(value).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-'
  const getIdLicitacion = row => row.cotizacion?.idLicitacion || (row.fuente === 'licitacion' ? row.ref : '')
  const ocValue = row => row.fuente === 'licitacion' ? '' : row.ref

  const renderOperations = row => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 112 }}>
      {row.fuente === 'orden' ? (
        <>
          <button onClick={e => { e.stopPropagation(); openVenta(row) }} style={operationBtn('#2563eb')} title="Ver venta">
            Ver Venta sala
          </button>
          <button onClick={e => { e.stopPropagation(); navigate(`/odt?ordenId=${row.id}`) }} style={operationBtn('#0ea5e9')} title="Informe taller">
            Inf. Taller
          </button>
          {row.nInterno && (
            <button onClick={e => { e.stopPropagation(); navigate(`/caja?nInterno=${row.nInterno}`) }} style={operationBtn('#16a34a')} title="Ver pagos">
              Ver pagos
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); navigate(`/ventas/${row.id}/imprimir`) }} style={operationBtn('#ef4444')} title="Nota de venta">
            Nota Venta
          </button>
          {canDeleteVentas && (
            <button onClick={e => { e.stopPropagation(); eliminarFila(row) }} style={operationBtn('#dc2626')} title="Eliminar venta">
              Eliminar Venta
            </button>
          )}
        </>
      ) : (
        <button onClick={e => { e.stopPropagation(); openVenta(row) }} style={operationBtn('#2563eb')} title="Ver detalle">
          Ver detalle
        </button>
      )}
    </div>
  )

  const renderDetalle = row => {
    const list = row.detalleProductos || []
    if (!list.length) return <span style={{ color: 'var(--text-3)' }}>-</span>
    return (
      <div style={{ width: '100%', minWidth: 360, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '24px minmax(230px, 1fr) 52px 38px', background: 'var(--text-2)', color: '#fff', fontSize: 7, fontWeight: 700 }}>
          <span style={detailHeadCell}>Cant.</span>
          <span style={detailHeadCell}>Producto</span>
          <span style={{ ...detailHeadCell, textAlign: 'right' }}>Total</span>
          <span style={{ ...detailHeadCell, textAlign: 'center' }}>Entreg.</span>
        </div>
        {list.map(item => (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '24px minmax(230px, 1fr) 52px 38px', borderTop: '1px solid var(--border)', background: Number(item.nEntregados || 0) >= Number(item.cantidad || 0) ? 'var(--green-50)' : '#fff' }}>
            <span style={detailCell}>{item.cantidad || 0}</span>
            <span style={{ ...detailCell, whiteSpace: 'normal', overflowWrap: 'anywhere', fontWeight: 600, lineHeight: 1.15 }}>{item.nombre || item.codigoInterno || 'Item'}</span>
            <span style={{ ...detailCell, textAlign: 'right', ...mono }}>{fmt(item.total)}</span>
            <span style={{ ...detailCell, textAlign: 'center', ...mono }}>{item.nEntregados ?? '-'}</span>
          </div>
        ))}
      </div>
    )
  }

  const renderLinkedList = (items, getLabel) => {
    if (!items?.length) return <span style={{ color: 'var(--text-3)' }}>-</span>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 92 }}>
        {items.map(item => <span key={item.id || getLabel(item)} style={{ fontSize: 11 }}>{getLabel(item)}</span>)}
      </div>
    )
  }

  const renderDocumentos = row => {
    const docs = row.documentos || []
    if (!docs.length) return row.documentosLegacy || '-'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 130 }}>
        {docs.map(doc => (
          <div key={doc.id} style={{ fontSize: 11, lineHeight: 1.25 }}>
            <div>{doc.documento || doc.tipoDocumento || 'Documento'} {doc.nDoc || doc.numeroNCInterna || ''}</div>
            <Badge tone={doc.estadoPagoDoc === 'Pagada' ? 'green' : 'gray'}>{doc.estadoPagoDoc || doc.estadoDoc || 'Activa'}</Badge>
          </div>
        ))}
      </div>
    )
  }

  const cols = [
    { key: '_acc', label: 'Operaciones', render: (_, row) => renderOperations(row) },
    { key: 'nInterno', label: 'Nro. Interno', render: v => <span style={{ ...mono, fontWeight: 700 }}>{v || '-'}</span> },
    {
      key: 'nombreCliente',
      label: 'Nombre',
      wrap: true,
      render: (v, row) => (
        <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {v || '-'}
          {row.clienteConflictivo && (
            <span
              style={{
                background: '#fee2e2',
                color: '#b91c1c',
                padding: '1px 6px',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
                cursor: 'help',
                border: '1px solid #fca5a5'
              }}
              title={row.clienteConflictivoDetalle || 'Cliente marcado como conflictivo'}
            >
              ⚠ Conflictivo
            </span>
          )}
        </span>
      )
    },
    { key: 'ref', label: 'OC', wrap: true, render: (_, row) => <span style={{ fontSize: 12, whiteSpace: 'normal' }}>{ocValue(row) || '-'}</span> },
    { key: 'total', label: 'Total', align: 'right',
      render: v => <span style={{ ...mono, fontWeight: 600, color: 'var(--green-700)' }}>{fmt(v)}</span> },
    { key: 'abono', label: 'Abono', align: 'right',
      render: v => <span style={{ ...mono, fontSize: 11 }}>{v ? fmt(v) : '-'}</span> },
    { key: 'facturado', label: 'Total Facturado', align: 'right',
      render: v => <span style={{ ...mono, fontSize: 11 }}>{v ? fmt(v) : '-'}</span> },
    { key: 'saldo', label: 'Saldo', align: 'right',
      render: v => <span style={{ ...mono, fontSize: 11, color: v > 0 ? 'var(--red)' : 'var(--text-3)' }}>{v != null ? fmt(v) : '-'}</span> },
    { key: 'estado', label: 'Estado', render: v => v ? <Badge tone={v === 'Activa' ? 'green' : 'gray'}>{v}</Badge> : '-' },
    { key: 'pago', label: 'Estado Pago',
      render: v => v ? <Badge tone={v === 'Pagada' ? 'green' : v === 'Parcial' ? 'amber' : 'red'}>{v}</Badge> : '-' },
    { key: 'estadoEntrega', label: 'Estado Entrega',
      render: (_, row) => row.estadoEntrega ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Badge tone={toneEntrega(row.estadoEntrega)}>{row.estadoEntrega}</Badge>
          {row.fechaEstadoEntrega && <span style={{ ...mono, fontSize: 10, color: 'var(--text-3)' }}>{formatDate(row.fechaEstadoEntrega)}</span>}
        </div>
      ) : '-' },
    { key: 'regionDespacho', label: 'Región Desp.', render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'ciudadDespacho', label: 'Ciudad Desp.', render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'detalleProductos', label: 'Detalle', width: 430, wrap: true, render: (_, row) => renderDetalle(row) },
    { key: 'fecha', label: 'Fecha Creacion', render: v => <span style={{ ...mono, fontSize: 11 }}>{formatDateTime(v)}</span> },
    { key: 'creadorNombre', label: 'Creada por', render: v => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
    { key: 'odtCount', label: 'ODTs', render: (_, row) => renderLinkedList(row.odts, odt => `#${odt.id} ${odt.estado || ''}`) },
    { key: 'guiasCount', label: 'Guias Desp.', render: (_, row) => row.guias?.length ? renderLinkedList(row.guias, guia => `#${guia.nGuia || guia.id}`) : (row.guiasLegacy ? <span style={{ ...mono, fontSize: 11 }}>#{row.guiasLegacy}</span> : '-') },
    { key: 'documentosCount', label: 'Documentos', wrap: true, render: (_, row) => renderDocumentos(row) },
    { key: 'cliente', label: 'Cliente', render: v => <span style={{ ...mono, fontSize: 11 }}>{v || '-'}</span> },
    { key: 'cotizacion', label: 'ID Licitacion', render: (_, row) => <span style={{ ...mono, fontSize: 11 }}>{getIdLicitacion(row) || '-'}</span> },
    { key: 'tipo', label: 'Tipo Venta', defaultHidden: true, render: v => <Badge tone={v?.includes('Licit') ? 'blue' : v === 'Venta Web' ? 'amber' : v === 'Convenio Marco' ? 'neutral' : 'gray'}>{v || '-'}</Badge> },
    { key: 'ncTotal', label: 'NC', defaultHidden: true, align: 'right', render: v => <span style={{ ...mono, fontSize: 11 }}>{v ? fmt(v) : '-'}</span> },
    { key: 'ndTotal', label: 'ND', defaultHidden: true, align: 'right', render: v => <span style={{ ...mono, fontSize: 11 }}>{v ? fmt(v) : '-'}</span> },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Matriz de Ventas"
        subtitle={`${data.defaultVentasHoy ? 'Ventas hoy - ' : ''}${total.toLocaleString('es-CL')} registros (${fmt(tot?.gran || 0)})`}
        breadcrumb={['Inicio', 'Ventas', 'Matriz']}
        actions={(
          <>
            {EXPORTS.map(exp => (
              <Btn key={exp.formato} variant="secondary" icon="download" size="sm" onClick={() => exportar(exp.formato)}>
                {exp.label}
              </Btn>
            ))}
          </>
        )}
      />
      <div className="kpi-strip">
        <KpiCard
          label="Ventas sala/marco (Hoy)"
          value={fmt(tot?.kpis?.hoy?.ordenes?.total || 0)}
          sublabel={`Mes: ${fmt(tot?.kpis?.mes?.ordenes?.total || 0)} (${tot?.kpis?.mes?.ordenes?.count || 0} vts)`}
          icon="package"
        />
        <KpiCard
          label="Ventas web (Hoy)"
          value={fmt(tot?.kpis?.hoy?.ocOnline?.total || 0)}
          sublabel={`Mes: ${fmt(tot?.kpis?.mes?.ocOnline?.total || 0)} (${tot?.kpis?.mes?.ocOnline?.count || 0} vts)`}
          icon="cloud"
        />
        <KpiCard
          label="Licitaciones (Hoy)"
          value={fmt(tot?.kpis?.hoy?.licitaciones?.total || 0)}
          sublabel={`Mes: ${fmt(tot?.kpis?.mes?.licitaciones?.total || 0)} (${tot?.kpis?.mes?.licitaciones?.count || 0} vts)`}
          icon="briefcase"
        />
        <KpiCard
          label="YTD (Acumulado año)"
          value={fmt(tot?.kpis?.ytd?.total || 0)}
          sublabel={`vs Año anterior: ${fmt(tot?.kpis?.prevYtd?.total || 0)}`}
          icon="dollarSign"
          tone="green"
          trend={tot?.kpis?.variacionYtd}
          trendTone="green-good"
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {QUICK_FILTERS.map(item => (
            <button key={item.id} onClick={() => aplicarQuick(item.id)} style={quickBtn(quick === item.id)}>
              {item.label}
            </button>
          ))}
          <button onClick={limpiarFiltros} style={quickBtn(false)}>Limpiar</button>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 8 }}>
            <FormField label="Desde"><Input type="date" value={desde} onChange={setFilter(setDesde)} /></FormField>
            <FormField label="Hasta"><Input type="date" value={hasta} onChange={setFilter(setHasta)} /></FormField>
            <FormField label="Estado pago">
              <select value={estadoPago} onChange={e => setFilter(setEstadoPago)(e.target.value)} style={selectStyle}>
                {ESTADO_PAGO_OPTS.map(v => <option key={v} value={v}>{v || 'Todos'}</option>)}
              </select>
            </FormField>
            <FormField label="Estado entrega">
              <select value={estadoEntrega} onChange={e => setFilter(setEstadoEntrega)(e.target.value)} style={selectStyle}>
                {ESTADO_ENTREGA_OPTS.map(v => <option key={v} value={v}>{v || 'Todos'}</option>)}
              </select>
            </FormField>
            <FormField label="Alcance">
              <select value={scope} onChange={e => setFilter(setScope)(e.target.value)} style={selectStyle}>
                <option value="operacional">Operacional</option>
                <option value="historico">Historico</option>
                <option value="todos">Todos</option>
              </select>
            </FormField>
          </div>
        </div>

        {isLoading
          ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
          : <Table columns={cols} rows={data.items} emptyMessage="Sin ventas" onRowDoubleClick={openVenta} ariaLabel="Matriz de ventas" getRowKey={row => row.id} toolbarExtra={paginationControls} />
        }
      </div>
    </main>
  )
}

const operationBtn = background => ({
  width: '100%',
  padding: '5px 8px',
  fontSize: 11,
  borderRadius: 5,
  border: 'none',
  background,
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 700,
  textAlign: 'left',
})
const detailHeadCell = { padding: '3px 4px', borderRight: '1px solid oklch(1 0 0 / 0.25)', lineHeight: 1.1 }
const detailCell = { padding: '4px', fontSize: 7, borderRight: '1px solid var(--border)', lineHeight: 1.15 }
const pagerBtn = disabled => ({ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 })
const exportFilteredBtn = disabled => ({
  padding: '5px 10px',
  fontSize: 12,
  borderRadius: 5,
  border: `1px solid ${disabled ? 'var(--border)' : 'var(--green-600)'}`,
  background: disabled ? 'oklch(0.96 0.002 220)' : 'var(--green-600)',
  color: disabled ? 'var(--text-3)' : '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: 700,
})
const quickBtn = active => ({ padding: '7px 12px', fontSize: 12, borderRadius: 6, border: `1px solid ${active ? 'var(--green-600)' : 'var(--border)'}`, background: active ? 'var(--green-50)' : '#fff', cursor: 'pointer', color: active ? 'var(--green-800)' : 'var(--text-2)', fontWeight: active ? 700 : 500 })
const selectStyle = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }
