import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader, Btn } from '../../components/shared'
import { FormField, Input } from '../../components/forms'
import { EmitirDteModal } from '../../components/facturacion/DteModals'
import { DteItemsEditor } from '../../components/facturacion/DteItemsEditor'
import { NotaDteFlow } from '../../components/facturacion/NotaDteFlow'
import { useClientes } from '../../api/clientes'
import { useCreateVenta, useVenta, useVentas } from '../../api/ventas'
import { useCotizaciones, useCrearVentaDesdeLicitacion } from '../../api/cotizaciones'
import { computeDteTotales, mapManualDteItems, puedeCrearVentaDesdeEmision, TIPOS_DTE } from '../../utils/facturacion'
import { toast } from '../../store/notif'

const TIPOS_EMISION = [
  { id: 33, ayuda: 'Venta afecta con IVA' },
  { id: 39, ayuda: 'Venta directa al cliente' },
  { id: 52, ayuda: 'Traslado o entrega de mercadería' },
  { id: 56, ayuda: 'Aumenta o corrige un documento emitido' },
  { id: 61, ayuda: 'Anula o rebaja un documento emitido' },
]

const TIPOS_VENTA = [
  { value: '', label: 'No es una venta' },
  { value: 'Licitación', label: 'Licitación' },
  { value: 'Convenio Marco', label: 'Convenio Marco' },
  { value: 'Venta Web', label: 'Venta Web' },
  { value: 'Venta Sala', label: 'Venta Sala' },
]

function Autocomplete({ label, placeholder, search, useSearch, onSelect, renderItem }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 300); return () => clearTimeout(timer) }, [query])
  useEffect(() => { const close = event => { if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false) }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close) }, [])
  const { data, isFetching } = useSearch(search(debounced), { enabled: debounced.length >= 2 })
  const items = debounced.length >= 2 ? data?.items || [] : []
  return <div ref={boxRef} style={{ position: 'relative', marginBottom: 16 }}>
    <FormField label={label}><Input value={query} onChange={value => { setQuery(value); setOpen(true) }} placeholder={placeholder} /></FormField>
    {open && debounced.length >= 2 && <div style={dropdownStyle}>
      {isFetching && <Result>Buscando...</Result>}
      {!isFetching && !items.length && <Result>Sin resultados</Result>}
      {items.map(item => <button key={item.id} type="button" onClick={() => { onSelect(item); setQuery(''); setOpen(false) }} style={resultButton}>{renderItem(item)}</button>)}
    </div>}
  </div>
}

function ClienteAutocomplete({ onSelect }) {
  return <Autocomplete label="Buscar cliente existente" placeholder="RUT o nombre..." search={value => ({ search: value, limit: 8 })} useSearch={useClientes} onSelect={onSelect} renderItem={item => <><b>{item.razonSocial || item.nombre}</b><small>{item.rut}</small></>} />
}

