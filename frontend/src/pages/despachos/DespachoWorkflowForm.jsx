import { useEffect, useRef, useState } from 'react'
import { Badge } from '../../components/shared'
import { useCreateDespacho, useDespachoColaOperativa, useUpdateDespacho } from '../../api/despachos'
import { emptyDespacho, showError, checkLabel, input, grid } from './shared'
import { DespachoCamposFields, Field, Footer, PackingProgress } from './shared-ui'

const tone = estado => estado?.tone || 'gray'

export default function DespachoWorkflowForm({ isEdit, initial, onDone, onCancel }) {
  const [form, setForm] = useState(() => ({
    ...emptyDespacho,
    ...initial,
    fechaInterno: initial.fechaInterno ? String(initial.fechaInterno).slice(0, 10) : '',
    fechaEntrega: initial.fechaEntrega ? String(initial.fechaEntrega).slice(0, 10) : '',
    plazoEntrega: initial.plazoEntrega && /^\d{4}-\d{2}-\d{2}/.test(initial.plazoEntrega) ? initial.plazoEntrega.slice(0, 10) : '',
    origenTipo: initial.origenTipo || (initial.ordenId ? 'orden' : 'manual'),
    motivoOperacion: initial.motivoOperacion || '',
  }))
  const [search, setSearch] = useState('')
  const loadedOrder = useRef(null)
  const cola = useDespachoColaOperativa({ search })
  const selected = (cola.data?.items || []).find(item => Number(item.ordenId) === Number(form.ordenId)) || null
  const tallerPendientes = (cola.data?.items || []).filter(item => Number(item.preparacion?.pendienteTaller || 0) > 0)
  const esManual = form.origenTipo === 'manual'
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  useEffect(() => {
    if (isEdit || esManual || !selected || loadedOrder.current === selected.ordenId) return
    loadedOrder.current = selected.ordenId
    setForm(prev => ({
      ...prev,
      ordenId: String(selected.ordenId), interno: selected.nInterno ? String(selected.nInterno) : '', origenTipo: 'orden', origenId: selected.ordenId,
      direccion: selected.direccion || '', region: selected.region || '', comuna: selected.comuna || '', contacto: selected.contacto || '',
      emailContacto: selected.emailContacto || '', plazoEntrega: selected.plazoEntrega ? String(selected.plazoEntrega).slice(0, 10) : '', montoEnvio: selected.montoEnvio || '',
      parcial: Number(selected.preparacion?.pendienteTaller || 0) > 0,
    }))
  }, [esManual, isEdit, selected])

  const createMut = useCreateDespacho()
  const updateMut = useUpdateDespacho()
  const saving = createMut.isPending || updateMut.isPending
  const elegirModo = mode => {
    loadedOrder.current = null
    if (mode === 'manual') setForm(prev => ({
      ...emptyDespacho,
      tipoDespacho: prev.tipoDespacho,
      transporte: prev.transporte,
      fechaInterno: prev.fechaInterno,
      fechaEntrega: prev.fechaEntrega,
      plazoEntrega: prev.plazoEntrega,
      origenTipo: 'manual',
    }))
    else setForm(prev => ({ ...prev, origenTipo: 'orden', motivoOperacion: '' }))
  }
  const guardar = () => {
    if (!isEdit && !esManual && !selected) return showError({ response: { data: { error: 'Elige una venta activa de la cola para iniciar su picking.' } } })
    if (!isEdit && !esManual && Number(selected?.preparacion?.disponiblePicking || 0) === 0 && Number(selected?.preparacion?.pendienteTaller || 0) > 0) {
      return showError({ response: { data: { error: 'Esta venta tiene productos en taller. Quedará disponible para picking cuando Taller los marque como listos.' } } })
    }
    if (esManual && !String(form.motivoOperacion || '').trim()) return showError({ response: { data: { error: 'Indica el motivo del despacho aislado para mantener la trazabilidad.' } } })
    if (!esManual && !/^\S+@\S+\.\S+$/.test(String(form.emailContacto || '').trim())) return showError({ response: { data: { error: 'La venta necesita un correo de contacto de despacho válido.' } } })
    const retiro = /retiro|retira|pickup/i.test(String(form.tipoDespacho || ''))
    if (!esManual && !retiro && (!String(form.direccion || '').trim() || !String(form.region || '').trim() || !String(form.comuna || '').trim())) return showError({ response: { data: { error: 'Completa dirección, región y comuna; para retiro indica “Retiro en sucursal” en tipo.' } } })
    const data = { ...form, ordenId: esManual ? undefined : form.ordenId, odtId: esManual ? undefined : form.odtId || undefined, origenTipo: esManual ? 'manual' : 'orden', origenId: esManual ? undefined : form.ordenId, emailContacto: esManual ? (form.emailContacto || undefined) : form.emailContacto }
    if (isEdit) updateMut.mutate({ id: initial.id, data }, { onSuccess: onDone, onError: showError })
    else createMut.mutate(data, { onSuccess: onDone, onError: showError })
  }

  return <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 20, maxWidth: 1040 }}>
    {!isEdit && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10, marginBottom: 18 }}>
      <button type="button" onClick={() => elegirModo('orden')} style={modeButton(!esManual)}><strong>Desde venta activa</strong><span>Hereda cliente, destino y costo; inicia picking.</span></button>
      <button type="button" onClick={() => elegirModo('manual')} style={modeButton(esManual)}><strong>Despacho aislado de bodega</strong><span>Excepción operativa con motivo y responsable; no altera una venta.</span></button>
    </div>}

    {!isEdit && !esManual && <section style={sectionStyle}>
      <Header title="1. Selecciona la venta que saldrá" text="La cola muestra ventas activas aún pendientes de entrega. No se escribe el ID a mano." />
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por interno, cliente o RUT…" style={{ ...input, marginBottom: 10 }} />
      <Field label="Venta activa"><select value={form.ordenId || ''} onChange={event => { loadedOrder.current = null; set('ordenId', event.target.value) }} style={input} disabled={cola.isLoading}><option value="">{cola.isLoading ? 'Cargando cola…' : 'Seleccionar venta para picking…'}</option>{(cola.data?.items || []).map(item => <option key={item.ordenId} value={String(item.ordenId)}>#{item.nInterno || item.ordenId} · {item.clienteNombre || 'Sin cliente'} · {preparacionLabel(item.preparacion)} · {item.estadoLogistico.label}</option>)}</select></Field>
      {tallerPendientes.length > 0 && <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--amber-200, #f5d58a)', borderRadius: 10, background: 'var(--amber-50, #fffbeb)' }}>
        <strong style={{ fontSize: 13 }}>Taller pendiente · {tallerPendientes.length} ventas visibles</strong>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {tallerPendientes.slice(0, 8).map(item => <a key={item.ordenId} href={`/pasar-taller?ordenId=${item.ordenId}`} style={{ fontSize: 12, color: 'var(--amber-700, #a16207)', fontWeight: 700 }}>#{item.nInterno || item.ordenId} · {item.preparacion.pendienteTaller} u.</a>)}
        </div>
      </div>}
      {selected && <VentaResumen item={selected} />}
    </section>}

    {esManual && <section style={sectionStyle}>
      <Header title="Origen excepcional" text="No genera picking ni guía SII automática. Registra una salida aislada sin inventar una venta." badge="Aislado" />
      <Field label="Motivo de la operación *"><textarea value={form.motivoOperacion || ''} onChange={event => set('motivoOperacion', event.target.value)} rows={2} placeholder="Ej.: traslado interno, devolución a proveedor, muestra o ajuste autorizado" style={{ ...input, resize: 'vertical' }} /></Field>
    </section>}

    {isEdit && <section style={sectionStyle}><Header title={esManual ? 'Despacho aislado' : `Venta #${form.interno || form.ordenId}`} text={esManual ? form.motivoOperacion || 'Sin motivo registrado' : 'El origen se conserva; corrige sólo los datos logísticos.'} badge={esManual ? 'Aislado' : 'Venta vinculada'} />{esManual && <Field label="Motivo de la operación *"><textarea value={form.motivoOperacion || ''} onChange={event => set('motivoOperacion', event.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} /></Field>}</section>}

    <section style={sectionStyle}>
      <Header title={esManual ? 'Datos operativos' : '2. Programa la salida'} text={esManual ? 'Completa lo necesario para trasladar, controlar y seguir esta salida.' : 'La información de venta ya está cargada; ajusta sólo lo propio de esta salida.'} />
      {(form.parcial || form.tieneMulta) && <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>{form.parcial && <Badge tone="amber">Envío parcial</Badge>}{form.tieneMulta && <Badge tone="red">Tiene multa</Badge>}</div>}
      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}><label style={checkLabel}><input type="checkbox" checked={!!form.parcial} onChange={e => set('parcial', e.target.checked)} /> Parcial</label><label style={checkLabel}><input type="checkbox" checked={!!form.tieneMulta} onChange={e => set('tieneMulta', e.target.checked)} /> Tiene multa</label></div>
      {!esManual && <div style={{ ...grid, marginBottom: 12 }}><Field label="Interno"><input value={form.interno || ''} disabled style={readOnlyInput} /></Field><Field label="Origen"><input value="Venta activa vinculada" disabled style={readOnlyInput} /></Field></div>}
      <DespachoCamposFields form={form} set={set} />
    </section>
    <Footer saving={saving} onClose={onCancel} onSave={guardar} closeLabel="Cancelar" />
  </div>
}

function Header({ title, text, badge }) { return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}><div><strong>{title}</strong><p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>{text}</p></div>{badge && <Badge tone={badge === 'Aislado' ? 'amber' : 'blue'}>{badge}</Badge>}</div> }
function VentaResumen({ item }) {
  const preparacion = item.preparacion || {}
  return <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--bg)' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr auto auto', gap: 12, alignItems: 'center' }}><div><div style={{ fontSize: 13, fontWeight: 700 }}>{item.clienteNombre || 'Cliente sin nombre'}</div><div style={{ marginTop: 3, color: 'var(--text-3)', fontSize: 12 }}>{item.direccion || 'Sin dirección de despacho'}{item.comuna ? ` · ${item.comuna}` : ''}</div></div><PackingProgress row={{ packing: item.packing }} /><Badge tone={tone(item.estadoLogistico)}>{item.estadoLogistico.label}</Badge></div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center', marginTop: 10 }}>
      <Badge tone="green">Picking disponible: {preparacion.disponiblePicking || 0} u.</Badge>
      {Number(preparacion.disponibleInventario || 0) > 0 && <Badge tone="blue">Inventario: {preparacion.disponibleInventario} u.</Badge>}
      {Number(preparacion.disponibleTaller || 0) > 0 && <Badge tone="blue">Taller listo: {preparacion.disponibleTaller} u.</Badge>}
      {Number(preparacion.pendienteTaller || 0) > 0 && <><Badge tone="amber">Taller pendiente: {preparacion.pendienteTaller} u.</Badge><a href={`/pasar-taller?ordenId=${item.ordenId}`} style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>Ver taller</a></>}
    </div>
  </div>
}
function preparacionLabel(preparacion = {}) {
  const picking = Number(preparacion.disponiblePicking || 0)
  const taller = Number(preparacion.pendienteTaller || 0)
  if (picking && taller) return `Picking ${picking}u / taller ${taller}u`
  if (taller) return `Taller ${taller}u`
  return `Picking ${picking}u`
}
const sectionStyle = { marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }
const readOnlyInput = { ...input, background: 'var(--bg)', color: 'var(--text-3)' }
const modeButton = selected => ({ display: 'flex', flexDirection: 'column', gap: 5, textAlign: 'left', padding: 14, borderRadius: 10, border: `1px solid ${selected ? 'var(--blue)' : 'var(--border)'}`, background: selected ? 'var(--blue-50)' : '#fff', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 })
