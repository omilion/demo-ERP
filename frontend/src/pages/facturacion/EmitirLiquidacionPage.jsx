import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, Btn } from '../../components/shared'
import { FormField, Input } from '../../components/forms'
import { EmitirDteModal } from '../../components/facturacion/DteModals'
import { useClientes } from '../../api/clientes'
import { useProveedores } from '../../api/proveedores'
import { toast } from '../../store/notif'
import { buildLiquidacionInput, TIPOS_DTE } from '../../utils/facturacion'

const inputStyle = { width: '100%', padding: 9, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', boxSizing: 'border-box' }
const emptyDetalle = () => ({ tpoDocLiq: 33, codigo: '', nombre: '', descripcion: '', cantidad: 1, unidad: 'UN', precio: '', monto: 0, exento: false })
const emptyComision = () => ({ tipoMovim: 'C', glosa: '', tasaComision: '', valComNeto: 0, valComExe: 0, valComIva: '' })
const emptyTotales = { neto: '', exento: '', tasaIva: 19, iva: '', ivaProp: '', ivaTerc: '', valComNeto: '', valComExe: '', valComIva: '', total: '' }
const LIQUIDABLE_TYPES = [30, 33, 34, 35, 39, 41, 48]

const Numeric = ({ value, onChange, ...props }) => <input type="number" value={value} onChange={event => onChange(event.target.value)} style={inputStyle} {...props} />

function ContraparteAutocomplete({ onSelect }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  useEffect(() => { const timeout = setTimeout(() => setDebounced(query.trim()), 300); return () => clearTimeout(timeout) }, [query])
  useEffect(() => { const onOutside = event => { if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false) }; document.addEventListener('mousedown', onOutside); return () => document.removeEventListener('mousedown', onOutside) }, [])
  const enabled = debounced.length >= 2
  const clientes = useClientes({ search: debounced, limit: 8 }, { enabled })
  const proveedores = useProveedores(enabled ? { search: debounced } : {})
  const resultados = enabled ? [
    ...(clientes.data?.items || []).map(item => ({ ...item, origen: 'Cliente' })),
    ...(proveedores.data?.items || []).map(item => ({ ...item, origen: 'Proveedor' })),
  ] : []
  return <div ref={boxRef} style={{ position: 'relative', marginBottom: 16 }}>
    <FormField label="Buscar contraparte existente (cliente o proveedor)"><Input value={query} onChange={value => { setQuery(value); setOpen(true) }} placeholder="RUT o nombre..." /></FormField>
    {open && enabled && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px oklch(0 0 0 / .12)', maxHeight: 240, overflowY: 'auto' }}>
      {(clientes.isFetching || proveedores.isFetching) && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-3)' }}>Buscando...</div>}
      {!clientes.isFetching && !proveedores.isFetching && !resultados.length && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-3)' }}>Sin resultados</div>}
      {resultados.map((item, index) => <button key={`${item.origen}-${item.id || index}`} type="button" onClick={() => { onSelect(item); setQuery(''); setOpen(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}><div style={{ fontWeight: 600 }}>{item.razonSocial || item.nombre}</div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.origen} · {item.rut}</div></button>)}
    </div>}
  </div>
}

export default function EmitirLiquidacionPage() {
  const navigate = useNavigate()
  const [receptor, setReceptor] = useState({ rut: '', razonSocial: '', giro: '', contacto: '', email: '', direccion: '', comuna: '', ciudad: '' })
  const [rutMandante, setRutMandante] = useState('')
  const [detalles, setDetalles] = useState([emptyDetalle()])
  const [comisiones, setComisiones] = useState([])
  const [totales, setTotales] = useState(emptyTotales)
  const [showModal, setShowModal] = useState(false)
  const setReceptorField = (field, value) => setReceptor(current => ({ ...current, [field]: value }))
  const selectContraparte = item => setReceptor({ rut: item.rut || '', razonSocial: item.razonSocial || item.nombre || '', giro: item.giro || '', contacto: item.contacto || '', email: item.email || '', direccion: item.direccion || '', comuna: item.comuna || '', ciudad: item.ciudad || '' })
  const updateDetalle = (index, patch) => setDetalles(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  const updateComision = (index, patch) => setComisiones(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  const detallesValidos = detalles.filter(row => row.nombre.trim() && row.tpoDocLiq && row.monto !== '')
  const normalizados = detallesValidos.map(row => ({ ...row, tpoDocLiq: Number(row.tpoDocLiq), cantidad: row.cantidad === '' ? undefined : Number(row.cantidad), precio: row.precio === '' ? undefined : Number(row.precio), monto: Number(row.monto), exento: Boolean(row.exento) }))
  const comisionesNormalizadas = comisiones.filter(row => row.glosa.trim()).map(row => ({ ...row, tasaComision: row.tasaComision === '' ? undefined : Number(row.tasaComision), valComNeto: Number(row.valComNeto || 0), valComExe: Number(row.valComExe || 0), valComIva: row.valComIva === '' ? undefined : Number(row.valComIva) }))
  const totalesNormalizados = Object.fromEntries(Object.entries(totales).map(([key, value]) => [key, value === '' ? undefined : Number(value)]))
  const documentInput = buildLiquidacionInput({ detalles: normalizados, comisiones: comisionesNormalizadas, totales: totalesNormalizados, rutMandante: rutMandante.trim() })
  const previewItems = normalizados.map(row => ({ nombre: row.nombre, cantidad: 1, precio: row.monto, exento: row.exento }))
  const previewTotales = { neto: Number(totales.neto || 0), exento: Number(totales.exento || 0), iva: Number(totales.iva || 0), total: Number(totales.total || 0) }
  const puedeContinuar = receptor.rut && receptor.razonSocial && detallesValidos.length > 0 && totales.total !== ''
  const ventaSintetica = { id: null, clienteId: null, cliente: receptor, items: [] }

  return <main className="page page-wide">
    <PageHeader title="Emitir liquidación factura" subtitle="DTE 43: detalle de documentos liquidados y comisiones" breadcrumb={['Inicio', 'Facturación', 'Liquidación']} />
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, maxWidth: 1080 }}>
      <div style={{ padding: '10px 12px', marginBottom: 18, borderRadius: 8, background: 'var(--bg)', color: 'var(--text-2)', fontSize: 13 }}>Los totales se ingresan desde la liquidación real: no se calculan automáticamente desde las líneas.</div>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Contraparte</h3>
      <ContraparteAutocomplete onSelect={selectContraparte} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}><FormField label="RUT"><Input value={receptor.rut} onChange={value => setReceptorField('rut', value)} /></FormField><FormField label="Razón social"><Input value={receptor.razonSocial} onChange={value => setReceptorField('razonSocial', value)} /></FormField></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}><FormField label="Giro"><Input value={receptor.giro} onChange={value => setReceptorField('giro', value)} /></FormField><FormField label="Contacto"><Input value={receptor.contacto} onChange={value => setReceptorField('contacto', value)} /></FormField><FormField label="Correo"><Input value={receptor.email} onChange={value => setReceptorField('email', value)} /></FormField></div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginTop: 12, marginBottom: 18 }}><FormField label="Dirección"><Input value={receptor.direccion} onChange={value => setReceptorField('direccion', value)} /></FormField><FormField label="Comuna"><Input value={receptor.comuna} onChange={value => setReceptorField('comuna', value)} /></FormField><FormField label="Ciudad"><Input value={receptor.ciudad} onChange={value => setReceptorField('ciudad', value)} /></FormField></div>
      <FormField label="RUT mandante (opcional)"><Input value={rutMandante} onChange={setRutMandante} placeholder="Sólo si Plastimar actúa como mandatario" /></FormField>

      <h3 style={{ margin: '22px 0 10px', fontSize: 15 }}>Documentos liquidados</h3>
      {detalles.map((row, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '100px 1.5fr .7fr .7fr 1fr 90px auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
        <div><label style={{ fontSize: 11 }}>Tipo</label><select value={row.tpoDocLiq} onChange={event => updateDetalle(index, { tpoDocLiq: event.target.value })} style={inputStyle}>{LIQUIDABLE_TYPES.map(tipo => <option key={tipo} value={tipo}>{tipo} — {TIPOS_DTE[tipo] || 'Documento'}</option>)}</select></div>
        <div><label style={{ fontSize: 11 }}>Descripción</label><input value={row.nombre} onChange={event => updateDetalle(index, { nombre: event.target.value })} style={inputStyle} /></div>
        <div><label style={{ fontSize: 11 }}>Cantidad</label><Numeric value={row.cantidad} onChange={value => updateDetalle(index, { cantidad: value })} min="0" /></div>
        <div><label style={{ fontSize: 11 }}>Unidad</label><input value={row.unidad} onChange={event => updateDetalle(index, { unidad: event.target.value })} style={inputStyle} /></div>
        <div><label style={{ fontSize: 11 }}>Monto línea</label><Numeric value={row.monto} onChange={value => updateDetalle(index, { monto: value })} /></div>
        <label style={{ fontSize: 12, paddingBottom: 9 }}><input type="checkbox" checked={row.exento} onChange={event => updateDetalle(index, { exento: event.target.checked })} /> Exento</label>
        <button type="button" onClick={() => setDetalles(rows => rows.filter((_, i) => i !== index))} disabled={detalles.length === 1} style={{ border: 0, background: 'none', color: 'var(--red)', padding: 9 }}>×</button>
      </div>)}
      <button type="button" onClick={() => setDetalles(rows => [...rows, emptyDetalle()])} style={{ border: 0, background: 'none', color: 'var(--blue)', fontWeight: 600 }}>+ Agregar documento</button>

      <h3 style={{ margin: '22px 0 10px', fontSize: 15 }}>Comisiones (opcional)</h3>
      {comisiones.map((row, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '70px 2fr .8fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}><div><label style={{ fontSize: 11 }}>Mov.</label><select value={row.tipoMovim} onChange={event => updateComision(index, { tipoMovim: event.target.value })} style={inputStyle}><option value="C">C</option><option value="R">R</option></select></div><div><label style={{ fontSize: 11 }}>Glosa</label><input value={row.glosa} onChange={event => updateComision(index, { glosa: event.target.value })} style={inputStyle} /></div><div><label style={{ fontSize: 11 }}>%</label><Numeric value={row.tasaComision} onChange={value => updateComision(index, { tasaComision: value })} /></div><div><label style={{ fontSize: 11 }}>Neto</label><Numeric value={row.valComNeto} onChange={value => updateComision(index, { valComNeto: value })} /></div><div><label style={{ fontSize: 11 }}>Exento</label><Numeric value={row.valComExe} onChange={value => updateComision(index, { valComExe: value })} /></div><div><label style={{ fontSize: 11 }}>IVA</label><Numeric value={row.valComIva} onChange={value => updateComision(index, { valComIva: value })} /></div><button type="button" onClick={() => setComisiones(rows => rows.filter((_, i) => i !== index))} style={{ border: 0, background: 'none', color: 'var(--red)', padding: 9 }}>×</button></div>)}
      <button type="button" onClick={() => setComisiones(rows => [...rows, emptyComision()])} style={{ border: 0, background: 'none', color: 'var(--blue)', fontWeight: 600 }}>+ Agregar comisión</button>

      <h3 style={{ margin: '22px 0 10px', fontSize: 15 }}>Totales declarados</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>{Object.entries(totales).map(([field, value]) => <FormField key={field} label={field === 'total' ? 'Total *' : field}><Numeric value={value} onChange={next => setTotales(current => ({ ...current, [field]: next }))} /></FormField>)}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}><Btn variant="ghost" onClick={() => navigate('/facturacion/documentos')}>Cancelar</Btn><Btn variant="primary" disabled={!puedeContinuar} onClick={() => setShowModal(true)}>Continuar a emisión</Btn></div>
    </div>
    {showModal && <EmitirDteModal venta={ventaSintetica} tipoDte={43} documentInput={documentInput} previewItems={previewItems} previewTotales={previewTotales} onClose={() => setShowModal(false)} onSuccess={({ emitido, documento }) => { setShowModal(false); toast.success(`Liquidación emitida${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`); navigate('/facturacion/documentos') }} />}
  </main>
}