function VentaAutocomplete({ onSelect }) {
  return <Autocomplete label="Buscar venta existente" placeholder="RUT del cliente o N° de orden interna..." search={value => ({ search: value, limit: 8 })} useSearch={useVentas} onSelect={onSelect} renderItem={item => <><b>#{item.nInterno || item.id} · {item.cliente?.razonSocial || item.cliente?.nombre || 'Cliente'}</b><small>{item.cliente?.rut || 'Sin RUT'} · Total {money(item.total)}</small></>} />
}

function LicitacionAutocomplete({ onSelect }) {
  return <Autocomplete label="Buscar licitación adjudicada" placeholder="ID de licitación, OC o referencia..." search={value => ({ search: value, estado: 'Adjudicada', limit: 8 })} useSearch={useCotizaciones} onSelect={onSelect} renderItem={item => <><b>{item.idLicitacion || `Licitación #${item.id}`} · {item.estado}</b><small>{item.ordenCompra || 'Sin OC'} · {item.rutCliente || 'Sin RUT'} · {item.ordenId ? `Venta #${item.ordenId}` : 'Sin venta'}</small></>} />
}

const dropdownStyle = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px oklch(0 0 0 / .12)', maxHeight: 240, overflowY: 'auto' }
const resultButton = { display: 'grid', width: '100%', gap: 2, padding: '8px 10px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }
const Result = ({ children }) => <div style={{ padding: 10, color: 'var(--text-3)', fontSize: 12 }}>{children}</div>
const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('es-CL')
const isVentaTipo = tipo => !!tipo

function despachoUrl(venta) {
  const params = new URLSearchParams({ action: 'new', ordenId: String(venta.id), nInterno: String(venta.nInterno || ''), direccion: venta.direccionDespacho || '', region: venta.regionDespacho || '', comuna: venta.comunaDespacho || '' })
  return `/despachos?${params.toString()}`
}

function VentaBloqueada({ venta, onClear, guia }) {
  return <section style={linkedStyle}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong>Venta #{venta.nInterno || venta.id} vinculada</strong><div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 4 }}>{venta.cliente?.razonSocial || venta.cliente?.nombre} · {venta.cliente?.rut}</div></div><Btn variant="ghost" onClick={onClear}>Cambiar venta</Btn></div>
    <div style={{ marginTop: 12, color: 'var(--text-2)', fontSize: 13 }}>{venta.items?.length || 0} ítem{venta.items?.length === 1 ? '' : 's'} · Total de la venta <strong>{money(venta.total)}</strong></div>
    {!!venta.items?.length && <div style={itemsTableStyle}><div style={itemsHeadStyle}><span>Código</span><span>Ítem</span><span style={{ textAlign: 'right' }}>Cant.</span><span style={{ textAlign: 'right' }}>P. unit. IVA inc.</span><span style={{ textAlign: 'right' }}>Subtotal</span></div>{venta.items.map(item => <div key={item.id} style={itemsRowStyle}><span style={skuStyle}>{item.codigoInterno || item.producto?.codigoInterno || '—'}</span><span>{item.nombre || item.producto?.nombre || `Producto #${item.productoId || item.id}`}</span><span style={{ textAlign: 'right' }}>{item.cantidad}</span><span style={{ textAlign: 'right' }}>{money(item.precioUnitario)}</span><span style={{ textAlign: 'right', fontWeight: 600 }}>{money(Number(item.cantidad || 0) * Number(item.precioUnitario || 0))}</span></div>)}</div>}
    <div style={{ marginTop: 10, color: 'var(--text-3)', fontSize: 12 }}>{guia ? 'La preparación y las cantidades a despachar se gestionan en Despachos.' : 'Los ítems quedan bloqueados aquí para que el documento conserve exactamente el total de la venta.'}</div>
  </section>
}

export default function EmitirManualPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const contextualTipoDte = Number(searchParams.get('tipoDte'))
  const contextualOrdenId = Number(searchParams.get('ordenId'))
  const contextualDocumentoId = Number(searchParams.get('documentoId'))
  const hasContextualNote = [56, 61].includes(contextualTipoDte) && Number.isInteger(contextualOrdenId) && contextualOrdenId > 0
  const createVenta = useCreateVenta()
  const crearVentaDesdeLicitacion = useCrearVentaDesdeLicitacion()
  const [tipoDte, setTipoDte] = useState(hasContextualNote ? contextualTipoDte : 33)
  const [ventaId, setVentaId] = useState(null)
  const [ventaCreada, setVentaCreada] = useState(null)
  const [sinVenta, setSinVenta] = useState(false)
  const [tipoVenta, setTipoVenta] = useState('')
  const [licitacionSeleccionada, setLicitacionSeleccionada] = useState(null)
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [licitacion, setLicitacion] = useState('')
  const [receptor, setReceptor] = useState({ rut: '', razonSocial: '', giro: '', direccion: '', comuna: '', ciudad: '' })
  const [items, setItems] = useState([])
  const [showModal, setShowModal] = useState(false)
  const { data: ventaEncontrada, isFetching: cargandoVenta } = useVenta(ventaId)
  const ventaVinculada = ventaCreada || ventaEncontrada
  const esNota = [56, 61].includes(tipoDte)
  const esGuia = tipoDte === 52
  const esBoletaTipo = tipoDte === 39
  const permiteVenta = [33, 39, 52].includes(tipoDte)
  const setField = (field, value) => { if (clienteSeleccionado) setClienteSeleccionado(null); setReceptor(current => ({ ...current, [field]: value })) }
  const selectCliente = cliente => { setClienteSeleccionado(cliente); setReceptor({ rut: cliente.rut || '', razonSocial: cliente.razonSocial || cliente.nombre || '', giro: cliente.giro || '', direccion: cliente.direccion || '', comuna: cliente.comuna || '', ciudad: cliente.ciudad || '' }) }
  const itemsDte = useMemo(() => mapManualDteItems(items), [items])
  const totales = useMemo(() => computeDteTotales(itemsDte), [itemsDte])
  const receptorInformado = receptor.rut.trim() && receptor.razonSocial.trim()
  const ventaSintetica = { id: null, clienteId: null, cliente: receptor, items: [] }
  const necesitaCliente = isVentaTipo(tipoVenta)
  const esLicitacion = tipoVenta === 'Licitación'
  const puedeCrearVenta = puedeCrearVentaDesdeEmision({ cliente: clienteSeleccionado, tipo: tipoVenta, items, licitacion })
  const puedeContinuarManual = esLicitacion ? Boolean(licitacionSeleccionada) : itemsDte.length > 0 && (esGuia || esBoletaTipo || receptorInformado) && (!necesitaCliente || puedeCrearVenta)

  const seleccionarTipo = id => {
    setTipoDte(id); setVentaId(null); setVentaCreada(null); setSinVenta(false); setShowModal(false)
  }
  const seleccionarVenta = venta => { setVentaId(venta.id); setVentaCreada(null); setSinVenta(false) }
  const emitirManual = async () => {
    if (esLicitacion) {
      if (!licitacionSeleccionada) return toast.error('Selecciona una licitación adjudicada antes de continuar.')
      try {
        const result = await crearVentaDesdeLicitacion.mutateAsync(licitacionSeleccionada.id)
        const creada = result?.orden
        if (!creada?.id) throw new Error('La licitación no devolvió una venta creada.')
        setVentaId(creada.id)
        setVentaCreada(null)
        if (esGuia) return navigate(despachoUrl(creada))
        toast.success(`Venta #${creada.nInterno || creada.id} creada desde licitación.`)
      } catch (error) {
        toast.error(error?.response?.data?.error || error.message || 'No fue posible crear la venta desde la licitación.')
      }
      return
    }
    if (!necesitaCliente) return setShowModal(true)
    if (!clienteSeleccionado) return toast.error('Para crear una venta debes seleccionar un cliente existente o crearlo en Clientes.')
    if (!puedeCrearVenta) return toast.error('La venta requiere cliente existente, productos del catálogo, cantidades enteras y sus datos obligatorios.')
    const payload = { tipo: tipoVenta, clienteId: Number(clienteSeleccionado.id), items: items.map(item => ({ productoId: Number(item.productoId), cantidad: Number(item.cantidad), precioUnitario: Number(item.precioUnitario), nombre: item.nombre || undefined, descripcion: item.descripcion || undefined, codigoInterno: item.codigoInterno || undefined })), ...(tipoVenta === 'Convenio Marco' ? { licitacion: licitacion.trim() } : {}) }
    try {
      const creada = await createVenta.mutateAsync(payload)
      setVentaCreada(creada)
      if (esGuia) return navigate(despachoUrl(creada))
      setShowModal(true)
    } catch (error) {
      toast.error(error?.response?.data?.error || 'No fue posible crear la venta antes de emitir.')
    }
  }

  const documentoVinculado = permiteVenta && ventaVinculada
  const mostrarManual = !esNota && (!permiteVenta || (sinVenta && !ventaVinculada))
  const subtitle = documentoVinculado ? `${TIPOS_DTE[tipoDte]} vinculada a venta #${ventaVinculada.nInterno || ventaVinculada.id}` : `${TIPOS_DTE[tipoDte]}${sinVenta ? ' sin venta asociada' : ''}`

  return <main className="page page-wide">
    <PageHeader title="Emitir documento" subtitle={subtitle} breadcrumb={['Inicio', 'Facturación', 'Emitir documento']} />
    <section style={cardStyle}>
      <div style={stepTitle}>1. Tipo de documento</div>
      <div role="group" aria-label="Tipo de documento" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 8 }}>
        {TIPOS_EMISION.map(tipo => <button key={tipo.id} type="button" onClick={() => seleccionarTipo(tipo.id)} aria-pressed={tipo.id === tipoDte} style={{ padding: '11px 12px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', border: tipo.id === tipoDte ? '2px solid var(--blue)' : '1px solid var(--border)', background: tipo.id === tipoDte ? 'var(--blue-50)' : '#fff', color: 'var(--text)' }}><span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{tipo.id} · {TIPOS_DTE[tipo.id]}</span><span style={{ display: 'block', marginTop: 3, color: 'var(--text-2)', fontSize: 11 }}>{tipo.ayuda}</span></button>)}
      </div>
      {esNota && <div style={infoStyle}><strong>Nota de crédito o débito:</strong> {hasContextualNote ? `la venta #${contextualOrdenId} y su documento tributario válido se cargaron como referencia.` : 'busca el DTE original por RUT o documento, revisa las operaciones permitidas y previsualiza la nota antes de emitirla al SII.'}</div>}
      {esGuia && <div style={infoStyle}><strong>Guía de despacho:</strong> una venta encontrada se prepara desde Despachos, donde ya existe el control de cantidades por enviar.</div>}
    </section>

    {esNota && <NotaDteFlow
      tipoDte={tipoDte}
      ordenId={hasContextualNote ? contextualOrdenId : null}
      preselectedDocumentId={hasContextualNote && tipoDte === contextualTipoDte && Number.isInteger(contextualDocumentoId) && contextualDocumentoId > 0 ? contextualDocumentoId : null}
      onSuccess={({ emitido, documento }) => { toast.success(`DTE emitido${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`); navigate('/facturacion/documentos') }}
    />}

    {permiteVenta && !ventaVinculada && !sinVenta && <section style={cardStyle}>
      <div style={stepTitle}>2. Buscar venta</div>
      <VentaAutocomplete onSelect={seleccionarVenta} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ color: 'var(--text-2)', fontSize: 13 }}>Busca por RUT o número interno para vincular el documento a una venta real.</span><Btn variant="ghost" onClick={() => setSinVenta(true)}>Continuar sin venta asociada</Btn></div>
    </section>}

    {permiteVenta && cargandoVenta && <section style={cardStyle}>Cargando venta seleccionada...</section>}
    {documentoVinculado && <section style={cardStyle}>
      <VentaBloqueada venta={ventaVinculada} guia={esGuia} onClear={() => { setVentaId(null); setVentaCreada(null); setSinVenta(false) }} />
      {esGuia ? <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}><Btn variant="primary" onClick={() => navigate(despachoUrl(ventaVinculada))}>Continuar en Despachos</Btn></div> : <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}><Btn variant="primary" onClick={() => setShowModal(true)}>Continuar a emisión</Btn></div>}
    </section>}

    {mostrarManual && <section style={cardStyle}>
      {/* Crear una venta nueva (Licitación/Convenio Marco/Venta Web/Venta Sala) desde
          esta pantalla solo tiene sentido para Factura/Boleta: una Guía siempre
          referencia una venta que ya existe (paso "Buscar venta" de arriba) o va
          huérfana (traslado interno) — no se inventa una venta nueva desde aquí. */}
      {permiteVenta && !esGuia && <><div style={stepTitle}>2. Origen del documento</div><FormField label="Tipo de venta (opcional)"><select value={tipoVenta} onChange={event => { setTipoVenta(event.target.value); setLicitacionSeleccionada(null) }} style={selectStyle}>{TIPOS_VENTA.map(tipo => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}</select></FormField><div style={infoStyle}>{esLicitacion ? 'La venta se creará desde una licitación adjudicada existente; sus ítems, cliente y condiciones no se reconstruyen aquí.' : necesitaCliente ? 'Se creará primero una venta real y el documento quedará vinculado a ella.' : 'Este documento seguirá siendo huérfano: se emitirá sin orden de venta asociada.'}</div></>}
      {esGuia && <div style={infoStyle}>Guía sin venta asociada: se emitirá como traslado huérfano (interno, muestra, devolución, etc.). Si corresponde a una venta, cierra esto y búscala por N° interno o RUT arriba.</div>}
      {esLicitacion ? <><div style={{ marginTop: 20 }}><LicitacionAutocomplete onSelect={setLicitacionSeleccionada} /></div>{licitacionSeleccionada && <div style={linkedStyle}><strong>{licitacionSeleccionada.idLicitacion || `Licitación #${licitacionSeleccionada.id}`}</strong><div style={{ marginTop: 4, color: 'var(--text-2)', fontSize: 13 }}>Estado: {licitacionSeleccionada.estado} · OC: {licitacionSeleccionada.ordenCompra || '—'} · {licitacionSeleccionada.ordenId ? `Ya vinculada a venta #${licitacionSeleccionada.ordenId}` : 'Sin venta vinculada'}</div><div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>El endpoint validará adjudicación, plazo, OC, cliente canónico y productos adjudicados antes de crear la venta.</div></div>}</> : <><div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: permiteVenta ? 20 : 0 }}><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{permiteVenta ? '3.' : '2.'} Receptor</h3>{esGuia && <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Opcional sólo para traslado interno</span>}{esBoletaTipo && <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Opcional — boleta a consumidor final</span>}</div>
      {esBoletaTipo && <div style={infoStyle}>El SII no exige RUT ni giro para una boleta a consumidor final. Déjalo en blanco y se emite como "Consumidor Final" (66.666.666-6); solo complétalo si el cliente lo pide para su contabilidad.</div>}
      <ClienteAutocomplete onSelect={selectCliente} />
      {necesitaCliente && <div style={infoStyle}>{clienteSeleccionado ? <><strong>{clienteSeleccionado.razonSocial || clienteSeleccionado.nombre}</strong> será el cliente de la nueva venta.</> : <>Selecciona un cliente existente. Si no existe, <button type="button" onClick={() => navigate('/clientes')} style={linkStyle}>créalo en Clientes</button> antes de emitir.</>}</div>}
      <div style={grid2}><FormField label="RUT"><Input value={receptor.rut} onChange={value => setField('rut', value)} placeholder={esGuia ? 'Requerido salvo traslado interno' : esBoletaTipo ? 'Opcional' : 'RUT del receptor'} /></FormField><FormField label="Razón social / Nombre"><Input value={receptor.razonSocial} onChange={value => setField('razonSocial', value)} placeholder={esBoletaTipo ? 'Opcional' : undefined} /></FormField></div>
      <div style={grid2}><FormField label="Giro"><Input value={receptor.giro} onChange={value => setField('giro', value)} /></FormField><FormField label="Dirección"><Input value={receptor.direccion} onChange={value => setField('direccion', value)} /></FormField></div>
      <div style={{ ...grid2, marginBottom: 20 }}><FormField label="Comuna"><Input value={receptor.comuna} onChange={value => setField('comuna', value)} /></FormField><FormField label="Ciudad"><Input value={receptor.ciudad} onChange={value => setField('ciudad', value)} /></FormField></div>
      {tipoVenta === 'Convenio Marco' && <><FormField label="Orden de compra / Convenio Marco"><Input value={licitacion} onChange={setLicitacion} placeholder="OC requerida" /></FormField><div style={infoStyle}>Convenio Marco no tiene una ficha independiente: la OC es el identificador real, único y validado por el backend.</div></>}
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{permiteVenta ? '4.' : '3.'} Ítems</h3>
      <DteItemsEditor items={items} onChange={setItems} />
      {necesitaCliente && !puedeCrearVenta && <div style={infoStyle}>Para crear la venta debes seleccionar un cliente existente y usar productos del catálogo con cantidades enteras. Convenio Marco requiere OC. Los ítems manuales sólo sirven para emisión huérfana.</div>}</>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 22 }}><span style={{ color: 'var(--text-3)', fontSize: 12 }}>{esLicitacion ? 'Se utilizarán los ítems adjudicados de la licitación seleccionada.' : !esGuia && !esBoletaTipo && !receptorInformado ? 'Falta informar RUT y razón social del receptor.' : `${itemsDte.length} ítem${itemsDte.length === 1 ? '' : 's'} listo${itemsDte.length === 1 ? '' : 's'} · Total ${money(totales.total)}`}</span><div style={{ display: 'flex', gap: 8 }}><Btn variant="ghost" onClick={() => navigate('/facturacion/documentos')}>Cancelar</Btn><Btn variant="primary" disabled={!puedeContinuarManual || createVenta.isPending || crearVentaDesdeLicitacion.isPending} onClick={emitirManual}>{esLicitacion ? 'Crear venta desde licitación' : necesitaCliente ? 'Crear venta y continuar' : 'Continuar a emisión'}</Btn></div></div>
    </section>}

    {showModal && <EmitirDteModal venta={documentoVinculado ? ventaVinculada : ventaSintetica} tipoDte={tipoDte} {...(!documentoVinculado ? { documentInput: { items: itemsDte }, previewItems: itemsDte, previewTotales: totales } : {})} referenceFirst={esNota} onClose={() => setShowModal(false)} onSuccess={({ emitido, documento }) => { setShowModal(false); toast.success(`DTE emitido${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`); navigate('/facturacion/documentos') }} />}
  </main>
}

const cardStyle = { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, maxWidth: 1120, marginBottom: 16 }
const linkedStyle = { padding: 14, borderRadius: 8, background: 'var(--blue-50)', border: '1px solid var(--blue-200)' }
const itemsTableStyle = { marginTop: 12, border: '1px solid var(--border)', borderRadius: 6, overflowX: 'auto', background: '#fff', minWidth: 620 }
const itemsHeadStyle = { display: 'grid', gridTemplateColumns: '115px minmax(180px, 1fr) 65px 125px 100px', gap: 8, padding: '8px 10px', background: 'var(--bg)', color: 'var(--text-3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }
const itemsRowStyle = { display: 'grid', gridTemplateColumns: '115px minmax(180px, 1fr) 65px 125px 100px', gap: 8, padding: '8px 10px', borderTop: '1px solid var(--border)', fontSize: 12, alignItems: 'center' }
const skuStyle = { color: 'var(--text-3)', fontFamily: "'DM Mono', monospace", fontSize: 11 }
const stepTitle = { fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 10 }
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }
const infoStyle = { marginTop: 14, padding: '10px 12px', borderRadius: 8, background: 'var(--bg)', color: 'var(--text-2)', fontSize: 13 }
const selectStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 6, background: '#fff', padding: '9px 10px', fontFamily: 'inherit' }
const linkStyle = { border: 0, background: 'none', padding: 0, color: 'var(--blue)', font: 'inherit', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }
