import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from '../../store/notif'
import { PageHeader, Btn } from '../../components/shared'
import { useCreateDespacho, useCreateGuia, useUpdateGuia, useUpdateDespachoPacking, useDeleteGuia, useDespachos, useDespachoPacking, useGuiaDetalle } from '../../api/despachos'
import { useVenta } from '../../api/ventas'
import { useEmitirDte, useEnviarDocumento } from '../../api/facturacion'
import { IND_TRASLADO, TIPO_DESPACHO, buildReceptor, mapVentaItems } from '../../utils/facturacion'
import { emptyDespacho, DESPACHO_MODO_OPTS, cardStyle, input, grid } from './shared'
import { DespachoCamposFields, Field, Footer, Mono } from './shared-ui'

// Guia de despacho: elegir que enviar del pedido, generar el documento SII, y
// resolver el despacho (orden de transporte) sin salir del flujo. Pagina
// propia (antes modal popup) para que el link/recarga no pierda el contexto
// y "Nueva guia"/"Editar guia" tengan una URL real en vez de estado volatil.
export default function GuiaFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = !!id
  const volver = () => navigate('/despachos?tab=guias')

  const guiaDetalle = useGuiaDetalle(isEdit ? Number(id) : undefined)
  if (isEdit && guiaDetalle.isLoading) {
    return <main className="page page-wide"><PageHeader title="Editar guía" breadcrumb={['Inicio', 'Logistica', 'Despachos', 'Guías', 'Editar']} /><div style={cardStyle}>Cargando...</div></main>
  }
  if (isEdit && !guiaDetalle.data?.guia) {
    return <main className="page page-wide"><PageHeader title="Editar guía" breadcrumb={['Inicio', 'Logistica', 'Despachos', 'Guías', 'Editar']} /><div style={cardStyle}>Guía no encontrada. <Btn variant="ghost" onClick={volver}>Volver</Btn></div></main>
  }

  const initial = isEdit ? guiaDetalle.data.guia : {
    ordenId: searchParams.get('ordenId') || '',
    odtId: searchParams.get('odtId') || '',
    nInterno: searchParams.get('nInterno') || '',
    nGuia: '',
    fechaGuia: '',
    origen: '',
  }

  return (
    <main className="page page-wide">
      <PageHeader
        title={isEdit ? `Editar guía #${id}` : 'Nueva guía'}
        breadcrumb={['Inicio', 'Logistica', 'Despachos', 'Guías', isEdit ? 'Editar' : 'Nueva']}
      />
      <GuiaForm key={id || 'nueva'} isEdit={isEdit} initial={initial} onDone={volver} onCancel={volver} />
    </main>
  )
}

