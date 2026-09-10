import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from '../../store/notif'
import { PageHeader, Btn, Badge } from '../../components/shared'
import { useCreateGuia, useUpdateGuia, useDespachos, useDespachoPacking, useGuiaDetalle } from '../../api/despachos'
import { useVenta } from '../../api/ventas'
import { IND_TRASLADO, TIPO_DESPACHO, normalizeRut, isValidRut } from '../../utils/facturacion'
import { cardStyle, input, grid } from './shared'
import { Field } from './shared-ui'
import api from '../../api/client'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

export default function GuiaFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = !!id
  const volver = () => navigate('/despachos?tab=guias')

  const guiaDetalle = useGuiaDetalle(isEdit ? Number(id) : undefined)
  if (isEdit && guiaDetalle.isLoading) {
    return (
      <main className="page page-wide">
        <PageHeader title="Editar guía de despacho" breadcrumb={['Inicio', 'Logística', 'Despachos', 'Guías', 'Editar']} />
        <div style={cardStyle}>Cargando datos de la guía...</div>
      </main>
    )
  }

  if (isEdit && !guiaDetalle.data?.guia) {
    return (
      <main className="page page-wide">
        <PageHeader title="Editar guía de despacho" breadcrumb={['Inicio', 'Logística', 'Despachos', 'Guías', 'Editar']} />
        <div style={cardStyle}>
          Guía no encontrada. <Btn variant="ghost" onClick={volver}>Volver</Btn>
        </div>
      </main>
    )
  }

  const initial = isEdit ? guiaDetalle.data.guia : {
    ordenId: searchParams.get('ordenId') || '',
    despachoId: searchParams.get('despachoId') || '',
    odtId: searchParams.get('odtId') || '',
    nInterno: searchParams.get('nInterno') || '',
    nGuia: '',
    fechaGuia: '',
    origen: '',
  }

  return (
    <main className="page page-wide">
      <PageHeader
        title={isEdit ? `Editar guía #${id}` : 'Preparar Guía de Despacho (DTE 52)'}
        breadcrumb={['Inicio', 'Logística', 'Despachos', 'Guías', isEdit ? 'Editar' : 'Nueva']}
      />
      <GuiaForm
        key={id || 'nueva'}
        isEdit={isEdit}
        initial={initial}
        existingDoc={guiaDetalle.data?.documentoDte}
        existingDespacho={guiaDetalle.data?.despacho}
        onDone={volver}
        onCancel={volver}
      />
    </main>
  )
}

