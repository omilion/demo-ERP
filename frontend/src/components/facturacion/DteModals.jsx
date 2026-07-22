import { useState } from 'react'
import { Badge, Btn, Icon } from '../shared'
import { useEmitirDte } from '../../api/facturacion'
import { buildReceptor, isValidRut, mapVentaItems, TIPOS_DTE, IND_TRASLADO, TIPO_DESPACHO, REFERENCIA_TIPOS } from '../../utils/facturacion'

const fmt = value => '$' + Math.round(Number(value || 0)).toLocaleString('es-CL')

const getError = error => error?.response?.data?.error || error?.message || 'No se pudo emitir el documento.'

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'oklch(0 0 0 / .45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={event => event.stopPropagation()} style={{ background: '#fff', width: 720, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', borderRadius: 12, boxShadow: '0 16px 48px oklch(0 0 0 / .2)' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          <button onClick={onClose} title="Cerrar" style={{ padding: 4, color: 'var(--text-3)' }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

function Preview({ receptor, items, tipoDte }) {
  const neto = items.reduce((sum, item) => sum + Number(item.cantidad || 0) * Number(item.precio || 0), 0)
  const iva = Math.round(neto * 0.19)
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16, background: 'var(--bg)', padding: 12, borderRadius: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Receptor</div>
          <div style={{ fontWeight: 700 }}>{receptor.razonSocial || 'Consumidor final'}</div>
          <div style={{ color: 'var(--text-2)', fontSize: 12 }}>{[receptor.rut, receptor.direccion, receptor.comuna].filter(Boolean).join(' · ') || 'Sin dirección registrada'}</div>
        </div>
        <Badge tone={tipoDte === 39 ? 'amber' : 'blue'}>{TIPOS_DTE[tipoDte]}</Badge>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: 'var(--bg)' }}><th style={th}>Ítem</th><th style={{ ...th, textAlign: 'right' }}>Cant.</th><th style={{ ...th, textAlign: 'right' }}>Precio neto</th><th style={{ ...th, textAlign: 'right' }}>Subtotal</th></tr></thead>
          <tbody>{items.map((item, index) => <tr key={index} style={{ borderTop: '1px solid var(--border)' }}><td style={td}>{item.nombre}</td><td style={{ ...td, textAlign: 'right' }}>{item.cantidad}</td><td style={{ ...td, textAlign: 'right' }}>{fmt(item.precio)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(Number(item.cantidad) * Number(item.precio))}</td></tr>)}</tbody>
        </table>
      </div>
      <div style={{ marginLeft: 'auto', width: 240, fontSize: 13 }}>
        <Total label="Neto" value={neto} /><Total label="IVA 19%" value={iva} /><Total label="Total" value={neto + iva} strong />
      </div>
    </>
  )
}

const th = { padding: '8px 10px', textAlign: 'left', color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase' }
const td = { padding: '8px 10px' }
const inputStyle = { width: '100%', padding: 9, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit' }
const Total = ({ label, value, strong }) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: strong ? '1px solid var(--border)' : 'none', fontWeight: strong ? 700 : 400 }}><span>{label}</span><span>{fmt(value)}</span></div>

