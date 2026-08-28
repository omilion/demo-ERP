import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Btn, PageHeader } from '../../components/shared'
import { useCrmDetalle, useCrmGestionCreate, useCrmPatch, useCrmTransicion, useUpdateCrmCotizacion } from '../../api/crm'
import { useUpdateOrdenCompraItems } from '../../api/ordenesCompra'
import { PRODUCT_PLACEHOLDER_IMAGE, useProductPlaceholderOnError } from '../../utils/assets'
import { toast, confirmDialog, promptDialog } from '../../store/notif'

const STAGES = [
  ['PENDIENTE_CLASIFICACION', 'Por clasificar'], ['COTIZACION_ENVIADA', 'Cotización enviada'],
  ['SEGUIMIENTO', 'Seguimiento'], ['VENTA_APROBADA', 'Venta aprobada'], ['CERRADO', 'Cerrado'],
]
const money = value => Number(value || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const input = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: '#fff', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13 }

function readableText(value) {
  const text = String(value || '')
  if (!/[ÃÂ]/.test(text)) return text
  try { return decodeURIComponent(escape(text)) } catch { return text }
}

function excerpt(value, words = 20) {
  const text = readableText(value).trim()
  const parts = text.split(/\s+/)
  return { text: parts.slice(0, words).join(' '), truncated: parts.length > words }
}

function Field({ label, children, full }) {
  return <label style={{ display: 'block', gridColumn: full ? '1 / -1' : 'auto' }}><span style={{ display: 'block', color: 'var(--text-3)', fontSize: 10, fontWeight: 750, letterSpacing: .4, textTransform: 'uppercase', marginBottom: 5 }}>{label}</span>{children}</label>
}

