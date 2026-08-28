import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { useConsultarEstado, useDocumento, useDocumentos, useEnviarDocumento, useEnviarLote, useReenviarDocumento, useTrazabilidadExcepciones } from '../../api/facturacion'
import { can, ventaPath } from '../../utils/permissions'
import { useAuthStore } from '../../store/auth'
import { TIPOS_DTE } from '../../utils/facturacion'
import { downloadDteXml, openDtePdf } from '../../utils/dteDocuments'
import { confirmDialog, toast } from '../../store/notif'

const ESTADO_TABS = [
  { id: 'all', label: 'Todos' }, { id: 'borrador', label: 'Borrador' }, { id: 'emitido', label: 'Emitido' },
  { id: 'enviado', label: 'Enviado' }, { id: 'aceptado', label: 'Aceptado' }, { id: 'rechazado', label: 'Rechazado' }, { id: 'error', label: 'Error' },
]
const TIPO_OPTIONS = [{ value: '', label: 'Todos los tipos' }, ...Object.entries(TIPOS_DTE).map(([value, label]) => ({ value, label }))]
const ESTADO_TONE = { borrador: 'gray', emitido: 'blue', enviado: 'amber', aceptado: 'green', rechazado: 'red', error: 'red' }
const fmt = value => '$' + Math.round(Number(value || 0)).toLocaleString('es-CL')
const dateFmt = value => value ? new Date(value).toLocaleDateString('es-CL') : '—'
const errorText = error => error?.response?.data?.error || error?.message || 'No se pudo completar la acción.'
const EXCEPCION_LABEL = {
  SIN_INTERNO: 'Sin N° interno',
  SIN_GUIA: 'Sin guía',
  GUIA_SIN_DTE: 'Guía sin DTE 52',
  SIN_DTE_VENTA: 'Sin factura o boleta',
}

function TrazabilidadExcepciones({ navigate, user }) {
  const [expanded, setExpanded] = useState(false)
  const { data = { items: [], total: 0, revisadas: 0, porCodigo: {} }, isLoading, isError, error } = useTrazabilidadExcepciones()
  return (
    <section style={tracePanelStyle} aria-label="Excepciones de trazabilidad de facturación">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><strong>Trazabilidad venta → guía → DTE</strong>{!isLoading && !isError && <Badge tone={data.total ? 'amber' : 'green'}>{data.total} con excepción</Badge>}</div>
          <p style={{ margin: '4px 0 0', color: 'var(--text-3)', fontSize: 12 }}>{isLoading ? 'Revisando cadenas documentales…' : isError ? errorText(error) : `${data.revisadas} ventas recientes revisadas automáticamente.`}</p>
        </div>
        {!isLoading && !isError && Boolean(data.items.length) && <Btn variant="secondary" size="sm" onClick={() => setExpanded(value => !value)}>{expanded ? 'Ocultar informe' : 'Revisar excepciones'}</Btn>}
      </div>
      {!isLoading && !isError && Boolean(data.items.length) && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{Object.entries(data.porCodigo || {}).map(([code, count]) => <Badge key={code} tone="gray">{EXCEPCION_LABEL[code] || code}: {count}</Badge>)}</div>}
      {expanded && <div style={{ overflowX: 'auto', marginTop: 12 }}><table style={traceTableStyle}><thead><tr><th>Venta</th><th>Tipo</th><th>Guías</th><th>Documentos</th><th>Excepciones</th><th /></tr></thead><tbody>{data.items.map(item => <tr key={item.orden.id}><td><strong>{item.orden.nInterno ? `Interno ${item.orden.nInterno}` : `Venta #${item.orden.id}`}</strong><span>Venta #{item.orden.id}</span></td><td>{item.orden.tipo || '—'}</td><td>{item.guias.length}</td><td>{item.documentosVenta.length}</td><td>{item.excepciones.map(exception => <div key={`${exception.codigo}-${exception.guiaId || ''}`} style={{ color: 'var(--red)', fontSize: 11 }}>{EXCEPCION_LABEL[exception.codigo] || exception.detalle}</div>)}</td><td><button type="button" onClick={() => navigate(ventaPath(item.orden.id, user))} style={actionButtonStyle}>Abrir venta</button></td></tr>)}</tbody></table></div>}
    </section>
  )
}

function DocumentoDetail({ id, onClose }) {
  const { data: documento, isLoading } = useDocumento(id)
  const reenviar = useReenviarDocumento()
  const [correoReenvio, setCorreoReenvio] = useState('')
  const [correoSyncId, setCorreoSyncId] = useState(null)
  // Ajuste de estado durante el render (no en un efecto): cuando llega un
  // documento nuevo se precarga su correo una sola vez, sin pisar lo que el
  // usuario ya haya escrito a mano en el campo.
  if (documento && documento.id !== correoSyncId) {
    setCorreoSyncId(documento.id)
    setCorreoReenvio(documento.receptor?.email || '')
  }
  const descargarXml = async () => {
    try {
      await downloadDteXml(documento)
    } catch (error) { toast.error(errorText(error)) }
  }
  const verPdf = async () => {
    try {
      await openDtePdf(documento)
    } catch (error) { toast.error(errorText(error)) }
  }
  const reenviarCorreo = async () => {
    try {
      const result = await reenviar.mutateAsync({ id: documento.id, to: correoReenvio.trim() })
      toast.success(`Documento reenviado a ${result.to?.join(', ') || correoReenvio}.`)
    } catch (error) { toast.error(errorText(error)) }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'oklch(0 0 0 / .38)' }} />
      <aside style={{ position: 'relative', width: 520, maxWidth: '100%', background: '#fff', boxShadow: '-8px 0 48px oklch(0 0 0 / .14)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontWeight: 700, fontSize: 17 }}>Documento DTE</div><div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{documento?.folio ? `Folio ${documento.folio}` : 'Sin folio asignado'}</div></div>
          <button onClick={onClose} style={{ color: 'var(--text-3)', padding: 6 }}>×</button>
        </div>
        <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
          {isLoading ? <div style={{ color: 'var(--text-3)' }}>Cargando documento...</div> : documento && <>
            <Detail label="Tipo" value={TIPOS_DTE[documento.tipoDte] || `DTE ${documento.tipoDte}`} />
            <Detail label="Estado" value={<Badge tone={ESTADO_TONE[documento.estado] || 'gray'}>{documento.estado}</Badge>} />
            <Detail label="Fecha emisión" value={dateFmt(documento.fechaEmision)} />
            <Detail label="Emitido por" value={documento.usuarioNombre || '—'} />
            <Detail label="Receptor" value={documento.receptor?.razonSocial || '—'} />
            <Detail label="RUT" value={documento.receptor?.rut || '—'} />
            <Detail label="Total" value={fmt(documento.totales?.total)} />
            {documento.estadoDetalle && <div style={{ marginTop: 14, padding: 12, background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 8, fontSize: 12 }}>{documento.estadoDetalle}</div>}
          </>}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="secondary" icon="download" onClick={descargarXml} disabled={!documento?.xml}>Descargar XML</Btn>
            <Btn variant="primary" icon="eye" onClick={verPdf} disabled={!documento?.xml}>Ver PDF</Btn>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="email" value={correoReenvio} onChange={event => setCorreoReenvio(event.target.value)} placeholder="Correo del cliente" style={{ flex: 1, padding: 9, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit' }} />
            <Btn variant="secondary" icon="send" onClick={reenviarCorreo} disabled={!documento?.xml || !correoReenvio.trim() || reenviar.isPending}>{reenviar.isPending ? 'Enviando...' : 'Reenviar'}</Btn>
          </div>
        </div>
      </aside>
    </div>
  )
}

const Detail = ({ label, value }) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}><span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{label}</span><span style={{ textAlign: 'right' }}>{value}</span></div>

export default function DocumentosPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canWrite = can(user, 'facturacion', 'write')
  const enviarDocumento = useEnviarDocumento()
  const enviarLote = useEnviarLote()
  const consultarEstado = useConsultarEstado()
  const [tab, setTab] = useState('all')
  const [tipoDte, setTipoDte] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [resultadoLote, setResultadoLote] = useState([])
  const debounceRef = useRef(null)
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search])
  const params = { ...(tab !== 'all' ? { estado: tab } : {}), ...(tipoDte ? { tipoDte } : {}) }
  const { data, isLoading } = useDocumentos(params)
  const documents = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase()
    return (data?.documentos || []).filter(doc => !needle || [doc.folio, doc.receptor?.razonSocial, doc.receptor?.rut, TIPOS_DTE[doc.tipoDte]].join(' ').toLowerCase().includes(needle))
  }, [data, debouncedSearch])
  const limit = 50
  const pages = Math.max(1, Math.ceil(documents.length / limit))
  const activePage = Math.min(page, pages)
  const visible = documents.slice((activePage - 1) * limit, activePage * limit)
  const pendientes = documents.filter(doc => doc.estado === 'emitido')
  const enSeguimientoIds = visible.filter(doc => doc.estado === 'enviado').map(doc => doc.id).join(',')
  // mutate (no la mutation completa) es estable entre renders — se guarda en
  // un ref (actualizado en un efecto, no durante el render) para que el
  // intervalo no se recree cada vez que cambia isPending.
  const consultarMutateRef = useRef(consultarEstado.mutate)
  useEffect(() => { consultarMutateRef.current = consultarEstado.mutate }, [consultarEstado.mutate])
  // Seguimiento automatico: mientras haya documentos "enviado" visibles, se
  // reconsulta su estado cada 20s sin que el usuario tenga que acordarse de
  // apretar "Consultar estado" uno por uno.
  useEffect(() => {
    if (!enSeguimientoIds) return
    const ids = enSeguimientoIds.split(',')
    const interval = setInterval(() => {
      ids.forEach(id => consultarMutateRef.current(id))
    }, 20000)
    return () => clearInterval(interval)
  }, [enSeguimientoIds])
  const enviarUno = async (event, doc) => {
    event.stopPropagation()
    if (!await confirmDialog({ title: 'Enviar al SII', detail: `Enviar ${TIPOS_DTE[doc.tipoDte] || 'DTE'} folio ${doc.folio} al SII?` })) return
    try {
      const result = await enviarDocumento.mutateAsync(doc.id)
      toast.success(`Documento enviado al SII. Track ID: ${result.trackId}`)
    } catch (error) { toast.error(errorText(error)) }
  }
  const consultarUno = async (event, doc) => {
    event.stopPropagation()
    try {
      const result = await consultarEstado.mutateAsync(doc.id)
      toast.success(`Estado SII: ${result.documento?.estado || doc.estado}`)
    } catch (error) { toast.error(errorText(error)) }
  }
  const enviarPendientes = async () => {
    if (!pendientes.length) return
    if (!await confirmDialog({ title: 'Enviar pendientes al SII', detail: `Se enviaran ${pendientes.length} documento(s) que coinciden con los filtros actuales, separando boletas del resto.` })) return
    try {
      const result = await enviarLote.mutateAsync(pendientes.map(doc => doc.id))
      setResultadoLote(result.resultados || [])
      if (result.fallidos) toast.error(`${result.exitosos} enviado(s); ${result.fallidos} con error. Revisa el detalle.`)
      else toast.success(`${result.exitosos} documento(s) enviados al SII.`)
    } catch (error) {
      setResultadoLote([])
      toast.error(errorText(error))
    }
  }
  const columns = [
    { key: 'folio', label: 'Folio', render: value => value || '—' },
    { key: 'tipoDte', label: 'Tipo', render: value => TIPOS_DTE[value] || `DTE ${value}` },
    { key: 'fechaEmision', label: 'Fecha emisión', render: dateFmt },
    { key: 'receptor', label: 'Receptor', render: value => <div><div style={{ fontWeight: 600 }}>{value?.razonSocial || '—'}</div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{value?.rut || ''}</div></div> },
    { key: 'totales', label: 'Total', align: 'right', render: value => fmt(value?.total) },
    {
      key: 'estado', label: 'Estado', render: (value, row) => (
        <div>
          <Badge tone={ESTADO_TONE[value] || 'gray'}>{value}</Badge>
          {row.trackId && value === 'enviado' && <div style={{ marginTop: 3, fontSize: 10, color: 'var(--text-3)' }}>Track {row.trackId}</div>}
          {row.estadoDetalle && (value === 'rechazado' || value === 'error') && (
            <div style={{ marginTop: 3, fontSize: 10, color: 'var(--red)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.estadoDetalle}>{row.estadoDetalle}</div>
          )}
        </div>
      ),
    },
    { key: 'ordenId', label: 'Venta', render: value => value ? <button onClick={event => { event.stopPropagation(); navigate(ventaPath(value, user)) }} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600 }}>#{value}</button> : '—' },
    { key: '_actions', label: 'Accion', required: true, width: 180, render: (_, row) => <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{canWrite && row.estado === 'emitido' && <button type="button" onClick={event => enviarUno(event, row)} disabled={enviarDocumento.isPending} style={actionButtonStyle}>Enviar al SII</button>}{row.estado === 'enviado' && <button type="button" onClick={event => consultarUno(event, row)} disabled={consultarEstado.isPending} style={actionButtonStyle}>Consultar estado</button>}</div> },
  ]
  return <main className="page page-wide">
    {!!resultadoLote.length && <section style={resultPanelStyle}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><strong>Resultado del ultimo envio masivo</strong><button type="button" onClick={() => setResultadoLote([])} style={{ border: 0, background: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>Cerrar</button></div><div style={{ display: 'grid', gap: 6, marginTop: 10 }}>{resultadoLote.map(result => <div key={result.id} style={{ display: 'grid', gridTemplateColumns: '90px 90px minmax(180px, 1fr)', gap: 10, fontSize: 12 }}><span>Folio {result.folio || '-'}</span><strong style={{ color: result.ok ? 'var(--green-700)' : 'var(--red)' }}>{result.ok ? 'Enviado' : 'Error'}</strong><span style={{ color: 'var(--text-2)' }}>{result.ok ? `Track ${result.trackId}` : result.error}</span></div>)}</div></section>}
    <PageHeader title="Documentos Emitidos" subtitle="Facturación electrónica DTE/SII" breadcrumb={['Inicio', 'Facturación', 'Documentos emitidos']} actions={<Btn variant="primary" icon="plus" onClick={() => navigate('/facturacion/emitir')}>Emitir documento</Btn>} />
    <TrazabilidadExcepciones navigate={navigate} user={user} />
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <Table columns={columns} rows={visible} onRowClick={row => setSelected(row.id)} emptyMessage="No hay documentos para estos filtros" ariaLabel="Documentos emitidos" columnPrefsKey="facturacion-documentos" toolbarExtra={<div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', width: '100%' }}><Tabs tabs={ESTADO_TABS} active={tab} onChange={value => { setTab(value); setPage(1) }} style={{ marginBottom: 0 }} /><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{canWrite && !!pendientes.length && <Btn variant="secondary" onClick={enviarPendientes} disabled={enviarLote.isPending}>Enviar pendientes ({pendientes.length})</Btn>}<select value={tipoDte} onChange={event => { setTipoDte(event.target.value); setPage(1) }} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13 }}>{TIPO_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><SearchBar value={search} onChange={value => { setSearch(value); setPage(1) }} placeholder="Buscar folio o receptor..." style={{ width: 260 }} /></div></div>} pager={{ page: activePage, pages, total: documents.length, limit, shown: visible.length, onChange: setPage, disabled: isLoading }} />
    </div>
    {selected && <DocumentoDetail id={selected} onClose={() => setSelected(null)} />}
  </main>
}

const actionButtonStyle = { border: '1px solid var(--border)', borderRadius: 6, background: '#fff', color: 'var(--blue)', padding: '5px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }
const resultPanelStyle = { marginBottom: 14, padding: 14, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }
const tracePanelStyle = { marginBottom: 14, padding: 16, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }
const traceTableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
