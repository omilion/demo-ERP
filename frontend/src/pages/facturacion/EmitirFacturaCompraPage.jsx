import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, Btn } from '../../components/shared'
import { FormField, Input } from '../../components/forms'
import { EmitirDteModal } from '../../components/facturacion/DteModals'
import { useProveedores } from '../../api/proveedores'
import { toast } from '../../store/notif'
import { computeDteTotales, mapVentaItems } from '../../utils/facturacion'

const emptyItem = () => ({ nombre: '', cantidad: 1, precioUnitario: 0, exento: false })
const inputStyle = { width: '100%', padding: 9, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', boxSizing: 'border-box' }
const fmt = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')

function ProveedorAutocomplete({ onSelect }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(timeout)
  }, [query])
  useEffect(() => {
    const onClickOutside = event => { if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const { data, isFetching } = useProveedores(debounced.length >= 2 ? { search: debounced } : {})
  const resultados = debounced.length >= 2 ? (data?.items || []) : []
  return <div ref={boxRef} style={{ position: 'relative', marginBottom: 16 }}>
    <FormField label="Buscar proveedor existente (rellena el receptor)"><Input value={query} onChange={value => { setQuery(value); setOpen(true) }} placeholder="RUT o nombre..." /></FormField>
    {open && debounced.length >= 2 && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px oklch(0 0 0 / .12)', maxHeight: 240, overflowY: 'auto' }}>
      {isFetching && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-3)' }}>Buscando...</div>}
      {!isFetching && !resultados.length && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-3)' }}>Sin resultados</div>}
      {resultados.map(proveedor => <button key={proveedor.id} type="button" onClick={() => { onSelect(proveedor); setQuery(''); setOpen(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}><div style={{ fontWeight: 600 }}>{proveedor.razonSocial || proveedor.nombre}</div><div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>{proveedor.rut}</div></button>)}
    </div>}
  </div>
}

export default function EmitirFacturaCompraPage() {
  const navigate = useNavigate()
  const [proveedor, setProveedor] = useState({ rut: '', razonSocial: '', giro: '', direccion: '', comuna: '', ciudad: '' })
  const [items, setItems] = useState([emptyItem()])
  const [showModal, setShowModal] = useState(false)
  const setField = (field, value) => setProveedor(actual => ({ ...actual, [field]: value }))
  const updateItem = (index, patch) => setItems(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  const addItem = () => setItems(rows => [...rows, emptyItem()])
  const removeItem = index => setItems(rows => rows.filter((_, i) => i !== index))
  const selectProveedor = item => setProveedor({ rut: item.rut || '', razonSocial: item.razonSocial || item.nombre || '', giro: item.giro || '', direccion: item.direccion || '', comuna: item.comuna || '', ciudad: '' })
  const itemsValidos = items.filter(item => item.nombre.trim() && Number(item.cantidad) > 0)
  const totalEstimado = computeDteTotales(mapVentaItems({ items: itemsValidos })).total
  const compraSintetica = {
    id: null,
    clienteId: null,
    // El motor DTE usa la forma de receptor; en una factura de compra ese receptor es el proveedor.
    cliente: proveedor,
    items: itemsValidos.map((item, index) => ({ id: `compra-${index}`, nombre: item.nombre.trim(), cantidad: Number(item.cantidad), precioUnitario: Number(item.precioUnitario), exento: item.exento })),
  }

  return <main className="page">
    <PageHeader title="Emitir factura de compra" subtitle="DTE 46 a un proveedor, sin venta asociada" breadcrumb={['Inicio', 'Facturación', 'Factura de compra']} />
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, maxWidth: 760 }}>
      <div style={{ padding: '10px 12px', marginBottom: 16, borderRadius: 8, background: 'var(--bg)', color: 'var(--text-2)', fontSize: 13 }}>El proveedor es el receptor tributario de esta Factura de Compra Electrónica (tipo 46).</div>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Proveedor</div>
      <ProveedorAutocomplete onSelect={selectProveedor} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}><FormField label="RUT"><Input value={proveedor.rut} onChange={value => setField('rut', value)} placeholder="Ej: 12345678-9" /></FormField><FormField label="Razón social / Nombre"><Input value={proveedor.razonSocial} onChange={value => setField('razonSocial', value)} /></FormField></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}><FormField label="Giro"><Input value={proveedor.giro} onChange={value => setField('giro', value)} /></FormField><FormField label="Dirección"><Input value={proveedor.direccion} onChange={value => setField('direccion', value)} /></FormField></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}><FormField label="Comuna"><Input value={proveedor.comuna} onChange={value => setField('comuna', value)} /></FormField><FormField label="Ciudad"><Input value={proveedor.ciudad} onChange={value => setField('ciudad', value)} /></FormField></div>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Ítems</div>
      {items.map((item, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 1fr 0.6fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
        <div>{index === 0 && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Nombre</label>}<input value={item.nombre} onChange={event => updateItem(index, { nombre: event.target.value })} style={inputStyle} placeholder="Producto o servicio" /></div>
        <div>{index === 0 && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Cant.</label>}<input type="number" min="1" value={item.cantidad} onChange={event => updateItem(index, { cantidad: event.target.value })} style={inputStyle} /></div>
        <div>{index === 0 && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Precio {item.exento ? '' : '(con IVA)'}</label>}<input type="number" min="0" value={item.precioUnitario} onChange={event => updateItem(index, { precioUnitario: event.target.value })} style={inputStyle} /></div>
        <div>{index === 0 && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Exento</label>}<input type="checkbox" checked={item.exento} onChange={event => updateItem(index, { exento: event.target.checked })} style={{ width: 18, height: 18, marginTop: 6 }} /></div>
        <button type="button" onClick={() => removeItem(index)} disabled={items.length === 1} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: items.length === 1 ? 'not-allowed' : 'pointer', opacity: items.length === 1 ? 0.4 : 1, fontSize: 13, padding: '9px 4px' }}>×</button>
      </div>)}
      <button type="button" onClick={addItem} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600, fontSize: 13, padding: 0, marginBottom: 16 }}>+ Agregar ítem</button>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 0', borderTop: '1px solid var(--border)', marginBottom: 20, fontSize: 14 }}><span style={{ color: 'var(--text-3)', marginRight: 8 }}>Total estimado:</span><span style={{ fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fmt(totalEstimado)}</span></div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Btn variant="ghost" onClick={() => navigate('/facturacion/documentos')}>Cancelar</Btn><Btn variant="primary" disabled={!itemsValidos.length || !proveedor.rut || !proveedor.razonSocial} onClick={() => setShowModal(true)}>Continuar a emisión</Btn></div>
    </div>
    {showModal && <EmitirDteModal venta={compraSintetica} tipoDte={46} onClose={() => setShowModal(false)} onSuccess={({ emitido, documento }) => { setShowModal(false); toast.success(`Factura de compra emitida${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`); navigate('/facturacion/documentos') }} />}
  </main>
}
