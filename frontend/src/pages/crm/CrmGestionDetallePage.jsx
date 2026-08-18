import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Btn, PageHeader } from '../../components/shared'
import { useCrmDetalle, useCrmGestionCreate, useCrmPatch } from '../../api/crm'
import { PRODUCT_PLACEHOLDER_IMAGE, useProductPlaceholderOnError } from '../../utils/assets'
import { toast } from '../../store/notif'

const money = value => Number(value || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const input = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: '#fff', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13 }

function Field({ label, children, full }) {
  return <label style={{ display: 'block', gridColumn: full ? '1 / -1' : 'auto' }}><span style={{ display: 'block', color: 'var(--text-3)', fontSize: 10, fontWeight: 750, letterSpacing: .4, textTransform: 'uppercase', marginBottom: 5 }}>{label}</span>{children}</label>
}

function Section({ title, tint = '#fff', children }) {
  return <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: tint, padding: 16, marginBottom: 14 }}><div style={{ fontSize: 12, fontWeight: 750, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: .45, paddingBottom: 10, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>{title}</div>{children}</section>
}

function ProductDetail({ oc }) {
  const products = oc?.items || []
  const totalCotizado = Number(oc?.total || 0) || products.reduce((sum, product) => sum + Number(product.precio || 0) * Number(product.cantidad || 0), 0)
  if (!oc) return <Section title="Cotización"><div style={{ color: 'var(--text-3)', fontSize: 13 }}>Este registro no tiene una OC Online vinculada.</div></Section>
  return <Section title="Cotización y detalle de productos" tint="#f0fdf4">
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}><div><div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 750 }}>OC Online #{oc.nCompra}</div><div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>{products.length} ítems · {oc.estadoCompra || 'Sin estado'}</div></div><div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' }}>Total cotizado</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-800)' }}>{money(totalCotizado)}</div></div></div>
    <div style={{ overflowX: 'auto', border: '1px solid #bbf7d0', borderRadius: 8, background: '#fff' }}><table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style={{ background: '#ecfdf5' }}>{[['Producto', 'left'], ['Código', 'left'], ['Descripción', 'left'], ['Cant.', 'right'], ['P. unitario', 'right'], ['Total', 'right']].map(([label, align]) => <th key={label} style={{ padding: '10px 11px', textAlign: align, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase' }}>{label}</th>)}</tr></thead><tbody>{products.map(product => <tr key={product.id} style={{ borderTop: '1px solid #ecfdf5', verticalAlign: 'top' }}><td style={{ padding: '10px 11px', minWidth: 190 }}><div style={{ display: 'flex', gap: 9, alignItems: 'center' }}><img src={product.producto?.fotoUrl || PRODUCT_PLACEHOLDER_IMAGE} alt="" loading="lazy" onError={useProductPlaceholderOnError} style={{ width: 40, height: 40, objectFit: 'cover', border: '1px solid var(--border)', borderRadius: 6 }} /><strong>{product.nombre || 'Producto sin nombre'}</strong></div></td><td style={{ padding: '10px 11px', fontFamily: "'DM Mono', monospace", color: 'var(--text-3)' }}>{product.codigoInterno || '—'}</td><td style={{ padding: '10px 11px', minWidth: 245, color: 'var(--text-2)', lineHeight: 1.4 }}>{product.descripcion || '—'}</td><td style={{ padding: '10px 11px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 750 }}>{product.cantidad}</td><td style={{ padding: '10px 11px', textAlign: 'right', fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' }}>{money(product.precio)}</td><td style={{ padding: '10px 11px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 750, whiteSpace: 'nowrap' }}>{money(product.precio * product.cantidad)}</td></tr>)}</tbody></table></div>
    <Link to={`/ordenes-compra/${oc.id}`} style={{ display: 'inline-block', marginTop: 12, color: 'var(--green-800)', fontWeight: 700, fontSize: 13 }}>Abrir OC Online completa →</Link>
  </Section>
}

export default function CrmGestionDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: crm, isLoading } = useCrmDetalle(id)
  const patch = useCrmPatch()
  const createGestion = useCrmGestionCreate()
  const [form, setForm] = useState({})
  const [gestion, setGestion] = useState({ tipo: 'LLAMADA', resultado: '', siguienteAccion: '', fechaProximo: '' })
  useEffect(() => { if (crm) setForm({ prioridad: crm.prioridad || '', fechaProximo: crm.fechaProximo?.slice(0, 10) || '', accion: crm.accion || '', resultado: crm.resultado || '', comentarios: crm.comentarios || '', nombre: crm.nombre || '', rsocial: crm.rsocial || '', email: crm.email || '', telefono: crm.telefono || '' }) }, [crm])
  if (isLoading) return <main className="page"><div style={{ padding: 32 }}>Cargando gestión CRM…</div></main>
  if (!crm) return <main className="page"><Btn variant="secondary" onClick={() => navigate('/crm')}>← Volver al CRM</Btn><div style={{ paddingTop: 24 }}>Registro CRM no encontrado.</div></main>
  const set = key => event => setForm(old => ({ ...old, [key]: event.target.value }))
  const save = async () => { try { await patch.mutateAsync({ id: crm.id, ...form }); toast.success('Datos CRM guardados') } catch (error) { toast.error(error.response?.data?.error || 'No se pudo guardar') } }
  const saveGestion = async () => { if (!gestion.resultado.trim()) return toast.warning('Indica el resultado de la gestión') ; try { await createGestion.mutateAsync({ id: crm.id, ...gestion }); setGestion({ tipo: 'LLAMADA', resultado: '', siguienteAccion: '', fechaProximo: '' }); toast.success('Gestión registrada') } catch (error) { toast.error(error.response?.data?.error || 'No se pudo registrar la gestión') } }
  return <main className="page page-wide"><PageHeader title={`Gestión CRM · ${crm.nombre || crm.rsocial || crm.email || `#${crm.id}`}`} subtitle={`Cotización #${crm.ncotizacion || crm.id} · ${crm.ejecutiva || 'Sin ejecutivo asignado'}`} breadcrumb={['Inicio', 'Ventas', 'CRM', 'Gestión y detalle']} actions={<Btn variant="secondary" size="sm" onClick={() => navigate('/crm')}>← Volver al CRM</Btn>} />
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, .82fr) minmax(540px, 1.45fr)', gap: 18, alignItems: 'start' }}>
      <div>
        <Section title="Gestión comercial" tint="#f8fafc"><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Etapa actual"><div style={{ ...input, background: '#f1f5f9' }}>{crm.etapaComercial || crm.estado || 'Sin clasificar'}</div></Field><Field label="Prioridad"><select value={form.prioridad || ''} onChange={set('prioridad')} style={input}><option value="">—</option><option>Alta</option><option>Media</option><option>Baja</option></select></Field><Field label="Próximo contacto" full><input type="date" value={form.fechaProximo || ''} onChange={set('fechaProximo')} style={input} /></Field><Field label="Acción / siguiente paso" full><textarea value={form.accion || ''} onChange={set('accion')} rows={3} style={{ ...input, resize: 'vertical' }} /></Field><Field label="Resultado última gestión" full><textarea value={form.resultado || ''} onChange={set('resultado')} rows={3} style={{ ...input, resize: 'vertical' }} /></Field></div><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}><Btn variant="primary" size="sm" onClick={save} disabled={patch.isPending}>{patch.isPending ? 'Guardando…' : 'Guardar cambios'}</Btn></div></Section>
        <Section title="Registrar gestión" tint="#fffbeb"><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Tipo"><select value={gestion.tipo} onChange={e => setGestion(g => ({ ...g, tipo: e.target.value }))} style={input}>{['LLAMADA', 'CORREO', 'REUNION', 'VISITA', 'COTIZACION', 'NOTA', 'OTRO'].map(value => <option key={value}>{value}</option>)}</select></Field><Field label="Próximo contacto"><input type="date" value={gestion.fechaProximo} onChange={e => setGestion(g => ({ ...g, fechaProximo: e.target.value }))} style={input} /></Field><Field label="Resultado" full><textarea value={gestion.resultado} onChange={e => setGestion(g => ({ ...g, resultado: e.target.value }))} rows={3} style={{ ...input, resize: 'vertical' }} /></Field><Field label="Siguiente acción" full><input value={gestion.siguienteAccion} onChange={e => setGestion(g => ({ ...g, siguienteAccion: e.target.value }))} style={input} /></Field></div><div style={{ marginTop: 14 }}><Btn variant="primary" size="sm" onClick={saveGestion} disabled={createGestion.isPending}>{createGestion.isPending ? 'Registrando…' : 'Registrar gestión'}</Btn></div></Section>
        <Section title="Datos del cliente"><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Contacto"><input value={form.nombre || ''} onChange={set('nombre')} style={input} /></Field><Field label="Razón social"><input value={form.rsocial || ''} onChange={set('rsocial')} style={input} /></Field><Field label="RUT"><div style={{ ...input, background: '#f8fafc' }}>{crm.rut || '—'}</div></Field><Field label="Teléfono"><input value={form.telefono || ''} onChange={set('telefono')} style={input} /></Field><Field label="Correo" full><input type="email" value={form.email || ''} onChange={set('email')} style={input} /></Field><Field label="Notas internas" full><textarea value={form.comentarios || ''} onChange={set('comentarios')} rows={3} style={{ ...input, resize: 'vertical' }} /></Field></div></Section>
      </div>
      <div><ProductDetail oc={crm.ordenCompraOnline} /><Section title="Historial reciente"><div style={{ fontSize: 13, color: 'var(--text-2)' }}>{crm.gestiones?.length ? crm.gestiones.slice(0, 10).map(row => <div key={row.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}><strong>{row.tipo}</strong> · {row.resultado}<span style={{ float: 'right', color: 'var(--text-3)', fontSize: 11 }}>{new Date(row.realizadaAt).toLocaleDateString('es-CL')}</span></div>) : 'Aún no hay gestiones registradas.'}</div></Section></div>
    </div>
  </main>
}
