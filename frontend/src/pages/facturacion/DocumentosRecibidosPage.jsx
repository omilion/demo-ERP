import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn, PageHeader, Table } from '../../components/shared'
import api from '../../api/client'
import { useDocumentosRecibidos, useSincronizarDocumentosRecibidos } from '../../api/facturacion'
import { TIPOS_DTE } from '../../utils/facturacion'
import { buildIngresoMercaderiaPrefill } from '../../utils/facturacion'
import { toast } from '../../store/notif'

const dateFmt = value => value ? new Date(value).toLocaleString('es-CL') : '—'
const fmt = value => '$' + Math.round(Number(value || 0)).toLocaleString('es-CL')
const errorText = error => error?.response?.data?.error || error?.message || 'No se pudo completar la acción.'

export default function DocumentosRecibidosPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useDocumentosRecibidos()
  const sincronizar = useSincronizarDocumentosRecibidos()
  const [selected, setSelected] = useState(null)
  const sync = async () => { try { const result = await sincronizar.mutateAsync(); toast.success(`${result.created} documento(s) recibido(s); ${result.skipped} ya estaban archivados.`); if (result.errors?.length) toast.warning(`${result.errors.length} adjunto(s) no se pudieron procesar.`) } catch (error) { toast.error(errorText(error)) } }
  const openHtml = async id => {
    const popup = window.open('', '_blank')
    if (!popup) return toast.warning('Habilita popups para ver el documento.')
    try { const response = await api.get(`/facturacion/recibidos/${id}/html`, { responseType: 'text' }); popup.document.write(response.data); popup.document.close() } catch (error) { popup.close(); toast.error(errorText(error)) }
  }
  const downloadXml = async row => {
    try { const response = await api.get(`/facturacion/recibidos/${row.id}/xml`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = row.archivoNombre || `DTE-recibido-${row.id}.xml`; link.click(); URL.revokeObjectURL(url) } catch (error) { toast.error(errorText(error)) }
  }
  const puedeIngresar = row => [33, 39, 61].includes(Number(row.tipoDte)) && !row.pagoProveedorId
  const ingresarMercaderia = row => {
    const prefill = buildIngresoMercaderiaPrefill(row)
    if (!prefill) return toast.warning('Este tipo de DTE no se puede ingresar como mercadería.')
    navigate('/stock-ingresos', { state: { prefill } })
  }
  const columns = [
    { key: 'folio', label: 'Folio', render: value => value ?? '—' },
    { key: 'tipoDte', label: 'Tipo', render: value => TIPOS_DTE[value] || `DTE ${value}` },
    { key: 'razonSocialEmisor', label: 'Emisor', render: (value, row) => <div><div style={{ fontWeight: 600 }}>{value || '—'}</div><div style={{ color: 'var(--text-3)', fontSize: 11 }}>{row.rutEmisor || ''}</div></div> },
    { key: 'fechaEmision', label: 'Emisión', render: value => value || '—' },
    { key: 'recibidoEn', label: 'Recibido', render: dateFmt },
    { key: 'totales', label: 'Total', align: 'right', render: value => fmt(value?.total) },
    { key: 'estado', label: 'Estado', render: (value, row) => row.pagoProveedorId ? <Badge tone="green">Ingresado</Badge> : <Badge tone={value === 'visto' ? 'blue' : 'amber'}>{value}</Badge> },
    { key: '_ingresar', label: '', render: (_, row) => puedeIngresar(row) ? <Btn variant="secondary" size="xs" onClick={event => { event.stopPropagation(); ingresarMercaderia(row) }}>Ingresar mercadería</Btn> : null },
  ]
  return <main className="page page-wide">
    <PageHeader title="Documentos recibidos" subtitle="Archivo de DTE XML recibidos en la casilla Gmail de solo lectura" breadcrumb={['Inicio', 'Facturación', 'Documentos recibidos']} actions={<Btn variant="primary" icon="refresh" onClick={sync} disabled={sincronizar.isPending}>{sincronizar.isPending ? 'Sincronizando...' : 'Buscar en Gmail'}</Btn>} />
    <div style={{ padding: '10px 12px', marginBottom: 16, borderRadius: 8, background: 'var(--bg)', color: 'var(--text-2)', fontSize: 13 }}>La sincronización no envía, borra ni modifica correos. Sólo descarga adjuntos XML y evita duplicarlos.</div>
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}><Table columns={columns} rows={data?.documentos || []} onRowClick={row => setSelected(row)} emptyMessage="Aún no hay documentos recibidos." ariaLabel="Documentos recibidos" columnPrefsKey="facturacion-recibidos" loading={isLoading} /></div>
    {selected && <aside style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', justifyContent: 'flex-end' }}><div onClick={() => setSelected(null)} style={{ position: 'absolute', inset: 0, background: 'oklch(0 0 0 / .38)' }} /><div style={{ position: 'relative', width: 480, maxWidth: '100%', padding: 22, background: '#fff', boxShadow: '-8px 0 48px oklch(0 0 0 / .14)' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}><strong>Documento recibido</strong><button onClick={() => setSelected(null)}>×</button></div><div style={{ display: 'grid', gap: 10, fontSize: 13 }}><div><b>Emisor:</b> {selected.razonSocialEmisor || '—'}</div><div><b>RUT:</b> {selected.rutEmisor || '—'}</div><div><b>Correo:</b> {selected.remitente || '—'}</div><div><b>Asunto:</b> {selected.asunto || '—'}</div><div><b>Archivo:</b> {selected.archivoNombre || '—'}</div>{selected.pagoProveedorId && <div><b>Ingreso de mercadería:</b> #{selected.pagoProveedorId}</div>}</div><div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap' }}><Btn variant="secondary" icon="download" onClick={() => downloadXml(selected)}>Descargar XML</Btn><Btn variant="primary" icon="eye" onClick={() => openHtml(selected.id)}>Ver documento</Btn>{puedeIngresar(selected) && <Btn variant="secondary" onClick={() => ingresarMercaderia(selected)}>Ingresar mercadería</Btn>}</div></div></aside>}
  </main>
}