function Section({ title, tint = '#fff', children }) {
  return <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: tint, padding: 16, marginBottom: 14 }}><div style={{ fontSize: 12, fontWeight: 750, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: .45, paddingBottom: 10, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>{title}</div>{children}</section>
}

function Description({ value }) {
  const [expanded, setExpanded] = useState(false)
  const short = excerpt(value)
  return <div style={{ color: 'var(--text-2)', lineHeight: 1.4 }}>{expanded ? readableText(value) : short.text || '—'}{short.truncated && <button type="button" onClick={() => setExpanded(open => !open)} style={{ display: 'block', marginTop: 5, padding: 0, border: 0, background: 'none', color: 'var(--green-800)', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>{expanded ? 'Ver menos' : 'Ver descripción completa'}</button>}</div>
}

function ProductDetail({ oc, cotizacion, licitacion, crmId, items, setItems }) {
  const [editing, setEditing] = useState(false)
  const updateItems = useUpdateOrdenCompraItems()
  const updateCrmCotizacion = useUpdateCrmCotizacion()
  const total = items.reduce((sum, product) => sum + Number(product.precio || 0) * Number(product.cantidad || 0), 0)
  const crmQuote = !oc && cotizacion
  const legacyLicitacion = !oc && !cotizacion && licitacion
  if (!oc && !cotizacion && !licitacion) return <Section title="Cotización"><div style={{ color: 'var(--text-3)', fontSize: 13 }}>Este registro no tiene una cotización vinculada.</div></Section>
  const update = (index, data) => setItems(current => current.map((item, pos) => pos === index ? { ...item, ...data } : item))
  const remove = index => setItems(current => current.filter((_, pos) => pos !== index))
  const add = () => setItems(current => [...current, { id: `new-${Date.now()}`, codigoInterno: '', nombre: '', descripcion: '', cantidad: 1, precio: 0 }])
  const saveItems = async () => {
    if (!items.length) return toast.warning('La cotización debe conservar al menos un producto')
    try {
      if (crmQuote) {
        await updateCrmCotizacion.mutateAsync({
          crmId: crmId || cotizacion?.crmId,
          items: items.map(({ productoId, codigoInterno, nombre, descripcion, cantidad, cantAdjudicados, precio }) => ({
            productoId: Number(productoId), codigoInterno, nombre, descripcion,
            cantidad: Number(cantidad), precioUnitario: Number(precio),
            // Vacio significa adjudicacion no registrada: se vende lo cotizado.
            cantAdjudicados: cantAdjudicados === '' || cantAdjudicados === undefined || cantAdjudicados === null ? null : Number(cantAdjudicados),
          })),
        })
        setEditing(false)
        toast.success('Cotizacion CRM actualizada')
        return
      }
      await updateItems.mutateAsync({ id: oc.id, items: items.map(({ codigoInterno, nombre, descripcion, cantidad, precio }) => ({ codigoInterno, nombre, descripcion, cantidad: Number(cantidad), precio: Number(precio) })) })
      setEditing(false)
      toast.success('Productos y total de la cotización actualizados')
    } catch (error) { toast.error(error.response?.data?.error || 'No se pudieron actualizar los productos') }
  }
  return <Section title="Cotización y detalle de productos" tint="#f0fdf4">
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 14, alignItems: 'center' }}><div><div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 750 }}>{crmQuote ? `${cotizacion.tipo} · Cotización CRM` : legacyLicitacion ? `Licitación #${licitacion.idLicitacion}` : `OC Online #${oc.nCompra}`}</div><div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>{items.length} ítems · {crmQuote ? 'Aún no ingresa a Matriz de Ventas' : legacyLicitacion ? licitacion.estado || 'Sin estado' : oc.estadoCompra || 'Sin estado'}</div></div><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' }}>Total cotizado</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-800)' }}>{money(total)}</div></div>{oc && (editing ? <><Btn variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancelar</Btn><Btn variant="primary" size="sm" onClick={saveItems} disabled={updateItems.isPending}>{updateItems.isPending ? 'Guardando…' : 'Guardar productos'}</Btn></> : <Btn variant="secondary" size="sm" onClick={() => setEditing(true)}>Editar productos</Btn>)}</div></div>
    <div style={{ overflowX: 'auto', border: '1px solid #bbf7d0', borderRadius: 8, background: '#fff' }}><table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style={{ background: '#ecfdf5' }}>{[['Producto', 'left'], ['Código', 'left'], ['Descripción', 'left'], ['Cant.', 'right'], [crmQuote ? 'Adjud.' : null, 'right'], ['P. unitario', 'right'], ['Total', 'right'], [editing ? '' : null, 'right']].filter(([label]) => label !== null).map(([label, align]) => <th key={label || 'actions'} style={{ padding: '10px 11px', textAlign: align, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase' }}>{label}</th>)}</tr></thead><tbody>{items.map((product, index) => <tr key={product.id || index} style={{ borderTop: '1px solid #ecfdf5', verticalAlign: 'top' }}><td style={{ padding: '10px 11px', minWidth: 180 }}><div style={{ display: 'flex', gap: 9, alignItems: 'center' }}><img src={product.producto?.fotoUrl || PRODUCT_PLACEHOLDER_IMAGE} alt="" loading="lazy" onError={useProductPlaceholderOnError} style={{ width: 40, height: 40, objectFit: 'cover', border: '1px solid var(--border)', borderRadius: 6 }} />{editing ? <input value={product.nombre || ''} onChange={e => update(index, { nombre: e.target.value })} style={input} placeholder="Nombre producto" /> : <strong>{product.nombre || 'Producto sin nombre'}</strong>}</div></td><td style={{ padding: '10px 11px', minWidth: 100 }}>{editing ? <input value={product.codigoInterno || ''} onChange={e => update(index, { codigoInterno: e.target.value })} style={input} /> : <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-3)' }}>{product.codigoInterno || '—'}</span>}</td><td style={{ padding: '10px 11px', minWidth: 245 }}>{editing ? <textarea value={readableText(product.descripcion)} onChange={e => update(index, { descripcion: e.target.value })} rows={3} style={{ ...input, resize: 'vertical' }} /> : <Description value={product.descripcion} />}</td><td style={{ padding: '10px 11px', textAlign: 'right', minWidth: 70 }}>{editing ? <input type="number" min="1" value={product.cantidad} onChange={e => update(index, { cantidad: e.target.value })} style={{ ...input, textAlign: 'right' }} /> : <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 750 }}>{product.cantidad}</span>}</td>{crmQuote && <td style={{ padding: '10px 11px', textAlign: 'right', minWidth: 80 }} title="Cantidad adjudicada. En blanco = adjudicación no registrada: la venta se crea por la cantidad cotizada.">{editing ? <input type="number" min="0" max={product.cantidad} value={product.cantAdjudicados ?? ''} placeholder="—" onChange={e => update(index, { cantAdjudicados: e.target.value })} style={{ ...input, textAlign: 'right' }} /> : <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 750, color: product.cantAdjudicados != null && product.cantAdjudicados < product.cantidad ? 'var(--red)' : 'inherit' }}>{product.cantAdjudicados ?? '—'}</span>}</td>}<td style={{ padding: '10px 11px', textAlign: 'right', minWidth: 100 }}>{editing ? <input type="number" min="0" value={product.precio} onChange={e => update(index, { precio: e.target.value })} style={{ ...input, textAlign: 'right' }} /> : <span style={{ fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' }}>{money(product.precio)}</span>}</td><td style={{ padding: '10px 11px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 750, whiteSpace: 'nowrap' }}>{money(product.precio * product.cantidad)}</td>{editing && <td style={{ padding: '10px 11px' }}><button type="button" onClick={() => remove(index)} style={{ border: 0, background: 'none', color: 'var(--red)', fontWeight: 700, cursor: 'pointer' }}>Quitar</button></td>}</tr>)}</tbody></table></div>
    {editing && oc && <button type="button" onClick={add} style={{ marginTop: 12, padding: '7px 10px', border: '1px dashed var(--green-700)', borderRadius: 7, background: '#fff', color: 'var(--green-800)', fontWeight: 700, cursor: 'pointer' }}>+ Agregar producto</button>}
    {oc && <Link to={`/ordenes-compra/${oc.id}`} style={{ display: 'inline-block', marginTop: 12, marginLeft: editing ? 12 : 0, color: 'var(--green-800)', fontWeight: 700, fontSize: 13 }}>Abrir OC Online completa →</Link>}
    {crmQuote && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>{editing ? <><Btn variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancelar</Btn><Btn variant="primary" size="sm" onClick={saveItems} disabled={updateCrmCotizacion.isPending}>{updateCrmCotizacion.isPending ? 'Guardando...' : 'Guardar productos'}</Btn></> : <Btn variant="secondary" size="sm" onClick={() => setEditing(true)}>Editar productos</Btn>}</div>}
  </Section>
}

export default function CrmGestionDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: crm, isLoading } = useCrmDetalle(id)
  const patch = useCrmPatch()
  const createGestion = useCrmGestionCreate()
  const transition = useCrmTransicion()
  const [form, setForm] = useState({})
  const [items, setItems] = useState([])
  const [gestion, setGestion] = useState({ tipo: 'LLAMADA', resultado: '', siguienteAccion: '', fechaProximo: '' })
  useEffect(() => { if (crm) { setForm({ prioridad: crm.prioridad || '', fechaProximo: crm.fechaProximo?.slice(0, 10) || '', accion: crm.accion || '', resultado: crm.resultado || '', comentarios: crm.comentarios || '', nombre: crm.nombre || '', rsocial: crm.rsocial || '', email: crm.email || '', telefono: crm.telefono || '' }); setItems(crm.ordenCompraOnline?.items || (crm.cotizacionComercial?.items || []).map(item => ({ ...item, precio: item.precioUnitario })) || crm.cotizacionLicitacion?.items || []) } }, [crm])
  if (isLoading) return <main className="page"><div style={{ padding: 32 }}>Cargando gestión CRM…</div></main>
  if (!crm) return <main className="page"><Btn variant="secondary" onClick={() => navigate('/crm')}>← Volver al CRM</Btn><div style={{ paddingTop: 24 }}>Registro CRM no encontrado.</div></main>
  const set = key => event => setForm(old => ({ ...old, [key]: event.target.value }))
  const currentStage = crm.etapaComercial || 'PENDIENTE_CLASIFICACION'
  const latestDate = crm.ultimaGestionAt || crm.estadoCambiadoAt || crm.updatedAt
  const quoteAction = !crm.esHistorico && !crm.ordenId && !crm.cotizacionComercial
    ? ({ LICITACION: { label: 'Crear cotizacion de Licitacion', path: `/crm/nueva/licitacion?crmId=${crm.id}` } }[crm.canalVenta] || null)
    : null
  const save = async () => { try { await patch.mutateAsync({ id: crm.id, ...form }); toast.success('Datos CRM guardados') } catch (error) { toast.error(error.response?.data?.error || 'No se pudo guardar') } }
  const saveGestion = async () => { if (!gestion.resultado.trim()) return toast.warning('Indica el resultado de la gestión'); try { await createGestion.mutateAsync({ id: crm.id, ...gestion }); setGestion({ tipo: 'LLAMADA', resultado: '', siguienteAccion: '', fechaProximo: '' }); toast.success('Gestión registrada') } catch (error) { toast.error(error.response?.data?.error || 'No se pudo registrar la gestión') } }
  const changeStage = async value => { if (value === currentStage) return; const ok = await confirmDialog({ title: 'Cambiar etapa comercial', detail: value === 'VENTA_APROBADA' ? 'Esto creará la Orden y la enviará a Matriz de Ventas.' : `¿Confirmas cambiar la etapa a “${STAGES.find(([id]) => id === value)?.[1]}”?`, confirmLabel: value === 'VENTA_APROBADA' ? 'Aprobar y crear venta' : 'Cambiar etapa' }); if (!ok) return; try { const extra = {}; if (value === 'VENTA_APROBADA') { const tipo = String(await promptDialog({ title: 'Tipo de confirmación', detail: 'Escribe OC, PAGO, WEBPAY u OTRO.', defaultValue: 'OC' }) || '').trim().toUpperCase(); if (!['OC', 'PAGO', 'WEBPAY', 'OTRO'].includes(tipo)) return toast.warning('Indica OC, PAGO, WEBPAY u OTRO'); const referencia = await promptDialog({ title: 'Referencia de confirmación', detail: 'Folio, número OC o respaldo (opcional).' }); extra.confirmacionTipo = tipo; extra.confirmacionReferencia = referencia || ''; } await transition.mutateAsync({ id: crm.id, etapa: value, ...extra }); toast.success(value === 'VENTA_APROBADA' ? 'Venta aprobada e ingresada a Matriz' : 'Etapa comercial actualizada') } catch (error) { toast.error(error.response?.data?.error || 'No se pudo cambiar la etapa') } }
  return <main className="page page-wide"><PageHeader title={`Gestión CRM · ${crm.nombre || crm.rsocial || crm.email || `#${crm.id}`}`} subtitle={`Cotización #${crm.ncotizacion || crm.id} · ${crm.ejecutiva || 'Sin ejecutivo asignado'}`} breadcrumb={['Inicio', 'Ventas', 'CRM', 'Gestión y detalle']} actions={<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><div style={{ padding: '7px 11px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 7, textAlign: 'left' }}><div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700 }}>Última gestión / cambio</div><div style={{ fontSize: 12, fontWeight: 650, marginTop: 2 }}>{latestDate ? new Date(latestDate).toLocaleString('es-CL') : 'Sin registros'}</div></div><Btn variant="secondary" size="sm" onClick={() => navigate('/crm')}>← Volver al CRM</Btn></div>} />
    {quoteAction && <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 18, padding: '13px 16px', border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 10 }}><div><strong style={{ fontSize: 14 }}>Cotizacion comercial</strong><div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>Abre el formulario de {quoteAction.label.replace('Crear cotizacion ', '')} y la vincula a esta oportunidad.</div></div><Btn variant="primary" size="sm" onClick={() => navigate(quoteAction.path)}>{quoteAction.label}</Btn></section>}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, .82fr) minmax(540px, 1.45fr)', gap: 18, alignItems: 'start' }}>
      <div><Section title="Gestión comercial" tint="#f8fafc"><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Etapa actual"><select value={currentStage} onChange={e => changeStage(e.target.value)} style={input}>{STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Prioridad"><select value={form.prioridad || ''} onChange={set('prioridad')} style={input}><option value="">—</option><option>Alta</option><option>Media</option><option>Baja</option></select></Field><Field label="Próximo contacto" full><input type="date" value={form.fechaProximo || ''} onChange={set('fechaProximo')} style={input} /></Field><Field label="Acción / siguiente paso" full><textarea value={form.accion || ''} onChange={set('accion')} rows={3} style={{ ...input, resize: 'vertical' }} /></Field><Field label="Resultado última gestión" full><textarea value={form.resultado || ''} onChange={set('resultado')} rows={3} style={{ ...input, resize: 'vertical' }} /></Field></div><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}><Btn variant="primary" size="sm" onClick={save} disabled={patch.isPending}>{patch.isPending ? 'Guardando…' : 'Guardar cambios'}</Btn></div></Section>
        <Section title="Registrar gestión" tint="#fffbeb"><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Tipo"><select value={gestion.tipo} onChange={e => setGestion(g => ({ ...g, tipo: e.target.value }))} style={input}>{['LLAMADA', 'CORREO', 'REUNION', 'VISITA', 'COTIZACION', 'NOTA', 'OTRO'].map(value => <option key={value}>{value}</option>)}</select></Field><Field label="Próximo contacto"><input type="date" value={gestion.fechaProximo} onChange={e => setGestion(g => ({ ...g, fechaProximo: e.target.value }))} style={input} /></Field><Field label="Resultado" full><textarea value={gestion.resultado} onChange={e => setGestion(g => ({ ...g, resultado: e.target.value }))} rows={3} style={{ ...input, resize: 'vertical' }} /></Field><Field label="Siguiente acción" full><input value={gestion.siguienteAccion} onChange={e => setGestion(g => ({ ...g, siguienteAccion: e.target.value }))} style={input} /></Field></div><div style={{ marginTop: 14 }}><Btn variant="primary" size="sm" onClick={saveGestion} disabled={createGestion.isPending}>{createGestion.isPending ? 'Registrando…' : 'Registrar gestión'}</Btn></div></Section>
        <Section title="Datos del cliente"><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Contacto"><input value={form.nombre || ''} onChange={set('nombre')} style={input} /></Field><Field label="Razón social"><input value={form.rsocial || ''} onChange={set('rsocial')} style={input} /></Field><Field label="RUT"><div style={{ ...input, background: '#f8fafc' }}>{crm.rut || '—'}</div></Field><Field label="Teléfono"><input value={form.telefono || ''} onChange={set('telefono')} style={input} /></Field><Field label="Correo" full><input type="email" value={form.email || ''} onChange={set('email')} style={input} /></Field><Field label="Notas internas" full><textarea value={form.comentarios || ''} onChange={set('comentarios')} rows={3} style={{ ...input, resize: 'vertical' }} /></Field></div></Section></div>
      <div><ProductDetail oc={crm.ordenCompraOnline} cotizacion={crm.cotizacionComercial} licitacion={crm.cotizacionLicitacion} crmId={crm.id} items={items} setItems={setItems} /><Section title="Historial reciente"><div style={{ fontSize: 13, color: 'var(--text-2)' }}>{crm.gestiones?.length ? crm.gestiones.slice(0, 10).map(row => <div key={row.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}><strong>{row.tipo}</strong> · {row.resultado}<span style={{ float: 'right', color: 'var(--text-3)', fontSize: 11 }}>{new Date(row.realizadaAt).toLocaleDateString('es-CL')}</span></div>) : 'Aún no hay gestiones registradas.'}</div></Section></div>
    </div>
  </main>
}