export function EmitirDteModal({ venta, guiaDespachoId, tipoDte, onClose, onSuccess }) {
  const emitir = useEmitirDte()
  const [error, setError] = useState('')
  const [indTraslado, setIndTraslado] = useState('')
  const [tipoDespacho, setTipoDespacho] = useState('')
  const [refTipo, setRefTipo] = useState('')
  const [refFolio, setRefFolio] = useState('')
  const [refFecha, setRefFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [refRazon, setRefRazon] = useState('')
  const receptor = buildReceptor(venta?.cliente)
  const items = mapVentaItems(venta)
  const autoTipo = isValidRut(receptor.rut) ? 33 : 39
  const [tipoElegido, setTipoElegido] = useState(autoTipo)
  const puedeElegirTipo = !tipoDte
  const detectedTipo = tipoDte || tipoElegido
  const esGuia = detectedTipo === 52

  const confirmar = async () => {
    // El SII exige ambos codigos en la guia; sin ellos el envio se rechaza y el
    // folio queda consumido, asi que se validan antes de llamar al backend.
    if (esGuia && (!indTraslado || !tipoDespacho)) {
      setError('Indica el motivo del traslado y el tipo de despacho.')
      return
    }
    setError('')
    try {
      const referencias = (refTipo && refFolio.trim())
        ? [{ tipoDocRef: refTipo, folioRef: refFolio.trim(), fechaRef: refFecha, razon: refRazon.trim() || undefined }]
        : []
      const result = await emitir.mutateAsync({
        ordenId: venta.id,
        clienteId: venta.clienteId || venta.cliente?.id,
        guiaDespachoId,
        tipoDte: detectedTipo,
        receptor,
        items,
        ...(esGuia ? { extra: { indTraslado: Number(indTraslado), tipoDespacho: Number(tipoDespacho) } } : {}),
        ...(referencias.length ? { referencias } : {}),
      })
      onSuccess?.(result)
    } catch (cause) { setError(getError(cause)) }
  }

  return <Modal title="Confirmar emisión DTE" onClose={onClose}>
    {puedeElegirTipo && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 14, maxWidth: 260 }}>
        <SelectField label="Tipo de documento" value={String(tipoElegido)} options={{ 33: 'Factura Electrónica', 39: 'Boleta Electrónica' }} onChange={value => setTipoElegido(Number(value))} />
      </div>
    )}
    <Preview receptor={receptor} items={items} tipoDte={detectedTipo} />
    {esGuia && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
        <SelectField label="Motivo del traslado" value={indTraslado} options={IND_TRASLADO} onChange={value => { setIndTraslado(value); setError('') }} />
        <SelectField label="Tipo de despacho" value={tipoDespacho} options={TIPO_DESPACHO} onChange={value => { setTipoDespacho(value); setError('') }} />
      </div>
    )}
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Referencia (opcional)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <SelectField label="Tipo de documento referenciado" value={refTipo} options={REFERENCIA_TIPOS} onChange={setRefTipo} />
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>N° / Folio</label>
          <input value={refFolio} onChange={event => setRefFolio(event.target.value)} style={inputStyle} placeholder="Ej: 1234" />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Fecha</label>
          <input type="date" value={refFecha} onChange={event => setRefFecha(event.target.value)} style={inputStyle} />
        </div>
      </div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Razón</label>
      <input value={refRazon} onChange={event => setRefRazon(event.target.value)} style={inputStyle} placeholder="Ej: Orden de compra del cliente" />
    </div>
    {error && <div style={errorStyle}>{error}</div>}
    <div style={footerStyle}><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn icon="send" onClick={confirmar} disabled={emitir.isPending || !items.length}>{emitir.isPending ? 'Emitiendo...' : 'Confirmar y emitir'}</Btn></div>
  </Modal>
}

function SelectField({ label, value, options, onChange }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{label} <span style={{ color: 'var(--red)' }}>*</span></label>
      <select value={value} onChange={event => onChange(event.target.value)} style={{ width: '100%', padding: 9, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', background: '#fff' }}>
        <option value="">Seleccionar...</option>
        {Object.entries(options).map(([code, text]) => <option key={code} value={code}>{code} — {text}</option>)}
      </select>
    </div>
  )
}

export function NotaDteModal({ documento, tipoDte, onClose, onSuccess }) {
  const emitir = useEmitirDte()
  const [razon, setRazon] = useState('')
  const [error, setError] = useState('')
  const total = Number(documento?.totales?.total || 0)
  const confirmar = async () => {
    if (!razon.trim()) { setError('Indica una razón para la nota.'); return }
    setError('')
    try {
      const result = await emitir.mutateAsync({
        ordenId: documento.ordenId,
        clienteId: documento.clienteId,
        tipoDte,
        receptor: documento.receptor || {},
        items: [{ nombre: `${tipoDte === 61 ? 'Anulación' : 'Corrección'} documento #${documento.folio || documento.id}`, cantidad: 1, precio: total / 1.19 }],
        referencias: [{ tipoDocRef: String(documento.tipoDte), folioRef: String(documento.folio), fechaRef: documento.fechaEmision, codRef: '1', razon: razon.trim() }],
      })
      onSuccess?.(result)
    } catch (cause) { setError(getError(cause)) }
  }
  return <Modal title={tipoDte === 61 ? 'Anular con nota de crédito' : 'Corregir con nota de débito'} onClose={onClose}>
    <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 12px' }}>Documento de referencia: {TIPOS_DTE[documento.tipoDte] || `DTE ${documento.tipoDte}`} #{documento.folio || 'sin folio'} ({fmt(total)}).</p>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Razón <span style={{ color: 'var(--red)' }}>*</span></label>
    <textarea value={razon} onChange={event => { setRazon(event.target.value); setError('') }} rows={4} style={{ width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', resize: 'vertical' }} />
    {error && <div style={errorStyle}>{error}</div>}
    <div style={footerStyle}><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn icon="send" onClick={confirmar} disabled={emitir.isPending}>{emitir.isPending ? 'Emitiendo...' : 'Confirmar y emitir'}</Btn></div>
  </Modal>
}

const errorStyle = { marginTop: 14, padding: '10px 12px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13 }
const footerStyle = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }
