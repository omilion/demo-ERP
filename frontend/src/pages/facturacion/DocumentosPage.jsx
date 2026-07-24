import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { useConsultarEstado, useDocumento, useDocumentos, useEnviarDocumento, useEnviarLote } from '../../api/facturacion'
import api from '../../api/client'
import { can, ventaPath } from '../../utils/permissions'
import { useAuthStore } from '../../store/auth'
import { TIPOS_DTE } from '../../utils/facturacion'
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

function DocumentoDetail({ id, onClose }) {
  const { data: documento, isLoading } = useDocumento(id)
  const descargarXml = async () => {
    try {
      const response = await api.get(`/facturacion/documentos/${id}/xml`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `DTE-${documento?.folio || id}.xml`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) { toast.error(errorText(error)) }
  }
  const verHtml = async () => {
    const popup = window.open('', '_blank')
    if (!popup) { toast.warning('Habilita popups para ver el documento.'); return }
    try {
      const response = await api.get(`/facturacion/documentos/${id}/html`, { responseType: 'text' })
      popup.document.open()
      popup.document.write(response.data)
      popup.document.close()
    } catch (error) {
      popup.close()
      toast.error(errorText(error))
    }
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
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="secondary" icon="download" onClick={descargarXml} disabled={!documento?.xml}>Descargar XML</Btn>
          <Btn variant="primary" icon="eye" onClick={verHtml} disabled={!documento?.xml}>Ver HTML</Btn>
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
    { key: 'estado', label: 'Estado', render: value => <Badge tone={ESTADO_TONE[value] || 'gray'}>{value}</Badge> },
    { key: 'ordenId', label: 'Venta', render: value => value ? <button onClick={event => { event.stopPropagation(); navigate(ventaPath(value, user)) }} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600 }}>#{value}</button> : '—' },
    { key: '_actions', label: 'Accion', required: true, width: 180, render: (_, row) => <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{canWrite && row.estado === 'emitido' && <button type="button" onClick={event => enviarUno(event, row)} disabled={enviarDocumento.isPending} style={actionButtonStyle}>Enviar al SII</button>}{row.estado === 'enviado' && <button type="button" onClick={event => consultarUno(event, row)} disabled={consultarEstado.isPending} style={actionButtonStyle}>Consultar estado</button>}</div> },
  ]
  return <main className="page page-wide">
    {!!resultadoLote.length && <section style={resultPanelStyle}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><strong>Resultado del ultimo envio masivo</strong><button type="button" onClick={() => setResultadoLote([])} style={{ border: 0, background: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>Cerrar</button></div><div style={{ display: 'grid', gap: 6, marginTop: 10 }}>{resultadoLote.map(result => <div key={result.id} style={{ display: 'grid', gridTemplateColumns: '90px 90px minmax(180px, 1fr)', gap: 10, fontSize: 12 }}><span>Folio {result.folio || '-'}</span><strong style={{ color: result.ok ? 'var(--green-700)' : 'var(--red)' }}>{result.ok ? 'Enviado' : 'Error'}</strong><span style={{ color: 'var(--text-2)' }}>{result.ok ? `Track ${result.trackId}` : result.error}</span></div>)}</div></section>}
    <PageHeader title="Documentos Emitidos" subtitle="Facturación electrónica DTE/SII" breadcrumb={['Inicio', 'Facturación', 'Documentos emitidos']} actions={<Btn variant="primary" icon="plus" onClick={() => navigate('/facturacion/emitir')}>Emitir documento</Btn>} />
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <Table columns={columns} rows={visible} onRowClick={row => setSelected(row.id)} emptyMessage="No hay documentos para estos filtros" ariaLabel="Documentos emitidos" columnPrefsKey="facturacion-documentos" toolbarExtra={<div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', width: '100%' }}><Tabs tabs={ESTADO_TABS} active={tab} onChange={value => { setTab(value); setPage(1) }} style={{ marginBottom: 0 }} /><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{canWrite && !!pendientes.length && <Btn variant="secondary" onClick={enviarPendientes} disabled={enviarLote.isPending}>Enviar pendientes ({pendientes.length})</Btn>}<select value={tipoDte} onChange={event => { setTipoDte(event.target.value); setPage(1) }} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13 }}>{TIPO_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><SearchBar value={search} onChange={value => { setSearch(value); setPage(1) }} placeholder="Buscar folio o receptor..." style={{ width: 260 }} /></div></div>} pager={{ page: activePage, pages, total: documents.length, limit, shown: visible.length, onChange: setPage, disabled: isLoading }} />
    </div>
    {selected && <DocumentoDetail id={selected} onClose={() => setSelected(null)} />}
  </main>
}

const actionButtonStyle = { border: '1px solid var(--border)', borderRadius: 6, background: '#fff', color: 'var(--blue)', padding: '5px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }
const resultPanelStyle = { marginBottom: 14, padding: 14, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }
