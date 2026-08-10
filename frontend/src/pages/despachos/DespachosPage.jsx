import { toast, promptDialog } from '../../store/notif'
import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { useDespachoMatriz, useDespachos, useGuias, useDeleteDespacho, useDeleteGuia } from '../../api/despachos'
import { downloadFromBackend } from '../../utils/csv'
import { useAuthStore } from '../../store/auth'
import { can, odtPath, ventaPath } from '../../utils/permissions'
import { useVenta } from '../../api/ventas'
import { EmitirDteModal } from '../../components/facturacion/DteModals'
import { useDocumentos } from '../../api/facturacion'
import { downloadDteXml, openDtePdf } from '../../utils/dteDocuments'
import { trackingTone, formatDays, showError, linkButton, btnSm, checkLabel } from './shared'
import { Mono, PackingProgress } from './shared-ui'

const TABS = [
  { id: 'matriz', label: 'Matriz despacho' },
  { id: 'registros', label: 'Registros' },
  { id: 'guias', label: 'Guias' },
]

const ESTADO_PAGO_OPTS = ['', 'No pagada', 'Pagada', 'Parcial']
const ESTADO_ENTREGA_OPTS = ['', 'Pendiente entrega', 'En despacho', 'Entregada', 'Parcial']
const TIPO_VENTA_OPTS = [
  ['', 'Todos'],
  ['venta-sala', 'Venta sala'],
  ['convenio-marco', 'Convenio marco'],
  ['venta-web', 'Venta web'],
  ['licitacion', 'Licitacion'],
]

const fmt = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-CL')
const dateFmt = value => value ? new Date(value).toLocaleDateString('es-CL') : '-'

export default function DespachosPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const ordenIdParam = searchParams.get('ordenId') || ''
  const odtIdParam = searchParams.get('odtId') || ''
  const { user } = useAuthStore()
  const canWriteDespacho = can(user, 'despacho', 'write')
  const canDeleteDespacho = can(user, 'despacho', 'delete')
  const canWriteFacturacion = can(user, 'facturacion', 'write')
  // Permite llegar directo a una pestana (ej. desde "Guias Despachos" en la
  // venta con ?tab=guias) en vez de aterrizar siempre en Matriz y obligar a
  // buscarla de nuevo a mano.
  const tabParam = searchParams.get('tab')
  const [tab, setTab] = useState(TABS.some(t => t.id === tabParam) ? tabParam : 'matriz')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [odtId, setOdtId] = useState(odtIdParam)
  const [nInterno, setNInterno] = useState('')
  const [rut, setRut] = useState('')
  const [cliente, setCliente] = useState('')
  const [oc, setOc] = useState('')
  const [idLicitacion, setIdLicitacion] = useState('')
  const [guia, setGuia] = useState('')
  const [nc, setNc] = useState('')
  const [nd, setNd] = useState('')
  const [region, setRegion] = useState('')
  const [comuna, setComuna] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [estadoPago, setEstadoPago] = useState('')
  const [estadoEntrega, setEstadoEntrega] = useState('')
  const [tipoVenta, setTipoVenta] = useState('')
  const [estadoLogistico, setEstadoLogistico] = useState('')
  const [ventasHoy, setVentasHoy] = useState(false)
  const [conIncidencia, setConIncidencia] = useState(false)
  const [includeEliminados, setIncludeEliminados] = useState(false)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  // { ordenId, guiaDespachoId? } - guiaDespachoId solo cuando se abre desde
  // una guia puntual; desde una fila de despacho se emite a nivel de venta.
  const [dteTarget, setDteTarget] = useState(null)
  const ventaGuiaDte = useVenta(dteTarget?.ordenId)

  // Sin esto el modal nunca abre y el boton "Emitir DTE"/"Emitir factura" parece muerto.
  useEffect(() => {
    if (dteTarget && ventaGuiaDte.isError) {
      toast.error('No se pudo cargar la venta asociada.')
      // Close a target whose asynchronous lookup failed.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDteTarget(null)
    }
  }, [dteTarget, ventaGuiaDte.isError])

  const setFilter = setter => value => {
    setter(value)
    setPage(1)
  }

  const baseParams = { page: String(page) }
  if (desde) baseParams.desde = desde
  if (hasta) baseParams.hasta = hasta
  if (search) baseParams.search = search
  if (odtId) baseParams.odt = odtId
  if (cliente) baseParams.cliente = cliente
  if (ordenIdParam) baseParams.ordenId = ordenIdParam

  const matrixParams = { ...baseParams }
  if (rut) matrixParams.rut = rut
  if (nInterno) matrixParams.nInterno = nInterno
  if (oc) matrixParams.oc = oc
  if (idLicitacion) matrixParams.idLicitacion = idLicitacion
  if (guia) matrixParams.guia = guia
  if (nc) matrixParams.nc = nc
  if (nd) matrixParams.nd = nd
  if (region) matrixParams.region = region
  if (comuna) matrixParams.comuna = comuna
  if (ciudad) matrixParams.ciudad = ciudad
  if (estadoPago) matrixParams.estadoPago = estadoPago
  if (estadoEntrega) matrixParams.estadoEntrega = estadoEntrega
  if (tipoVenta) matrixParams.tipoVenta = tipoVenta
  if (ventasHoy) matrixParams.ventasHoy = 'true'

  const registroParams = {}
  if (desde) registroParams.desde = desde
  if (hasta) registroParams.hasta = hasta
  if (search) registroParams.search = search
  if (odtId) registroParams.odtId = odtId
  if (nInterno) registroParams.nInterno = nInterno
  if (region) registroParams.region = region
  if (comuna) registroParams.comuna = comuna
  if (cliente) registroParams.cliente = cliente
  if (estadoLogistico) registroParams.estado = estadoLogistico
  if (conIncidencia) registroParams.conIncidencia = 'true'
  if (ordenIdParam) registroParams.ordenId = ordenIdParam
  if (canDeleteDespacho && includeEliminados) registroParams.includeEliminados = 'true'
  registroParams.page = String(page)

  const guiaParams = {}
  if (desde) guiaParams.desde = desde
  if (hasta) guiaParams.hasta = hasta
  if (search) guiaParams.search = search
  if (odtId) guiaParams.odtId = odtId
  if (nInterno) guiaParams.nInterno = nInterno
  if (guia) guiaParams.nGuia = guia
  if (cliente) guiaParams.cliente = cliente
  if (ordenIdParam) guiaParams.ordenId = ordenIdParam
  if (canDeleteDespacho && includeEliminados) guiaParams.includeEliminados = 'true'
  guiaParams.page = String(page)

  const matriz = useDespachoMatriz(tab === 'matriz' ? matrixParams : {})
  const despachos = useDespachos(tab === 'registros' ? registroParams : {})
  const guias = useGuias(tab === 'guias' ? guiaParams : {})
  const documentosGuias = useDocumentos({ tipoDte: 52 }, { enabled: tab === 'guias' })
  const dtePorGuiaId = useMemo(() => {
    const result = new Map()
    for (const documento of documentosGuias.data?.documentos || []) {
      const guiaId = Number(documento.guiaDespachoId)
      if (guiaId && documento.folio && documento.estado !== 'borrador' && !result.has(guiaId)) {
        result.set(guiaId, documento)
      }
    }
    return result
  }, [documentosGuias.data])
  const delMut = useDeleteDespacho()
  const delGuiaMut = useDeleteGuia()

  const currentResult = tab === 'matriz' ? matriz.data : tab === 'registros' ? despachos.data : guias.data
  const currentLoading = tab === 'matriz' ? matriz.isLoading : tab === 'registros' ? despachos.isLoading : guias.isLoading
  const total = currentResult?.total || 0
  const limit = currentResult?.limit || 100
  const pages = Math.max(1, Math.ceil(total / limit))
  const rows = currentResult?.items || []

  const renderOdtLink = value => value ? (
    <button
      onClick={(e) => { e.stopPropagation(); navigate(odtPath(value, user)) }}
      style={linkButton('var(--amber, #d97706)', 600)}
      title={`Abrir OT #${value}`}
    >#{value}</button>
  ) : '-'

  const colsMatriz = [
    { key: 'fechaCreacion', label: 'Fecha', render: dateFmt },
    { key: 'nInterno', label: 'N interno', render: v => <Mono strong>{v || '-'}</Mono> },
    { key: 'clienteNombre', label: 'Cliente', render: (_, row) => (
      <div style={{ minWidth: 160 }}>
        <div style={{ fontWeight: 600 }}>{row.clienteNombre || '-'}</div>
        <Mono muted>{row.rutCliente || ''}</Mono>
      </div>
    ) },
    { key: 'oc', label: 'OC / ID', render: (_, row) => (
      <div style={{ minWidth: 100 }}>
        <Mono>{row.oc || '-'}</Mono>
        {row.idLicitacion && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Lic. {row.idLicitacion}</div>}
      </div>
    ) },
    { key: 'total', label: 'Total', align: 'right', render: v => <Mono strong>{fmt(v)}</Mono> },
    { key: 'facturado', label: 'Facturado', align: 'right', render: v => <Mono>{v ? fmt(v) : '-'}</Mono> },
    { key: 'estadoPago', label: 'Pago', render: v => v ? <Badge tone={v === 'Pagada' ? 'green' : v === 'Parcial' ? 'amber' : 'red'}>{v}</Badge> : '-' },
    { key: 'estadoEntrega', label: 'Entrega', render: v => v ? <Badge tone={toneEntrega(v)}>{v}</Badge> : '-' },
    { key: 'itemsDetalle', label: 'Detalle', wrap: true, render: value => <DetalleProductos items={value || []} /> },
    { key: 'packing', label: 'Packing', render: (_, row) => <PackingProgress row={row} /> },
    { key: 'odts', label: 'OT', render: value => <InlineList items={(value || []).map(odt => `#${odt.id} ${odt.estado || ''}`)} /> },
    { key: 'guias', label: 'Guias', render: (value, row) => {
      const list = (value || []).map(g => g.nGuia)
      if (!list.length && row.guiasLegacy) list.push(`#${row.guiasLegacy}`)
      return <InlineList items={list} />
    } },
    { key: 'documentos', label: 'Docs', render: value => <InlineList items={(value || []).map(d => `${d.tipoDocumento || d.documento || ''} ${d.nDoc || d.numeroNCInterna || ''}`.trim())} /> },
    { key: 'direccion', label: 'Destino', wrap: true, render: (_, row) => (
      <div style={{ fontSize: 11, minWidth: 150 }}>
        <div>{row.direccion || '-'}</div>
        <div style={{ color: 'var(--text-3)' }}>{[row.region, row.comuna, row.ciudad].filter(Boolean).join(' / ')}</div>
      </div>
    ) },
    { key: '_acc', label: 'Acciones', render: (_, row) => (
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <button onClick={e => { e.stopPropagation(); navigate(ventaPath(row.ordenId, user)) }} style={btnSm('var(--green-700)')}>Ver</button>
        {row.odtCount > 0 && <button onClick={e => { e.stopPropagation(); navigate(`/odt?ordenId=${row.ordenId}`) }} style={btnSm('var(--amber)')}>OT</button>}
        {row.nInterno && <button onClick={e => { e.stopPropagation(); navigate(`/caja?nInterno=${row.nInterno}`) }} style={btnSm('var(--text-2)')}>Pagos</button>}
        {canWriteDespacho && (
          <button
            onClick={e => {
              e.stopPropagation()
              navigate(`/despachos/ordenes/${row.ordenId}/packing`)
            }}
            style={btnSm('var(--green-700)')}
          >Packing</button>
        )}
        {canWriteDespacho && (
          <button
            onClick={e => {
              e.stopPropagation()
              const params = new URLSearchParams({ ordenId: row.ordenId || '', nInterno: row.nInterno || '', direccion: row.direccion || '', region: row.region || '', comuna: row.comuna || '' })
              navigate(`/despachos/nuevo?${params.toString()}`)
            }}
            style={btnSm('var(--blue)')}
          >Desp.</button>
        )}
        {canWriteDespacho && (
          <button
            onClick={e => {
              e.stopPropagation()
              navigate(`/despachos/guias/nueva?ordenId=${row.ordenId || ''}&nInterno=${row.nInterno || ''}`)
            }}
            style={btnSm('var(--blue)')}
          >Guia</button>
        )}
      </div>
    ) },
  ]

  const colsDespacho = [
    { key: 'fechaEntrega', label: 'Fecha entrega', render: dateFmt },
    { key: 'tiempos', label: 'Dias despacho', render: (_, row) => (
      <span style={{ fontFamily: "'DM Mono', monospace", color: row.tiempos?.pendiente ? 'var(--amber)' : 'var(--text-2)', fontWeight: row.tiempos?.pendiente ? 700 : 500 }}>
        {formatDays(row.tiempos?.despachoDias)}
      </span>
    ) },
    { key: 'interno', label: 'N interno', render: v => <Mono strong>{v || '-'}</Mono> },
    { key: 'ordenId', label: 'Orden', render: v => v ? <button onClick={(e) => { e.stopPropagation(); navigate(ventaPath(v, user)) }} style={linkButton('var(--blue)')}>#{v}</button> : '-' },
    { key: 'odtId', label: 'OT', render: renderOdtLink },
    { key: 'tipoDespacho', label: 'Tipo', render: v => v ? <Badge tone="blue">{v}</Badge> : '-' },
    { key: 'transporte', label: 'Transporte' },
    { key: 'contacto', label: 'Contacto' },
    { key: 'direccion', label: 'Direccion', wrap: true, render: v => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
    { key: 'region', label: 'Region' },
    { key: 'comuna', label: 'Comuna' },
    { key: 'montoEnvio', label: 'Envio', align: 'right', render: v => <Mono>{fmt(v)}</Mono> },
    { key: 'parcial', label: 'Estado', render: (v, r) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {v && <Badge tone="amber">Parcial</Badge>}
        {r.tieneMulta && <Badge tone="red">Multa</Badge>}
        {!v && !r.tieneMulta && <Badge tone={r.fechaEntrega ? 'green' : 'gray'}>{r.fechaEntrega ? 'Entregado' : 'Pendiente'}</Badge>}
        {r.tracking?.estado && <Badge tone={trackingTone(r.tracking.estado)}>{r.tracking.estado}</Badge>}
        {r.incidencia && <Badge tone="red">{r.incidencia.tipoIncidente || 'Incidencia'}</Badge>}
      </div>
    ) },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={(e) => { e.stopPropagation(); navigate(`/despachos/${row.id}/tracking`) }} style={linkButton('var(--blue)')}>Track</button>
        {canWriteFacturacion && <button
          disabled={!row.ordenId}
          title={row.ordenId ? 'Emitir factura electrónica' : 'Este despacho no tiene una venta asociada'}
          onClick={(e) => { e.stopPropagation(); if (row.ordenId) setDteTarget({ ordenId: row.ordenId }) }}
          style={{ ...linkButton('var(--blue)'), opacity: row.ordenId ? 1 : 0.45, cursor: row.ordenId ? 'pointer' : 'not-allowed' }}
        >Emitir factura</button>}
        {canWriteDespacho && <button onClick={(e) => { e.stopPropagation(); navigate(`/despachos/${row.id}/editar`) }} style={linkButton('var(--green-700)')}>Editar</button>}
        {canDeleteDespacho && <button onClick={(e) => { e.stopPropagation(); solicitarEliminacion('despacho', row.id, delMut) }} style={linkButton('var(--red)')}>Borrar</button>}
      </div>
    ) },
  ]

  const renderGuiaDte = row => {
    const documento = dtePorGuiaId.get(Number(row.id))
    if (!documento) return null
    const runDteAction = async (event, action) => {
      event.stopPropagation()
      try {
        await action(documento)
      } catch (error) {
        toast.error(error?.response?.data?.error || error?.message || 'No se pudo abrir el documento.')
      }
    }
    return <>
      <Badge tone={documento.estado === 'aceptado' ? 'green' : documento.estado === 'enviado' ? 'amber' : 'blue'}>DTE folio {documento.folio}</Badge>
      <button onClick={event => runDteAction(event, openDtePdf)} style={linkButton('var(--blue)')}>Ver PDF</button>
      <button onClick={event => runDteAction(event, downloadDteXml)} style={linkButton('var(--text-2)')}>Descargar XML</button>
    </>
  }

  const colsGuia = [
    { key: 'fechaGuia', label: 'Fecha', render: dateFmt },
    { key: 'nGuia', label: 'N guia', render: v => <Mono strong>{v}</Mono> },
    { key: 'nInterno', label: 'N interno' },
    { key: 'ordenId', label: 'Orden', render: v => v ? <button onClick={(e) => { e.stopPropagation(); navigate(ventaPath(v, user)) }} style={linkButton('var(--blue)')}>#{v}</button> : '-' },
    { key: 'odtId', label: 'OT', render: renderOdtLink },
    { key: 'origen', label: 'Origen' },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {documentosGuias.isLoading && <span style={{ color: 'var(--text-3)', fontSize: 11 }}>Cargando DTE...</span>}
        {renderGuiaDte(row)}
        {!documentosGuias.isLoading && !dtePorGuiaId.has(Number(row.id)) && canWriteFacturacion && <button
          disabled={!row.ordenId}
          title={row.ordenId ? 'Emitir guía de despacho electrónica' : 'Esta guía no tiene una orden asociada'}
          onClick={(e) => { e.stopPropagation(); if (row.ordenId) setDteTarget({ ordenId: row.ordenId, guiaDespachoId: row.id }) }}
          style={{ ...linkButton('var(--blue)'), opacity: row.ordenId ? 1 : 0.45, cursor: row.ordenId ? 'pointer' : 'not-allowed' }}
        >Emitir DTE</button>}
        <button onClick={(e) => { e.stopPropagation(); window.open(`${window.location.origin}/despachos/guias/${row.id}/imprimir`, '_blank') }} style={linkButton('var(--text-2)')}>Imprimir</button>
        {canWriteDespacho && <button onClick={(e) => { e.stopPropagation(); navigate(`/despachos/guias/${row.id}/editar`) }} style={linkButton('var(--green-700)')}>Editar</button>}
        {canDeleteDespacho && <button onClick={(e) => { e.stopPropagation(); solicitarEliminacion('guia', row.id, delGuiaMut) }} style={linkButton('var(--red)')}>Borrar</button>}
      </div>
    ) },
  ]

  const columns = tab === 'matriz' ? colsMatriz : tab === 'registros' ? colsDespacho : colsGuia

  const exportar = async () => {
    if (tab === 'matriz') {
      const exportParams = { ...matrixParams }
      delete exportParams.page
      await downloadFromBackend('/despachos/matriz/export', `despacho_matriz_${new Date().toISOString().slice(0, 10)}.csv`, exportParams)
    } else if (tab === 'registros') {
      const exportParams = { ...registroParams }
      delete exportParams.page
      await downloadFromBackend('/despachos/export/registros', `despachos_${new Date().toISOString().slice(0, 10)}.csv`, exportParams)
    } else {
      const exportParams = { ...guiaParams }
      delete exportParams.page
      await downloadFromBackend('/despachos/guias/export', `guias_${new Date().toISOString().slice(0, 10)}.csv`, exportParams)
    }
  }

  async function solicitarEliminacion(tipo, id, mutation) {
    const motivo = await promptDialog({ title: `Motivo de eliminacion de ${tipo}` })
    if (!motivo?.trim()) return
    mutation.mutate({ id, motivo: motivo.trim() }, { onError: showError })
  }

  function clearFilters() {
    setDesde(''); setHasta(''); setSearch(''); setOdtId(''); setNInterno('')
    setRut(''); setCliente(''); setOc(''); setIdLicitacion(''); setGuia('')
    setNc(''); setNd(''); setRegion(''); setComuna(''); setCiudad('')
    setEstadoPago(''); setEstadoEntrega(''); setTipoVenta(''); setEstadoLogistico('')
    setVentasHoy(false); setConIncidencia(false); setIncludeEliminados(false); setPage(1)
    if (ordenIdParam || odtIdParam) setSearchParams({})
  }

  const toolbarExtra = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tabs tabs={TABS} active={tab} onChange={value => { setTab(value); setPage(1) }} style={{ marginBottom: 0 }} />
          {tab === 'registros' && (
            <button
              onClick={() => setFilter(setEstadoLogistico)(estadoLogistico === 'pendiente' ? '' : 'pendiente')}
              style={quickFilterBtn(estadoLogistico === 'pendiente')}
            >
              Pendientes{estadoLogistico === 'pendiente' ? ' · mas antiguos primero' : ''}
            </button>
          )}
        </div>
        <SearchBar placeholder="Buscar cliente, documento, guia o interno..." value={search} onChange={setFilter(setSearch)} style={{ width: 320 }} />
      </div>
      <div style={filterGrid}>
        <FilterField label="Desde"><input type="date" value={desde} onChange={e => setFilter(setDesde)(e.target.value)} style={inputFilter} /></FilterField>
        <FilterField label="Hasta"><input type="date" value={hasta} onChange={e => setFilter(setHasta)(e.target.value)} style={inputFilter} /></FilterField>
        <FilterField label="N interno"><input value={nInterno} onChange={e => setFilter(setNInterno)(e.target.value)} style={inputFilter} /></FilterField>
        <FilterField label="RUT"><input value={rut} onChange={e => setFilter(setRut)(e.target.value)} style={inputFilter} /></FilterField>
        <FilterField label="Cliente"><input value={cliente} onChange={e => setFilter(setCliente)(e.target.value)} style={inputFilter} /></FilterField>
        <FilterField label="OC"><input value={oc} onChange={e => setFilter(setOc)(e.target.value)} style={inputFilter} /></FilterField>
        <FilterField label="ID licitacion"><input value={idLicitacion} onChange={e => setFilter(setIdLicitacion)(e.target.value)} style={inputFilter} /></FilterField>
        <FilterField label="Guia"><input value={guia} onChange={e => setFilter(setGuia)(e.target.value)} style={inputFilter} /></FilterField>
        <FilterField label="NC"><input value={nc} onChange={e => setFilter(setNc)(e.target.value)} style={inputFilter} /></FilterField>
        <FilterField label="ND"><input value={nd} onChange={e => setFilter(setNd)(e.target.value)} style={inputFilter} /></FilterField>
        <FilterField label="OT"><input value={odtId} onChange={e => setFilter(setOdtId)(e.target.value)} style={inputFilter} /></FilterField>
        <FilterField label="Tipo venta">
          <select value={tipoVenta} onChange={e => setFilter(setTipoVenta)(e.target.value)} style={inputFilter}>
            {TIPO_VENTA_OPTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </FilterField>
        <FilterField label="Pago">
          <select value={estadoPago} onChange={e => setFilter(setEstadoPago)(e.target.value)} style={inputFilter}>
            {ESTADO_PAGO_OPTS.map(v => <option key={v} value={v}>{v || 'Todos'}</option>)}
          </select>
        </FilterField>
        <FilterField label="Entrega">
          <select value={estadoEntrega} onChange={e => setFilter(setEstadoEntrega)(e.target.value)} style={inputFilter}>
            {ESTADO_ENTREGA_OPTS.map(v => <option key={v} value={v}>{v || 'Todos'}</option>)}
          </select>
        </FilterField>
        <FilterField label="Estado despacho">
          <select value={estadoLogistico} onChange={e => setFilter(setEstadoLogistico)(e.target.value)} style={inputFilter}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="entregada">Entregada</option>
            <option value="parcial">Parcial</option>
            <option value="multa">Con multa</option>
          </select>
        </FilterField>
        <FilterField label="Region"><input value={region} onChange={e => setFilter(setRegion)(e.target.value)} style={inputFilter} /></FilterField>
        <FilterField label="Comuna"><input value={comuna} onChange={e => setFilter(setComuna)(e.target.value)} style={inputFilter} /></FilterField>
        <FilterField label="Ciudad"><input value={ciudad} onChange={e => setFilter(setCiudad)(e.target.value)} style={inputFilter} /></FilterField>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <label style={checkLabel}><input type="checkbox" checked={ventasHoy} onChange={e => { setVentasHoy(e.target.checked); setPage(1) }} /> Ventas hoy</label>
          {tab === 'registros' && (
            <label style={checkLabel}><input type="checkbox" checked={conIncidencia} onChange={e => { setConIncidencia(e.target.checked); setPage(1) }} /> Con incidencia</label>
          )}
          {canDeleteDespacho && tab !== 'matriz' && (
            <label style={checkLabel}><input type="checkbox" checked={includeEliminados} onChange={e => { setIncludeEliminados(e.target.checked); setPage(1) }} /> Ver eliminados</label>
          )}
          <button onClick={clearFilters} style={smallButton}>Limpiar</button>
        </div>
      </div>
      {ordenIdParam && <div><Badge tone="blue">Orden #{ordenIdParam}</Badge></div>}
    </div>
  )

  return (
    <main className="page page-wide">
      <PageHeader
        title="Despachos y Guias"
        subtitle="Matriz logistica de ventas, registros de despacho y guias"
        breadcrumb={['Inicio', 'Logistica', 'Despachos']}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" size="sm" onClick={() => window.print()}>Imprimir</Btn>
            <Btn variant="secondary" size="sm" onClick={exportar}>Exportar CSV</Btn>
            {canWriteDespacho && (tab === 'guias'
              ? <Btn variant="primary" size="sm" onClick={() => navigate(`/despachos/guias/nueva?ordenId=${ordenIdParam}&odtId=${odtIdParam}`)}>Nueva guia</Btn>
              : <Btn variant="primary" size="sm" onClick={() => navigate('/despachos/nuevo')}>Nuevo despacho</Btn>)}
          </div>
        }
      />

      <div className="kpi-strip">
        <KpiCard label="Ventas matriz" value={matriz.data?.total || 0} icon="truck" sublabel="Segun filtros" />
        <KpiCard label="Pendientes" value={matriz.data?.stats?.pendientes || 0} icon="package" tone="amber" sublabel="Pendiente entrega" />
        <KpiCard label="No pagadas" value={matriz.data?.stats?.noPagadas || 0} icon="alertTriangle" tone="red" sublabel="Estado pago" />
        <KpiCard label="Guias" value={guias.data?.total || 0} icon="fileText" sublabel="Registros guia" />
      </div>

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {currentLoading
          ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
          : <Table
              key={tab}
              columns={columns}
              rows={rows}
              emptyMessage={tab === 'matriz' ? 'Sin ventas para despacho' : 'Sin registros'}
              keyboard
              ariaLabel="Despachos"
              columnPrefsKey={`despachos-${tab}`}
              getRowKey={(row, index) => row.id || row.ordenId || row.numeroGuia || index}
              onRowDoubleClick={tab === 'matriz' ? row => row.ordenId && navigate(ventaPath(row.ordenId, user)) : undefined}
              toolbarExtra={toolbarExtra}
              pager={{ page, pages, total, limit, shown: rows.length, onChange: setPage, disabled: currentLoading }}
            />
        }
      </div>

      {dteTarget && ventaGuiaDte.data && (
        <EmitirDteModal
          venta={ventaGuiaDte.data}
          guiaDespachoId={dteTarget.guiaDespachoId}
          tipoDte={dteTarget.guiaDespachoId ? 52 : undefined}
          onClose={() => setDteTarget(null)}
          onSuccess={({ emitido, documento }) => {
            setDteTarget(null)
            toast.success(`DTE emitido${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`)
          }}
        />
      )}
      {dteTarget && ventaGuiaDte.isPending && <LoadingOverlay label="Cargando venta..." />}
    </main>
  )
}

function FilterField({ label, children }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}><span style={{ display: 'block', marginBottom: 4 }}>{label}</span>{children}</label>
}

function InlineList({ items }) {
  const clean = (items || []).filter(Boolean)
  if (!clean.length) return '-'
  return <span title={clean.join('\n')} style={{ fontSize: 11, fontWeight: 600 }}>{clean.slice(0, 2).join(', ')}{clean.length > 2 ? ` +${clean.length - 2}` : ''}</span>
}

function DetalleProductos({ items }) {
  if (!items.length) return '-'
  const label = items.slice(0, 2).map(item => `${item.nombre || item.codigo || 'Producto'} (${item.entregados || 0}/${item.cantidad || 0})`).join(', ')
  const title = items.map(item => `${item.codigo || ''} ${item.nombre || ''}: ${item.entregados || 0}/${item.cantidad || 0}`).join('\n')
  return <span title={title} style={{ fontSize: 11 }}>{label}{items.length > 2 ? ` +${items.length - 2}` : ''}</span>
}

function toneEntrega(value) {
  if (value === 'Entregada') return 'green'
  if (value === 'Parcial') return 'amber'
  if (value === 'En despacho') return 'blue'
  return 'gray'
}

function LoadingOverlay({ label }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'oklch(0 0 0 / .45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', padding: '16px 22px', borderRadius: 10, fontSize: 13, color: 'var(--text-2)' }}>{label}</div>
    </div>
  )
}

const filterGrid = { padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, alignItems: 'end' }
const inputFilter = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff' }
const smallButton = { padding: '7px 10px', fontSize: 12, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)' }
const quickFilterBtn = active => ({ padding: '7px 12px', fontSize: 12, borderRadius: 6, border: `1px solid ${active ? 'var(--green-600)' : 'var(--border)'}`, background: active ? 'var(--green-50)' : '#fff', cursor: 'pointer', color: active ? 'var(--green-800)' : 'var(--text-2)', fontWeight: active ? 700 : 500 })