function GuiaForm({ isEdit, initial, existingDoc, existingDespacho, onDone, onCancel }) {
  const { user } = useAuthStore()
  const canEmitir = can(user, 'facturacion.emitir', 'write') || can(user, 'facturacion', 'write')

  const [form, setForm] = useState(() => ({
    ordenId: '',
    odtId: '',
    nInterno: '',
    nGuia: '',
    origen: '',
    despachoId: '',
    ...initial,
    fechaGuia: initial.fechaGuia ? String(initial.fechaGuia).slice(0, 10) : new Date().toISOString().slice(0, 10),
  }))
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const despachoId = initial.despachoId ? String(initial.despachoId) : (form.despachoId ? String(form.despachoId) : '')

  const despachosQuery = useDespachos(form.ordenId ? { ordenId: form.ordenId } : (form.despachoId ? { id: form.despachoId } : {}))
  const despachos = despachosQuery.data?.items || []
  const selectedDespacho = despachos.find(d => String(d.id) === String(despachoId || form.despachoId)) || existingDespacho || null
  const esManual = form.origenTipo === 'manual' || selectedDespacho?.origenTipo === 'manual'

  // Venta data if linked
  const ventaQuery = useVenta(!esManual && form.ordenId ? form.ordenId : undefined)
  const ventaData = ventaQuery.data || null

  // Fiscal receptor state
  const receptorDefaults = useMemo(() => {
    const r = existingDoc?.receptor || {}
    return {
      rut: r.rut || selectedDespacho?.receptorRut || ventaData?.rutCliente || '',
      razonSocial: r.razonSocial || selectedDespacho?.receptorRazonSocial || ventaData?.cliente?.razonSocial || ventaData?.nombreCliente || '',
      giro: r.giro || selectedDespacho?.receptorGiro || ventaData?.cliente?.giro || '',
      direccion: r.direccion || selectedDespacho?.direccion || ventaData?.direccionDespacho || ventaData?.clienteSucursal?.direccion || '',
      comuna: r.comuna || selectedDespacho?.comuna || ventaData?.comunaDespacho || ventaData?.clienteSucursal?.comuna || '',
      ciudad: r.ciudad || selectedDespacho?.ciudad || ventaData?.ciudadDespacho || ventaData?.clienteSucursal?.ciudad || '',
      contacto: r.contacto || selectedDespacho?.contacto || ventaData?.contactoDespacho || '',
      email: r.email || selectedDespacho?.emailContacto || ventaData?.emailContactoDespacho || '',
    }
  }, [existingDoc, selectedDespacho, ventaData])

  const [receptor, setReceptor] = useState(receptorDefaults)
  const receptorTouched = useRef(false)

  // selectedDespacho/ventaData llegan de queries async: cuando el formulario
  // monta antes de que resuelvan, el estado inicial queda vacio para siempre
  // si no se resincroniza aca. Se corta apenas el usuario edita algo a mano.
  useEffect(() => {
    if (receptorTouched.current) return
    setReceptor(receptorDefaults)
  }, [receptorDefaults])

  const setReceptorField = (key, value) => {
    receptorTouched.current = true
    setReceptor(prev => ({ ...prev, [key]: value }))
  }

  // Traslado & Tipo despacho
  const [indTraslado, setIndTraslado] = useState(existingDoc?.extra?.indTraslado ? String(existingDoc.extra.indTraslado) : '1')
  const [tipoDespacho, setTipoDespacho] = useState(existingDoc?.extra?.tipoDespacho ? String(existingDoc.extra.tipoDespacho) : '2')

  // Items
  const packing = useDespachoPacking(
    form.ordenId || undefined,
    { guiaDespachoId: isEdit ? initial.id : undefined },
    !esManual && !!form.ordenId,
  )
  const [envios, setEnvios] = useState({})

  // Manual items for isolated dispatch
  const [itemsManuales, setItemsManuales] = useState(() => {
    if (existingDoc?.items && Array.isArray(existingDoc.items)) return existingDoc.items
    if (selectedDespacho?.items && Array.isArray(selectedDespacho.items)) return selectedDespacho.items
    return []
  })
  const [nuevoItemDesc, setNuevoItemDesc] = useState('')
  const [nuevoItemCant, setNuevoItemCant] = useState('1')
  const [nuevoItemUnidad, setNuevoItemUnidad] = useState('UN')

  const currentGuideItems = Array.isArray(initial.items) ? initial.items : []
  const itemsVenta = (packing.data?.items || []).map(item => {
    const preparado = Number(item.cantidadPreparada ?? item.nEntregados ?? 0)
    const pendientePreparar = Number(item.pendientePreparar ?? Math.max(0, Number(item.cantidad || 0) - preparado))
    const disponibleGuia = Number(item.disponibleGuia ?? preparado)
    const currentLine = currentGuideItems.find(line => Number(line.ordenItemId) === Number(item.id))
      || currentGuideItems.find(line => line.nombre === item.nombre)
    const defaultEnvio = isEdit ? Number(currentLine?.cantidad || 0) : disponibleGuia
    const requested = Math.max(0, Number.parseInt(envios[item.id] ?? String(defaultEnvio), 10) || 0)
    const envio = Math.min(disponibleGuia, requested)
    return { ...item, preparado, pendientePreparar, disponibleGuia, envio }
  })

  const itemsFinales = useMemo(() => {
    if (esManual) return itemsManuales
    return itemsVenta.filter(i => i.envio > 0)
  }, [esManual, itemsManuales, itemsVenta])

  const disponibleGuiaTotal = itemsVenta.reduce((sum, item) => sum + item.disponibleGuia, 0)
  const sinUnidadesDisponibles = !esManual && !packing.isLoading && !packing.isPlaceholderData && disponibleGuiaTotal <= 0

  // Validation
  const validacion = useMemo(() => {
    const faltantes = []
    const indNum = Number(indTraslado || 1)
    const rutClean = normalizeRut(receptor.rut)
    if (indNum !== 5) {
      if (!rutClean || !isValidRut(rutClean)) faltantes.push('RUT del receptor válido')
      if (!String(receptor.razonSocial || '').trim()) faltantes.push('Razón Social del receptor')
      if (!String(receptor.giro || '').trim()) faltantes.push('Giro comercial del receptor')
      if (!String(receptor.direccion || '').trim()) faltantes.push('Dirección de destino')
      if (!String(receptor.comuna || '').trim()) faltantes.push('Comuna de destino')
      if (!String(receptor.ciudad || '').trim()) faltantes.push('Ciudad de destino')
    }
    if (!IND_TRASLADO[indNum]) faltantes.push('Indicador de traslado')
    if (!TIPO_DESPACHO[Number(tipoDespacho || 2)]) faltantes.push('Tipo de despacho')
    if (itemsFinales.length === 0) faltantes.push('Al menos un producto a trasladar con cantidad > 0')

    return {
      valido: faltantes.length === 0,
      faltantes,
    }
  }, [indTraslado, receptor, tipoDespacho, itemsFinales])

  const createGuiaMut = useCreateGuia()
  const updateGuiaMut = useUpdateGuia()
  const [emitidoResult, setEmitidoResult] = useState(null)
  const saving = createGuiaMut.isPending || updateGuiaMut.isPending

  const agregarItemManual = () => {
    if (!nuevoItemDesc.trim()) return
    const cant = Math.max(1, Number(nuevoItemCant) || 1)
    setItemsManuales(prev => [...prev, { nombre: nuevoItemDesc.trim(), cantidad: cant, unidad: nuevoItemUnidad || 'UN' }])
    setNuevoItemDesc('')
    setNuevoItemCant('1')
  }

  const eliminarItemManual = idx => {
    setItemsManuales(prev => prev.filter((_, i) => i !== idx))
  }

  const guardar = async (emitirSii = false) => {
    if (!esManual && itemsFinales.length === 0) {
      toast.error('Esta venta no tiene unidades preparadas disponibles para incluir en una nueva guía.')
      return
    }
    if (emitirSii && !validacion.valido) {
      toast.error(`No se puede emitir al SII: faltan ${validacion.faltantes.length} campos obligatorios.`)
      return
    }

    try {
      const targetDespachoId = despachoId ? Number(despachoId) : (form.despachoId ? Number(form.despachoId) : null)

      const payload = {
        ordenId: esManual ? undefined : (form.ordenId || undefined),
        odtId: esManual ? undefined : (form.odtId || undefined),
        nInterno: esManual ? undefined : (form.nInterno || undefined),
        nGuia: form.nGuia || undefined,
        fechaGuia: form.fechaGuia || undefined,
        origen: form.origen || undefined,
        origenTipo: esManual ? 'manual' : 'orden',
        despachoId: targetDespachoId || undefined,
        indTraslado: Number(indTraslado),
        tipoDespacho: Number(tipoDespacho),
        receptor,
        items: itemsFinales.map(i => ({ ordenItemId: i.id, nombre: i.nombre || i.descripcion, cantidad: i.envio || i.cantidad, unidad: i.unidad || 'UN' })),
        borrador: !emitirSii,
        emitirSii,
      }

      if (isEdit) {
        await updateGuiaMut.mutateAsync({ id: initial.id, data: payload })
        toast.success('Guía actualizada.')
        onDone()
      } else {
        const res = await createGuiaMut.mutateAsync(payload)
        toast.success(emitirSii ? 'Guía DTE 52 emitida al SII con éxito.' : 'Guía guardada como borrador.')
        if (emitirSii && res?.documento?.folio) {
          setEmitidoResult(res.documento)
        } else {
          onDone()
        }
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Error al guardar guía')
    }
  }

  const emitirGuiaDirecta = async () => {
    if (!initial.id) return
    try {
      const res = await api.post(`/despachos/guias/${initial.id}/emitir-sii`)
      toast.success(`Guía emitida al SII con Folio ${res.data.folio}`)
      setEmitidoResult(res.data.documento)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al emitir guía al SII')
    }
  }

  if (emitidoResult) {
    return (
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 24, maxWidth: 650, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>📄</div>
        <h3 style={{ margin: '0 0 8px' }}>Guía DTE 52 emitida al SII</h3>
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--blue)', marginBottom: 8 }}>
          Folio asignado: {emitidoResult.folio}
        </p>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 20 }}>
          Estado en SII: {emitidoResult.estado}. El documento cuenta con timbre electrónico y XML firmado.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Btn variant="primary" onClick={onDone}>
            Ir a Lista de Guías
          </Btn>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 24, maxWidth: 960 }}>
      {/* Banner de estado DTE */}
      {existingDoc && (
        <div style={{ padding: 12, borderRadius: 8, background: existingDoc.estado === 'borrador' ? 'var(--amber-50, #fffbeb)' : 'var(--green-50, #f0fdf4)', border: '1px solid var(--border)', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>Documento DTE 52: </strong>
            <Badge tone={existingDoc.estado === 'borrador' ? 'amber' : 'green'}>
              {existingDoc.estado === 'borrador' ? 'Borrador / Preparada (Sin emitir)' : `Emitido (Folio ${existingDoc.folio})`}
            </Badge>
          </div>
          {existingDoc.estado === 'borrador' && canEmitir && (
            <Btn variant="primary" size="sm" onClick={emitirGuiaDirecta} disabled={!validacion.valido}>
              Emitir al SII ahora
            </Btn>
          )}
        </div>
      )}

      {/* Checklist de validacion DTE 52 */}
      {sinUnidadesDisponibles && (
        <div role="alert" style={{ padding: 14, borderRadius: 8, background: 'var(--amber-50, #fffbeb)', border: '1px solid var(--amber-200, #fde68a)', marginBottom: 20, color: 'var(--amber-900, #78350f)', fontSize: 13 }}>
          <strong>No hay unidades disponibles para una nueva guía.</strong>
          <div style={{ marginTop: 4 }}>Todas las unidades preparadas ya están incluidas en otras guías, o todavía falta completar el packing.</div>
        </div>
      )}
      {!validacion.valido && (
        <div style={{ padding: 14, borderRadius: 8, background: 'var(--amber-50, #fffbeb)', border: '1px solid var(--amber-200, #fde68a)', marginBottom: 20 }}>
          <strong style={{ fontSize: 13, color: 'var(--amber-800, #92400e)' }}>
            ⚠️ Campos obligatorios pendientes para emisión SII (puedes guardar como borrador):
          </strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12, color: 'var(--amber-900, #78350f)' }}>
            {validacion.faltantes.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Origen y vinculacion */}
      <section style={{ marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 12px' }}>1. Origen y Despacho</h4>
        <div style={grid}>
          {!esManual && (
            <Field label="N° Interno (Venta)">
              <input value={form.interno || form.nInterno || (form.ordenId ? `#${form.ordenId}` : '')} disabled style={{ ...input, background: 'var(--bg)' }} />
            </Field>
          )}
          {esManual && (
            <Field label="Origen">
              <input value="Despacho aislado de bodega" disabled style={{ ...input, background: 'var(--bg)' }} />
            </Field>
          )}
          <Field label="Fecha de la Guía *">
            <input type="date" value={form.fechaGuia} onChange={e => set('fechaGuia', e.target.value)} style={input} />
          </Field>
          <Field label="N° Folio / Guía manual (opcional)">
            <input value={form.nGuia} onChange={e => set('nGuia', e.target.value)} placeholder="Autogenerado o asignado" style={input} />
          </Field>
        </div>
      </section>

      {/* Datos Fiscales del Receptor */}
      <section style={{ marginBottom: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <h4 style={{ margin: '0 0 12px' }}>2. Datos del Receptor (Destinatario)</h4>
        <div style={grid}>
          <Field label="RUT Receptor *">
            <input value={receptor.rut} onChange={e => setReceptorField('rut', e.target.value)} placeholder="76.123.456-7" style={input} />
          </Field>
          <Field label="Razón Social *">
            <input value={receptor.razonSocial} onChange={e => setReceptorField('razonSocial', e.target.value)} placeholder="Nombre o Razón Social" style={input} />
          </Field>
          <Field label="Giro Comercial *">
            <input value={receptor.giro} onChange={e => setReceptorField('giro', e.target.value)} placeholder="Giro" style={input} />
          </Field>
          <Field label="Dirección de Destino *">
            <input value={receptor.direccion} onChange={e => setReceptorField('direccion', e.target.value)} placeholder="Dirección" style={input} />
          </Field>
          <Field label="Comuna *">
            <input value={receptor.comuna} onChange={e => setReceptorField('comuna', e.target.value)} placeholder="Comuna" style={input} />
          </Field>
          <Field label="Ciudad *">
            <input value={receptor.ciudad} onChange={e => setReceptorField('ciudad', e.target.value)} placeholder="Ciudad" style={input} />
          </Field>
        </div>
      </section>

      {/* Motivo de traslado y Tipo de despacho */}
      <section style={{ marginBottom: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <h4 style={{ margin: '0 0 12px' }}>3. Parámetros de Traslado SII</h4>
        <div style={grid}>
          <Field label="Motivo del traslado (IndTraslado) *">
            <select value={indTraslado} onChange={e => setIndTraslado(e.target.value)} style={input}>
              {Object.entries(IND_TRASLADO).map(([val, desc]) => (
                <option key={val} value={val}>{val} - {desc}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de despacho *">
            <select value={tipoDespacho} onChange={e => setTipoDespacho(e.target.value)} style={input}>
              {Object.entries(TIPO_DESPACHO).map(([val, desc]) => (
                <option key={val} value={val}>{val} - {desc}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* Ítems a trasladar */}
      <section style={{ marginBottom: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <h4 style={{ margin: '0 0 12px' }}>4. Productos a Trasladar</h4>
        {!esManual && (
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Producto</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', width: 80 }}>Pedido</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', width: 90 }}>Preparado</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', width: 110 }}>Pendiente de packing</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', width: 110 }}>Disponible para guía</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', width: 110 }}>A Enviar</th>
                </tr>
              </thead>
              <tbody>
                {itemsVenta.map(it => (
                  <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px' }}>{it.nombre}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{it.cantidad}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{it.preparado}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{it.pendientePreparar}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: it.disponibleGuia > 0 ? 'var(--green-700)' : 'var(--text-3)' }}>{it.disponibleGuia}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <input
                        type="number"
                        min="0"
                        max={it.disponibleGuia}
                        value={it.envio}
                        disabled={it.disponibleGuia <= 0}
                        onChange={e => setEnvios({ ...envios, [it.id]: e.target.value })}
                        style={{ ...input, width: 80, textAlign: 'right', padding: '4px 8px', opacity: it.disponibleGuia > 0 ? 1 : 0.55 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {esManual && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Descripción</label>
                <input value={nuevoItemDesc} onChange={e => setNuevoItemDesc(e.target.value)} placeholder="Descripción del producto a trasladar" style={input} />
              </div>
              <div style={{ width: 90 }}>
                <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Cantidad</label>
                <input type="number" min="1" value={nuevoItemCant} onChange={e => setNuevoItemCant(e.target.value)} style={input} />
              </div>
              <div style={{ width: 80 }}>
                <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Unidad</label>
                <input value={nuevoItemUnidad} onChange={e => setNuevoItemUnidad(e.target.value)} style={input} />
              </div>
              <Btn variant="secondary" onClick={agregarItemManual}>Agregar</Btn>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Producto</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', width: 90 }}>Cantidad</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', width: 80 }}>Unidad</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {itemsManuales.map((it, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px' }}>{it.nombre}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{it.cantidad}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{it.unidad || 'UN'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <button type="button" onClick={() => eliminarItemManual(idx)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Botones de accion */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="secondary" onClick={() => guardar(false)} disabled={saving || sinUnidadesDisponibles}>
            Guardar Borrador / Preparada
          </Btn>
          {canEmitir && (
            <Btn variant="primary" onClick={() => guardar(true)} disabled={saving || !validacion.valido || sinUnidadesDisponibles}>
              Guardar y Emitir al SII
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}
