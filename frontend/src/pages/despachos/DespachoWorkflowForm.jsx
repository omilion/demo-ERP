import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn } from '../../components/shared'
import { useCreateDespacho, useDespachoColaOperativa, useUpdateDespacho } from '../../api/despachos'
import { useVenta } from '../../api/ventas'
import { emptyDespacho, showError, checkLabel, input, grid } from './shared'
import { DespachoCamposFields, Field, Footer, PackingProgress } from './shared-ui'

const tone = estado => estado?.tone || 'gray'

export default function DespachoWorkflowForm({ isEdit, initial, onDone, onCancel }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(() => ({
    ...emptyDespacho,
    ...initial,
    fechaInterno: initial.fechaInterno ? String(initial.fechaInterno).slice(0, 10) : '',
    fechaEntrega: initial.fechaEntrega ? String(initial.fechaEntrega).slice(0, 10) : '',
    plazoEntrega: initial.plazoEntrega && /^\d{4}-\d{2}-\d{2}/.test(initial.plazoEntrega) ? initial.plazoEntrega.slice(0, 10) : '',
    origenTipo: initial.origenTipo || (initial.ordenId ? 'orden' : 'manual'),
    motivoOperacion: initial.motivoOperacion || '',
    receptorRut: initial.receptorRut || '',
    receptorRazonSocial: initial.receptorRazonSocial || '',
    receptorGiro: initial.receptorGiro || '',
    ciudad: initial.ciudad || '',
    items: Array.isArray(initial.items) ? initial.items : [],
  }))

  const [search, setSearch] = useState('')
  const [nuevoItemNombre, setNuevoItemNombre] = useState('')
  const [nuevoItemCant, setNuevoItemCant] = useState('1')
  const [nuevoItemUnidad, setNuevoItemUnidad] = useState('UN')
  const [createdDespacho, setCreatedDespacho] = useState(null)
  const loadedOrder = useRef(null)

  const cola = useDespachoColaOperativa({ etapa: 'despacho', search })
  const selected = (cola.data?.items || []).find(item => Number(item.ordenId) === Number(form.ordenId)) || null
  const esManual = form.origenTipo === 'manual'
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  useEffect(() => {
    if (isEdit || esManual || !selected || loadedOrder.current === selected.ordenId) return
    loadedOrder.current = selected.ordenId
    setForm(prev => ({
      ...prev,
      ordenId: String(selected.ordenId),
      interno: selected.nInterno ? String(selected.nInterno) : String(selected.ordenId),
      origenTipo: 'orden',
      origenId: selected.ordenId,
      direccion: selected.direccion || '',
      region: selected.region || '',
      comuna: selected.comuna || '',
      contacto: selected.contacto || '',
      emailContacto: selected.emailContacto || '',
      plazoEntrega: selected.plazoEntrega ? String(selected.plazoEntrega).slice(0, 10) : '',
      montoEnvio: selected.montoEnvio || '',
      parcial: !selected.packing?.completo && selected.packing?.preparados > 0,
      tieneMulta: !!selected.tieneMulta,
    }))
  }, [esManual, isEdit, selected])

  // Si la venta no aparece en la cola operativa (ej: Licitacion sin direccion
  // de despacho propia ni sucursal asignada) el efecto de arriba nunca corre y
  // el destino queda en blanco aunque el cliente ya tenga domicilio en ficha
  // desde que se creo (feedback FB #6, 09-11: "esta venta ya solicito todos
  // los datos necesarios al inicio"). Se completa con ese domicilio solo si
  // nada (ni la cola, ni el usuario) ya cargo un destino.
  const clienteFallbackApplied = useRef(false)
  const ventaId = !esManual && form.ordenId ? Number(form.ordenId) : undefined
  const { data: ventaData } = useVenta(!isEdit ? ventaId : undefined)
  useEffect(() => {
    if (isEdit || esManual || clienteFallbackApplied.current) return
    if (cola.isLoading || !ventaData?.cliente) return
    clienteFallbackApplied.current = true
    const cliente = ventaData.cliente
    // Seed unico del destino cuando la cola operativa no trajo uno (ver
    // comentario arriba); no es estado derivable en render porque el usuario
    // debe poder seguir editando estos campos despues.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(prev => ({
      ...prev,
      direccion: prev.direccion || cliente.direccion || '',
      region: prev.region || cliente.region || '',
      comuna: prev.comuna || cliente.comuna || '',
    }))
  }, [isEdit, esManual, cola.isLoading, ventaData])

  const createMut = useCreateDespacho()
  const updateMut = useUpdateDespacho()
  const saving = createMut.isPending || updateMut.isPending

  const elegirModo = mode => {
    loadedOrder.current = null
    clienteFallbackApplied.current = false
    if (mode === 'manual') {
      setForm(prev => ({
        ...emptyDespacho,
        tipoDespacho: prev.tipoDespacho || 'Despacho domicilio',
        transporte: prev.transporte,
        fechaInterno: prev.fechaInterno,
        fechaEntrega: prev.fechaEntrega,
        plazoEntrega: prev.plazoEntrega,
        origenTipo: 'manual',
        motivoOperacion: '',
        receptorRut: '',
        receptorRazonSocial: '',
        receptorGiro: '',
        ciudad: '',
        items: [],
      }))
    } else {
      setForm(prev => ({ ...prev, origenTipo: 'orden', motivoOperacion: '' }))
    }
  }

  const agregarItemAislado = () => {
    if (!nuevoItemNombre.trim()) return
    const cant = Math.max(1, Number(nuevoItemCant) || 1)
    setForm(prev => ({
      ...prev,
      items: [...(prev.items || []), { nombre: nuevoItemNombre.trim(), cantidad: cant, unidad: nuevoItemUnidad || 'UN' }],
    }))
    setNuevoItemNombre('')
    setNuevoItemCant('1')
  }

  const eliminarItemAislado = index => {
    setForm(prev => ({
      ...prev,
      items: (prev.items || []).filter((_, i) => i !== index),
    }))
  }

  const guardar = () => {
    if (!isEdit && !esManual && !selected) {
      return showError({ response: { data: { error: 'Elige una venta lista para despacho de la cola.' } } })
    }
    if (!isEdit && !esManual && Number(selected?.preparacion?.pendienteTaller || 0) > 0 && !form.parcial) {
      return showError({ response: { data: { error: 'Esta venta tiene unidades en taller pendientes. Sólo puede realizarse una salida parcial si ya tiene unidades preparadas en packing.' } } })
    }
    if (esManual && !String(form.motivoOperacion || '').trim()) {
      return showError({ response: { data: { error: 'Indica el motivo del despacho aislado para mantener la trazabilidad de bodega.' } } })
    }
    if (!esManual && !/^\S+@\S+\.\S+$/.test(String(form.emailContacto || '').trim())) {
      return showError({ response: { data: { error: 'La venta necesita un correo de contacto de despacho válido.' } } })
    }
    const retiro = /retiro|retira|pickup/i.test(String(form.tipoDespacho || ''))
    if (!esManual && !retiro && (!String(form.direccion || '').trim() || !String(form.region || '').trim() || !String(form.comuna || '').trim())) {
      return showError({ response: { data: { error: 'Completa dirección, región y comuna; para retiro indica “Retiro en sucursal” en tipo de despacho.' } } })
    }

    const data = {
      ...form,
      ordenId: esManual ? undefined : form.ordenId,
      odtId: esManual ? undefined : form.odtId || undefined,
      origenTipo: esManual ? 'manual' : 'orden',
      origenId: esManual ? undefined : form.ordenId,
      emailContacto: esManual ? (form.emailContacto || undefined) : form.emailContacto,
      items: esManual ? (form.items?.length ? form.items : undefined) : undefined,
    }

    if (isEdit) {
      updateMut.mutate({ id: initial.id, data }, {
        onSuccess: () => {
          onDone()
        },
        onError: showError,
      })
    } else {
      createMut.mutate(data, {
        onSuccess: res => {
          if (esManual) {
            setCreatedDespacho(res)
          } else {
            onDone()
          }
        },
        onError: showError,
      })
    }
  }

  if (createdDespacho && esManual) {
    return (
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 24, maxWidth: 650, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📦</div>
        <h3 style={{ margin: '0 0 8px' }}>Despacho aislado #{createdDespacho.id} registrado</h3>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 20 }}>
          El despacho ha sido registrado exitosamente en la bodega sin asociar una venta. Ahora puedes preparar la guía DTE 52 correspondiente.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Btn variant="primary" onClick={() => navigate(`/despachos/guias/nueva?despachoId=${createdDespacho.id}`)}>
            Preparar Guía DTE 52
          </Btn>
          <Btn variant="secondary" onClick={onDone}>
            Ir a Lista de Despachos
          </Btn>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 20, maxWidth: 1040 }}>
      {!isEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10, marginBottom: 18 }}>
          <button type="button" onClick={() => elegirModo('orden')} style={modeButton(!esManual)}>
            <strong>Salida desde venta lista</strong>
            <span>Hereda cliente, destino y cantidades preparadas en packing.</span>
          </button>
          <button type="button" onClick={() => elegirModo('manual')} style={modeButton(esManual)}>
            <strong>Despacho aislado de bodega</strong>
            <span>Excepción operativa con motivo y responsable; no inventa una venta.</span>
          </button>
        </div>
      )}

      {!isEdit && !esManual && (
        <section style={sectionStyle}>
          <Header
            title="1. Venta reconocida para programar salida"
            text="Sólo se listan ventas con preparación lista en packing o envíos parciales ya preparados."
          />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar por interno, cliente o RUT…"
            style={{ ...input, marginBottom: 10 }}
          />
          <Field label="Venta lista para despacho">
            <select
              value={form.ordenId || ''}
              onChange={event => { loadedOrder.current = null; clienteFallbackApplied.current = false; set('ordenId', event.target.value) }}
              style={input}
              disabled={cola.isLoading}
            >
              <option value="">{cola.isLoading ? 'Cargando cola...' : 'Seleccionar venta lista para despacho…'}</option>
              {(cola.data?.items || []).map(item => (
                <option key={item.ordenId} value={String(item.ordenId)}>
                  #{item.nInterno || item.ordenId} · {item.clienteNombre || 'Sin cliente'} · {item.estadoLogistico?.label || 'Listo'}
                </option>
              ))}
            </select>
          </Field>
          {selected && <VentaResumen item={selected} />}
        </section>
      )}

      {esManual && (
        <section style={sectionStyle}>
          <Header
            title="Origen y motivo del despacho aislado"
            text="Salida operativa no vinculada a una venta (devoluciones, traslados, muestras, garantías)."
            badge="Aislado"
          />
          <Field label="Motivo de la operación *">
            <textarea
              value={form.motivoOperacion || ''}
              onChange={event => set('motivoOperacion', event.target.value)}
              rows={2}
              placeholder="Ej.: Traslado a sucursal, devolución de material a proveedor, muestra comercial autorizada..."
              style={{ ...input, resize: 'vertical' }}
            />
          </Field>

          <div style={{ marginTop: 14, ...grid }}>
            <Field label="RUT Receptor / Destinatario">
              <input
                value={form.receptorRut || ''}
                onChange={e => set('receptorRut', e.target.value)}
                placeholder="76.123.456-7"
                style={input}
              />
            </Field>
            <Field label="Razón Social / Destinatario">
              <input
                value={form.receptorRazonSocial || ''}
                onChange={e => set('receptorRazonSocial', e.target.value)}
                placeholder="Nombre o empresa de destino"
                style={input}
              />
            </Field>
            <Field label="Giro Receptor">
              <input
                value={form.receptorGiro || ''}
                onChange={e => set('receptorGiro', e.target.value)}
                placeholder="Giro comercial"
                style={input}
              />
            </Field>
            <Field label="Ciudad">
              <input
                value={form.ciudad || ''}
                onChange={e => set('ciudad', e.target.value)}
                placeholder="Ciudad de entrega"
                style={input}
              />
            </Field>
          </div>

          <div style={{ marginTop: 16 }}>
            <strong style={{ fontSize: 13 }}>Ítems a trasladar en este despacho</strong>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Descripción del producto</label>
                <input
                  value={nuevoItemNombre}
                  onChange={e => setNuevoItemNombre(e.target.value)}
                  placeholder="Ej.: Malla raschel 80% 4.20x100m"
                  style={input}
                />
              </div>
              <div style={{ width: 90 }}>
                <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Cantidad</label>
                <input
                  type="number"
                  min="1"
                  value={nuevoItemCant}
                  onChange={e => setNuevoItemCant(e.target.value)}
                  style={input}
                />
              </div>
              <div style={{ width: 80 }}>
                <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Unidad</label>
                <input
                  value={nuevoItemUnidad}
                  onChange={e => setNuevoItemUnidad(e.target.value)}
                  style={input}
                />
              </div>
              <Btn variant="secondary" onClick={agregarItemAislado}>Agregar</Btn>
            </div>

            {(form.items || []).length > 0 && (
              <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    <tr>
                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>Ítem</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', width: 90 }}>Cant.</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', width: 80 }}>Unidad</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(form.items || []).map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 10px' }}>{it.nombre}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{it.cantidad}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>{it.unidad || 'UN'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => eliminarItemAislado(idx)}
                            style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {isEdit && (
        <section style={sectionStyle}>
          <Header
            title={esManual ? 'Despacho aislado' : `Venta #${form.interno || form.ordenId}`}
            text={esManual ? form.motivoOperacion || 'Sin motivo registrado' : 'El origen se conserva; corrige sólo los datos logísticos.'}
            badge={esManual ? 'Aislado' : 'Venta vinculada'}
          />
          {esManual && (
            <Field label="Motivo de la operación *">
              <textarea
                value={form.motivoOperacion || ''}
                onChange={event => set('motivoOperacion', event.target.value)}
                rows={2}
                style={{ ...input, resize: 'vertical' }}
              />
            </Field>
          )}
        </section>
      )}

      <section style={sectionStyle}>
        <Header
          title={esManual ? 'Datos operativos de salida' : '2. Programa los datos de salida'}
          text={esManual ? 'Completa lo necesario para trasladar, controlar y seguir esta salida.' : 'La información de venta ya está precargada.'}
        />
        {(form.parcial || form.tieneMulta) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {form.parcial && <Badge tone="amber">Envío parcial preparado</Badge>}
            {form.tieneMulta && <Badge tone="red">⚠️ Venta con Multa / Retraso Licitación</Badge>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
          <label style={checkLabel}>
            <input
              type="checkbox"
              checked={!!form.parcial}
              onChange={e => set('parcial', e.target.checked)}
            /> Parcial
          </label>
        </div>
        {!esManual && (
          <div style={{ ...grid, marginBottom: 12 }}>
            <Field label="N° Interno (Venta)">
              <input value={form.interno || ''} disabled style={readOnlyInput} />
            </Field>
            <Field label="Origen">
              <input value="Venta activa vinculada" disabled style={readOnlyInput} />
            </Field>
          </div>
        )}
        <DespachoCamposFields form={form} set={set} />
      </section>

      <Footer saving={saving} onClose={onCancel} onSave={guardar} closeLabel="Cancelar" />
    </div>
  )
}

function Header({ title, text, badge }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
      <div>
        <strong>{title}</strong>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>{text}</p>
      </div>
      {badge && <Badge tone={badge === 'Aislado' ? 'amber' : 'blue'}>{badge}</Badge>}
    </div>
  )
}

function VentaResumen({ item }) {
  const preparacion = item.preparacion || {}
  const navigate = useNavigate()
  return (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{item.clienteNombre || 'Cliente sin nombre'}</div>
          <div style={{ marginTop: 3, color: 'var(--text-3)', fontSize: 12 }}>
            {item.direccion || 'Sin dirección de despacho'}{item.comuna ? ` · ${item.comuna}` : ''}
          </div>
        </div>
        <PackingProgress row={{ packing: item.packing }} />
        <Badge tone={tone(item.estadoLogistico)}>{item.estadoLogistico?.label || 'Listo'}</Badge>
        <Btn variant="ghost" size="sm" onClick={() => navigate(`/ventas/${encodeURIComponent(String(item.ordenId))}`)}>
          Ver pedido
        </Btn>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center', marginTop: 10 }}>
        <Badge tone="green">Picking disponible: {preparacion.disponiblePicking || 0} u.</Badge>
        {Number(preparacion.disponibleInventario || 0) > 0 && <Badge tone="blue">Inventario: {preparacion.disponibleInventario} u.</Badge>}
        {Number(preparacion.disponibleTaller || 0) > 0 && <Badge tone="blue">Taller listo: {preparacion.disponibleTaller} u.</Badge>}
        {Number(preparacion.pendienteTaller || 0) > 0 && (
          <>
            <Badge tone="amber">Taller pendiente: {preparacion.pendienteTaller} u.</Badge>
            <a href={`/pasar-taller?ordenId=${item.ordenId}`} style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>Ver taller</a>
          </>
        )}
      </div>
    </div>
  )
}

const sectionStyle = { marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }
const readOnlyInput = { ...input, background: 'var(--bg)', color: 'var(--text-3)' }
const modeButton = selected => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  textAlign: 'left',
  padding: 14,
  borderRadius: 10,
  border: `1px solid ${selected ? 'var(--blue)' : 'var(--border)'}`,
  background: selected ? 'var(--blue-50)' : '#fff',
  color: 'var(--text-2)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
})
