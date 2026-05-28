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
  const [rut, setRut] = useState(searchParams.get('rut') || '')
  const [nombre, setNombre] = useState(searchParams.get('nombre') || '')
  const [oc, setOc] = useState(searchParams.get('oc') || '')
  const [idLicitacion, setIdLicitacion] = useState(searchParams.get('idLicitacion') || '')
  const [nInterno, setNInterno] = useState(searchParams.get('nInterno') || '')
  const [odt, setOdt] = useState(searchParams.get('odt') || '')
  const [guia, setGuia] = useState(searchParams.get('guia') || '')
  const [nc, setNc] = useState(searchParams.get('nc') || '')
  const [nd, setNd] = useState(searchParams.get('nd') || '')
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
  if (rut) params.rut = rut
  if (nombre) params.nombre = nombre
  if (oc) params.oc = oc
  if (idLicitacion) params.idLicitacion = idLicitacion
  if (nInterno) params.nInterno = nInterno
  if (odt) params.odt = odt
  if (guia) params.guia = guia
  if (nc) params.nc = nc
  if (nd) params.nd = nd
  if (estadoPago) params.estadoPago = estadoPago
  if (estadoEntrega) params.estadoEntrega = estadoEntrega

  const totalParams = { ...params }
  delete totalParams.page

  const { data = { items: [], total: 0, limit: 100, totalMonto: 0 }, isLoading } = useMatrizVentas(params)
  const { data: tot } = useMatrizTotales(totalParams)

  const total = data.total ?? 0
  const LIMIT = data.limit ?? 100
  const pages = Math.max(1, Math.ceil(total / LIMIT))
  const suffix = todayIso()

  function openVenta(row) {
    if (row.fuente === 'orden') navigate(ventaPath(row.id, user))
    else if (row.fuente === 'licitacion') navigate(`/licitaciones/${row.id}`)
    else if (row.fuente === 'oc-online') navigate('/ordenes-compra')
  }

  function eliminarFila(row) {
    if (row.fuente !== 'orden') { alert('Solo se pueden eliminar ordenes desde aqui'); return }
    if (!confirm(`Anular venta N ${row.nInterno ?? row.id}? Esta accion usa el flujo auditado.`)) return
    anularVenta.mutate(row.id, {
      onError: e => alert(e.response?.data?.error || 'Error al anular'),
    })
  }

  function limpiarFiltros() {
    setQuick('')
    setSearch('')
    setDesde('')
    setHasta('')
    setRut('')
    setNombre('')
    setOc('')
    setIdLicitacion('')
    setNInterno('')
    setOdt('')
    setGuia('')
    setNc('')
    setNd('')
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

  const cols = [
    { key: 'fecha', label: 'Fecha',
      render: v => <span style={{ ...mono, fontSize: 11 }}>{v ? new Date(v).toLocaleDateString('es-CL') : '-'}</span> },
    { key: 'nInterno', label: 'N Int',
      render: v => <span style={{ ...mono, fontWeight: 600 }}>{v || '-'}</span> },
    { key: 'tipo', label: 'Tipo',
      render: v => <Badge tone={v?.includes('Licit') ? 'blue' : v === 'Venta Web' ? 'amber' : v === 'Convenio Marco' ? 'neutral' : 'gray'}>{v || '-'}</Badge> },
    { key: 'ref', label: 'OC / ID',
      render: (_, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 150 }}>
          <span style={{ fontSize: 12, whiteSpace: 'normal' }}>{row.ref || '-'}</span>
          {row.cotizacion?.idLicitacion && <span style={{ ...mono, fontSize: 10, color: 'var(--text-3)' }}>LIC {row.cotizacion.idLicitacion}</span>}
        </div>
      ) },
    { key: 'cliente', label: 'Cliente', wrap: true,
      render: (_, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 140, maxWidth: 220 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{row.nombreCliente || '-'}</span>
          <span style={{ ...mono, fontSize: 10, color: 'var(--text-3)' }}>{row.cliente || ''}</span>
        </div>
      ) },
    { key: 'detalleProductos', label: 'Detalle', wrap: true,
      render: (_, row) => {
        const list = row.detalleProductos || []
        if (!list.length) return <span style={{ color: 'var(--text-3)' }}>-</span>
        const shown = list.slice(0, 2)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 190, maxWidth: 260 }}>
            {shown.map(item => (
              <span key={item.id} style={{ fontSize: 11, lineHeight: 1.25 }}>
                <strong>{item.cantidad}x</strong> {item.nombre || item.codigoInterno || 'Item'} <span style={{ color: 'var(--text-3)' }}>{fmt(item.total)}</span>
              </span>
            ))}
            {list.length > shown.length && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>+{list.length - shown.length} mas</span>}
          </div>
        )
      } },
    { key: 'total', label: 'Total', align: 'right',
      render: v => <span style={{ ...mono, fontWeight: 600, color: 'var(--green-700)' }}>{fmt(v)}</span> },
    { key: 'abono', label: 'Abono', align: 'right',
      render: v => <span style={{ ...mono, fontSize: 11 }}>{v ? fmt(v) : '-'}</span> },
    { key: 'facturado', label: 'Fact.', align: 'right',
      render: v => <span style={{ ...mono, fontSize: 11 }}>{v ? fmt(v) : '-'}</span> },
    { key: 'ncTotal', label: 'NC', align: 'right',
      render: v => <span style={{ ...mono, fontSize: 11 }}>{v ? fmt(v) : '-'}</span> },
    { key: 'ndTotal', label: 'ND', align: 'right',
      render: v => <span style={{ ...mono, fontSize: 11 }}>{v ? fmt(v) : '-'}</span> },
    { key: 'saldo', label: 'Saldo', align: 'right',
      render: v => <span style={{ ...mono, fontSize: 11, color: v > 0 ? 'var(--red)' : 'var(--text-3)' }}>{v != null ? fmt(v) : '-'}</span> },
    { key: 'pago', label: 'Pago',
      render: v => v ? <Badge tone={v === 'Pagada' ? 'green' : v === 'Parcial' ? 'amber' : 'red'}>{v}</Badge> : '-' },
    { key: 'estadoEntrega', label: 'Entrega',
      render: v => v ? <Badge tone={toneEntrega(v)}>{v}</Badge> : '-' },
    { key: 'odtCount', label: 'ODT', align: 'center',
      render: (_, row) => {
        const list = row.odts || []
        if (!list.length) return '-'
        return <span title={list.map(o => `#${o.id} ${o.estado || ''}`).join('\n')} style={{ ...mono, fontSize: 11, fontWeight: 600 }}>{list.length}x #{list[0]?.id}</span>
      } },
    { key: 'guiasCount', label: 'Guias', align: 'center',
      render: (_, row) => {
        const list = row.guias || []
        if (!list.length) return row.guiasLegacy ? <span style={{ fontSize: 11 }}>#{row.guiasLegacy}</span> : '-'
        const tip = list.map(g => `${g.nGuia} (${new Date(g.fechaGuia).toLocaleDateString('es-CL')})`).join('\n')
        return <span title={tip} style={{ ...mono, fontSize: 11, fontWeight: 600 }}>{list.length}x {list[0]?.nGuia}</span>
      } },
    { key: 'documentosCount', label: 'Docs', align: 'center',
      render: (_, row) => {
        const list = row.documentos || []
        if (!list.length) return '-'
        const tipos = [...new Set(list.map(d => d.tipoDocumento || d.documento).filter(Boolean))].join(', ')
        const tip = list.map(d => `${d.tipoDocumento || d.documento || '?'} ${d.nDoc || ''} ${d.estadoPagoDoc || ''}`).join('\n')
        return <span title={tip} style={{ fontSize: 11, fontWeight: 600 }}>{list.length} <span style={{ color: 'var(--text-3)', fontSize: 10 }}>{tipos}</span></span>
      } },
    { key: '_acc', label: 'Acciones', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button onClick={e => { e.stopPropagation(); openVenta(row) }} style={btnSm('var(--green-700)')} title="Ver detalle">Ver</button>
        {row.fuente === 'orden' && row.cotizacion && (
          <button onClick={e => { e.stopPropagation(); navigate(`/licitaciones/${row.cotizacion.id}`) }} style={btnSm('var(--blue)')} title={`Licitacion ${row.cotizacion.idLicitacion}`}>Lic</button>
        )}
        {row.fuente === 'licitacion' && row.ordenVinculadaId && (
          <button onClick={e => { e.stopPropagation(); navigate(ventaPath(row.ordenVinculadaId, user)) }} style={btnSm('var(--green-700)')} title="Ver venta vinculada">Venta</button>
        )}
        {row.fuente === 'orden' && row.odtCount > 0 && (
          <button onClick={e => { e.stopPropagation(); navigate(`/odt?ordenId=${row.id}`) }} style={btnSm('var(--amber)')} title={`${row.odtCount} ODT`}>ODT {row.odtCount}</button>
        )}
        {row.fuente === 'orden' && row.guiasCount > 0 && (
          <button onClick={e => { e.stopPropagation(); navigate(`/despachos?ordenId=${row.id}`) }} style={btnSm('var(--blue)')} title={`${row.guiasCount} guia(s)`}>Guias</button>
        )}
        {row.fuente === 'orden' && row.nInterno && (
          <button onClick={e => { e.stopPropagation(); navigate(`/caja?nInterno=${row.nInterno}`) }} style={btnSm('var(--text-2)')} title="Pagos / facturacion">Pagos</button>
        )}
        {canDeleteVentas && row.fuente === 'orden' && (
          <button onClick={e => { e.stopPropagation(); eliminarFila(row) }} style={btnSm('var(--red)')} title="Anular">Anular</button>
        )}
      </div>
    )},
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Matriz de Ventas"
        subtitle={`${data.defaultVentasHoy ? 'Ventas hoy - ' : ''}${total.toLocaleString('es-CL')} registros (${fmt(data.totalMonto || 0)})`}
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
        <KpiCard label="Ventas sala/marco" value={tot?.ordenes?.count || 0} sublabel={fmt(tot?.ordenes?.total || 0)} icon="package" />
        <KpiCard label="Ventas web" value={tot?.ocOnline?.count || 0} sublabel={fmt(tot?.ocOnline?.total || 0)} icon="cloud" />
        <KpiCard label="Licitaciones" value={tot?.licitaciones?.count || 0} sublabel={fmt(tot?.licitaciones?.total || 0)} icon="briefcase" />
        <KpiCard label="Total periodo" value={fmt(tot?.gran || 0)} icon="dollarSign" tone="green" sublabel="Suma filtrada" />
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

        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 8 }}>
          <FormField label="Desde"><Input type="date" value={desde} onChange={setFilter(setDesde)} /></FormField>
          <FormField label="Hasta"><Input type="date" value={hasta} onChange={setFilter(setHasta)} /></FormField>
          <FormField label="RUT cliente"><Input value={rut} onChange={setFilter(setRut)} placeholder="11.111.111-1" /></FormField>
          <FormField label="Nombre cliente"><Input value={nombre} onChange={setFilter(setNombre)} /></FormField>
          <FormField label="N interno"><Input value={nInterno} onChange={setFilter(setNInterno)} type="number" /></FormField>
          <FormField label="ID licitacion"><Input value={idLicitacion} onChange={setFilter(setIdLicitacion)} /></FormField>
          <FormField label="OC"><Input value={oc} onChange={setFilter(setOc)} /></FormField>
          <FormField label="ODT"><Input value={odt} onChange={setFilter(setOdt)} type="number" /></FormField>
          <FormField label="N guia"><Input value={guia} onChange={setFilter(setGuia)} /></FormField>
          <FormField label="NC"><Input value={nc} onChange={setFilter(setNc)} /></FormField>
          <FormField label="ND"><Input value={nd} onChange={setFilter(setNd)} /></FormField>
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
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1) }} />
          <SearchBar placeholder="Buscar libre" value={search} onChange={setFilter(setSearch)} style={{ width: 280 }} />
        </div>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={pagerBtn(page <= 1)}>Anterior</button>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={pagerBtn(page >= pages)}>Siguiente</button>
        </div>
        {isLoading
          ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
          : <Table columns={cols} rows={data.items} emptyMessage="Sin ventas" onRowClick={openVenta} ariaLabel="Matriz de ventas" getRowKey={row => row.id} />
        }
      </div>
    </main>
  )
}

const btnSm = color => ({ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color, fontWeight: 500 })
const pagerBtn = disabled => ({ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 })
const quickBtn = active => ({ padding: '7px 12px', fontSize: 12, borderRadius: 6, border: `1px solid ${active ? 'var(--green-600)' : 'var(--border)'}`, background: active ? 'var(--green-50)' : '#fff', cursor: 'pointer', color: active ? 'var(--green-800)' : 'var(--text-2)', fontWeight: active ? 700 : 500 })
const selectStyle = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }
