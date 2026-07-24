import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, Btn } from '../../components/shared'
import { FormField, Input } from '../../components/forms'
import { EmitirDteModal } from '../../components/facturacion/DteModals'
import { DteItemsEditor } from '../../components/facturacion/DteItemsEditor'
import { useClientes } from '../../api/clientes'
import { computeDteTotales, mapManualDteItems, TIPOS_DTE } from '../../utils/facturacion'
import { toast } from '../../store/notif'

const TIPOS_EMISION = [
  { id: 33, ayuda: 'Venta afecta con IVA' },
  { id: 39, ayuda: 'Venta directa al cliente' },
  { id: 52, ayuda: 'Traslado o entrega de mercadería' },
  { id: 56, ayuda: 'Aumenta o corrige un documento emitido' },
  { id: 61, ayuda: 'Anula o rebaja un documento emitido' },
]

function ClienteAutocomplete({ onSelect }) {
  const [query, setQuery] = useState(''); const [debounced, setDebounced] = useState(''); const [open, setOpen] = useState(false); const boxRef = useRef(null)
  useEffect(() => { const timeout = setTimeout(() => setDebounced(query.trim()), 300); return () => clearTimeout(timeout) }, [query])
  useEffect(() => { const close = event => { if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false) }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close) }, [])
  const { data, isFetching } = useClientes({ search: debounced, limit: 8 }, { enabled: debounced.length >= 2 }); const items = debounced.length >= 2 ? data?.items || [] : []
  return <div ref={boxRef} style={{ position: 'relative', marginBottom: 16 }}><FormField label="Buscar cliente existente (rellena el receptor)"><Input value={query} onChange={value => { setQuery(value); setOpen(true) }} placeholder="RUT o nombre..." /></FormField>{open && debounced.length >= 2 && <div style={dropdownStyle}>{isFetching && <Result>Buscando...</Result>}{!isFetching && !items.length && <Result>Sin resultados</Result>}{items.map(item => <button key={item.id} type="button" onClick={() => { onSelect(item); setQuery(''); setOpen(false) }} style={resultButton}><b>{item.razonSocial || item.nombre}</b><small>{item.rut}</small></button>)}</div>}</div>
}
const dropdownStyle = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px oklch(0 0 0 / .12)', maxHeight: 240, overflowY: 'auto' }
const resultButton = { display: 'grid', width: '100%', gap: 2, padding: '8px 10px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }
const Result = ({ children }) => <div style={{ padding: 10, color: 'var(--text-3)', fontSize: 12 }}>{children}</div>

export default function EmitirManualPage() {
  const navigate = useNavigate()
  const [tipoDte, setTipoDte] = useState(33)
  const [receptor, setReceptor] = useState({ rut: '', razonSocial: '', giro: '', direccion: '', comuna: '', ciudad: '' })
  const [items, setItems] = useState([])
  const [showModal, setShowModal] = useState(false)
  const esNota = [56, 61].includes(tipoDte)
  const esGuia = tipoDte === 52
  const setField = (field, value) => setReceptor(current => ({ ...current, [field]: value }))
  const selectCliente = cliente => setReceptor({ rut: cliente.rut || '', razonSocial: cliente.razonSocial || cliente.nombre || '', giro: cliente.giro || '', direccion: cliente.direccion || '', comuna: cliente.comuna || '', ciudad: cliente.ciudad || '' })
  const itemsDte = useMemo(() => mapManualDteItems(items), [items])
  const totales = useMemo(() => computeDteTotales(itemsDte), [itemsDte])
  const receptorInformado = receptor.rut.trim() && receptor.razonSocial.trim()
  const puedeContinuar = itemsDte.length > 0 && (esGuia || receptorInformado)
  const ventaSintetica = { id: null, clienteId: null, cliente: receptor, items: [] }
  const seleccion = TIPOS_EMISION.find(tipo => tipo.id === tipoDte)

  return <main className="page page-wide">
    <PageHeader title="Emitir documento" subtitle={`${TIPOS_DTE[tipoDte]} sin venta asociada`} breadcrumb={['Inicio', 'Facturación', 'Emitir documento']} />
    <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, maxWidth: 1120, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 10 }}>1. Tipo de documento</div>
      <div role="group" aria-label="Tipo de documento" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 8 }}>
        {TIPOS_EMISION.map(tipo => <button key={tipo.id} type="button" onClick={() => setTipoDte(tipo.id)} aria-pressed={tipo.id === tipoDte} style={{ padding: '11px 12px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', border: tipo.id === tipoDte ? '2px solid var(--blue)' : '1px solid var(--border)', background: tipo.id === tipoDte ? 'var(--blue-50)' : '#fff', color: 'var(--text)' }}><span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{tipo.id} · {TIPOS_DTE[tipo.id]}</span><span style={{ display: 'block', marginTop: 3, color: 'var(--text-2)', fontSize: 11 }}>{tipo.ayuda}</span></button>)}
      </div>
      {esNota && <div style={infoStyle}><strong>Primero referencia el documento que vas a corregir.</strong> Al continuar, el confirmador abre con el buscador de venta por RUT u orden interna. Puedes agregar 3 o más referencias; no es obligatorio porque el SII admite casos sin referencia.</div>}
      {esGuia && <div style={infoStyle}><strong>Guía de despacho:</strong> al confirmar debes indicar motivo de traslado y tipo de despacho. Si eliges “traslado interno”, el sistema usará al emisor como receptor.</div>}
      {!esNota && !esGuia && <div style={infoStyle}>Seleccionaste <strong>{seleccion?.ayuda?.toLowerCase()}</strong>. Completa el receptor y los ítems antes de confirmar.</div>}
    </section>
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, maxWidth: 1120 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>2. Receptor</h3>{esGuia && <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Opcional sólo para traslado interno</span>}</div>
      <ClienteAutocomplete onSelect={selectCliente} />
      <div style={grid2}><FormField label="RUT"><Input value={receptor.rut} onChange={value => setField('rut', value)} placeholder={esGuia ? 'Requerido salvo traslado interno' : 'RUT del receptor'} /></FormField><FormField label="Razón social / Nombre"><Input value={receptor.razonSocial} onChange={value => setField('razonSocial', value)} /></FormField></div>
      <div style={grid2}><FormField label="Giro"><Input value={receptor.giro} onChange={value => setField('giro', value)} /></FormField><FormField label="Dirección"><Input value={receptor.direccion} onChange={value => setField('direccion', value)} /></FormField></div>
      <div style={{ ...grid2, marginBottom: 20 }}><FormField label="Comuna"><Input value={receptor.comuna} onChange={value => setField('comuna', value)} /></FormField><FormField label="Ciudad"><Input value={receptor.ciudad} onChange={value => setField('ciudad', value)} /></FormField></div>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>3. Ítems</h3>
      <DteItemsEditor items={items} onChange={setItems} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 22 }}><span style={{ color: 'var(--text-3)', fontSize: 12 }}>{!esGuia && !receptorInformado ? 'Falta informar RUT y razón social del receptor.' : `${itemsDte.length} ítem${itemsDte.length === 1 ? '' : 's'} listo${itemsDte.length === 1 ? '' : 's'} · Total ${Math.round(totales.total).toLocaleString('es-CL')}`}</span><div style={{ display: 'flex', gap: 8 }}><Btn variant="ghost" onClick={() => navigate('/facturacion/documentos')}>Cancelar</Btn><Btn variant="primary" disabled={!puedeContinuar} onClick={() => setShowModal(true)}>Continuar a emisión</Btn></div></div>
    </div>
    {showModal && <EmitirDteModal venta={ventaSintetica} tipoDte={tipoDte} documentInput={{ items: itemsDte }} previewItems={itemsDte} previewTotales={totales} referenceFirst={esNota} onClose={() => setShowModal(false)} onSuccess={({ emitido, documento }) => { setShowModal(false); toast.success(`DTE emitido${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`); navigate('/facturacion/documentos') }} />}
  </main>
}

const grid2 = { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }
const infoStyle = { marginTop: 14, padding: '10px 12px', borderRadius: 8, background: 'var(--bg)', color: 'var(--text-2)', fontSize: 13 }
