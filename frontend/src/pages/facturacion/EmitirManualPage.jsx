import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, Btn } from '../../components/shared'
import { FormField, Input } from '../../components/forms'
import { EmitirDteModal } from '../../components/facturacion/DteModals'
import { DteItemsEditor } from '../../components/facturacion/DteItemsEditor'
import { useClientes } from '../../api/clientes'
import { toast } from '../../store/notif'

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
  const navigate = useNavigate(); const [receptor, setReceptor] = useState({ rut: '', razonSocial: '', giro: '', direccion: '', comuna: '', ciudad: '' }); const [items, setItems] = useState([]); const [showModal, setShowModal] = useState(false)
  const setField = (field, value) => setReceptor(current => ({ ...current, [field]: value }))
  const selectCliente = cliente => setReceptor({ rut: cliente.rut || '', razonSocial: cliente.razonSocial || cliente.nombre || '', giro: cliente.giro || '', direccion: cliente.direccion || '', comuna: cliente.comuna || '', ciudad: cliente.ciudad || '' })
  const itemsValidos = items.filter(item => item.nombre.trim() && Number(item.cantidad) > 0)
  const ventaSintetica = { id: null, clienteId: null, cliente: receptor, items: itemsValidos.map((item, index) => ({ id: `manual-${index}`, nombre: item.nombre.trim(), descripcion: item.descripcion || null, cantidad: Number(item.cantidad), precioUnitario: Number(item.precioUnitario), exento: item.exento })) }
  return <main className="page page-wide"><PageHeader title="Emitir documento" subtitle="Factura o boleta sin venta asociada" breadcrumb={['Inicio', 'Facturación', 'Emitir documento']} /><div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, maxWidth: 1120 }}><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Receptor</h3><ClienteAutocomplete onSelect={selectCliente} /><div style={grid2}><FormField label="RUT"><Input value={receptor.rut} onChange={value => setField('rut', value)} placeholder="Vacío = consumidor final" /></FormField><FormField label="Razón social / Nombre"><Input value={receptor.razonSocial} onChange={value => setField('razonSocial', value)} /></FormField></div><div style={grid2}><FormField label="Giro"><Input value={receptor.giro} onChange={value => setField('giro', value)} /></FormField><FormField label="Dirección"><Input value={receptor.direccion} onChange={value => setField('direccion', value)} /></FormField></div><div style={{ ...grid2, marginBottom: 20 }}><FormField label="Comuna"><Input value={receptor.comuna} onChange={value => setField('comuna', value)} /></FormField><FormField label="Ciudad"><Input value={receptor.ciudad} onChange={value => setField('ciudad', value)} /></FormField></div><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Ítems</h3><DteItemsEditor items={items} onChange={setItems} /><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}><Btn variant="ghost" onClick={() => navigate('/facturacion/documentos')}>Cancelar</Btn><Btn variant="primary" disabled={!itemsValidos.length} onClick={() => setShowModal(true)}>Continuar a emisión</Btn></div></div>{showModal && <EmitirDteModal venta={ventaSintetica} onClose={() => setShowModal(false)} onSuccess={({ emitido, documento }) => { setShowModal(false); toast.success(`DTE emitido${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`); navigate('/facturacion/documentos') }} />}</main>
}
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }
