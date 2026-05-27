import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, Pager, SearchBar, Table, Tabs } from '../../components/shared'
import { useDespachoMatriz, useDespachos, useGuias, useCreateDespacho, useUpdateDespacho, useDeleteDespacho, useCreateGuia, useUpdateGuia, useDeleteGuia } from '../../api/despachos'
import { downloadFromBackend } from '../../utils/csv'
import { useAuthStore } from '../../store/auth'
import { can, odtPath, ventaPath } from '../../utils/permissions'

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

const emptyDespacho = {
  ordenId: '',
  odtId: '',
  interno: '',
  plazoEntrega: '',
  fechaInterno: '',
  fechaEntrega: '',
  tipoDespacho: '',
  transporte: '',
  montoEnvio: '',
  direccion: '',
  contacto: '',
  region: '',
  comuna: '',
  parcial: false,
  tieneMulta: false,
}

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
  const [tab, setTab] = useState('matriz')
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
  const [includeEliminados, setIncludeEliminados] = useState(false)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [creating, setCreating] = useState(null)
  const [editing, setEditing] = useState(null)
  const [creatingGuia, setCreatingGuia] = useState(null)
  const [editingGuia, setEditingGuia] = useState(null)

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
  const createMut = useCreateDespacho()
  const updateMut = useUpdateDespacho()
  const delMut = useDeleteDespacho()
  const createGuiaMut = useCreateGuia()
  const updateGuiaMut = useUpdateGuia()
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
      title={`Abrir ODT #${value}`}
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
    { key: 'odts', label: 'ODTs', render: value => <InlineList items={(value || []).map(odt => `#${odt.id} ${odt.estado || ''}`)} /> },
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
        {row.odtCount > 0 && <button onClick={e => { e.stopPropagation(); navigate(`/odt?ordenId=${row.ordenId}`) }} style={btnSm('var(--amber)')}>ODT</button>}
        {row.nInterno && <button onClick={e => { e.stopPropagation(); navigate(`/caja?nInterno=${row.nInterno}`) }} style={btnSm('var(--text-2)')}>Pagos</button>}
        {canWriteDespacho && (
          <button
            onClick={e => {
              e.stopPropagation()
              setCreating({
                ...emptyDespacho,
                ordenId: row.ordenId || '',
                interno: row.nInterno || '',
                direccion: row.direccion || '',
                region: row.region || '',
                comuna: row.comuna || '',
              })
            }}
            style={btnSm('var(--blue)')}
          >Desp.</button>
        )}
        {canWriteDespacho && (
          <button
            onClick={e => {
              e.stopPropagation()
              setCreatingGuia({ ordenId: row.ordenId || '', odtId: '', nInterno: row.nInterno || '', nGuia: '', fechaGuia: '', origen: '' })
            }}
            style={btnSm('var(--blue)')}
          >Guia</button>
        )}
      </div>
    ) },
  ]

  const colsDespacho = [
    { key: 'fechaEntrega', label: 'Fecha entrega', render: dateFmt },
    { key: 'interno', label: 'N interno', render: v => <Mono strong>{v || '-'}</Mono> },
    { key: 'ordenId', label: 'Orden', render: v => v ? <button onClick={(e) => { e.stopPropagation(); navigate(ventaPath(v, user)) }} style={linkButton('var(--blue)')}>#{v}</button> : '-' },
    { key: 'odtId', label: 'ODT', render: renderOdtLink },
    { key: 'tipoDespacho', label: 'Tipo', render: v => v ? <Badge tone="blue">{v}</Badge> : '-' },
    { key: 'transporte', label: 'Transporte' },
    { key: 'contacto', label: 'Contacto' },
    { key: 'direccion', label: 'Direccion', wrap: true, render: v => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
    { key: 'region', label: 'Region' },
    { key: 'comuna', label: 'Comuna' },
    { key: 'montoEnvio', label: 'Envio', align: 'right', render: v => <Mono>{fmt(v)}</Mono> },
    { key: 'parcial', label: 'Estado', render: (v, r) => (
      <div style={{ display: 'flex', gap: 4 }}>
        {v && <Badge tone="amber">Parcial</Badge>}
        {r.tieneMulta && <Badge tone="red">Multa</Badge>}
        {!v && !r.tieneMulta && <Badge tone={r.fechaEntrega ? 'green' : 'gray'}>{r.fechaEntrega ? 'Entregado' : 'Pendiente'}</Badge>}
      </div>
    ) },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 8 }}>
        {canWriteDespacho && <button onClick={(e) => { e.stopPropagation(); setEditing(row) }} style={linkButton('var(--green-700)')}>Editar</button>}
        {canDeleteDespacho && <button onClick={(e) => { e.stopPropagation(); solicitarEliminacion('despacho', row.id, delMut) }} style={linkButton('var(--red)')}>Borrar</button>}
      </div>
    ) },
  ]

  const colsGuia = [
    { key: 'fechaGuia', label: 'Fecha', render: dateFmt },
    { key: 'nGuia', label: 'N guia', render: v => <Mono strong>{v}</Mono> },
    { key: 'nInterno', label: 'N interno' },
    { key: 'ordenId', label: 'Orden', render: v => v ? <button onClick={(e) => { e.stopPropagation(); navigate(ventaPath(v, user)) }} style={linkButton('var(--blue)')}>#{v}</button> : '-' },
    { key: 'odtId', label: 'ODT', render: renderOdtLink },
    { key: 'origen', label: 'Origen' },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 8 }}>
        {canWriteDespacho && <button onClick={(e) => { e.stopPropagation(); setEditingGuia(row) }} style={linkButton('var(--green-700)')}>Editar</button>}
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

  function solicitarEliminacion(tipo, id, mutation) {
    const motivo = window.prompt(`Motivo de eliminacion de ${tipo}`)
    if (!motivo?.trim()) return
    mutation.mutate({ id, motivo: motivo.trim() }, { onError: showError })
  }

  function clearFilters() {
    setDesde(''); setHasta(''); setSearch(''); setOdtId(''); setNInterno('')
    setRut(''); setCliente(''); setOc(''); setIdLicitacion(''); setGuia('')
    setNc(''); setNd(''); setRegion(''); setComuna(''); setCiudad('')
    setEstadoPago(''); setEstadoEntrega(''); setTipoVenta(''); setEstadoLogistico('')
    setVentasHoy(false); setIncludeEliminados(false); setPage(1)
    if (ordenIdParam || odtIdParam) setSearchParams({})
  }

  return (
    <main style={{ maxWidth: 1600, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Despachos y Guias"
        subtitle="Matriz logistica de ventas, registros de despacho y guias"
        breadcrumb={['Inicio', 'Logistica', 'Despachos']}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" size="sm" onClick={() => window.print()}>Imprimir</Btn>
            <Btn variant="secondary" size="sm" onClick={exportar}>Exportar CSV</Btn>
            {canWriteDespacho && (tab === 'guias'
              ? <Btn variant="primary" size="sm" onClick={() => setCreatingGuia({ ordenId: ordenIdParam, odtId: odtIdParam, nInterno: '', nGuia: '', fechaGuia: '', origen: '' })}>Nueva guia</Btn>
              : <Btn variant="primary" size="sm" onClick={() => setCreating(emptyDespacho)}>Nuevo despacho</Btn>)}
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
          <FilterField label="ODT"><input value={odtId} onChange={e => setFilter(setOdtId)(e.target.value)} style={inputFilter} /></FilterField>
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
            {canDeleteDespacho && tab !== 'matriz' && (
              <label style={checkLabel}><input type="checkbox" checked={includeEliminados} onChange={e => { setIncludeEliminados(e.target.checked); setPage(1) }} /> Ver eliminados</label>
            )}
            <button onClick={clearFilters} style={smallButton}>Limpiar</button>
          </div>
        </div>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <Tabs tabs={TABS} active={tab} onChange={value => { setTab(value); setPage(1) }} />
          <SearchBar placeholder="Buscar cliente, documento, guia o interno..." value={search} onChange={setFilter(setSearch)} style={{ width: 320 }} />
        </div>
        {ordenIdParam && <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}><Badge tone="blue">Orden #{ordenIdParam}</Badge></div>}
        {currentLoading
          ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
          : <Table columns={columns} rows={rows} emptyMessage={tab === 'matriz' ? 'Sin ventas para despacho' : 'Sin registros'} />
        }
        <Pager page={page} pages={pages} total={total} limit={limit} shown={rows.length} onChange={setPage} disabled={currentLoading} />
      </div>

      {creating && (
        <DespachoModal
          title="Nuevo despacho"
          initial={creating}
          saving={createMut.isPending}
          onClose={() => setCreating(null)}
          onSave={(data) => createMut.mutate(data, { onSuccess: () => setCreating(null), onError: showError })}
        />
      )}
      {editing && (
        <DespachoModal
          title={`Editar despacho #${editing.id}`}
          initial={editing}
          saving={updateMut.isPending}
          onClose={() => setEditing(null)}
          onSave={(data) => updateMut.mutate({ id: editing.id, data }, { onSuccess: () => setEditing(null), onError: showError })}
        />
      )}
      {creatingGuia && (
        <GuiaModal
          title="Nueva guia"
          initial={creatingGuia}
          saving={createGuiaMut.isPending}
          onClose={() => setCreatingGuia(null)}
          onSave={(data) => createGuiaMut.mutate(data, { onSuccess: () => setCreatingGuia(null), onError: showError })}
        />
      )}
      {editingGuia && (
        <GuiaModal
          title={`Editar guia #${editingGuia.id}`}
          initial={editingGuia}
          saving={updateGuiaMut.isPending}
          onClose={() => setEditingGuia(null)}
          onSave={(data) => updateGuiaMut.mutate({ id: editingGuia.id, data }, { onSuccess: () => setEditingGuia(null), onError: showError })}
        />
      )}
    </main>
  )
}

function DespachoModal({ title, initial, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    ...emptyDespacho,
    ...initial,
    fechaInterno: initial.fechaInterno ? String(initial.fechaInterno).slice(0, 10) : '',
    fechaEntrega: initial.fechaEntrega ? String(initial.fechaEntrega).slice(0, 10) : '',
  }))
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  return (
    <Modal title={title} onClose={onClose}>
      <div style={grid}>
        <Field label="Orden ID"><input value={form.ordenId || ''} onChange={e => set('ordenId', e.target.value)} style={input} /></Field>
        <Field label="ODT ID"><input value={form.odtId || ''} onChange={e => set('odtId', e.target.value)} style={input} /></Field>
        <Field label="Interno"><input value={form.interno || ''} onChange={e => set('interno', e.target.value)} style={input} /></Field>
        <Field label="Plazo entrega"><input value={form.plazoEntrega || ''} onChange={e => set('plazoEntrega', e.target.value)} style={input} /></Field>
        <Field label="Fecha interno"><input type="date" value={form.fechaInterno || ''} onChange={e => set('fechaInterno', e.target.value)} style={input} /></Field>
        <Field label="Fecha entrega"><input type="date" value={form.fechaEntrega || ''} onChange={e => set('fechaEntrega', e.target.value)} style={input} /></Field>
        <Field label="Tipo"><input value={form.tipoDespacho || ''} onChange={e => set('tipoDespacho', e.target.value)} style={input} /></Field>
        <Field label="Transporte"><input value={form.transporte || ''} onChange={e => set('transporte', e.target.value)} style={input} /></Field>
        <Field label="Monto envio"><input value={form.montoEnvio || ''} onChange={e => set('montoEnvio', e.target.value)} style={input} /></Field>
        <Field label="Contacto"><input value={form.contacto || ''} onChange={e => set('contacto', e.target.value)} style={input} /></Field>
        <Field label="Region"><input value={form.region || ''} onChange={e => set('region', e.target.value)} style={input} /></Field>
        <Field label="Comuna"><input value={form.comuna || ''} onChange={e => set('comuna', e.target.value)} style={input} /></Field>
      </div>
      <Field label="Direccion"><textarea value={form.direccion || ''} onChange={e => set('direccion', e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} /></Field>
      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
        <label style={checkLabel}><input type="checkbox" checked={!!form.parcial} onChange={e => set('parcial', e.target.checked)} /> Parcial</label>
        <label style={checkLabel}><input type="checkbox" checked={!!form.tieneMulta} onChange={e => set('tieneMulta', e.target.checked)} /> Tiene multa</label>
      </div>
      <Footer saving={saving} onClose={onClose} onSave={() => onSave(form)} />
    </Modal>
  )
}

function GuiaModal({ title = 'Nueva guia', initial, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    ordenId: '',
    odtId: '',
    nInterno: '',
    nGuia: '',
    origen: '',
    ...initial,
    fechaGuia: initial.fechaGuia ? String(initial.fechaGuia).slice(0, 10) : '',
  }))
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  return (
    <Modal title={title} onClose={onClose}>
      <div style={grid}>
        <Field label="N guia"><input value={form.nGuia} onChange={e => set('nGuia', e.target.value)} style={input} /></Field>
        <Field label="Orden ID"><input value={form.ordenId} onChange={e => set('ordenId', e.target.value)} style={input} /></Field>
        <Field label="ODT ID"><input value={form.odtId} onChange={e => set('odtId', e.target.value)} style={input} /></Field>
        <Field label="N interno"><input value={form.nInterno} onChange={e => set('nInterno', e.target.value)} style={input} /></Field>
        <Field label="Fecha"><input type="date" value={form.fechaGuia} onChange={e => set('fechaGuia', e.target.value)} style={input} /></Field>
      </div>
      <Field label="Origen"><input value={form.origen} onChange={e => set('origen', e.target.value)} style={input} /></Field>
      <Footer saving={saving} onClose={onClose} onSave={() => onSave(form)} />
    </Modal>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, padding: 20, width: 760, maxWidth: '95vw', boxShadow: '0 16px 48px oklch(0 0 0 / 0.20)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={linkButton('var(--text-3)')}>Cerrar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FilterField({ label, children }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}><span style={{ display: 'block', marginBottom: 4 }}>{label}</span>{children}</label>
}

function Field({ label, children }) {
  return <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}><span style={{ display: 'block', marginBottom: 5 }}>{label}</span>{children}</label>
}

function Footer({ saving, onClose, onSave }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
      <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
      <Btn variant="primary" icon="check" onClick={onSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Btn>
    </div>
  )
}

function Mono({ children, strong = false, muted = false }) {
  return <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: strong ? 700 : 500, color: muted ? 'var(--text-3)' : undefined }}>{children}</span>
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

function showError(error) {
  alert(error.response?.data?.error || 'Error')
}

function linkButton(color, fontWeight = 500) {
  return { background: 'transparent', border: 'none', color, cursor: 'pointer', fontSize: 12, fontWeight }
}

const btnSm = (color) => ({ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color, fontWeight: 500 })
const filterGrid = { padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, alignItems: 'end' }
const inputFilter = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff' }
const smallButton = { padding: '7px 10px', fontSize: 12, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)' }
const input = { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }
const checkLabel = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }
