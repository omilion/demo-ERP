import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn } from '../../components/shared'
import { useCreateDespacho, useDespachoColaOperativa, useUpdateDespacho } from '../../api/despachos'
import { useVenta } from '../../api/ventas'
import { emptyDespacho, showError, checkLabel, input, grid } from './shared'
import { DespachoCamposFields, Field, Footer, PackingProgress } from './shared-ui'
import { TRANSPORTISTAS } from '../../utils/facturacion'

const tone = estado => estado?.tone || 'gray'
const localToday = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export default function DespachoWorkflowForm({ isEdit, initial, venta: ventaProp, fromVenta = false, onDone, onCancel }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(() => ({
    ...emptyDespacho,
    ...initial,
    fechaInterno: initial.fechaInterno ? String(initial.fechaInterno).slice(0, 10) : (fromVenta ? localToday() : ''),
    fechaEntrega: initial.fechaEntrega ? String(initial.fechaEntrega).slice(0, 10) : '',
    plazoEntrega: initial.plazoEntrega && /^\d{4}-\d{2}-\d{2}/.test(initial.plazoEntrega) ? initial.plazoEntrega.slice(0, 10) : '',
    tipoDespacho: initial.tipoDespacho || (fromVenta ? 'Despacho a domicilio' : ''),
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
  const [itemSelections, setItemSelections] = useState({})
  const loadedOrder = useRef(null)
  const inheritedHydrationKey = useRef('')

  const cola = useDespachoColaOperativa({ etapa: 'despacho', search })
  const selected = (cola.data?.items || []).find(item => Number(item.ordenId) === Number(form.ordenId)) || null
  const esManual = form.origenTipo === 'manual'
  const linkedFromSale = fromVenta && !isEdit && !esManual
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

  const ventaId = !esManual && form.ordenId ? Number(form.ordenId) : undefined
  const { data: ventaQueryData } = useVenta(ventaId)
  const ventaData = ventaQueryData || ventaProp || null

  // La venta y su sucursal son la fuente maestra de datos ya capturados al
  // vender. Sólo se rellenan campos vacíos, de modo que una excepción de cola
  // o una edición explícita del usuario no se pierda.
  useEffect(() => {
    if (isEdit || esManual || (!selected && !ventaData)) return
    const sourceKey = `${form.ordenId}|${Boolean(selected)}|${Boolean(ventaData)}`
    if (inheritedHydrationKey.current === sourceKey) return
    inheritedHydrationKey.current = sourceKey
    const cliente = ventaData?.cliente || {}
    const sucursal = ventaData?.clienteSucursal || {}
    const value = (...values) => values.find(item => item !== null && item !== undefined && String(item).trim() !== '') || ''
    const inherited = {
      direccion: value(ventaData?.direccionDespacho, selected?.direccion, sucursal.direccion, cliente.direccion),
      region: value(ventaData?.regionDespacho, selected?.region, sucursal.region, cliente.region),
      comuna: value(ventaData?.comunaDespacho, selected?.comuna, sucursal.comuna, cliente.comuna),
      ciudad: value(ventaData?.ciudadDespacho, sucursal.ciudad, cliente.ciudad),
      contacto: value(ventaData?.contactoDespacho, selected?.contacto, sucursal.contacto, cliente.nombre),
      emailContacto: value(ventaData?.emailContactoDespacho, selected?.emailContacto, sucursal.email, ventaData?.emailCliente, cliente.email),
      plazoEntrega: value(ventaData?.fechaPlazo, selected?.plazoEntrega),
      montoEnvio: value(ventaData?.montoDespacho, selected?.montoEnvio),
    }
    setForm(prev => ({
      ...prev,
      ...Object.fromEntries(Object.entries(inherited).map(([key, item]) => [
        key,
        prev[key] || item,
      ])),
      interno: prev.interno || (ventaData?.nInterno ? String(ventaData.nInterno) : ''),
      odtId: prev.odtId || (selected?.odtId || ventaData?.odts?.[0]?.id ? String(selected?.odtId || ventaData?.odts?.[0]?.id) : ''),
      tipoDespacho: prev.tipoDespacho || (fromVenta ? 'Despacho a domicilio' : ''),
    }))
  }, [esManual, form.ordenId, fromVenta, isEdit, selected, ventaData])

  // Inicializar selección de ítems cuando carga la venta
  useEffect(() => {
    if (!ventaData?.items?.length) return
    setItemSelections(prev => {
      const next = { ...prev }
      for (const it of ventaData.items) {
        if (next[it.id] !== undefined) continue
        const yaEntregados = Number(it.nEntregados || 0)
        const totalCant = Number(it.cantidad || 0)
        const pendiente = Math.max(0, totalCant - yaEntregados)

        // Si estamos editando y el despacho ya tenía ítems guardados
        const savedItem = (initial.items || []).find(si => Number(si.ordenItemId || si.id) === Number(it.id))
        if (savedItem) {
          next[it.id] = {
            selected: true,
            cantidad: Number(savedItem.cantidad || 1)
          }
        } else {
          next[it.id] = {
            selected: pendiente > 0 || totalCant > 0,
            cantidad: pendiente > 0 ? pendiente : totalCant
          }
        }
      }
      return next
    })
  }, [ventaData, initial.items])

  const toggleItem = (itemId, checked) => {
    setItemSelections(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { cantidad: 1 }), selected: checked }
    }))
  }

  const changeItemCant = (itemId, cant) => {
    setItemSelections(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { selected: true }), cantidad: Math.max(1, Number(cant) || 1) }
    }))
  }

  const selectAllItems = () => {
    if (!ventaData?.items) return
    setItemSelections(prev => {
      const next = { ...prev }
      for (const it of ventaData.items) {
        const yaEntregados = Number(it.nEntregados || 0)
        const totalCant = Number(it.cantidad || 0)
        const pendiente = Math.max(0, totalCant - yaEntregados)
        next[it.id] = {
          selected: true,
          cantidad: pendiente > 0 ? pendiente : totalCant
        }
      }
      return next
    })
  }

  const deselectAllItems = () => {
    if (!ventaData?.items) return
    setItemSelections(prev => {
      const next = { ...prev }
      for (const it of ventaData.items) {
        next[it.id] = {
          ...(next[it.id] || { cantidad: 1 }),
          selected: false
        }
      }
      return next
    })
  }

  const itemsVentaComputed = useMemo(() => {
    if (esManual || !ventaData?.items) return []
    return ventaData.items.map(it => {
      const sel = itemSelections[it.id]
      const yaEntregados = Number(it.nEntregados || 0)
      const totalCant = Number(it.cantidad || 0)
      const pendiente = Math.max(0, totalCant - yaEntregados)
      const isSelected = sel ? !!sel.selected : true
      const despacharCant = sel?.cantidad !== undefined ? sel.cantidad : (pendiente > 0 ? pendiente : totalCant)
      return {
        ...it,
        selected: isSelected,
        despacharCant,
        pendiente,
        yaEntregados,
        totalCant
      }
    })
  }, [esManual, ventaData, itemSelections])

  const selectedItemsVenta = useMemo(() => {
    return itemsVentaComputed.filter(it => it.selected && it.despacharCant > 0)
  }, [itemsVentaComputed])

  const isAutoParcial = useMemo(() => {
    if (esManual || !itemsVentaComputed.length) return false
    const someUnselected = itemsVentaComputed.some(it => !it.selected)
    const somePartialQty = itemsVentaComputed.some(it => it.selected && it.despacharCant < it.totalCant)
    const alreadyDelivered = itemsVentaComputed.some(it => it.yaEntregados > 0)
    return someUnselected || somePartialQty || alreadyDelivered
  }, [esManual, itemsVentaComputed])

  const createMut = useCreateDespacho()
  const updateMut = useUpdateDespacho()
  const saving = createMut.isPending || updateMut.isPending

  const elegirModo = mode => {
    loadedOrder.current = null
    inheritedHydrationKey.current = ''
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
    if (!isEdit && !esManual && !linkedFromSale && !selected && !form.ordenId) {
      return showError({ response: { data: { error: 'Elige una venta lista para despacho de la cola.' } } })
    }
    const pendienteTaller = selected?.preparacion?.pendienteTaller ?? ventaData?.preparacion?.pendienteTaller
    if (!isEdit && !esManual && Number(pendienteTaller || 0) > 0 && !form.parcial && !isAutoParcial) {
      return showError({ response: { data: { error: 'Esta venta tiene unidades en taller pendientes. Sólo puede realizarse una salida parcial si ya tiene unidades preparadas en packing.' } } })
    }
    if (!esManual && selectedItemsVenta.length === 0) {
      return showError({ response: { data: { error: 'Debes marcar con la casilla al menos un producto a incluir en el despacho.' } } })
    }
    if (esManual && !String(form.motivoOperacion || '').trim()) {
      return showError({ response: { data: { error: 'Indica el motivo del despacho aislado para mantener la trazabilidad de bodega.' } } })
    }
    if (linkedFromSale && !String(form.fechaInterno || '').trim()) {
      return showError({ response: { data: { error: 'Indica la fecha de salida.' } } })
    }
    if (linkedFromSale && !String(form.transporte || '').trim()) {
      return showError({ response: { data: { error: 'Indica el transporte o selecciona “Por Confirmar”.' } } })
    }
    if (!esManual && !/^\S+@\S+\.\S+$/.test(String(form.emailContacto || '').trim())) {
      return showError({ response: { data: { error: 'La venta necesita un correo de contacto de despacho válido.' } } })
    }
    const retiro = /retiro|retira|pickup/i.test(String(form.tipoDespacho || ''))
    if (!esManual && !retiro && (!String(form.direccion || '').trim() || !String(form.region || '').trim() || !String(form.comuna || '').trim())) {
      return showError({ response: { data: { error: 'Completa dirección, región y comuna; para retiro indica “Retiro en sucursal” en tipo de despacho.' } } })
    }

    const finalItems = esManual
      ? (form.items?.length ? form.items : undefined)
      : selectedItemsVenta.map(it => ({
          ordenItemId: it.id,
          productoId: it.productoId,
          codigoInterno: it.codigoInterno || it.producto?.codigoInterno || '',
          nombre: it.producto?.nombre || it.nombre || it.descripcion,
          descripcion: it.descripcion,
          cantidad: Number(it.despacharCant),
          unidad: it.unidad || 'UN',
        }))

    const data = {
      ...form,
      parcial: Boolean(form.parcial || isAutoParcial),
      ordenId: esManual ? undefined : form.ordenId,
      odtId: esManual ? undefined : form.odtId || undefined,
      origenTipo: esManual ? 'manual' : 'orden',
      origenId: esManual ? undefined : form.ordenId,
      emailContacto: esManual ? (form.emailContacto || undefined) : form.emailContacto,
      items: finalItems,
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

      {!isEdit && !esManual && linkedFromSale && (
        <VentaSalidaContext venta={ventaData} form={form} />
      )}

      {!isEdit && !esManual && !linkedFromSale && (
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
              onChange={event => { loadedOrder.current = null; inheritedHydrationKey.current = ''; set('ordenId', event.target.value) }}
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

      {/* ── Tabla de Selección Ítem por Ítem para Despacho de Venta ── */}
      {!esManual && (form.ordenId || selected) && (
        <section style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong style={{ fontSize: 13, color: 'var(--text-1)' }}>
                2. Productos incluidos en este despacho ({selectedItemsVenta.length} de {itemsVentaComputed.length} marcados)
              </strong>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                Marca con la casilla los ítems que viajan en esta entrega. Si ajustas cantidades o desmarcas ítems, el despacho se registrará como <b>Parcial</b> automáticamente.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={selectAllItems}
                style={{ padding: '4px 10px', fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', fontWeight: 600, color: 'var(--blue)' }}
              >
                ✓ Seleccionar todos
              </button>
              <button
                type="button"
                onClick={deselectAllItems}
                style={{ padding: '4px 10px', fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', fontWeight: 500, color: 'var(--text-3)' }}
              >
                ✗ Deseleccionar todos
              </button>
            </div>
          </div>

          {itemsVentaComputed.length > 0 ? (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 680 }}>
                <thead style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    <th style={{ padding: '7px 8px', textAlign: 'center', width: 44 }}>Incluir</th>
                    <th style={{ padding: '7px 8px', textAlign: 'left', width: 95 }}>Código</th>
                    <th style={{ padding: '7px 10px', textAlign: 'left' }}>Producto</th>
                    <th style={{ padding: '7px 8px', textAlign: 'left', width: 85 }}>Ubicación</th>
                    <th style={{ padding: '7px 8px', textAlign: 'right', width: 65 }}>Pedido</th>
                    <th style={{ padding: '7px 8px', textAlign: 'right', width: 75 }}>Entregado</th>
                    <th style={{ padding: '7px 8px', textAlign: 'right', width: 75 }}>Pendiente</th>
                    <th style={{ padding: '7px 10px', textAlign: 'right', width: 110, color: 'var(--green-700)' }}>A Despachar</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsVentaComputed.map((it, idx) => (
                    <tr
                      key={it.id || idx}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: it.selected ? 'rgba(13, 148, 136, 0.04)' : 'var(--bg-card, #fff)',
                        opacity: it.selected ? 1 : 0.6,
                        transition: 'background 0.15s, opacity 0.15s',
                      }}
                    >
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={it.selected}
                          onChange={e => toggleItem(it.id, e.target.checked)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#0d9488' }}
                        />
                      </td>
                      <td style={{ padding: '8px', fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>
                        {it.producto?.codigoInterno || it.codigoInterno || '—'}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                          {it.producto?.nombre || it.nombre || `Producto #${it.productoId}`}
                        </div>
                        {it.descripcion && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                            {it.descripcion}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px', fontFamily: "'DM Mono',monospace", fontSize: 11, color: 'var(--text-2)' }}>
                        {it.producto?.ubicacion || it.ubicacion || '—'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: 'var(--text-2)' }}>
                        {it.totalCant}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: '#166534', fontWeight: 600 }}>
                        {it.yaEntregados}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 700, color: it.pendiente > 0 ? 'var(--amber, #b45309)' : '#166534' }}>
                        {it.pendiente}
                      </td>
                      <td style={{ padding: '4px 10px', textAlign: 'right' }}>
                        <input
                          type="number"
                          min="1"
                          max={it.totalCant}
                          disabled={!it.selected}
                          value={it.despacharCant}
                          onChange={e => changeItemCant(it.id, e.target.value)}
                          style={{
                            width: 65,
                            padding: '4px 6px',
                            borderRadius: 5,
                            border: '1px solid var(--border)',
                            fontSize: 12,
                            fontFamily: "'DM Mono',monospace",
                            textAlign: 'right',
                            fontWeight: 700,
                            color: it.selected ? '#0f766e' : 'var(--text-3)',
                            background: it.selected ? '#fff' : 'var(--bg)'
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-3)', fontSize: 12, background: 'var(--bg)', borderRadius: 6, marginBottom: 12 }}>
              Cargando productos de la venta…
            </div>
          )}
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
          title={esManual ? 'Datos operativos de salida' : linkedFromSale ? '3. Registrar salida' : '3. Programa los datos de salida'}
          text={esManual ? 'Completa lo necesario para trasladar, controlar y seguir esta salida.' : linkedFromSale ? 'Ingresa sólo la fecha y el transporte. El destino se hereda de la venta.' : 'La información de venta ya está precargada.'}
        />
        {(form.parcial || isAutoParcial || form.tieneMulta) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(form.parcial || isAutoParcial) && <Badge tone="amber">Envío parcial preparado</Badge>}
            {form.tieneMulta && <Badge tone="red">⚠️ Venta con Multa / Retraso Licitación</Badge>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
          <label style={checkLabel}>
            <input
              type="checkbox"
              checked={!!(form.parcial || isAutoParcial)}
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
        {linkedFromSale ? <SalidaOperativaFields form={form} set={set} /> : <DespachoCamposFields form={form} set={set} />}
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

function VentaSalidaContext({ venta, form }) {
  const cliente = venta?.cliente || {}
  const sucursal = venta?.clienteSucursal || {}
  const nombre = cliente.razonSocial || cliente.nombre || 'Cliente sin nombre'
  const destino = form.direccion || venta?.direccionDespacho || sucursal.direccion || cliente.direccion
  const ubicacion = [form.comuna || venta?.comunaDespacho || sucursal.comuna || cliente.comuna, form.region || venta?.regionDespacho || sucursal.region || cliente.region]
    .filter(Boolean)
    .join(' · ')
  const contacto = form.contacto || venta?.contactoDespacho || sucursal.contacto || cliente.nombre
  const email = form.emailContacto || venta?.emailContactoDespacho || sucursal.email || venta?.emailCliente || cliente.email
  const faltanDatos = !String(email || '').trim() || (!String(form.tipoDespacho || '').match(/retiro|retira|pickup/i) && (!String(destino || '').trim() || !String(ubicacion || '').trim()))

  return (
    <section style={sectionStyle}>
      <Header
        title={`1. Venta vinculada #${venta?.nInterno || form.interno || form.ordenId}`}
        text="La venta concentra el cliente y el destino. Bodega no debe volver a digitarlos."
        badge="Venta vinculada"
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, padding: 12, borderRadius: 10, background: 'var(--bg)' }}>
        <ReadOnlyValue label="Cliente" value={nombre} />
        <ReadOnlyValue label="ODT / interno" value={form.odtId ? `ODT #${form.odtId} · ${form.interno || 'Venta'}` : `Venta #${form.interno || form.ordenId}`} />
        <ReadOnlyValue label="Destino" value={destino || 'Sin dirección registrada'} />
        <ReadOnlyValue label="Región / comuna" value={ubicacion || 'Sin ubicación registrada'} />
        <ReadOnlyValue label="Contacto" value={contacto || 'Sin contacto registrado'} />
        <ReadOnlyValue label="Correo" value={email || 'Sin correo registrado'} />
      </div>
      {faltanDatos && (
        <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 8, border: '1px solid #f0c36d', background: '#fff8e6', color: '#7a4d00', fontSize: 12, lineHeight: 1.45 }}>
          Faltan datos de despacho en la venta. Completa la dirección, región, comuna o correo en el detalle de la venta; el operador no debe reingresarlos aquí.
        </div>
      )}
    </section>
  )
}

function ReadOnlyValue({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.35 }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

function SalidaOperativaFields({ form, set }) {
  const transporteEsOtro = !!form.transporte && !TRANSPORTISTAS.includes(form.transporte)
  return (
    <div style={grid}>
      <Field label="Fecha de salida *">
        <input type="date" value={form.fechaInterno || ''} onChange={event => set('fechaInterno', event.target.value)} style={input} />
      </Field>
      <Field label="Tipo de entrega *">
        <select value={form.tipoDespacho || ''} onChange={event => set('tipoDespacho', event.target.value)} style={input}>
          <option value="">Seleccionar...</option>
          <option value="Despacho a domicilio">Despacho a domicilio</option>
          <option value="Retiro en sucursal">Retiro en sucursal</option>
          <option value="Retiro en bodega">Retiro en bodega</option>
        </select>
      </Field>
      <Field label="Transporte *">
        <select value={transporteEsOtro ? 'Otro' : (form.transporte || '')} onChange={event => set('transporte', event.target.value === 'Otro' ? '' : event.target.value)} style={input}>
          <option value="">Seleccionar...</option>
          {TRANSPORTISTAS.map(item => <option key={item} value={item}>{item}</option>)}
          <option value="Otro">Otro: indicar</option>
        </select>
        {(transporteEsOtro || form.transporte === '') && (
          <input value={transporteEsOtro ? form.transporte : ''} onChange={event => set('transporte', event.target.value)} placeholder="Nombre del transportista" style={{ ...input, marginTop: 6 }} />
        )}
      </Field>
      <Field label="N° de seguimiento (opcional)">
        <input value={form.numeroSeguimiento || ''} onChange={event => set('numeroSeguimiento', event.target.value)} placeholder="Se completa al disponer de él" style={input} />
      </Field>
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
