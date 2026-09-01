import { toast, confirmDialog } from '../../store/notif'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { useMatrizVentas, useMatrizTotales } from '../../api/matrizVentas'
import { useAnularVenta } from '../../api/ventas'
import { useAuthStore } from '../../store/auth'
import { downloadFromBackend } from '../../utils/csv'
import { can, ventaPath } from '../../utils/permissions'
import BotonExportar from '../../components/BotonExportar'

const TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'venta-sala', label: 'Venta sala' },
  { id: 'normal', label: 'Venta simple' },
  { id: 'venta-web', label: 'Venta web' },
  { id: 'convenio-marco', label: 'Convenio marco' },
  { id: 'trato-directo', label: 'Trato directo' },
  { id: 'licitacion', label: 'Licitaciones' },
  { id: 'compra-agil', label: 'Compra ágil' },
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

const getAyerIso = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const getEstaSemanaRange = () => {
  const now = new Date()
  const day = now.getDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMonday = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - diffToMonday)

  const fmtDate = d => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dayStr = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dayStr}`
  }

  return {
    desde: fmtDate(monday),
    hasta: fmtDate(now)
  }
}

function getInitialQuick(searchParams) {
  if (searchParams.get('no_pagada') || searchParams.get('noPagada')) return 'noPagada'
  if (searchParams.get('pendiente_entrega') || searchParams.get('pendienteEntrega')) return 'pendienteEntrega'
  if (searchParams.get('entregada')) return 'entregada'
  if (searchParams.get('ventasHoy')) return 'ventasHoy'
  if (searchParams.get('desde') || searchParams.get('hasta') || searchParams.get('all')) return ''
  return 'ventasHoy'
}

export default function MatrizVentasPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const user = useAuthStore(s => s.user)
  const canDeleteVentas = can(user, 'ventas', 'delete')
  const canWriteDespacho = can(user, 'despacho', 'write')
  const anularVenta = useAnularVenta()

  const [tab, setTab] = useState(searchParams.get('tipo') || 'all')
  const [quick, setQuick] = useState(getInitialQuick(searchParams))
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [desde, setDesde] = useState(searchParams.get('desde') || '')
  const [hasta, setHasta] = useState(searchParams.get('hasta') || '')
  const [estadoPago, setEstadoPago] = useState(searchParams.get('estadoPago') || '')
  const [estadoEntrega, setEstadoEntrega] = useState(searchParams.get('estadoEntrega') || '')
  const [page, setPage] = useState(1)

  const setFilter = setter => value => {
    setter(value)
    if (quick === 'ventasHoy') setQuick('')
    setPage(1)
  }

  const params = { page: String(page) }
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
    estadoPago || estadoEntrega
  )

  const selectedTabObj = TABS.find(t => t.id === tab)
  const totalMontoSum = data.totalMonto ?? data.items?.reduce((s, row) => s + Number(row.total || 0), 0) ?? 0

  const ayerIso = getAyerIso()
  const estaSemanaRange = getEstaSemanaRange()
  const isAyerActive = Boolean(desde && desde === ayerIso && hasta === ayerIso)
  const isEstaSemanaActive = Boolean(desde && desde === estaSemanaRange.desde && hasta === estaSemanaRange.hasta)

  function aplicarAyer() {
    if (isAyerActive) {
      setDesde('')
      setHasta('')
    } else {
      setTab('all')
      setQuick('')
      setDesde(ayerIso)
      setHasta(ayerIso)
    }
    setPage(1)
  }

  function aplicarEstaSemana() {
    if (isEstaSemanaActive) {
      setDesde('')
      setHasta('')
    } else {
      setTab('all')
      setQuick('')
      setDesde(estaSemanaRange.desde)
      setHasta(estaSemanaRange.hasta)
    }
    setPage(1)
  }

  let badgeTitle = 'Venta Total Hoy'
  if (isAyerActive) {
    badgeTitle = 'Ventas Cierre Ayer'
  } else if (isEstaSemanaActive) {
    badgeTitle = 'Ventas Esta Semana'
  } else if (desde || hasta) {
    badgeTitle = 'Venta para el período'
  } else if (tab !== 'all') {
    const channelName = selectedTabObj ? selectedTabObj.label : 'Canal'
    badgeTitle = quick === 'ventasHoy' ? `Ventas ${channelName} Hoy` : `Total ${channelName}`
  } else if (quick === 'noPagada') {
    badgeTitle = 'Total Ventas No Pagadas'
  } else if (quick === 'pendienteEntrega') {
    badgeTitle = 'Total Ventas Pendiente Entrega'
  } else if (quick === 'entregada') {
    badgeTitle = 'Total Entregadas No Pagadas'
  }

  const countWord = total === 1 ? 'venta' : 'ventas'
  const ventasCountText = `${total.toLocaleString('es-CL')} ${countWord}`
  const totalAmountText = fmt(totalMontoSum)

  let customEmptyMessage = 'Sin ventas para los filtros aplicados'
  if (quick === 'ventasHoy' || (!desde && !hasta && !search && !estadoPago && !estadoEntrega && (quick === '' || quick === 'ventasHoy'))) {
    if (tab !== 'all') {
      const channelName = selectedTabObj ? selectedTabObj.label : tab
      customEmptyMessage = `No hay ventas del día para ${channelName}`
    } else {
      customEmptyMessage = `No hay ventas del día`
    }
  } else if (desde || hasta) {
    customEmptyMessage = `No hay ventas para el período seleccionado`
  } else if (search) {
    customEmptyMessage = `No se encontraron ventas para "${search}"`
  } else if (quick) {
    customEmptyMessage = `No hay ventas registradas para este filtro`
  }

  const paginationControls = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', width: '100%' }}>
      <Tabs 
        tabs={TABS} 
        active={tab} 
        onChange={t => { setTab(t); setPage(1) }} 
        style={{ marginBottom: 0, borderBottom: 'none', gap: 1 }} 
      />
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 10px',
        height: 26,
        borderRadius: 6,
        background: 'var(--green-50)',
        border: '1px solid var(--green-200)',
        fontSize: 12,
        fontWeight: 600,
        boxSizing: 'border-box'
      }}>
        <span style={{ color: 'var(--green-800)', fontWeight: 700 }}>{badgeTitle}:</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
          {ventasCountText}
        </span>
        <span style={{ color: 'var(--green-400)', fontWeight: 700 }}>•</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 800, color: 'var(--green-700)' }}>
          {totalAmountText}
        </span>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={pagerBtn(page <= 1)}>Anterior</button>
        <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: "'DM Mono', monospace", minWidth: 46, textAlign: 'center' }}>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={pagerBtn(page >= pages)}>Siguiente</button>
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
    setTab('all')
    setPage(1)
  }

  function aplicarQuick(value) {
    setQuick(q => q === value ? '' : value)
    setPage(1)
  }

  function aplicarCanal(targetTab, targetQuick = 'ventasHoy') {
    if (tab === targetTab && quick === targetQuick) {
      setTab('all')
      setQuick('')
    } else {
      setTab(targetTab)
      setQuick(targetQuick)
    }
    setPage(1)
  }

  function aplicarYtd() {
    const startOfYear = `${new Date().getFullYear()}-01-01`
    const isYtdActive = desde === startOfYear && hasta === todayIso()
    if (isYtdActive) {
      setDesde('')
      setHasta('')
    } else {
      setTab('all')
      setQuick('')
      setDesde(startOfYear)
      setHasta(todayIso())
    }
    setPage(1)
  }

  // `formato` elige QUE se exporta (resumen, guias, notas); `archivo`, el tipo.
  function exportar(formato, archivo = 'csv') {
    const exportParams = { ...params, page: undefined, formato, archivo }
    downloadFromBackend('/matriz-ventas/export', `matriz_ventas_${formato}_${suffix}.${archivo}`, exportParams)
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
          {canWriteDespacho && ['EN_TALLER', 'PICKING_PARCIAL', 'LISTA_PICKING', 'PICKING', 'PACKING'].includes(row.estadoLogistico?.codigo) && (
            <button onClick={e => { e.stopPropagation(); navigate(`/despachos/ordenes/${row.id}/packing`) }} style={operationBtn('#7c3aed')} title="Registrar picking/packing">
              Packing
            </button>
          )}
          {canWriteDespacho && row.estadoLogistico?.codigo === 'LISTA_DESPACHO' && (
            <>
              <button onClick={e => { e.stopPropagation(); navigate(`/despachos/nuevo?ordenId=${row.id}`) }} style={operationBtn('#059669')} title="Programar salida">
                Programar Salida
              </button>
              <button onClick={e => { e.stopPropagation(); navigate(`/despachos/guias/nueva?ordenId=${row.id}`) }} style={operationBtn('#d97706')} title="Preparar guía DTE 52">
                Preparar Guía
              </button>
            </>
          )}
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
    { key: 'estadoLogistico', label: 'Operación', render: value => value ? <Badge tone={value.tone || 'gray'}>{value.label}</Badge> : '-' },
    { key: 'regionDespacho', label: 'Región Desp.', render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'detalleProductos', label: 'Detalle', width: 430, wrap: true, render: (_, row) => renderDetalle(row) },
    { key: 'fecha', label: 'Fecha Creacion', render: v => <span style={{ ...mono, fontSize: 11 }}>{formatDateTime(v)}</span> },
    { key: 'creadorNombre', label: 'Creada por', render: v => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
    { key: 'odtCount', label: 'OT', render: (_, row) => renderLinkedList(row.odts, odt => `#${odt.id} ${odt.estado || ''}`) },
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
            <BotonExportar
              label="Exportar vista actual"
              variant="primary"
              onExportar={archivo => exportar('resumen', archivo)}
            />
            {EXPORTS.map(exp => (
              <BotonExportar
                key={exp.formato}
                label={exp.label}
                onExportar={archivo => exportar(exp.formato, archivo)}
              />
            ))}
          </>
        )}
      />
      <div className="kpi-strip-inline">
        {/* 1: Entregadas no pagadas */}
        <KpiCard
          label="Entregadas no pagadas"
          value={Number(tot?.kpis?.operacional?.entregadaNoPagada || 0).toLocaleString('es-CL')}
          sublabel="Entregadas con cobro pendiente"
          icon="alertTriangle"
          tone={tot?.kpis?.operacional?.entregadaNoPagada ? 'red' : 'green'}
          active={quick === 'entregada'}
          onClick={() => aplicarQuick('entregada')}
        />
        {/* 2: No pagadas */}
        <KpiCard
          label="No pagadas"
          value={Number(tot?.kpis?.operacional?.noPagada || 0).toLocaleString('es-CL')}
          sublabel="Total ventas activas por cobrar"
          icon="creditCard"
          tone={tot?.kpis?.operacional?.noPagada ? 'amber' : 'green'}
          active={quick === 'noPagada'}
          onClick={() => aplicarQuick('noPagada')}
        />
        {/* 3: Pendiente entrega */}
        <KpiCard
          label="Pendiente entrega"
          value={Number(tot?.kpis?.operacional?.pendienteEntrega || 0).toLocaleString('es-CL')}
          sublabel="Ventas activas sin entregar"
          icon="send"
          tone={tot?.kpis?.operacional?.pendienteEntrega ? 'amber' : 'green'}
          active={quick === 'pendienteEntrega'}
          onClick={() => aplicarQuick('pendienteEntrega')}
        />
        {/* 4: Ventas web (Hoy) */}
        <KpiCard
          label="Ventas web (Hoy)"
          value={fmt(tot?.kpis?.hoy?.ocOnline?.total || 0)}
          sublabel={`Mes: ${fmt(tot?.kpis?.mes?.ocOnline?.total || 0)} (${tot?.kpis?.mes?.ocOnline?.count || 0} vts)`}
          icon="cloud"
          tone="blue"
          active={tab === 'venta-web' && quick === 'ventasHoy'}
          onClick={() => aplicarCanal('venta-web', 'ventasHoy')}
        />
        {/* 5: Ventas sala/marco (Hoy) */}
        <KpiCard
          label="Ventas sala/marco (Hoy)"
          value={fmt(tot?.kpis?.hoy?.ordenes?.total || 0)}
          sublabel={`Mes: ${fmt(tot?.kpis?.mes?.ordenes?.total || 0)} (${tot?.kpis?.mes?.ordenes?.count || 0} vts)`}
          icon="package"
          tone="neutral"
          active={tab === 'venta-sala' && quick === 'ventasHoy'}
          onClick={() => aplicarCanal('venta-sala', 'ventasHoy')}
        />
        {/* 6: Licitaciones (Hoy) */}
        <KpiCard
          label="Licitaciones (Hoy)"
          value={fmt(tot?.kpis?.hoy?.licitaciones?.total || 0)}
          sublabel={`Mes: ${fmt(tot?.kpis?.mes?.licitaciones?.total || 0)} (${tot?.kpis?.mes?.licitaciones?.count || 0} vts)`}
          icon="briefcase"
          tone="purple"
          active={tab === 'licitacion' && quick === 'ventasHoy'}
          onClick={() => aplicarCanal('licitacion', 'ventasHoy')}
        />
        {/* 7: YTD (Acumulado año) */}
        <KpiCard
          label="YTD (Acumulado año)"
          value={fmt(tot?.kpis?.ytd?.total || 0)}
          sublabel={`vs Año anterior: ${fmt(tot?.kpis?.prevYtd?.total || 0)}`}
          icon="dollarSign"
          tone="green"
          trend={tot?.kpis?.variacionYtd}
          trendTone="green-good"
          active={Boolean(desde && desde === `${new Date().getFullYear()}-01-01` && hasta === todayIso())}
          onClick={aplicarYtd}
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Desde:</span>
            <input type="date" value={desde} onChange={e => setFilter(setDesde)(e.target.value)} style={compactInputStyle} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Hasta:</span>
            <input type="date" value={hasta} onChange={e => setFilter(setHasta)(e.target.value)} style={compactInputStyle} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button
              onClick={aplicarAyer}
              style={quickDateBtnStyle(isAyerActive)}
              title="Filtrar ventas del día anterior (Ayer)"
            >
              Ayer
            </button>
            <button
              onClick={aplicarEstaSemana}
              style={quickDateBtnStyle(isEstaSemanaActive)}
              title="Filtrar ventas de esta semana (Lunes a Hoy)"
            >
              Esta semana
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Pago:</span>
            <select value={estadoPago} onChange={e => setFilter(setEstadoPago)(e.target.value)} style={compactSelectStyle}>
              {ESTADO_PAGO_OPTS.map(v => <option key={v} value={v}>{v || 'Todos'}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Entrega:</span>
            <select value={estadoEntrega} onChange={e => setFilter(setEstadoEntrega)(e.target.value)} style={compactSelectStyle}>
              {ESTADO_ENTREGA_OPTS.map(v => <option key={v} value={v}>{v || 'Todos'}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <SearchBar
              placeholder="Buscar cliente, OT, guía, OC..."
              value={search}
              onChange={setFilter(setSearch)}
              style={{ width: 280, height: 28 }}
            />
            {hasUserFilters && (
              <button onClick={limpiarFiltros} style={compactClearBtn} title="Limpiar todos los filtros activos">
                ✕ Limpiar
              </button>
            )}
          </div>
        </div>

        {isLoading
          ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
          : <Table columns={cols} rows={data.items} emptyMessage={customEmptyMessage} onRowDoubleClick={openVenta} ariaLabel="Matriz de ventas" getRowKey={row => row.id} toolbarExtra={paginationControls} />
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
const compactInputStyle = { height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', color: 'var(--text-1)', boxSizing: 'border-box' }
const compactSelectStyle = { height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', color: 'var(--text-1)', boxSizing: 'border-box' }
const compactClearBtn = { height: 28, padding: '0 10px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', color: '#991b1b', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }
const quickDateBtnStyle = active => ({
  height: 28,
  padding: '0 10px',
  fontSize: 11,
  fontWeight: active ? 700 : 600,
  borderRadius: 6,
  border: active ? '1px solid var(--green-700)' : '1px solid var(--border)',
  background: active ? 'var(--green-700)' : '#fff',
  color: active ? '#fff' : 'var(--text-2)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  transition: 'all 0.15s ease',
  display: 'inline-flex',
  alignItems: 'center',
})
