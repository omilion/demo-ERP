import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge, PageHeader, Btn, Table, Icon } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import {
  useCotizacion, useUpdateCotizacion, useDeleteCotizacion,
  useAddCotizacionItem, useUpdateCotizacionItem, useDeleteCotizacionItem,
  useCrearVentaDesdeLicitacion, useActualizarVentaDesdeLicitacion,
  useCotizacionItemHistorial,
} from '../../api/cotizaciones'
import { useEvaluarDescuentoCotizacion, useSolicitarDescuentoCotizacion } from '../../api/descuentos'
import { useProductos } from '../../api/productos'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { plazoDiasFromLicitacion, plazoLabel, sanitizeOrdenCompra, sanitizePlazoDias } from '../../utils/licitacionFields'

const ESTADO_TONE = {
  'Pendiente':  'amber', 'Adjudicada': 'green', 'Cerrada': 'neutral',
  'No Adjudicada': 'red', 'Rechazada':  'red',   'En proceso': 'blue',
}
const ESTADOS = ['Pendiente', 'En proceso', 'Adjudicada', 'No Adjudicada', 'Rechazada', 'Cerrada']

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

const licitacionForm = data => ({
  idLicitacion: data.idLicitacion || '',
  estado: data.estado || 'Pendiente',
  rutCliente: data.rutCliente || '',
  obs: data.obs || '',
  plazo: plazoDiasFromLicitacion(data),
  ordenCompra: sanitizeOrdenCompra(data.ordenCompra),
  referencia: data.referencia || '',
  fecha: data.fecha ? data.fecha.slice(0, 10) : '',
  fechaPlazo: data.fechaPlazo ? data.fechaPlazo.slice(0, 10) : '',
  enviosParciales: !!data.enviosParciales,
  montoDespacho: data.montoDespacho || 0,
})

function precioLicitacion(producto) {
  return Number(producto.consultaPrecios?.precioLicitacion ?? producto.precioLicitacion ?? producto.precioLista ?? 0)
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '')
}

function descuentoApiError(error, fallback = 'No fue posible evaluar descuentos') {
  return error?.response?.data?.error || fallback
}

function normalizeRuleValue(rule) {
  const value = firstDefined(rule.valor, rule.porcentaje, rule.descuentoPct, rule.valorDescuento)
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeRuleStatus(value) {
  return String(value || '').trim().toUpperCase()
}

function normalizeEvaluatedRule(rule, defaults = {}, idx = 0) {
  const estado = normalizeRuleStatus(firstDefined(rule.estado, rule.status, defaults.estado, ''))
  const isPending = estado === 'PENDIENTE'
  const isRejected = estado === 'RECHAZADA'
  const isAuthorized = estado === 'AUTORIZADA'
  const requiresApproval = Boolean(firstDefined(
    rule.requiereAprobacion,
    rule.requiere_aprobacion,
    rule.requiresApproval,
    defaults.requiereAprobacion,
    false
  )) || isPending
  const disponibleRaw = firstDefined(rule.disponible, rule.aplicable, rule.aprobada, defaults.disponible)
  return {
    id: firstDefined(rule.id, rule.reglaId, rule.codigo, defaults.id, `regla-${idx}`),
    codigo: firstDefined(rule.codigo, rule.code, ''),
    nombre: firstDefined(rule.nombre, rule.name, rule.titulo, defaults.nombre, `Regla ${idx + 1}`),
    descripcion: firstDefined(rule.descripcion, rule.description, rule.motivo, rule.razon, ''),
    valor: normalizeRuleValue(rule),
    montoDescuento: firstDefined(rule.montoDescuento, rule.descuentoMonto, null),
    totalConDescuento: firstDefined(rule.totalConDescuento, rule.totalFinal, null),
    requiereAprobacion: requiresApproval,
    estado,
    disponible: isAuthorized ? true : isPending || isRejected ? false : disponibleRaw === undefined ? !requiresApproval : Boolean(disponibleRaw),
  }
}

function normalizeEvaluacionDescuentos(result) {
  const grupos = []
  const add = (items, defaults) => {
    if (Array.isArray(items)) grupos.push(...items.map((item, idx) => normalizeEvaluatedRule(item, defaults, grupos.length + idx)))
  }

  if (Array.isArray(result)) add(result, {})
  else {
    add(result?.disponibles, { disponible: true })
    add(result?.aplicables, { disponible: true })
    add(result?.reglasDisponibles, { disponible: true })
    add(result?.solicitables, { requiereAprobacion: true, disponible: false })
    add(result?.requierenAprobacion, { requiereAprobacion: true, disponible: false })
    add(result?.requiereAprobacion, { requiereAprobacion: true, disponible: false })
    if (!grupos.length) add(result?.items, {})
    if (!grupos.length) add(result?.reglas, {})
  }

  const seen = new Set()
  return grupos.filter(rule => {
    const key = `${rule.id || ''}-${rule.codigo || ''}-${rule.nombre}-${rule.valor}`
    if (seen.has(key)) return false
    seen.add(key)
    return rule.valor !== null
  })
}

function buildCotizacionDiscountPayload({ cotizacion, items, subtotal, totalAdjudicado }) {
  return {
    origen: 'licitacion',
    cotizacionId: cotizacion.id,
    idLicitacion: cotizacion.idLicitacion || null,
    tipoVenta: 'Licitacion',
    estado: cotizacion.estado || null,
    rutCliente: cotizacion.rutCliente || cotizacion.cliente?.rut || null,
    clienteId: cotizacion.cliente?.id || null,
    ordenId: cotizacion.orden?.id || cotizacion.ordenId || null,
    ordenCompra: cotizacion.ordenCompra || null,
    subtotal,
    totalAdjudicado,
    baseEvaluacion: totalAdjudicado || subtotal,
    items: items.map(item => ({
      id: item.id,
      productoId: item.productoId || null,
      codigoInterno: item.codigoInterno || null,
      nombre: item.nombre || null,
      cantidad: Number(item.cantidad || 0),
      cantAdjudicados: Number(item.cantAdjudicados || 0),
      precio: Number(item.precio || 0),
    })),
  }
}

function LicitacionDescuentoPanel({ cotizacion, items, subtotal, totalAdjudicado, canRequest }) {
  const evaluar = useEvaluarDescuentoCotizacion()
  const solicitar = useSolicitarDescuentoCotizacion()
  const [evaluacion, setEvaluacion] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const hasContext = items.length > 0 && (subtotal > 0 || totalAdjudicado > 0)
  const payload = buildCotizacionDiscountPayload({ cotizacion, items, subtotal, totalAdjudicado })
  const reglas = normalizeEvaluacionDescuentos(evaluacion)

  function evaluate() {
    if (!hasContext) return
    setError('')
    setMessage('')
    evaluar.mutate({ id: cotizacion.id, data: payload }, {
      onSuccess: data => setEvaluacion(data),
      onError: err => {
        setEvaluacion(null)
        setError(descuentoApiError(err, 'No fue posible evaluar reglas para esta licitacion'))
      },
    })
  }

  useEffect(() => {
    if (!hasContext) {
      const timer = setTimeout(() => setEvaluacion(null), 0)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => evaluate(), 450)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasContext, cotizacion.id, cotizacion.estado, cotizacion.ordenCompra, subtotal, totalAdjudicado, items])

  async function requestRule(rule) {
    const motivo = await promptDialog({ title: 'Motivo de solicitud para esta licitacion' })
    if (motivo === null) return
    setError('')
    setMessage('')
    solicitar.mutate({
      id: cotizacion.id,
      data: {
        ...payload,
        reglaId: rule.id,
        reglaCodigo: rule.codigo || null,
        reglaNombre: rule.nombre,
        descuentoPct: rule.valor,
        porcentaje: rule.valor,
        descuentoPctSolicitado: rule.valor,
        motivo: motivo.trim() || undefined,
      },
    }, {
      onSuccess: () => setMessage('Solicitud de descuento enviada'),
      onError: err => setError(descuentoApiError(err, 'No se pudo enviar la solicitud')),
    })
  }

  return (
    <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Evaluacion de descuentos</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Base adjudicada {fmt(totalAdjudicado || subtotal)}</div>
        </div>
        <Btn variant="secondary" size="sm" icon="refreshCw" onClick={evaluate} disabled={!hasContext || evaluar.isPending}>
          {evaluar.isPending ? 'Evaluando...' : 'Evaluar'}
        </Btn>
      </div>
      <div style={{ padding: 14 }}>
        {!hasContext && <div style={discountEmpty}>Agrega productos para evaluar reglas de descuento.</div>}
        {hasContext && error && <div style={{ ...discountNotice, background: 'var(--amber-bg)', color: 'var(--text-2)' }}>{error}</div>}
        {hasContext && message && <div style={{ ...discountNotice, background: 'var(--green-50)', color: 'var(--green-700)' }}>{message}</div>}
        {hasContext && reglas.length === 0 && !evaluar.isPending && !error && <div style={discountEmpty}>Sin reglas evaluadas para esta licitacion.</div>}
        {hasContext && reglas.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {reglas.map(rule => (
              <article key={rule.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{rule.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{rule.descripcion || rule.codigo || 'Regla comercial'}</div>
                  </div>
                  <strong style={{ fontFamily: "'DM Mono', monospace", color: 'var(--green-700)', fontSize: 16 }}>{rule.valor}%</strong>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  <Badge tone={rule.disponible ? 'green' : 'amber'}>{rule.disponible ? 'Disponible' : 'Requiere gestion'}</Badge>
                  {rule.estado && <Badge tone={rule.estado === 'AUTORIZADA' ? 'green' : rule.estado === 'PENDIENTE' ? 'amber' : 'red'}>{rule.estado}</Badge>}
                  {rule.montoDescuento != null && <Badge tone="blue">{fmt(rule.montoDescuento)}</Badge>}
                </div>
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                  <Btn variant="secondary" size="xs" onClick={() => requestRule(rule)} disabled={!canRequest || rule.estado === 'RECHAZADA' || solicitar.isPending}>
                    Solicitar
                  </Btn>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function ProductoLookup({ onSelect }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { data: result } = useProductos(q.length >= 2 ? { search: q, limit: 15 } : {})
  const productos = result?.items ?? []

  useEffect(() => {
    const handler = event => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: 8 }}>
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => q.length >= 2 && setOpen(true)}
        placeholder="Buscar en catalogo por codigo o nombre"
        style={{ ...inputSm, width: '100%' }}
      />
      {open && q.length >= 2 && productos.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', maxHeight: 260, overflowY: 'auto' }}>
          {productos.slice(0, 15).map(producto => (
            <button
              key={producto.id}
              type="button"
              onClick={() => {
                onSelect(producto)
                setQ('')
                setOpen(false)
              }}
              style={{ display: 'grid', gridTemplateColumns: '36px 120px 1fr 120px', gap: 8, width: '100%', padding: '8px 10px', border: 0, borderBottom: '1px solid var(--border)', background: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: 12, alignItems: 'center' }}
            >
              {producto.fotoUrl ? (
                <img src={producto.fotoUrl} alt={producto.nombre} style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 4 }} />
              ) : (
                <div style={{ width: 30, height: 30, borderRadius: 4, background: 'var(--bg-2)', border: '1px solid var(--border)' }} />
              )}
              <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-3)' }}>{producto.codigoInterno || '-'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{producto.nombre}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", textAlign: 'right' }}>{fmt(precioLicitacion(producto))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LicitacionDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canReadVentas = can(user, 'ventas', 'read')
  const canWriteVentas = can(user, 'ventas', 'write')
  const canWriteLicitaciones = can(user, 'licitaciones', 'write')
  const canDeleteLicitaciones = can(user, 'licitaciones', 'delete')
  const { data, isLoading } = useCotizacion(id)
  const updateMut = useUpdateCotizacion()
  const deleteMut = useDeleteCotizacion()
  const addItemMut = useAddCotizacionItem()
  const updateItemMut = useUpdateCotizacionItem()
  const deleteItemMut = useDeleteCotizacionItem()
  const crearVentaMut = useCrearVentaDesdeLicitacion()
  const actualizarVentaMut = useActualizarVentaDesdeLicitacion()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [editItemId, setEditItemId] = useState(null)
  const [itemForm, setItemForm] = useState({})
  const [newItem, setNewItem] = useState({ codigoInterno: '', nombre: '', descripcion: '', cantidad: '', cantAdjudicados: '', precio: '' })
  const [historialItemId, setHistorialItemId] = useState(null)

  if (isLoading) return <main style={{ padding: 24 }}>Cargando…</main>
  if (!data) return <main style={{ padding: 24 }}>No encontrada</main>

  const items = data.items ?? []
  const subtotal = items.reduce((s, i) => s + (i.cantidad || 0) * (i.precio || 0), 0)
  const totalAdjudicado = items.reduce((s, i) => s + (i.cantAdjudicados || 0) * (i.precio || 0), 0)

  const handleSave = () => {
    updateMut.mutate({
      id: data.id,
      data: {
        ...form,
        plazo: sanitizePlazoDias(form.plazo),
        ordenCompra: sanitizeOrdenCompra(form.ordenCompra),
      },
    }, { onSuccess: () => setEditing(false) })
  }

  const handleDelete = async () => {
    if (!await confirmDialog({ title: 'Confirmar', detail: '¿Eliminar licitación? Esta acción no se puede deshacer.', tone: 'danger' })) return
    deleteMut.mutate(data.id, { onSuccess: () => navigate('/licitaciones') })
  }

  const startEditItem = (it) => {
    setEditItemId(it.id)
    setItemForm({
      codigoInterno: it.codigoInterno || '',
      nombre: it.nombre || '',
      descripcion: it.descripcion || '',
      cantidad: it.cantidad ?? '',
      cantAdjudicados: it.cantAdjudicados ?? '',
      precio: it.precio ?? '',
    })
  }
  const saveItem = () => {
    updateItemMut.mutate({ id: data.id, itemId: editItemId, data: itemForm }, {
      onSuccess: () => setEditItemId(null),
    })
  }
  const deleteItem = async (itemId) => {
    if (!await confirmDialog({ title: 'Confirmar', detail: '¿Eliminar item?', tone: 'danger' })) return
    deleteItemMut.mutate({ id: data.id, itemId })
  }
  const addItem = () => {
    if (!newItem.nombre && !newItem.codigoInterno) { toast.warning('Código o nombre requerido'); return }
    addItemMut.mutate({ id: data.id, data: newItem }, {
      onSuccess: () => setNewItem({ codigoInterno: '', nombre: '', descripcion: '', cantidad: '', cantAdjudicados: '', precio: '' }),
    })
  }
  const crearVenta = async () => {
    if (data.orden?.id || data.ordenId) {
      navigate('/ventas/' + (data.orden?.id || data.ordenId) + '/editar')
      return
    }
    if (!await confirmDialog({ title: 'Confirmar', detail: '¿Crear venta desde esta licitación? Se generará una orden con los items adjudicados.' })) return
    crearVentaMut.mutate(data.id, {
      onSuccess: (res) => {
        const msg = res.faltantes?.length
          ? `Venta creada (#${res.orden.id}). Faltantes en catálogo: ${res.faltantes.join(', ')}`
          : `Venta creada (#${res.orden.id})`
        toast.warning(msg)
        navigate('/ventas/' + res.orden.id + '/editar')
      },
      onError: (err) => toast.error(err?.response?.data?.error || 'Error al crear venta'),
    })
  }
  const actualizarVenta = async () => {
    if (!data.orden?.id && !data.ordenId) return
    if (!await confirmDialog({ title: 'Confirmar', detail: 'Actualizar la venta vinculada con los items adjudicados actuales?' })) return
    actualizarVentaMut.mutate(data.id, {
      onSuccess: (res) => {
        toast.warning(res.faltantes?.length ? `Venta actualizada. Faltantes: ${res.faltantes.join(', ')}` : 'Venta actualizada')
        navigate('/ventas/' + res.orden.id + '/editar')
      },
      onError: (err) => toast.error(err?.response?.data?.error || 'Error al actualizar venta'),
    })
  }
  const adjudicarTodo = async () => {
    if (!canWriteLicitaciones || !items.length) return
    if (!await confirmDialog({ title: 'Confirmar', detail: 'Adjudicar todos los items por su cantidad cotizada?' })) return
    items.forEach(item => {
      updateItemMut.mutate({
        id: data.id,
        itemId: item.id,
        data: { cantAdjudicados: item.cantidad },
      })
    })
  }
  const imprimir = () => window.print()

  const hasAdjudicados = items.some(i => (i.cantAdjudicados || 0) > 0)
  const faltantesVenta = [
    !data.rutCliente && 'cliente asociado',
    data.estado !== 'Adjudicada' && 'estado Adjudicada',
    !String(data.plazo || '').trim() && 'plazo',
    !String(data.ordenCompra || '').trim() && 'orden de compra',
    !hasAdjudicados && 'items adjudicados',
  ].filter(Boolean)

  const isRowEditing = row => editItemId === row.id
  const setField = (field, value) => setItemForm(f => ({ ...f, [field]: value }))

  const cols = [
    {
      key: 'fotoUrl',
      label: '',
      align: 'center',
      render: (_, row) => row.fotoUrl ? (
        <img src={row.fotoUrl} alt={row.nombre} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} />
      ) : (
        <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--bg-2)', border: '1px solid var(--border)' }} />
      )
    },
    { key: 'codigoInterno', label: 'Código', render: (v, row) => isRowEditing(row)
      ? <input value={itemForm.codigoInterno} onChange={e => setField('codigoInterno', e.target.value)} style={{ ...inputSm, width: 90 }} />
      : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{v || '—'}</span> },
    { key: 'nombre', label: 'Producto', wrap: true, render: (v, row) => isRowEditing(row)
      ? <input value={itemForm.nombre} onChange={e => setField('nombre', e.target.value)} style={{ ...inputSm, width: '100%' }} />
      : <span style={{ fontSize: 13 }}>{v || '—'}</span> },
    { key: 'descripcion', label: 'Descripción', wrap: true, render: (v, row) => isRowEditing(row)
      ? <input value={itemForm.descripcion} onChange={e => setField('descripcion', e.target.value)} style={{ ...inputSm, width: '100%' }} />
      : <span style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 280, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '—'}</span> },
    { key: 'cantidad', label: 'Cant.', align: 'right', render: (v, row) => isRowEditing(row)
      ? <input type="number" value={itemForm.cantidad} onChange={e => setField('cantidad', e.target.value)} style={{ ...inputSm, width: 64, textAlign: 'right' }} />
      : <span style={{ fontFamily: "'DM Mono', monospace" }}>{v}</span> },
    { key: 'cantAdjudicados', label: 'Adjud.', align: 'right', render: (v, row) => isRowEditing(row)
      ? <input type="number" value={itemForm.cantAdjudicados} onChange={e => setField('cantAdjudicados', e.target.value)} style={{ ...inputSm, width: 64, textAlign: 'right' }} />
      : <span style={{ fontFamily: "'DM Mono', monospace", color: v > 0 ? 'var(--green-700)' : 'var(--text-3)' }}>{v}</span> },
    { key: 'precio', label: 'P. unit. neto', align: 'right', render: (v, row) => isRowEditing(row)
      ? <input type="number" value={itemForm.precio} onChange={e => setField('precio', e.target.value)} style={{ ...inputSm, width: 90, textAlign: 'right' }} />
      : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(v)}</span> },
    { key: '_total', label: 'Total neto', align: 'right',
      render: (_, row) => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 12 }}>{fmt((row.cantidad||0) * (row.precio||0))}</span> },
    { key: '_acc', label: '', align: 'right',
      render: (_, row) => {
        if (isRowEditing(row)) return (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button onClick={saveItem} disabled={updateItemMut.isPending} style={btnSmPrim}>Guardar</button>
            <button onClick={() => setEditItemId(null)} style={btnTiny}>Cancelar</button>
          </div>
        )
        return (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button onClick={() => setHistorialItemId(row.id)} title="Ver historial de precio" style={btnTiny}><Icon name="history" size={12} /></button>
            {canWriteLicitaciones && <button onClick={() => startEditItem(row)} style={btnTiny}>Editar</button>}
            {canDeleteLicitaciones && <button onClick={() => deleteItem(row.id)} style={{ ...btnTiny, color: 'var(--red)' }}>×</button>}
          </div>
        )
      } },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title={`Licitación ${data.idLicitacion || `#${data.id}`}`}
        subtitle={data.referencia || 'Sin referencia'}
        breadcrumb={['Inicio', 'Ventas', 'Licitaciones', String(data.id)]}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {!editing && <>
              {/* Acciones primarias destacadas */}
              {canWriteLicitaciones && <Btn variant="primary" size="sm" icon="edit" onClick={() => { setForm(licitacionForm(data)); setEditing(true) }}>Editar</Btn>}
              {canWriteLicitaciones && canWriteVentas && hasAdjudicados && !data.orden && (
                <Btn variant="primary" size="sm" icon="plusCircle" onClick={crearVenta} disabled={crearVentaMut.isPending || faltantesVenta.length > 0}>
                  {crearVentaMut.isPending ? 'Creando…' : 'Crear Venta'}
                </Btn>
              )}
              {canWriteLicitaciones && canWriteVentas && data.orden && (
                <Btn variant="primary" size="sm" icon="refreshCw" onClick={actualizarVenta} disabled={actualizarVentaMut.isPending || faltantesVenta.length > 0}>
                  {actualizarVentaMut.isPending ? 'Actualizando…' : 'Actualizar venta'}
                </Btn>
              )}
              {/* Separador visual antes de acciones secundarias (Ficha, Imprimir, Eliminar) */}
              <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '0 2px' }} />
              <Btn variant="secondary" size="sm" icon="fileText" onClick={() => navigate(`/licitaciones/${data.id}/ficha`)}>Ficha Tec. y Eco.</Btn>
              <Btn variant="secondary" size="sm" icon="printer" onClick={imprimir}>Imprimir</Btn>
              {canDeleteLicitaciones && <Btn variant="secondary" size="sm" icon="trash" onClick={handleDelete} disabled={deleteMut.isPending}>Eliminar</Btn>}
            </>}
            {editing && <>
              <Btn variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={updateMut.isPending}>Cancelar</Btn>
              <Btn variant="primary" size="sm" onClick={handleSave} disabled={updateMut.isPending}>
                {updateMut.isPending ? 'Guardando…' : 'Guardar'}
              </Btn>
            </>}
            <Btn variant="secondary" size="sm" onClick={() => navigate('/licitaciones')}>← Volver</Btn>
          </div>
        }
      />

      {editing ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <FormField label="ID Licitación">
              <Input value={form.idLicitacion} onChange={v => setForm(f => ({ ...f, idLicitacion: v }))} />
            </FormField>
            <FormField label="Estado">
              <Select value={form.estado} onChange={v => setForm(f => ({ ...f, estado: v }))} options={ESTADOS} />
            </FormField>
            <FormField label="Fecha">
              <Input type="date" value={form.fecha} onChange={v => setForm(f => ({ ...f, fecha: v }))} />
            </FormField>
            <FormField label="Plazo de la licitación (días)">
              <Input
                type="number"
                min="0"
                max="3650"
                step="1"
                inputMode="numeric"
                value={form.plazo}
                onChange={v => setForm(f => ({ ...f, plazo: sanitizePlazoDias(v) }))}
                onKeyDown={e => ['e', 'E', '+', '-', '.', ','].includes(e.key) && e.preventDefault()}
                placeholder="Ej: 30"
              />
            </FormField>
            <FormField label="Fecha Límite Licitación">
              <Input type="date" value={form.fechaPlazo} onChange={v => setForm(f => ({ ...f, fechaPlazo: v }))} />
            </FormField>
            <FormField label="OC">
              <Input
                value={form.ordenCompra}
                onChange={v => setForm(f => ({ ...f, ordenCompra: sanitizeOrdenCompra(v, { live: true }) }))}
                maxLength={80}
                placeholder="Ej: OC-12345"
                title="Solo letras, números y guiones"
              />
            </FormField>
            <FormField label="RUT organismo">
              <Input value={form.rutCliente} onChange={v => setForm(f => ({ ...f, rutCliente: v }))} />
            </FormField>
            <FormField label="Referencia">
              <Input value={form.referencia} onChange={v => setForm(f => ({ ...f, referencia: v }))} />
            </FormField>
            <FormField label="Monto Despacho">
              <Input type="number" value={form.montoDespacho} onChange={v => setForm(f => ({ ...f, montoDespacho: Number(v) || 0 }))} />
            </FormField>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                <input type="checkbox" checked={form.enviosParciales} onChange={e => setForm(f => ({ ...f, enviosParciales: e.target.checked }))} />
                Permite envíos parciales
              </label>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <FormField label="Observaciones">
              <Textarea value={form.obs} onChange={v => setForm(f => ({ ...f, obs: v }))} rows={4} />
            </FormField>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 16, alignItems: 'start', marginBottom: 16 }} className="licitacion-two-col">
          {/* Columna izquierda: datos generales */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <InfoCard label="ID Licitación" value={data.idLicitacion || '—'} />
              <InfoCard label="Estado"><Badge tone={ESTADO_TONE[data.estado] || 'gray'}>{data.estado}</Badge></InfoCard>
              <InfoCard label="Fecha cotización" value={data.fecha ? new Date(data.fecha).toLocaleDateString('es-CL') : '—'} />
              <InfoCard label="Fecha límite" value={data.fechaPlazo ? new Date(data.fechaPlazo).toLocaleDateString('es-CL') : '—'} />
              <InfoCard label="Envíos Parciales" value={data.enviosParciales ? 'Permitido' : 'No permitido'} />
              <InfoCard label="Monto Despacho" value={fmt(data.montoDespacho)} />
              <InfoCard label="Plazo licitación" value={plazoLabel(data)} />
              <InfoCard label="OC" value={data.ordenCompra || '—'} />
              <InfoCard label="Vendedor" value={data.usuario || '—'} />
            </div>

            {data.cliente && (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Organismo / Cliente</div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{data.cliente.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace" }}>{data.cliente.rut}</span>
                  {data.cliente.email && <span> · {data.cliente.email}</span>}
                  {data.cliente.telefono && <span> · {data.cliente.telefono}</span>}
                </div>
              </div>
            )}
            {!data.cliente && data.rutCliente && (
              <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, fontSize: 13 }}>
                RUT cliente <span style={{ fontFamily: "'DM Mono', monospace" }}>{data.rutCliente}</span> no encontrado en clientes registrados.
              </div>
            )}

            {data.obs && (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Observaciones</div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-1)' }}>{data.obs}</div>
              </div>
            )}
          </div>

          {/* Columna derecha: productos cotizados */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Productos cotizados <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({items.length})</span></div>
              <div style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span><span style={{ color: 'var(--text-3)' }}>Subtotal:</span> <strong style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(subtotal)}</strong></span>
                <span><span style={{ color: 'var(--text-3)' }}>Adjudicado:</span> <strong style={{ fontFamily: "'DM Mono', monospace", color: 'var(--green-700)' }}>{fmt(totalAdjudicado)}</strong></span>
                {canWriteLicitaciones && <button type="button" onClick={adjudicarTodo} disabled={!items.length || updateItemMut.isPending} style={btnSm}>Adjudicar todo</button>}
              </div>
            </div>
            <Table
              columns={cols}
              rows={items}
              emptyMessage="Sin productos cotizados"
              keyboard={!editItemId}
              onRowDoubleClick={canWriteLicitaciones && !editItemId ? row => startEditItem(row) : undefined}
              ariaLabel="Productos cotizados"
              getRowKey={row => row.id}
            />
            {canWriteLicitaciones && <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Agregar item</div>
              <ProductoLookup onSelect={producto => setNewItem(f => ({
                ...f,
                codigoInterno: producto.codigoInterno || '',
                nombre: producto.nombre || '',
                descripcion: producto.descripcion || producto.texto2 || '',
                cantidad: f.cantidad || '1',
                precio: precioLicitacion(producto) || '',
              }))} />
              <button type="button" onClick={() => navigate('/bodega/nuevo')} style={{ ...btnSm, marginBottom: 8 }}>
                Crear producto externo en catalogo
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 80px 100px auto', gap: 6 }}>
                <input value={newItem.codigoInterno} onChange={e => setNewItem(f => ({ ...f, codigoInterno: e.target.value }))} placeholder="Código" style={inputSm} />
                <input value={newItem.nombre} onChange={e => setNewItem(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre producto" style={inputSm} />
                <input value={newItem.cantidad} onChange={e => setNewItem(f => ({ ...f, cantidad: e.target.value }))} type="number" placeholder="Cant" style={inputSm} />
                <input value={newItem.cantAdjudicados} onChange={e => setNewItem(f => ({ ...f, cantAdjudicados: e.target.value }))} type="number" placeholder="Adj" style={inputSm} />
                <input value={newItem.precio} onChange={e => setNewItem(f => ({ ...f, precio: e.target.value }))} type="number" placeholder="P. unit. neto" style={inputSm} />
                <button onClick={addItem} disabled={addItemMut.isPending} style={btnSmPrim}>+ Agregar</button>
              </div>
              <input value={newItem.descripcion} onChange={e => setNewItem(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción (opcional)" style={{ ...inputSm, marginTop: 6, width: '100%' }} />
            </div>}
          </div>
        </div>
      )}

      {data.orden && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cadena vinculada</div>
            {canReadVentas && <button onClick={() => navigate('/ventas/' + data.orden.id)} style={btnSm}>Ver orden →</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, fontSize: 13 }}>
            <div><span style={{ color: 'var(--text-3)' }}>Orden:</span> <strong>#{data.orden.nInterno || data.orden.id}</strong></div>
            <div><span style={{ color: 'var(--text-3)' }}>Total:</span> <strong style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(data.orden.total)}</strong></div>
            <div><span style={{ color: 'var(--text-3)' }}>Estado pago:</span> {data.orden.estadoPago || '—'}</div>
            <div><span style={{ color: 'var(--text-3)' }}>Estado entrega:</span> {data.orden.estadoEntrega || '—'}</div>
            <div><span style={{ color: 'var(--text-3)' }}>OT:</span> <strong>{(data.odts || []).length}</strong></div>
            <div><span style={{ color: 'var(--text-3)' }}>Despachos:</span> <strong>{(data.despachos || []).length}</strong></div>
            <div><span style={{ color: 'var(--text-3)' }}>Guías:</span> <strong>{(data.guias || []).length}</strong></div>
          </div>

          {(data.odts || []).length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>OT ({data.odts.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.odts.map(o => (
                  <button key={o.id} onClick={() => navigate('/taller/' + o.id + '/editar')} style={chip}>
                    #{o.nInterno || o.id} · {o.estado || '—'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(data.despachos || []).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>Despachos ({data.despachos.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.despachos.map(d => (
                  <span key={d.id} style={chip}>
                    {d.interno || '#' + d.id} {d.fechaEntrega ? '· ' + new Date(d.fechaEntrega).toLocaleDateString('es-CL') : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(data.guias || []).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>Guías ({data.guias.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.guias.map(g => (
                  <span key={g.id} style={chip}>
                    Guía {g.folio || '#' + g.id} {g.fechaGuia ? '· ' + new Date(g.fechaGuia).toLocaleDateString('es-CL') : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!data.orden && faltantesVenta.length > 0 && (
        <div style={{ background: '#fff8e6', border: '1px solid var(--amber)', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 13, color: 'var(--text-2)' }}>
          Para pasar a venta falta: <strong>{faltantesVenta.join(', ')}</strong>.
        </div>
      )}

      <LicitacionDescuentoPanel
        cotizacion={data}
        items={items}
        subtotal={subtotal}
        totalAdjudicado={totalAdjudicado}
        canRequest={canWriteLicitaciones}
      />

      {historialItemId && <ItemPrecioHistorialModal itemId={historialItemId} onClose={() => setHistorialItemId(null)} />}
    </main>
  )
}

function ItemPrecioHistorialModal({ itemId, onClose }) {
  const { data: history = [] } = useCotizacionItemHistorial(itemId)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 500, maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Historial de Precio del Ítem</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><Icon name="x" size={18} /></button>
        </div>
        {history.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Sin cambios registrados.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map(h => (
              <div key={h.id} style={{ padding: 10, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>{fmt(h.precioAnterior)} ➔ {fmt(h.precioNuevo)}</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{new Date(h.createdAt).toLocaleDateString('es-CL')}</span>
                </div>
                {h.usuarioNombre && <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{h.usuarioNombre}</div>}
                {h.motivo && <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>Motivo: {h.motivo}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const inputSm = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: '#fff' }
const btnTiny = { padding: '3px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }
const btnSm = { padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }
const btnSmPrim = { padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--green-600)', background: 'var(--green-600)', color: '#fff', cursor: 'pointer', fontWeight: 500 }
const chip = { padding: '4px 10px', fontSize: 12, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: "'DM Mono', monospace" }
const discountEmpty = { padding: 14, borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--bg)', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }
const discountNotice = { padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 10 }

function InfoCard({ label, value, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--border)', padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      {children ?? <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>}
    </div>
  )
}
