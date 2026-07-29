import { useEffect, useRef, useState } from 'react'
import { Badge, Btn, Icon } from '../shared'
import { useEmitirDte, useDocumentos, useEmpresa } from '../../api/facturacion'
import { useDespachoPacking } from '../../api/despachos'
import { useVentas } from '../../api/ventas'
import { buildReceptor, buildReferenciaInternaRow, computeDteTotales, isDteReferenciable, isReferenciaRowEmpty, isValidRut, mapVentaItems, TIPOS_DTE, IND_TRASLADO, TIPO_DESPACHO, REFERENCIA_TIPOS, REFERENCIA_TIPOS_INTERNOS } from '../../utils/facturacion'

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

function Preview({ empresa, receptor, items, tipoDte, referencias, totales }) {
  const calculatedTotales = computeDteTotales(items)
  const { neto, exento, iva, total } = totales || calculatedTotales
  const referenciasCompletas = (referencias || []).filter(r => {
    const tipo = r.tipo ?? String(r.tipoDocRef || '')
    const folio = r.folio ?? r.folioRef
    const esInterna = REFERENCIA_TIPOS_INTERNOS.includes(tipo)
    return esInterna ? !!r.docLocalId : !!String(folio || '').trim()
  })
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
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{tipoDte === 46 ? 'Proveedor (receptor DTE)' : 'Receptor'}</div>
          <div style={{ fontWeight: 700 }}>{receptor.razonSocial || 'Consumidor final'}</div>
          <div style={{ color: 'var(--text-2)', fontSize: 12 }}>{[receptor.rut, receptor.direccion, receptor.comuna].filter(Boolean).join(' · ') || 'Sin dirección registrada'}</div>
        </div>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: 'var(--bg)' }}><th style={th}>Ítem</th><th style={{ ...th, textAlign: 'right' }}>Cant.</th><th style={{ ...th, textAlign: 'right' }}>Precio neto</th><th style={{ ...th, textAlign: 'right' }}>Subtotal</th></tr></thead>
          <tbody>{items.map((item, index) => {
            const subtotal = Math.round(Number(item.cantidad) * Number(item.precio)) - Math.round(Number(item.descuentoMonto) || 0)
            return <tr key={index} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={td}>{item.nombre}{item.descuentoMonto > 0 && <span style={{ display: 'block', color: 'var(--text-3)', fontSize: 11 }}>Descuento: -{fmt(item.descuentoMonto)}</span>}</td>
              <td style={{ ...td, textAlign: 'right' }}>{item.cantidad}</td>
              <td style={{ ...td, textAlign: 'right' }}>{fmt(item.precio)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(subtotal)}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
      <div style={{ marginLeft: 'auto', width: 240, fontSize: 13, marginBottom: referenciasCompletas.length ? 14 : 0 }}>
        <Total label="Neto" value={neto} />
        {exento > 0 && <Total label="Exento" value={exento} />}
        <Total label="IVA 19%" value={iva} />
        <Total label="Total" value={total} strong />
      </div>
      {!!referenciasCompletas.length && (
        <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Referencia{referenciasCompletas.length > 1 ? 's' : ''}</div>
          {referenciasCompletas.map((r, i) => {
            const tipo = r.tipo ?? String(r.tipoDocRef || '')
            const folio = r.folio ?? r.folioRef
            const fecha = r.fecha ?? r.fechaRef
            const esInterna = REFERENCIA_TIPOS_INTERNOS.includes(tipo)
            const tipoLabel = esInterna ? TIPOS_DTE[Number(tipo)] : REFERENCIA_TIPOS[tipo]
            return (
              <div key={i} style={{ marginTop: i ? 8 : 0 }}>
                <div>{tipoLabel}{folio ? ` N° ${folio}` : ''}{fecha ? ` — ${dateFmt(fecha)}` : ''}</div>
                {r.razon && <div style={{ color: 'var(--text-2)', marginTop: 2 }}>{r.razon}</div>}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

const th = { padding: '8px 10px', textAlign: 'left', color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase' }
const td = { padding: '8px 10px' }
const inputStyle = { width: '100%', padding: 9, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit' }
const Total = ({ label, value, strong }) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: strong ? '1px solid var(--border)' : 'none', fontWeight: strong ? 700 : 400 }}><span>{label}</span><span>{fmt(value)}</span></div>

export function EmitirDteModal({ venta, guiaDespachoId, tipoDte, documentInput, previewItems, previewTotales, referenceFirst = false, onClose, onSuccess }) {
  const emitir = useEmitirDte()
  const [error, setError] = useState('')
  const [indTraslado, setIndTraslado] = useState('')
  const [tipoDespacho, setTipoDespacho] = useState('')
  // Sin tipo por defecto: al agregar una referencia se ve directo N°/Folio +
  // Razon para escribir sin elegir nada antes (el SII permite una Referencia
  // sin TpoDocRef, solo con RazonRef en texto libre). Solo si es una Guia/
  // Factura/NC/ND real del sistema hace falta cambiar el tipo arriba. Se
  // admite mas de una referencia (en la practica llegan a verse hasta 3 en un
  // mismo documento: guia ya enviada + OC del cliente + resolucion).
  const emptyReferenciaRow = () => ({ tipo: '', docLocalId: '', folio: '', fecha: new Date().toISOString().slice(0, 10), razon: '' })
  const [referencias, setReferencias] = useState([])
  const [ventaReferencia, setVentaReferencia] = useState(null)
  const addReferenciaRow = () => setReferencias(rows => [...rows, emptyReferenciaRow()])
  const updateReferenciaRow = (index, patch) => setReferencias(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  const removeReferenciaRow = (index) => setReferencias(rows => rows.filter((_, i) => i !== index))
  const agregarDocumentoVenta = (doc) => setReferencias(rows => rows.some(row => String(row.docLocalId) === String(doc.id)) ? rows : [...rows, buildReferenciaInternaRow(doc)])
  // Una fila recien agregada (o vaciada del todo) se ignora sin bloquear; una
  // fila con datos a medias (ej. folio sin completar, o tipo elegido sin
  // documento) si bloquea, para no confirmar con una referencia coja.
  const referenciasIncompletas = referencias.some(row => {
    if (isReferenciaRowEmpty(row)) return false
    const esInterna = REFERENCIA_TIPOS_INTERNOS.includes(row.tipo)
    return esInterna ? !row.docLocalId : !row.folio.trim()
  })
  const { data: empresaData } = useEmpresa()
  const documentosVentaReferencia = useDocumentos({ ordenId: ventaReferencia?.id }, { enabled: !!ventaReferencia?.id })
  const empresa = empresaData?.empresa
  // La DTE declara solo lo que se eligio enviar en ESTA guia (packing por
  // guiaDespachoId, existe desde que se crea la guia sin importar si ya
  // tiene despacho asignado), no el total de la venta.
  const packing = useDespachoPacking(venta?.id, { guiaDespachoId }, !!guiaDespachoId)
  const cantidadPorItemId = guiaDespachoId
    ? Object.fromEntries((packing.data?.packedGuia || []).map(row => [row.ordenItemId, row.cantidad]))
    : null
  const receptor = buildReceptor(venta?.cliente)
  const autoTipo = isValidRut(receptor.rut) ? 33 : 39
  const [tipoElegido, setTipoElegido] = useState(autoTipo)
  const puedeElegirTipo = !tipoDte
  const detectedTipo = tipoDte || tipoElegido
  const esGuia = detectedTipo === 52
  // Los cargos (flete, etc.) son un monto fijo por venta, no por unidad
  // transportada: se declaran en la Factura/Boleta (documento completo de la
  // venta), no en cada Guia parcial que se despache de a poco.
  const mappedItems = mapVentaItems(venta, cantidadPorItemId, { includeCargos: !esGuia })
  const items = previewItems || mappedItems
  const payloadItems = documentInput?.items ?? mappedItems
  const esNota = [56, 61].includes(detectedTipo)
  const referenciaPrioritaria = referenceFirst || esNota

  const confirmar = async () => {
    // El SII exige ambos codigos en la guia; sin ellos el envio se rechaza y el
    // folio queda consumido, asi que se validan antes de llamar al backend.
    if (esGuia && (!indTraslado || !tipoDespacho)) {
      setError('Indica el motivo del traslado y el tipo de despacho.')
      return
    }
    const trasladoInterno = esGuia && Number(indTraslado) === 5
    if (!trasladoInterno && (!isValidRut(receptor.rut) || !receptor.razonSocial?.trim())) {
      setError('Completa un RUT válido y la razón social del receptor antes de emitir.')
      return
    }
    if (referenciasIncompletas) {
      setError('Completa o quita las referencias que quedaron a medias.')
      return
    }
    setError('')
    try {
      const referenciasPayload = referencias.reduce((acc, row) => {
        if (isReferenciaRowEmpty(row)) return acc
        const esInterna = REFERENCIA_TIPOS_INTERNOS.includes(row.tipo)
        if (esInterna) {
          if (row.docLocalId) acc.push({ docLocalId: Number(row.docLocalId), razon: row.razon.trim() || undefined })
        } else if (row.folio.trim()) {
          acc.push({ tipoDocRef: row.tipo || undefined, folioRef: row.folio.trim(), fechaRef: row.fecha, razon: row.razon.trim() || undefined })
        }
        return acc
      }, [])
      const result = await emitir.mutateAsync({
        ordenId: venta.id,
        clienteId: venta.clienteId || venta.cliente?.id,
        guiaDespachoId,
        tipoDte: detectedTipo,
        receptor,
        items: payloadItems,
        ...(esGuia ? { extra: { indTraslado: Number(indTraslado), tipoDespacho: Number(tipoDespacho) } } : {}),
        ...(referenciasPayload.length ? { referencias: referenciasPayload } : {}),
        ...(documentInput || {}),
      })
      onSuccess?.(result)
    } catch (cause) { setError(getError(cause)) }
  }

  const referenciasUi = !documentInput?.referencias && <>
    <div style={{ marginTop: 16, marginBottom: 8, padding: '10px 12px', borderRadius: 8, background: referenciaPrioritaria ? 'var(--blue-50)' : 'var(--bg)' }}><div style={{ fontSize: 13, fontWeight: 700 }}>{referenciaPrioritaria ? 'Primero: documento que corrige o anula' : 'Referencias (opcional)'}</div><div style={{ marginTop: 2, color: 'var(--text-2)', fontSize: 12 }}>{referenciaPrioritaria ? 'Busca la venta por RUT u orden interna y agrega uno o más DTE emitidos. También puedes agregar referencias externas.' : 'Puedes relacionar más de una guía, orden de compra u otro documento antes de emitir.'}</div></div>
    <VentaReferenceSearch selected={ventaReferencia} onSelect={setVentaReferencia} autoFocus={referenciaPrioritaria} />
    {ventaReferencia && <DocumentosVenta venta={ventaReferencia} documentos={documentosVentaReferencia.data?.documentos || []} loading={documentosVentaReferencia.isLoading} onAdd={agregarDocumentoVenta} referencedIds={referencias.map(row => String(row.docLocalId)).filter(Boolean)} />}
    {referencias.length === 0 ? (
      <button type="button" onClick={addReferenciaRow} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600, fontSize: 13, padding: 0, marginBottom: 4 }}>
        + Agregar referencia {referenciaPrioritaria ? 'sin venta' : '(opcional — guía ya enviada, orden de compra del cliente, etc.)'}
      </button>
    ) : (
      <div style={{ marginBottom: 4 }}>
        {referencias.map((row, index) => <ReferenciaRow key={index} value={row} onChange={patch => updateReferenciaRow(index, patch)} onRemove={() => removeReferenciaRow(index)} />)}
        <button type="button" onClick={addReferenciaRow} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600, fontSize: 13, padding: 0, marginTop: 4 }}>+ Agregar otra referencia</button>
      </div>
    )}
  </>

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
    {referenciaPrioritaria && referenciasUi}
    <Preview empresa={empresa} receptor={receptor} items={items} tipoDte={detectedTipo} referencias={documentInput?.referencias || referencias} totales={previewTotales} />
    {esGuia && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
        <SelectField label="Motivo del traslado" value={indTraslado} options={IND_TRASLADO} onChange={value => { setIndTraslado(value); setError('') }} />
        <SelectField label="Tipo de despacho" value={tipoDespacho} options={TIPO_DESPACHO} onChange={value => { setTipoDespacho(value); setError('') }} />
      </div>
    )}
    {!referenciaPrioritaria && referenciasUi}
    {error && <div style={errorStyle}>{error}</div>}
    <div style={footerStyle}><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn icon="send" onClick={confirmar} disabled={emitir.isPending || !(documentInput?.detalles?.length || payloadItems.length) || referenciasIncompletas}>{emitir.isPending ? 'Emitiendo...' : 'Confirmar y emitir'}</Btn></div>
  </Modal>
}

function VentaReferenceSearch({ selected, onSelect, autoFocus = false }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  useEffect(() => { const timeout = setTimeout(() => setDebounced(query.trim()), 300); return () => clearTimeout(timeout) }, [query])
  useEffect(() => { const close = event => { if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false) }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close) }, [])
  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])
  const { data, isFetching } = useVentas({ search: debounced, limit: 8 }, { enabled: debounced.length >= 2 })
  const ventas = debounced.length >= 2 ? data?.items || [] : []
  return <div ref={boxRef} style={{ position: 'relative', marginBottom: 10 }}>
    <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>Buscar venta para referenciar</label>
    <input ref={inputRef} value={query} onChange={event => { setQuery(event.target.value); setOpen(true) }} onFocus={() => debounced.length >= 2 && setOpen(true)} placeholder="RUT del cliente o N° de orden interna..." style={{ ...inputStyle, background: '#fff' }} />
    {open && debounced.length >= 2 && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 210, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', boxShadow: 'var(--shadow-md)' }}>{isFetching && <div style={{ padding: 10, color: 'var(--text-3)', fontSize: 12 }}>Buscando...</div>}{!isFetching && !ventas.length && <div style={{ padding: 10, color: 'var(--text-3)', fontSize: 12 }}>Sin ventas encontradas.</div>}{ventas.map(venta => <button key={venta.id} type="button" onClick={() => { onSelect(venta); setQuery(''); setOpen(false) }} style={{ display: 'block', width: '100%', padding: '9px 10px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}><div style={{ fontWeight: 700 }}>Orden #{venta.nInterno || venta.id} · {venta.cliente?.razonSocial || venta.cliente?.nombre || 'Sin cliente'}</div><div style={{ marginTop: 2, color: 'var(--text-3)', fontSize: 11 }}>{venta.cliente?.rut || venta.rutCliente || ''} · {dateFmt(venta.createdAt)} · {fmt(venta.total)}</div></button>)}</div>}
    {selected && <div style={{ marginTop: 7, color: 'var(--text-2)', fontSize: 12 }}>Venta seleccionada: <strong>#{selected.nInterno || selected.id}</strong> — {selected.cliente?.razonSocial || selected.cliente?.nombre || 'Sin cliente'}</div>}
  </div>
}

function DocumentosVenta({ venta, documentos, loading, onAdd, referencedIds }) {
  const compatibles = documentos.filter(isDteReferenciable)
  return <div style={{ marginBottom: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}><div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700 }}>DTE emitidos de la orden #{venta.nInterno || venta.id}</div>{loading && <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Buscando documentos...</div>}{!loading && !compatibles.length && <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Esta venta no tiene Factura, Guía, Nota de Débito o Nota de Crédito emitida para agregar como referencia.</div>}{compatibles.map(doc => { const agregado = referencedIds.includes(String(doc.id)); return <button key={doc.id} type="button" disabled={agregado} onClick={() => onAdd(doc)} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 10, padding: '7px 0', border: 'none', borderTop: '1px solid var(--border)', background: 'none', color: agregado ? 'var(--text-3)' : 'var(--blue)', cursor: agregado ? 'default' : 'pointer', textAlign: 'left', fontSize: 12 }}><span>{TIPOS_DTE[doc.tipoDte]} · folio {doc.folio}</span><span>{agregado ? 'Agregada' : '+ Agregar referencia'}</span></button> })}</div>
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

// Cada fila hace su propio fetch de documentos locales cuando el tipo es
// interno (33/52/56/61) — por eso es un componente aparte y no un loop
// dentro de EmitirDteModal (los hooks no pueden llamarse variable cantidad
// de veces en un mismo componente).
function ReferenciaRow({ value, onChange, onRemove }) {
  const esInterna = REFERENCIA_TIPOS_INTERNOS.includes(value.tipo)
  const documentosRef = useDocumentos({ tipoDte: value.tipo }, { enabled: esInterna })
  const documentos = (documentosRef.data?.documentos || []).filter(isDteReferenciable)
  const incompleta = !isReferenciaRowEmpty(value) && (esInterna ? !value.docLocalId : !value.folio.trim())
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>Referencia</div>
        <button type="button" onClick={onRemove} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>Quitar</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: esInterna ? '1.4fr 2fr' : '1.4fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <SelectField label="Tipo de documento referenciado" value={value.tipo} options={REFERENCIA_TIPOS} onChange={tipo => onChange({ tipo, docLocalId: '', folio: '', fecha: '' })} />
        {esInterna ? (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Documento emitido</label>
            <select value={value.docLocalId} onChange={event => {
              const documento = documentos.find(doc => String(doc.id) === event.target.value)
              onChange(documento ? { ...buildReferenciaInternaRow(documento), razon: value.razon } : { docLocalId: '', folio: '', fecha: '' })
            }} style={{ ...inputStyle, background: '#fff' }} disabled={documentosRef.isLoading}>
              <option value="">{documentosRef.isLoading ? 'Cargando...' : 'Seleccionar...'}</option>
              {documentos.map(doc => (
                <option key={doc.id} value={doc.id}>Folio {doc.folio} — {doc.receptor?.razonSocial || 'sin receptor'} — {dateFmt(doc.fechaEmision)}</option>
              ))}
            </select>
            {!documentosRef.isLoading && !documentos.length && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>No hay {TIPOS_DTE[Number(value.tipo)]?.toLowerCase()} emitidas todavía.</div>
            )}
          </div>
        ) : (
          <>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>N° / Folio</label>
              <input value={value.folio} onChange={event => onChange({ folio: event.target.value })} style={inputStyle} placeholder="Ej: 1234" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Fecha</label>
              <input type="date" value={value.fecha} onChange={event => onChange({ fecha: event.target.value })} style={inputStyle} />
            </div>
          </>
        )}
      </div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Razón</label>
      <input value={value.razon} onChange={event => onChange({ razon: event.target.value })} style={inputStyle} placeholder="Ej: Orden de compra del cliente" />
      {incompleta && (
        <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 6 }}>
          {esInterna ? 'Falta elegir el documento.' : 'Falta el N°/Folio.'} Complétalo o quita la referencia para seguir.
        </div>
      )}
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
