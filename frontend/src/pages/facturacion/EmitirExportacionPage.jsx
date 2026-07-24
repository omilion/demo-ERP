import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, Btn } from '../../components/shared'
import { FormField, Input } from '../../components/forms'
import { EmitirDteModal } from '../../components/facturacion/DteModals'
import { useDocumentos } from '../../api/facturacion'
import { useClientes } from '../../api/clientes'
import { toast } from '../../store/notif'
import { buildExportacionInput, TIPOS_DTE } from '../../utils/facturacion'

const inputStyle = { width: '100%', padding: 9, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', boxSizing: 'border-box' }
const emptyItem = () => ({ nombre: '', cantidad: 1, unidad: 'UN', precio: 0, descuentoMonto: 0 })
const emptyAduana = () => ({ codModVenta: '', codClauVenta: '', totClauVenta: '', codViaTransp: '', nombreTransp: '', rutCiaTransp: '', nomCiaTransp: '', codPtoEmbarque: '', codPtoDesemb: '', tara: '', pesoBruto: '', pesoNeto: '', totBultos: '', mntFlete: '', mntSeguro: '', codPaisRecep: '', codPaisDestin: '', tipoBultos: [] })
const emptyBulto = () => ({ codTpoBultos: '', cantBultos: '', marcas: '', idContainer: '', sello: '', emisorSello: '' })
const n = value => value === '' ? undefined : Number(value)
const Numeric = ({ value, onChange, ...props }) => <input type="number" value={value} onChange={event => onChange(event.target.value)} style={inputStyle} {...props} />

function ImportadorAutocomplete({ onSelect }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  useEffect(() => { const timeout = setTimeout(() => setDebounced(query.trim()), 300); return () => clearTimeout(timeout) }, [query])
  useEffect(() => { const onOutside = event => { if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false) }; document.addEventListener('mousedown', onOutside); return () => document.removeEventListener('mousedown', onOutside) }, [])
  const { data, isFetching } = useClientes({ search: debounced, limit: 8 }, { enabled: debounced.length >= 2 })
  const resultados = debounced.length >= 2 ? (data?.items || []) : []
  return <div ref={boxRef} style={{ position: 'relative', marginBottom: 16 }}>
    <FormField label="Buscar importador registrado (opcional)"><Input value={query} onChange={value => { setQuery(value); setOpen(true) }} placeholder="RUT o nombre..." /></FormField>
    {open && debounced.length >= 2 && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px oklch(0 0 0 / .12)', maxHeight: 240, overflowY: 'auto' }}>
      {isFetching && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-3)' }}>Buscando...</div>}
      {!isFetching && !resultados.length && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-3)' }}>Sin resultados</div>}
      {resultados.map(item => <button key={item.id} type="button" onClick={() => { onSelect(item); setQuery(''); setOpen(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}><div style={{ fontWeight: 600 }}>{item.razonSocial || item.nombre}</div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.rut}</div></button>)}
    </div>}
  </div>
}

export default function EmitirExportacionPage() {
  const navigate = useNavigate()
  const [tipoDte, setTipoDte] = useState(110)
  const [receptor, setReceptor] = useState({ rut: '55555555-5', razonSocial: '', nacionalidad: '', giro: '', contacto: '', email: '', direccion: '', comuna: '', ciudad: '' })
  const [items, setItems] = useState([emptyItem()])
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [tipoDespacho, setTipoDespacho] = useState('')
  const [moneda, setMoneda] = useState('DOLAR USA')
  const [usarOtraMoneda, setUsarOtraMoneda] = useState(false)
  const [otraMoneda, setOtraMoneda] = useState({ tipoMoneda: 'PESO CL', tipoCambio: '', mntExe: '', mntTotal: '' })
  const [usarAduana, setUsarAduana] = useState(false)
  const [aduana, setAduana] = useState(emptyAduana())
  const [referenciaId, setReferenciaId] = useState('')
  const [codRef, setCodRef] = useState('3')
  const [razon, setRazon] = useState('')
  const [showModal, setShowModal] = useState(false)
  const { data: documentosData } = useDocumentos({ tipoDte: 110 })
  const exportaciones = useMemo(() => (documentosData?.documentos || []).filter(doc => ['emitido', 'enviado', 'aceptado'].includes(doc.estado)), [documentosData])
  const setReceptorField = (field, value) => setReceptor(current => ({ ...current, [field]: value }))
  const selectImportador = item => setReceptor({ rut: item.rut || '55555555-5', razonSocial: item.razonSocial || item.nombre || '', nacionalidad: item.nacionalidad || '', giro: item.giro || '', contacto: item.contacto || '', email: item.email || '', direccion: item.direccion || '', comuna: item.comuna || '', ciudad: item.ciudad || '' })
  const updateItem = (index, patch) => setItems(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  const updateAduana = (field, value) => setAduana(current => ({ ...current, [field]: value }))
  const itemsValidos = items.filter(row => row.nombre.trim() && Number(row.cantidad) > 0)
  const itemsNormalizados = itemsValidos.map(row => ({ ...row, cantidad: Number(row.cantidad), precio: Number(row.precio), descuentoMonto: Number(row.descuentoMonto || 0), exento: true }))
  const total = itemsNormalizados.reduce((sum, item) => sum + Math.round(item.cantidad * item.precio) - item.descuentoMonto, 0)
  const refDoc = exportaciones.find(doc => String(doc.id) === String(referenciaId))
  const referencias = [111, 112].includes(tipoDte) && refDoc ? [{ tipo: '110', folio: String(refDoc.folio), fecha: refDoc.fechaEmision, tipoDocRef: 110, folioRef: String(refDoc.folio), fechaRef: refDoc.fechaEmision, codRef: Number(codRef), razon }] : []
  const aduanaNormalizada = usarAduana ? { ...aduana, codModVenta: n(aduana.codModVenta), codClauVenta: n(aduana.codClauVenta), totClauVenta: n(aduana.totClauVenta), codViaTransp: n(aduana.codViaTransp), codPtoEmbarque: n(aduana.codPtoEmbarque), codPtoDesemb: n(aduana.codPtoDesemb), tara: n(aduana.tara), pesoBruto: n(aduana.pesoBruto), pesoNeto: n(aduana.pesoNeto), totBultos: n(aduana.totBultos), mntFlete: n(aduana.mntFlete), mntSeguro: n(aduana.mntSeguro), tipoBultos: aduana.tipoBultos.map(bulto => ({ ...bulto, codTpoBultos: n(bulto.codTpoBultos), cantBultos: n(bulto.cantBultos) })) } : null
  const documentInput = buildExportacionInput({ tipoDte, items: itemsNormalizados, fechaVencimiento, tipoDespacho, moneda, otraMoneda: usarOtraMoneda ? { ...otraMoneda, tipoCambio: n(otraMoneda.tipoCambio), mntExe: n(otraMoneda.mntExe), mntTotal: n(otraMoneda.mntTotal) } : null, transporte: aduanaNormalizada ? { aduana: aduanaNormalizada } : null, referencias })
  const previewTotales = { neto: 0, exento: total, iva: 0, total }
  const puedeContinuar = receptor.rut && receptor.razonSocial && itemsValidos.length && (tipoDte !== 110 || fechaVencimiento) && (![111, 112].includes(tipoDte) || (refDoc && razon.trim())) && (!usarAduana || (aduana.totBultos !== '' && aduana.codPaisRecep))
  const ventaSintetica = { id: null, clienteId: null, cliente: receptor, items: [] }
  const selectTipo = value => { setTipoDte(Number(value)); setReferenciaId(''); setRazon('') }

  return <main className="page page-wide">
    <PageHeader title="Emitir documento de exportación" subtitle="Factura, nota de crédito o nota de débito de exportación" breadcrumb={['Inicio', 'Facturación', 'Exportación']} />
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, maxWidth: 1080 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, .7fr) 1fr', gap: 12, marginBottom: 18 }}><FormField label="Tipo de documento"><select value={tipoDte} onChange={event => selectTipo(event.target.value)} style={inputStyle}>{[110, 111, 112].map(tipo => <option key={tipo} value={tipo}>{tipo} — {TIPOS_DTE[tipo]}</option>)}</select></FormField><div style={{ alignSelf: 'end', padding: '10px 12px', borderRadius: 8, background: 'var(--bg)', color: 'var(--text-2)', fontSize: 13 }}>Todos los ítems de exportación se declaran exentos, sin IVA.</div></div>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Importador / receptor extranjero</h3>
      <ImportadorAutocomplete onSelect={selectImportador} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12 }}><FormField label="RUT receptor"><Input value={receptor.rut} onChange={value => setReceptorField('rut', value)} /></FormField><FormField label="Razón social"><Input value={receptor.razonSocial} onChange={value => setReceptorField('razonSocial', value)} /></FormField><FormField label="Nacionalidad (código)"><Input value={receptor.nacionalidad} onChange={value => setReceptorField('nacionalidad', value)} /></FormField></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}><FormField label="Giro"><Input value={receptor.giro} onChange={value => setReceptorField('giro', value)} /></FormField><FormField label="Contacto"><Input value={receptor.contacto} onChange={value => setReceptorField('contacto', value)} /></FormField><FormField label="Correo"><Input value={receptor.email} onChange={value => setReceptorField('email', value)} /></FormField></div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginTop: 12 }}><FormField label="Dirección"><Input value={receptor.direccion} onChange={value => setReceptorField('direccion', value)} /></FormField><FormField label="Comuna"><Input value={receptor.comuna} onChange={value => setReceptorField('comuna', value)} /></FormField><FormField label="Ciudad"><Input value={receptor.ciudad} onChange={value => setReceptorField('ciudad', value)} /></FormField></div>

      {[111, 112].includes(tipoDte) && <div style={{ marginTop: 20, padding: 14, border: '1px solid var(--border)', borderRadius: 8 }}><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Referencia obligatoria a Factura de Exportación</h3><div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 12 }}><FormField label="Factura 110"><select value={referenciaId} onChange={event => setReferenciaId(event.target.value)} style={inputStyle}><option value="">Seleccionar...</option>{exportaciones.map(doc => <option key={doc.id} value={doc.id}>Folio {doc.folio} — {doc.fechaEmision} — {doc.receptor?.razonSocial || ''}</option>)}</select></FormField><FormField label="Motivo"><select value={codRef} onChange={event => setCodRef(event.target.value)} style={inputStyle}><option value="1">Anula</option><option value="3">Corrige monto</option></select></FormField><FormField label="Razón"><Input value={razon} onChange={setRazon} /></FormField></div></div>}

      <h3 style={{ margin: '22px 0 10px', fontSize: 15 }}>Ítems / montos del documento</h3>
      {items.map((row, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr .6fr .6fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}><div><label style={{ fontSize: 11 }}>Nombre</label><input value={row.nombre} onChange={event => updateItem(index, { nombre: event.target.value })} style={inputStyle} /></div><div><label style={{ fontSize: 11 }}>Cant.</label><Numeric value={row.cantidad} onChange={value => updateItem(index, { cantidad: value })} min="1" /></div><div><label style={{ fontSize: 11 }}>Unid.</label><input value={row.unidad} onChange={event => updateItem(index, { unidad: event.target.value })} style={inputStyle} /></div><div><label style={{ fontSize: 11 }}>Precio</label><Numeric value={row.precio} onChange={value => updateItem(index, { precio: value })} /></div><div><label style={{ fontSize: 11 }}>Descuento</label><Numeric value={row.descuentoMonto} onChange={value => updateItem(index, { descuentoMonto: value })} /></div><button type="button" disabled={items.length === 1} onClick={() => setItems(rows => rows.filter((_, i) => i !== index))} style={{ border: 0, background: 'none', color: 'var(--red)', padding: 9 }}>×</button></div>)}
      <button type="button" onClick={() => setItems(rows => [...rows, emptyItem()])} style={{ border: 0, background: 'none', color: 'var(--blue)', fontWeight: 600 }}>+ Agregar ítem</button>

      <div style={{ marginTop: 22, borderTop: '1px solid var(--border)', paddingTop: 16 }}><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Moneda y despacho</h3><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}><FormField label="Moneda"><Input value={moneda} onChange={setMoneda} /></FormField>{tipoDte === 110 && <FormField label="Fecha vencimiento *"><input type="date" value={fechaVencimiento} onChange={event => setFechaVencimiento(event.target.value)} style={inputStyle} /></FormField>}{tipoDte === 110 && <FormField label="Tipo despacho"><select value={tipoDespacho} onChange={event => setTipoDespacho(event.target.value)} style={inputStyle}><option value="">No informar</option><option value="1">1 — Receptor</option><option value="2">2 — Emisor a receptor</option><option value="3">3 — Emisor a otra instalación</option></select></FormField>}</div></div>
      <label style={{ display: 'block', marginTop: 16, fontWeight: 600 }}><input type="checkbox" checked={usarOtraMoneda} onChange={event => setUsarOtraMoneda(event.target.checked)} /> Informar conversión a otra moneda</label>
      {usarOtraMoneda && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 10 }}><FormField label="Moneda"><Input value={otraMoneda.tipoMoneda} onChange={value => setOtraMoneda(current => ({ ...current, tipoMoneda: value }))} /></FormField><FormField label="Tipo cambio"><Numeric value={otraMoneda.tipoCambio} onChange={value => setOtraMoneda(current => ({ ...current, tipoCambio: value }))} /></FormField><FormField label="Exento"><Numeric value={otraMoneda.mntExe} onChange={value => setOtraMoneda(current => ({ ...current, mntExe: value }))} /></FormField><FormField label="Total"><Numeric value={otraMoneda.mntTotal} onChange={value => setOtraMoneda(current => ({ ...current, mntTotal: value }))} /></FormField></div>}
      <label style={{ display: 'block', marginTop: 18, fontWeight: 600 }}><input type="checkbox" checked={usarAduana} onChange={event => setUsarAduana(event.target.checked)} /> Informar Aduana y transporte</label>
      {usarAduana && <AduanaForm aduana={aduana} setAduana={setAduana} updateAduana={updateAduana} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}><Btn variant="ghost" onClick={() => navigate('/facturacion/documentos')}>Cancelar</Btn><Btn variant="primary" disabled={!puedeContinuar} onClick={() => setShowModal(true)}>Continuar a emisión</Btn></div>
    </div>
    {showModal && <EmitirDteModal venta={ventaSintetica} tipoDte={tipoDte} documentInput={documentInput} previewItems={itemsNormalizados.map(item => ({ ...item, exento: true }))} previewTotales={previewTotales} onClose={() => setShowModal(false)} onSuccess={({ emitido, documento }) => { setShowModal(false); toast.success(`DTE de exportación emitido${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`); navigate('/facturacion/documentos') }} />}
  </main>
}

