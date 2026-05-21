import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { FormField, Input } from '../../components/forms'
import { useMatrizVentas, useMatrizTotales } from '../../api/matrizVentas'
import { useDeleteVenta } from '../../api/ventas'
import { useAuthStore } from '../../store/auth'
import { downloadFromBackend } from '../../utils/csv'
import { ventaPath } from '../../utils/permissions'

const TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'venta-sala', label: 'Venta sala' },
  { id: 'venta-web', label: 'Venta web' },
  { id: 'convenio-marco', label: 'Convenio marco' },
  { id: 'licitacion', label: 'Licitaciones' },
]

const ESTADO_PAGO_OPTS = ['', 'No pagada', 'Pagada', 'Parcial']
const ESTADO_ENTREGA_OPTS = ['', 'Pendiente entrega', 'En despacho', 'Entregada', 'Parcial']

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

export default function MatrizVentasPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialRut = searchParams.get('rut') || ''
  const initialNInterno = searchParams.get('nInterno') || ''
  const initialOc = searchParams.get('oc') || ''
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'admin'
  const deleteVenta = useDeleteVenta()

  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [rut, setRut] = useState(initialRut)
  const [oc, setOc] = useState(initialOc)
  const [nInterno, setNInterno] = useState(initialNInterno)
  const [odt, setOdt] = useState('')
  const [guia, setGuia] = useState('')
  const [estadoPago, setEstadoPago] = useState('')
  const [estadoEntrega, setEstadoEntrega] = useState('')
  const [scope, setScope] = useState('operacional')
  const [page, setPage] = useState(1)

  const params = { page: String(page), scope }
  if (tab !== 'all') params.tipo = tab
  if (search) params.search = search
  if (desde) params.desde = desde
  if (hasta) params.hasta = hasta
  if (rut) params.rut = rut
  if (oc) params.oc = oc
  if (nInterno) params.nInterno = nInterno
  if (odt) params.odt = odt
  if (guia) params.guia = guia
  if (estadoPago) params.estadoPago = estadoPago
  if (estadoEntrega) params.estadoEntrega = estadoEntrega

  const { data = { items: [], total: 0, limit: 100, totalMonto: 0 }, isLoading } = useMatrizVentas(params)
  const { data: tot } = useMatrizTotales({ desde, hasta })

  const total = data.total ?? 0
  const LIMIT = data.limit ?? 100
  const pages = Math.max(1, Math.ceil(total / LIMIT))

  function openVenta(row) {
    if (row.fuente === 'orden') navigate(ventaPath(row.id, user))
    else if (row.fuente === 'licitacion') navigate(`/licitaciones/${row.id}`)
    else if (row.fuente === 'oc-online') navigate(`/ordenes-compra`)
  }

  function eliminarFila(row) {
    if (row.fuente !== 'orden') { alert('Solo se pueden eliminar órdenes desde aquí'); return }
    if (!confirm(`¿Eliminar venta N° ${row.nInterno ?? row.id}? Esta acción es irreversible.`)) return
    deleteVenta.mutate(row.id, {
      onError: e => alert(e.response?.data?.error || 'Error al eliminar'),
    })
  }

  const toneEntrega = v => v === 'Entregada' ? 'green' : v === 'Parcial' ? 'amber' : v === 'En despacho' ? 'blue' : 'gray'

  const cols = [
    { key: 'fecha', label: 'Fecha',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v ? new Date(v).toLocaleDateString('es-CL') : '—'}</span> },
    { key: 'nInterno', label: 'N° Int',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v || '—'}</span> },
    { key: 'tipo', label: 'Tipo',
      render: v => <Badge tone={v?.includes('Licit') ? 'blue' : v === 'Venta Web' ? 'amber' : v === 'Convenio Marco' ? 'neutral' : 'gray'}>{v}</Badge> },
    { key: 'ref', label: 'OC / Ref',
      render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'cliente', label: 'Cliente',
      render: (_, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{row.nombreCliente || '—'}</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-3)' }}>{row.cliente || ''}</span>
        </div>
      ) },
    { key: 'creadorNombre', label: 'Vendedor',
      render: v => <span style={{ fontSize: 11 }}>{v || '—'}</span> },
    { key: 'total', label: 'Total', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--green-700)' }}>{fmt(v)}</span> },
    { key: 'abono', label: 'Abono', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v ? fmt(v) : '—'}</span> },
    { key: 'facturado', label: 'Facturado', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v ? fmt(v) : '—'}</span> },
    { key: 'saldo', label: 'Saldo', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: v > 0 ? 'var(--red)' : 'var(--text-3)' }}>{v != null ? fmt(v) : '—'}</span> },
    { key: 'pago', label: 'Pago',
      render: v => v
        ? <Badge tone={v === 'Pagada' ? 'green' : v === 'Parcial' ? 'amber' : 'red'}>{v}</Badge>
        : '—' },
    { key: 'estadoEntrega', label: 'Entrega',
      render: v => v ? <Badge tone={toneEntrega(v)}>{v}</Badge> : '—' },
    { key: 'guiasCount', label: 'Guías', align: 'center',
      render: (v, row) => {
        const list = row.guias || []
        if (!list.length) return row.guiasLegacy ? <span style={{ fontSize: 11 }}>#{row.guiasLegacy}</span> : '—'
        const tip = list.map(g => `${g.nGuia} (${new Date(g.fechaGuia).toLocaleDateString('es-CL')})`).join('\n')
        return <span title={tip} style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600 }}>{list.length}× {list[0]?.nGuia}</span>
      } },
    { key: 'documentosCount', label: 'Docs', align: 'center',
      render: (v, row) => {
        const list = row.documentos || []
        if (!list.length) return '—'
        const tipos = [...new Set(list.map(d => d.tipoDocumento).filter(Boolean))].join(', ')
        const tip = list.map(d => `${d.tipoDocumento || '?'} ${d.nDoc || ''} ${d.estadoPagoDoc || ''}`).join('\n')
        return <span title={tip} style={{ fontSize: 11, fontWeight: 600 }}>{list.length} <span style={{ color: 'var(--text-3)', fontSize: 10 }}>{tipos}</span></span>
      } },
    { key: '_acc', label: 'Acciones', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button onClick={e => { e.stopPropagation(); openVenta(row) }} style={btnSm('var(--green-700)')} title="Ver detalle">Ver</button>
        {row.fuente === 'orden' && row.cotizacion && (
          <button onClick={e => { e.stopPropagation(); navigate(`/licitaciones/${row.cotizacion.id}`) }} style={btnSm('var(--blue)')} title={`Licitación ${row.cotizacion.idLicitacion}`}>Lic</button>
        )}
        {row.fuente === 'licitacion' && row.ordenVinculadaId && (
          <button onClick={e => { e.stopPropagation(); navigate(ventaPath(row.ordenVinculadaId, user)) }} style={btnSm('var(--green-700)')} title="Ver venta vinculada">Venta</button>
        )}
        {row.fuente === 'orden' && row.odtCount > 0 && (
          <button onClick={e => { e.stopPropagation(); navigate(`/odt?ordenId=${row.id}`) }} style={btnSm('var(--amber)')} title={`${row.odtCount} ODT — ${row.odts.map(o => `#${o.id} ${o.estado || ''}`).join(', ')}`}>ODT {row.odtCount}</button>
        )}
        {row.fuente === 'orden' && row.guiasCount > 0 && (
          <button onClick={e => { e.stopPropagation(); navigate(`/despachos?ordenId=${row.id}`) }} style={btnSm('var(--blue)')} title={`${row.guiasCount} guía(s)`}>Guías</button>
        )}
        {row.fuente === 'orden' && row.nInterno && (
          <button onClick={e => { e.stopPropagation(); navigate(`/caja?nInterno=${row.nInterno}`) }} style={btnSm('var(--text-2)')} title="Pagos / facturación">Pagos</button>
        )}
        {isAdmin && row.fuente === 'orden' && (
          <button onClick={e => { e.stopPropagation(); eliminarFila(row) }} style={btnSm('var(--red)')} title="Eliminar">×</button>
        )}
      </div>
    )},
  ]

  function limpiarFiltros() {
    setSearch(''); setDesde(''); setHasta(''); setRut(''); setOc('')
    setNInterno(''); setOdt(''); setGuia(''); setEstadoPago(''); setEstadoEntrega(''); setScope('operacional')
    setPage(1)
  }

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Matriz de Ventas"
        subtitle={`${total.toLocaleString('es-CL')} ventas (${fmt(data.totalMonto || 0)})`}
        breadcrumb={['Inicio', 'Ventas', 'Matriz']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm"
            onClick={() => downloadFromBackend('/reportes/export/ventas', `ventas_${new Date().toISOString().slice(0,10)}.csv`, params)}
          >Exportar CSV</Btn>
        </>}
      />
      <div className="kpi-strip">
        <KpiCard label="Ventas sala/marco" value={tot?.ordenes?.count || 0} sublabel={fmt(tot?.ordenes?.total || 0)} icon="package" />
        <KpiCard label="Ventas web" value={tot?.ocOnline?.count || 0} sublabel={fmt(tot?.ocOnline?.total || 0)} icon="cloud" />
        <KpiCard label="Licitaciones" value={tot?.licitaciones?.count || 0} sublabel={fmt(tot?.licitaciones?.total || 0)} icon="briefcase" />
        <KpiCard label="Total período" value={fmt(tot?.gran || 0)} icon="dollarSign" tone="green" sublabel="Suma todos" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          <FormField label="Desde"><Input type="date" value={desde} onChange={setDesde} /></FormField>
          <FormField label="Hasta"><Input type="date" value={hasta} onChange={setHasta} /></FormField>
          <FormField label="RUT cliente"><Input value={rut} onChange={setRut} placeholder="11.111.111-1" /></FormField>
          <FormField label="OC / ID Licitación"><Input value={oc} onChange={setOc} /></FormField>
          <FormField label="N° Interno"><Input value={nInterno} onChange={setNInterno} type="number" /></FormField>
          <FormField label="ODT"><Input value={odt} onChange={setOdt} type="number" /></FormField>
          <FormField label="N° Guía"><Input value={guia} onChange={setGuia} type="number" /></FormField>
          <FormField label="Estado pago">
            <select value={estadoPago} onChange={e => setEstadoPago(e.target.value)} style={selectStyle}>
              {ESTADO_PAGO_OPTS.map(v => <option key={v} value={v}>{v || 'Todos'}</option>)}
            </select>
          </FormField>
          <FormField label="Estado entrega">
            <select value={estadoEntrega} onChange={e => setEstadoEntrega(e.target.value)} style={selectStyle}>
              {ESTADO_ENTREGA_OPTS.map(v => <option key={v} value={v}>{v || 'Todos'}</option>)}
            </select>
          </FormField>
          <FormField label="Alcance">
            <select value={scope} onChange={e => { setScope(e.target.value); setPage(1) }} style={selectStyle}>
              <option value="operacional">Operacional</option>
              <option value="historico">Historico</option>
              <option value="todos">Todos</option>
            </select>
          </FormField>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={limpiarFiltros} style={{ padding: '7px 12px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)' }}>Limpiar</button>
          </div>
        </div>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1) }} />
          <SearchBar placeholder="Buscar libre…" value={search} onChange={setSearch} style={{ width: 280 }} />
        </div>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={pagerBtn(page <= 1)}>‹ Anterior</button>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={pagerBtn(page >= pages)}>Siguiente ›</button>
        </div>
        {isLoading
          ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={data.items} emptyMessage="Sin ventas" onRowClick={openVenta} />
        }
      </div>
    </main>
  )
}

const btnSm = (color) => ({ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color, fontWeight: 500 })
const pagerBtn = (disabled) => ({ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 })
const selectStyle = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }
