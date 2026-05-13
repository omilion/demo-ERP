import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, Textarea, useForm } from '../../components/forms/index'
import { Icon } from '../../components/shared'
import { useVenta, useCreateVenta, useUpdateVenta } from '../../api/ventas'
import { useClientes } from '../../api/clientes'
import { useProductos } from '../../api/productos'

const TIPOS = ['Normal', 'Licitación', 'Convenio Marco', 'Venta Web', 'Venta Sala']

function ProductoSearch({ onAdd }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const inputRef = useRef()

  const { data: result } = useProductos(q.length >= 2 ? { search: q } : {})
  const productos = result?.items ?? []

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(p) {
    onAdd(p)
    setQ('')
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}>
          <Icon name="search" size={14} />
        </span>
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => q.length >= 2 && setOpen(true)}
          placeholder="Buscar producto por código o nombre… (mínimo 2 caracteres)"
          style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
          onKeyDown={e => e.key === 'Escape' && setOpen(false)}
        />
      </div>
      {open && q.length >= 2 && productos.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', maxHeight: 260, overflowY: 'auto' }}>
          {productos.slice(0, 15).map(p => (
            <button key={p.id} onClick={() => select(p)}
              style={{ display: 'flex', width: '100%', padding: '9px 14px', gap: 10, textAlign: 'left', background: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--green-50)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: 'var(--text-3)', flexShrink: 0, paddingTop: 2, minWidth: 80 }}>{p.codigoInterno}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                  Stock: <strong style={{ color: p.stock > 0 ? 'var(--green-600)' : 'var(--red)' }}>{p.stock}</strong>
                  {p.precioLista > 0 && <span> · Lista: <strong>${p.precioLista.toLocaleString('es-CL')}</strong></span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && q.length >= 2 && productos.length === 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text-3)' }}>
          Sin resultados para "{q}"
        </div>
      )}
    </div>
  )
}