function AduanaForm({ aduana, setAduana, updateAduana }) {
  const fields = [['codModVenta', 'Modalidad'], ['codClauVenta', 'Cláusula'], ['totClauVenta', 'Total cláusula'], ['codViaTransp', 'Vía transporte'], ['nombreTransp', 'Medio transporte'], ['rutCiaTransp', 'RUT compañía'], ['nomCiaTransp', 'Compañía'], ['codPtoEmbarque', 'Pto. embarque'], ['codPtoDesemb', 'Pto. desembarque'], ['tara', 'Tara'], ['pesoBruto', 'Peso bruto'], ['pesoNeto', 'Peso neto'], ['totBultos', 'Total bultos *'], ['mntFlete', 'Flete'], ['mntSeguro', 'Seguro'], ['codPaisRecep', 'País receptor *'], ['codPaisDestin', 'País destino']]
  return <div style={{ marginTop: 10, padding: 14, border: '1px solid var(--border)', borderRadius: 8 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>{fields.map(([field, label]) => <FormField key={field} label={label}><input value={aduana[field]} onChange={event => updateAduana(field, event.target.value)} style={inputStyle} /></FormField>)}</div><div style={{ marginTop: 14, fontWeight: 700, fontSize: 13 }}>Tipos de bulto</div>{aduana.tipoBultos.map((bulto, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: 8, marginTop: 8 }}><input placeholder="Código" value={bulto.codTpoBultos} onChange={event => setAduana(current => ({ ...current, tipoBultos: current.tipoBultos.map((row, i) => i === index ? { ...row, codTpoBultos: event.target.value } : row) }))} style={inputStyle} /><input placeholder="Cantidad" value={bulto.cantBultos} onChange={event => setAduana(current => ({ ...current, tipoBultos: current.tipoBultos.map((row, i) => i === index ? { ...row, cantBultos: event.target.value } : row) }))} style={inputStyle} /><input placeholder="Marcas / container" value={bulto.marcas} onChange={event => setAduana(current => ({ ...current, tipoBultos: current.tipoBultos.map((row, i) => i === index ? { ...row, marcas: event.target.value } : row) }))} style={inputStyle} /><button type="button" onClick={() => setAduana(current => ({ ...current, tipoBultos: current.tipoBultos.filter((_, i) => i !== index) }))} style={{ border: 0, background: 'none', color: 'var(--red)' }}>×</button></div>)}<button type="button" onClick={() => setAduana(current => ({ ...current, tipoBultos: [...current.tipoBultos, emptyBulto()] }))} style={{ border: 0, background: 'none', color: 'var(--blue)', fontWeight: 600, marginTop: 10 }}>+ Agregar bulto</button></div>
}
