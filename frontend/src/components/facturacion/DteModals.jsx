import { useState } from 'react'
import { Badge, Btn, Icon } from '../shared'
import { useEmitirDte, useDocumentos, useEmpresa } from '../../api/facturacion'
import { useDespachoPacking } from '../../api/despachos'
import { buildReceptor, isValidRut, mapVentaItems, TIPOS_DTE, IND_TRASLADO, TIPO_DESPACHO, REFERENCIA_TIPOS, REFERENCIA_TIPOS_INTERNOS } from '../../utils/facturacion'

const dateFmt = value => value ? new Date(value).toLocaleDateString('es-CL') : '—'

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

function Preview({ empresa, receptor, items, tipoDte, referencia }) {
  const neto = items.reduce((sum, item) => sum + Number(item.cantidad || 0) * Number(item.precio || 0), 0)
  const iva = Math.round(neto * 0.19)
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <Badge tone={tipoDte === 39 ? 'amber' : 'blue'}>{TIPOS_DTE[tipoDte]}</Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Emisor</div>
          <div style={{ fontWeight: 700 }}>{empresa?.razonSocial || 'Sin configurar'}</div>
          <div style={{ color: 'var(--text-2)', fontSize: 12 }}>{[empresa?.rut, empresa?.giro, [empresa?.direccion, empresa?.comuna].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Falta configuración del emisor'}</div>
        </div>
        <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Receptor</div>
          <div style={{ fontWeight: 700 }}>{receptor.razonSocial || 'Consumidor final'}</div>
          <div style={{ color: 'var(--text-2)', fontSize: 12 }}>{[receptor.rut, receptor.direccion, receptor.comuna].filter(Boolean).join(' · ') || 'Sin dirección registrada'}</div>
        </div>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: 'var(--bg)' }}><th style={th}>Ítem</th><th style={{ ...th, textAlign: 'right' }}>Cant.</th><th style={{ ...th, textAlign: 'right' }}>Precio neto</th><th style={{ ...th, textAlign: 'right' }}>Subtotal</th></tr></thead>
          <tbody>{items.map((item, index) => <tr key={index} style={{ borderTop: '1px solid var(--border)' }}><td style={td}>{item.nombre}</td><td style={{ ...td, textAlign: 'right' }}>{item.cantidad}</td><td style={{ ...td, textAlign: 'right' }}>{fmt(item.precio)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(Number(item.cantidad) * Number(item.precio))}</td></tr>)}</tbody>
        </table>
      </div>
      <div style={{ marginLeft: 'auto', width: 240, fontSize: 13, marginBottom: referencia ? 14 : 0 }}>
        <Total label="Neto" value={neto} /><Total label="IVA 19%" value={iva} /><Total label="Total" value={neto + iva} strong />
      </div>
      {referencia && (
        <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Referencia</div>
          <div>{referencia.tipoLabel}{referencia.folio ? ` N° ${referencia.folio}` : ''}{referencia.fecha ? ` — ${dateFmt(referencia.fecha)}` : ''}</div>
          {referencia.razon && <div style={{ color: 'var(--text-2)', marginTop: 2 }}>{referencia.razon}</div>}
        </div>
      )}
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
  const [mostrarReferencia, setMostrarReferencia] = useState(false)
  // "Otro" por defecto: al abrir la referencia se ve directo N°/Folio + Razon
  // para escribir sin elegir nada antes. Solo si es una Guia/Factura/NC/ND
  // real del sistema hace falta cambiar el tipo arriba.
  const [refTipo, setRefTipo] = useState('806')
  const [refDocLocalId, setRefDocLocalId] = useState('')
  const [refFolio, setRefFolio] = useState('')
  const [refFecha, setRefFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [refRazon, setRefRazon] = useState('')
  const refEsInterna = REFERENCIA_TIPOS_INTERNOS.includes(refTipo)
  // Se eligio un tipo pero falta terminar de elegir el documento/folio: no se
  // manda ninguna referencia en ese estado, asi que no se deja confirmar a
  // medias (antes quedaba en silencio como si no se hubiera tocado nada).
  const referenciaIncompleta = mostrarReferencia && !!refTipo && (refEsInterna ? !refDocLocalId : !refFolio.trim())
  const documentosRef = useDocumentos({ tipoDte: refTipo, estado: 'emitido' }, { enabled: refEsInterna })
  const { data: empresaData } = useEmpresa()
  const empresa = empresaData?.empresa
  // La DTE declara solo lo que se eligio enviar en ESTA guia (packing por
  // guiaDespachoId, existe desde que se crea la guia sin importar si ya
  // tiene despacho asignado), no el total de la venta.
  const packing = useDespachoPacking(venta?.id, { guiaDespachoId }, !!guiaDespachoId)
  const cantidadPorItemId = guiaDespachoId
    ? Object.fromEntries((packing.data?.packedGuia || []).map(row => [row.ordenItemId, row.cantidad]))
    : null
  const receptor = buildReceptor(venta?.cliente)
  const items = mapVentaItems(venta, cantidadPorItemId)
  const autoTipo = isValidRut(receptor.rut) ? 33 : 39
  const [tipoElegido, setTipoElegido] = useState(autoTipo)
  const puedeElegirTipo = !tipoDte
  const detectedTipo = tipoDte || tipoElegido
  const esGuia = detectedTipo === 52

  let referenciaResumen = null
  if (refEsInterna && refDocLocalId) {
    const doc = (documentosRef.data?.documentos || []).find(d => String(d.id) === String(refDocLocalId))
    if (doc) referenciaResumen = { tipoLabel: TIPOS_DTE[Number(refTipo)], folio: doc.folio, fecha: doc.fechaEmision, razon: refRazon.trim() }
  } else if (!refEsInterna && refTipo && refFolio.trim()) {
    referenciaResumen = { tipoLabel: REFERENCIA_TIPOS[refTipo], folio: refFolio.trim(), fecha: refFecha, razon: refRazon.trim() }
  }

  const confirmar = async () => {
    // El SII exige ambos codigos en la guia; sin ellos el envio se rechaza y el
    // folio queda consumido, asi que se validan antes de llamar al backend.
    if (esGuia && (!indTraslado || !tipoDespacho)) {
      setError('Indica el motivo del traslado y el tipo de despacho.')
      return
    }
    if (referenciaIncompleta) {
      setError(refEsInterna ? 'Elige el documento al que referencia, o quita la referencia.' : 'Completa el N°/Folio de la referencia, o quítala.')
      return
    }
    setError('')
    try {
      const referencias = refEsInterna
        ? (refDocLocalId ? [{ docLocalId: Number(refDocLocalId), razon: refRazon.trim() || undefined }] : [])
        : (refTipo && refFolio.trim())
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
    {guiaDespachoId && !packing.isLoading && !items.length && (
      <div style={{ ...errorStyle, background: 'var(--bg)', color: 'var(--text-2)', marginBottom: 14, marginTop: 0 }}>
        Esta guía todavía no tiene productos seleccionados para enviar. Sin cantidades no hay qué declarar en la guía.
      </div>
    )}
    <Preview empresa={empresa} receptor={receptor} items={items} tipoDte={detectedTipo} referencia={referenciaResumen} />
    {esGuia && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
        <SelectField label="Motivo del traslado" value={indTraslado} options={IND_TRASLADO} onChange={value => { setIndTraslado(value); setError('') }} />
        <SelectField label="Tipo de despacho" value={tipoDespacho} options={TIPO_DESPACHO} onChange={value => { setTipoDespacho(value); setError('') }} />
      </div>
    )}
    {!mostrarReferencia ? (
      <button type="button" onClick={() => setMostrarReferencia(true)} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600, fontSize: 13, padding: 0, marginBottom: 4 }}>
        + Agregar referencia (opcional — guía ya enviada, orden de compra del cliente, etc.)
      </button>
    ) : (
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Referencia</div>
          <button type="button" onClick={() => { setMostrarReferencia(false); setRefTipo('806'); setRefDocLocalId(''); setRefFolio(''); setRefRazon(''); setError('') }} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>Quitar</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: refEsInterna ? '1.4fr 2fr' : '1.4fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <SelectField label="Tipo de documento referenciado" value={refTipo} options={REFERENCIA_TIPOS} onChange={value => { setRefTipo(value); setRefDocLocalId(''); setRefFolio('') }} />
          {refEsInterna ? (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Documento emitido</label>
              <select value={refDocLocalId} onChange={event => setRefDocLocalId(event.target.value)} style={{ ...inputStyle, background: '#fff' }} disabled={documentosRef.isLoading}>
                <option value="">{documentosRef.isLoading ? 'Cargando...' : 'Seleccionar...'}</option>
                {(documentosRef.data?.documentos || []).map(doc => (
                  <option key={doc.id} value={doc.id}>Folio {doc.folio} — {doc.receptor?.razonSocial || 'sin receptor'} — {dateFmt(doc.fechaEmision)}</option>
                ))}
              </select>
              {!documentosRef.isLoading && !(documentosRef.data?.documentos || []).length && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>No hay {TIPOS_DTE[Number(refTipo)]?.toLowerCase()} emitidas todavía.</div>
              )}
            </div>
          ) : (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>N° / Folio</label>
                <input value={refFolio} onChange={event => setRefFolio(event.target.value)} style={inputStyle} placeholder="Ej: 1234" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Fecha</label>
                <input type="date" value={refFecha} onChange={event => setRefFecha(event.target.value)} style={inputStyle} />
              </div>
            </>
          )}
        </div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Razón</label>
        <input value={refRazon} onChange={event => setRefRazon(event.target.value)} style={inputStyle} placeholder="Ej: Orden de compra del cliente" />
        {referenciaIncompleta && (
          <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 6 }}>
            {refEsInterna ? 'Falta elegir el documento.' : 'Falta el N°/Folio.'} Complétalo o quita la referencia para seguir.
          </div>
        )}
      </div>
    )}
    {error && <div style={errorStyle}>{error}</div>}
    <div style={footerStyle}><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn icon="send" onClick={confirmar} disabled={emitir.isPending || !items.length || referenciaIncompleta}>{emitir.isPending ? 'Emitiendo...' : 'Confirmar y emitir'}</Btn></div>
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