function ItemsTable({ items, onChange }) {
  function update(idx, field, value) {
    onChange(items.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }
  function remove(idx) { onChange(items.filter((_, i) => i !== idx)) }

  const subtotal = items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0), 0)

  if (items.length === 0) return (
    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 8 }}>
      Busca y agrega productos con el buscador de arriba
    </div>
  )

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {[['Producto', 'left', ''], ['Cant.', 'right', '80px'], ['P. Unit.', 'right', '130px'], ['Subtotal', 'right', '120px'], ['', 'center', '36px']].map(([h, align, w], i) => (
              <th key={i} style={{ padding: '8px ' + (i === 0 ? '12px' : '8px'), textAlign: align, fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4, width: w || 'auto' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const sub = (Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0)
            return (
              <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ fontWeight: 500 }}>{item.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>{item.codigoInterno}</div>
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input type="number" min="1" value={item.cantidad} onChange={e => update(idx, 'cantidad', e.target.value)}
                    style={{ width: '100%', padding: '5px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: 'right', background: '#fff' }} />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input type="number" min="0" value={item.precioUnitario} onChange={e => update(idx, 'precioUnitario', e.target.value)}
                    style={{ width: '100%', padding: '5px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: 'right', background: '#fff' }} />
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>
                  ${sub.toLocaleString('es-CL')}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  <button onClick={() => remove(idx)} style={{ padding: '4px', borderRadius: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
            <td colSpan={3} style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, textAlign: 'right', color: 'var(--text-2)' }}>Subtotal</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 14 }}>${subtotal.toLocaleString('es-CL')}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default function VentasFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const { data: found, isLoading } = useVenta(isEdit ? Number(id) : null)
  const { data: clientesResult } = useClientes()
  const clientesData = clientesResult?.items ?? []
  const createVenta = useCreateVenta()
  const updateVenta = useUpdateVenta()

  const { data, set, errors, validate } = useForm({
    clienteId: '', tipo: 'Normal', estado: 'Activa',
    estadoPago: 'No pagada', estadoEntrega: 'Pendiente entrega',
    abono: '', guias: '', facturado: '', descuentoPct: '', licitacion: '', observaciones: '',
  })

  const [items, setItems] = useState([])
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (found && !initialized) {
      set('clienteId', String(found.clienteId || ''))
      set('tipo', found.tipo || 'Normal')
      set('estado', found.estado || 'Activa')
      set('estadoPago', found.estadoPago || 'No pagada')
      set('estadoEntrega', found.estadoEntrega || 'Pendiente entrega')
      set('abono', found.abono != null ? String(found.abono) : '')
      set('guias', found.guias != null ? String(found.guias) : '')
      set('facturado', found.facturado != null ? String(found.facturado) : '')
      set('descuentoPct', found.descuentoPct != null ? String(found.descuentoPct) : '')
      set('licitacion', found.licitacion || '')
      set('observaciones', found.observaciones || '')
      if (found.items?.length) {
        setItems(found.items.map(i => ({
          productoId: i.productoId,
          nombre: i.producto?.nombre || `Producto #${i.productoId}`,
          codigoInterno: i.producto?.codigoInterno || '',
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario,
        })))
      }
      setInitialized(true)
    }
  }, [found?.id])

  const descuento = Number(data.descuentoPct) || 0
  const subtotal = items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0), 0)
  const totalCalculado = subtotal * (1 - descuento / 100)

  function addProducto(p) {
    setItems(prev => {
      const existing = prev.findIndex(i => i.productoId === p.id)
      if (existing >= 0) return prev.map((item, idx) => idx === existing ? { ...item, cantidad: Number(item.cantidad) + 1 } : item)
      return [...prev, { productoId: p.id, nombre: p.nombre, codigoInterno: p.codigoInterno || '', cantidad: 1, precioUnitario: p.precioLista || 0 }]
    })
  }

  const saving = createVenta.isPending || updateVenta.isPending

  function handleSave() {
    if (!isEdit && items.length === 0) { alert('Agrega al menos un producto a la venta'); return }
    const payload = {
      tipo: data.tipo, estado: data.estado,
      estadoPago: data.estadoPago, estadoEntrega: data.estadoEntrega,
      licitacion: data.licitacion || undefined,
      observaciones: data.observaciones || undefined,
    }
    if (data.clienteId) payload.clienteId = Number(data.clienteId)
    if (data.descuentoPct !== '') payload.descuentoPct = Number(data.descuentoPct)

    if (isEdit) {
      if (data.abono !== '') payload.abono = Number(data.abono)
      if (data.guias !== '') payload.guias = parseInt(data.guias, 10)
      if (data.facturado !== '') payload.facturado = Number(data.facturado)
      updateVenta.mutate({ id: Number(id), data: payload }, {
        onSuccess: () => navigate('/ventas'),
        onError: err => alert(err.response?.data?.error || 'Error al guardar'),
      })
    } else {
      createVenta.mutate({
        ...payload,
        items: items.map(i => ({ productoId: i.productoId, cantidad: Number(i.cantidad), precioUnitario: Number(i.precioUnitario) })),
      }, {
        onSuccess: () => navigate('/ventas'),
        onError: err => alert(err.response?.data?.error || 'Error al crear'),
      })
    }
  }

  const clienteOptions = [
    { value: '', label: '— Seleccionar cliente —' },
    ...clientesData.map(c => ({ value: String(c.id), label: `${c.nombre} (${c.rut})` })),
  ]

  if (isEdit && isLoading) return <main style={{ padding: 24 }}><p>Cargando…</p></main>

  return (
    <FormPage
      title={isEdit ? 'Editar Venta' : 'Nueva Venta'}
      subtitle={isEdit ? `Editando venta #${id}` : 'Crear nueva orden de venta'}
      breadcrumb={['Inicio', 'Ventas', isEdit ? 'Editar Venta' : 'Nueva Venta']}
      onSave={handleSave}
      saving={saving}
    >
      <FormDivider label="Cliente" />
      <FormField label="Cliente / Organismo">
        <Select value={data.clienteId} onChange={v => set('clienteId', v)} options={clienteOptions} />
      </FormField>
      {isEdit && found?.cliente && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -8, marginBottom: 4 }}>
          Actual: <strong style={{ color: 'var(--text-2)' }}>{found.cliente.nombre}</strong> · {found.cliente.rut}
        </div>
      )}

      <FormDivider label="Tipo y estado" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Tipo de Venta">
          <Select value={data.tipo} onChange={v => set('tipo', v)} options={TIPOS} />
        </FormField>
        <FormField label="Estado Pago">
          <Select value={data.estadoPago} onChange={v => set('estadoPago', v)} options={['No pagada', 'Pagada', 'Parcial']} />
        </FormField>
        <FormField label="Estado Entrega">
          <Select value={data.estadoEntrega} onChange={v => set('estadoEntrega', v)} options={['Pendiente entrega', 'Entregada', 'En despacho', 'Parcial']} />
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Estado de la orden">
          <Select value={data.estado} onChange={v => set('estado', v)} options={['Activa', 'Cerrada', 'Nula', 'Completada', 'En proceso']} />
        </FormField>
        <FormField label="ID Licitación / N° OC" hint="Ej: 61602954-LE15-1">
          <Input value={data.licitacion || ''} onChange={v => set('licitacion', v)} placeholder="Código de seguimiento" />
        </FormField>
      </div>

      <FormDivider label={isEdit ? `Productos (${items.length})` : 'Agregar productos'} />
      <ProductoSearch onAdd={addProducto} />
      <div style={{ marginTop: 12 }}>
        <ItemsTable items={items} onChange={setItems} />
      </div>
      {items.length > 0 && (
        <div style={{ marginTop: 10, background: 'var(--bg)', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: 24, alignItems: 'center' }}>
          {descuento > 0 && <>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Subtotal: <strong style={{ fontFamily: "'DM Mono',monospace" }}>${subtotal.toLocaleString('es-CL')}</strong></span>
            <span style={{ fontSize: 12, color: 'var(--green-600)' }}>Dto. ({descuento}%): <strong style={{ fontFamily: "'DM Mono',monospace" }}>−${(subtotal * descuento / 100).toLocaleString('es-CL')}</strong></span>
          </>}
          <span style={{ fontSize: 15, fontWeight: 700 }}>Total: <span style={{ fontFamily: "'DM Mono',monospace", color: 'var(--green-700)' }}>${totalCalculado.toLocaleString('es-CL')}</span></span>
        </div>
      )}

      <FormDivider label="Seguimiento financiero" />
      <div style={{ display: 'grid', gridTemplateColumns: isEdit ? '1fr 1fr 1fr 1fr' : '1fr', gap: 14 }}>
        <FormField label="Descuento %" hint="Porcentaje global sobre subtotal">
          <Input value={data.descuentoPct} onChange={v => set('descuentoPct', v)} type="number" placeholder="0" />
        </FormField>
        {isEdit && <>
          <FormField label="Abono recibido">
            <Input value={data.abono} onChange={v => set('abono', v)} type="number" prefix="$" placeholder="0" />
          </FormField>
          <FormField label="Monto facturado">
            <Input value={data.facturado} onChange={v => set('facturado', v)} type="number" prefix="$" placeholder="0" />
          </FormField>
          <FormField label="N° Guía despacho">
            <Input value={data.guias} onChange={v => set('guias', v)} type="number" placeholder="—" />
          </FormField>
        </>}
      </div>

      <FormDivider label="Observaciones" />
      <FormField label="Notas internas">
        <Textarea value={data.observaciones || ''} onChange={v => set('observaciones', v)} placeholder="Instrucciones especiales, condiciones de entrega, etc." rows={3} />
      </FormField>
    </FormPage>
  )
}