function GuiaForm({ isEdit, initial, onDone, onCancel }) {
  const [form, setForm] = useState(() => ({
    ordenId: '',
    odtId: '',
    nInterno: '',
    nGuia: '',
    origen: '',
    ...initial,
    fechaGuia: initial.fechaGuia ? String(initial.fechaGuia).slice(0, 10) : '',
  }))
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const [despachoModo, setDespachoModo] = useState(initial.despachoId ? 'existente' : 'ninguno')
  const [despachoIdExistente, setDespachoIdExistente] = useState(initial.despachoId ? String(initial.despachoId) : '')
  const [despachoNuevo, setDespachoNuevo] = useState(() => ({ ...emptyDespacho, ordenId: initial.ordenId || '' }))
  const setDespachoNuevoField = (key, value) => setDespachoNuevo(prev => ({ ...prev, [key]: value }))
  const despachosOrden = useDespachos(form.ordenId ? { ordenId: form.ordenId } : {})
  const despachos = form.ordenId ? (despachosOrden.data?.items || []) : []

  const packing = useDespachoPacking(form.ordenId || undefined, undefined, !isEdit && !!form.ordenId)
  const [envios, setEnvios] = useState({})
  const items = (packing.data?.items || []).map(item => {
    const pendiente = Math.max(0, Number(item.cantidad || 0) - Number(item.nEntregados || 0))
    const envio = Math.min(pendiente, Math.max(0, Number.parseInt(envios[item.id] || '0', 10) || 0))
    return { ...item, pendiente, envio }
  })
  const hayItemsSeleccionados = items.some(i => i.envio > 0)
  // La guia siempre se emite como DTE-52 al crearla (no debe existir un
  // registro de guia sin folio SII real): estos dos codigos los exige el SII
  // y no tienen default seguro, los define quien despacha.
  const [indTraslado, setIndTraslado] = useState('')
  const [tipoDespacho, setTipoDespacho] = useState('')
  const ventaParaDte = useVenta(!isEdit ? form.ordenId : undefined)

  const createDespachoMut = useCreateDespacho()
  const createGuiaMut = useCreateGuia()
  const updateGuiaMut = useUpdateGuia()
  const updatePackingMut = useUpdateDespachoPacking()
  const emitirMut = useEmitirDte()
  const enviarMut = useEnviarDocumento()
  const deleteGuiaMut = useDeleteGuia()
  const saving = createDespachoMut.isPending || createGuiaMut.isPending || updateGuiaMut.isPending
    || updatePackingMut.isPending || emitirMut.isPending || enviarMut.isPending || deleteGuiaMut.isPending

  const guardar = async () => {
    if (isEdit && !form.nGuia.trim()) { toast.error('Indica el N° de guia.'); return }
    if (despachoModo === 'existente' && !despachoIdExistente) { toast.error('Elige el despacho.'); return }
    if (!isEdit) {
      if (!form.ordenId) { toast.error('Indica el N° de Orden: la guía se emite como documento SII y necesita una venta real.'); return }
      if (!hayItemsSeleccionados) { toast.error('Selecciona al menos un producto y una cantidad para enviar.'); return }
      if (!indTraslado || !tipoDespacho) { toast.error('Indica el motivo del traslado y el tipo de despacho (los exige el SII).'); return }
      if (ventaParaDte.isLoading || !ventaParaDte.data) { toast.error('Espera a que cargue la venta antes de guardar.'); return }
    }
    try {
      let despachoId = null
      if (despachoModo === 'existente') {
        despachoId = Number(despachoIdExistente)
      } else if (despachoModo === 'nuevo') {
        const nuevo = await createDespachoMut.mutateAsync({ ...despachoNuevo, ordenId: form.ordenId })
        despachoId = nuevo.id
      }

      if (isEdit) {
        await updateGuiaMut.mutateAsync({ id: initial.id, data: { nGuia: form.nGuia, fechaGuia: form.fechaGuia, origen: form.origen, despachoId } })
        toast.success('Guía actualizada.')
        onDone()
        return
      }

      const guia = await createGuiaMut.mutateAsync({ ordenId: form.ordenId, odtId: form.odtId, nInterno: form.nInterno, nGuia: form.nGuia, fechaGuia: form.fechaGuia, origen: form.origen, despachoId })
      const itemsAEnviar = items.filter(i => i.envio > 0)
      try {
        await updatePackingMut.mutateAsync({
          ordenId: form.ordenId,
          guiaDespachoId: guia.id,
          despachoId: despachoId || undefined,
          items: itemsAEnviar.map(i => ({ itemId: i.id, nEntregados: Number(i.nEntregados || 0) + i.envio })),
        })
        const cantidadPorItemId = Object.fromEntries(itemsAEnviar.map(i => [i.id, i.envio]))
        const dteItems = mapVentaItems(ventaParaDte.data, cantidadPorItemId, { includeCargos: false })
        const receptor = buildReceptor(ventaParaDte.data.cliente)
        const { emitido } = await emitirMut.mutateAsync({
          ordenId: guia.ordenId ?? Number(form.ordenId),
          clienteId: ventaParaDte.data.clienteId || ventaParaDte.data.cliente?.id,
          guiaDespachoId: guia.id,
          tipoDte: 52,
          receptor,
          items: dteItems,
          extra: { indTraslado: Number(indTraslado), tipoDespacho: Number(tipoDespacho) },
        })
        // El folio ya quedo consumido y el XML firmado: si el envio al SII
        // falla aca (SII caido, red, etc.) NO se deshace la guia — queda
        // 'emitido' y se puede reintentar el envio desde Documentos, igual
        // que cualquier otro DTE emitido manualmente.
        try {
          await enviarMut.mutateAsync(emitido.id)
          toast.success(`Guía enviada al SII: folio ${emitido?.folio}.`)
        } catch (enviarError) {
          toast.error(`Guía emitida (folio ${emitido?.folio}) pero no se pudo enviar al SII automáticamente: ${enviarError?.response?.data?.error || enviarError?.message || 'error desconocido'}. Reintenta desde Documentos.`)
        }
        onDone()
      } catch (dteError) {
        // La guia no puede quedar como simple registro local sin su DTE: si la
        // emision falla (packing o SII), se deshace la guia recien creada en
        // vez de dejarla huerfana sin folio.
        try {
          const motivo = `Emisión SII fallida al crear: ${dteError?.response?.data?.error || dteError?.message || 'error desconocido'}`
          await deleteGuiaMut.mutateAsync({ id: guia.id, motivo })
        } catch { /* best-effort */ }
        throw dteError
      }
    } catch (cause) {
      toast.error(cause?.response?.data?.error || cause?.message || 'No se pudo guardar la guia.')
    }
  }

  return (
    <div style={cardStyle}>
      {!isEdit && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.5 }}>
          1. Elige abajo qué productos y cuánto enviar de este pedido. 2. Indica el motivo/tipo de despacho que exige el SII. 3. Resuelve el despacho (o déjalo pendiente). 4. Guarda: se emite y se envía al SII en el mismo paso — si la emisión falla, no queda un registro suelto (si solo falla el envío, queda emitida y se reintenta desde Documentos).
        </div>
      )}
      <div style={grid}>
        <Field label="N guia">
          <input value={form.nGuia} onChange={e => set('nGuia', e.target.value)} style={input} placeholder={isEdit ? '' : 'Automático si lo dejas vacío'} />
        </Field>
        <Field label="Orden ID"><input value={form.ordenId} onChange={e => set('ordenId', e.target.value)} style={input} disabled={isEdit} /></Field>
        <Field label="OT ID"><input value={form.odtId} onChange={e => set('odtId', e.target.value)} style={input} /></Field>
        <Field label="N interno"><input value={form.nInterno} disabled style={{ ...input, background: 'var(--bg)', color: 'var(--text-3)' }} title="Es el numero interno de la venta, no se edita aca" /></Field>
        <Field label="Fecha"><input type="date" value={form.fechaGuia} onChange={e => set('fechaGuia', e.target.value)} style={input} /></Field>
      </div>
      <Field label="Origen"><input value={form.origen} onChange={e => set('origen', e.target.value)} style={input} /></Field>

      {!isEdit && form.ordenId && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Qué enviar en esta guía</div>
          {packing.isLoading ? (
            <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Cargando ítems...</div>
          ) : !items.length ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}>Sin ítems de venta.</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Producto', 'Pendiente', 'Enviar ahora'].map((h, i) => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: i ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 10px' }}>{item.nombre}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}><Mono>{item.pendiente}</Mono></td>
                      <td style={{ padding: '4px 10px', textAlign: 'right' }}>
                        <input
                          type="number" min="0" max={item.pendiente} value={envios[item.id] ?? ''} placeholder="0"
                          onChange={event => setEnvios(prev => ({ ...prev, [item.id]: event.target.value }))}
                          style={{ width: 70, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, textAlign: 'right' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!isEdit && form.ordenId && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Documento SII (obligatorio para emitir la guía)</div>
          <div style={grid}>
            <Field label="Motivo del traslado">
              <select value={indTraslado} onChange={e => setIndTraslado(e.target.value)} style={input}>
                <option value="">Seleccionar...</option>
                {Object.entries(IND_TRASLADO).map(([code, text]) => <option key={code} value={code}>{code} — {text}</option>)}
              </select>
            </Field>
            <Field label="Tipo de despacho">
              <select value={tipoDespacho} onChange={e => setTipoDespacho(e.target.value)} style={input}>
                <option value="">Seleccionar...</option>
                {Object.entries(TIPO_DESPACHO).map(([code, text]) => <option key={code} value={code}>{code} — {text}</option>)}
              </select>
            </Field>
          </div>
          {ventaParaDte.isLoading && <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 4 }}>Cargando datos del receptor...</div>}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Despacho (orden de transporte)</div>
        <select value={despachoModo} onChange={e => setDespachoModo(e.target.value)} style={{ ...input, marginBottom: 10 }}>
          {DESPACHO_MODO_OPTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {despachoModo === 'existente' && (
          <select value={despachoIdExistente} onChange={e => setDespachoIdExistente(e.target.value)} style={input}>
            <option value="">Seleccionar despacho...</option>
            {despachos.map(d => (
              <option key={d.id} value={String(d.id)}>#{d.id} {d.transporte || ''} {d.numeroSeguimiento ? `· ${d.numeroSeguimiento}` : ''}</option>
            ))}
          </select>
        )}
        {despachoModo === 'nuevo' && <DespachoCamposFields form={despachoNuevo} set={setDespachoNuevoField} />}
      </div>

      <Footer saving={saving} onClose={onCancel} onSave={guardar} />
    </div>
  )
}
