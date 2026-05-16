import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge, PageHeader, Btn, Table } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import {
  useCotizacion, useUpdateCotizacion, useDeleteCotizacion,
  useAddCotizacionItem, useUpdateCotizacionItem, useDeleteCotizacionItem,
  useCrearVentaDesdeLicitacion,
} from '../../api/cotizaciones'

const ESTADO_TONE = {
  'Pendiente':  'amber', 'Adjudicada': 'green', 'Cerrada': 'neutral',
  'Rechazada':  'red',   'En proceso': 'blue',
}
const ESTADOS = ['Pendiente', 'En proceso', 'Adjudicada', 'Rechazada', 'Cerrada']

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

export default function LicitacionDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useCotizacion(id)
  const updateMut = useUpdateCotizacion()
  const deleteMut = useDeleteCotizacion()
  const addItemMut = useAddCotizacionItem()
  const updateItemMut = useUpdateCotizacionItem()
  const deleteItemMut = useDeleteCotizacionItem()
  const crearVentaMut = useCrearVentaDesdeLicitacion()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [editItemId, setEditItemId] = useState(null)
  const [itemForm, setItemForm] = useState({})
  const [newItem, setNewItem] = useState({ codigoInterno: '', nombre: '', descripcion: '', cantidad: '', cantAdjudicados: '', precio: '' })

  useEffect(() => {
    if (data) setForm({
      estado: data.estado || 'Pendiente',
      obs: data.obs || '',
      plazo: data.plazo || '',
      ordenCompra: data.ordenCompra || '',
      referencia: data.referencia || '',
      fecha: data.fecha ? data.fecha.slice(0, 10) : '',
    })
  }, [data])

  if (isLoading) return <main style={{ padding: 24 }}>Cargando…</main>
  if (!data) return <main style={{ padding: 24 }}>No encontrada</main>

  const items = data.items ?? []
  const subtotal = items.reduce((s, i) => s + (i.cantidad || 0) * (i.precio || 0), 0)
  const totalAdjudicado = items.reduce((s, i) => s + (i.cantAdjudicados || 0) * (i.precio || 0), 0)

  const handleSave = () => {
    updateMut.mutate({ id: data.id, data: form }, { onSuccess: () => setEditing(false) })
  }

  const handleDelete = () => {
    if (!confirm('¿Eliminar licitación? Esta acción no se puede deshacer.')) return
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
  const deleteItem = (itemId) => {
    if (!confirm('¿Eliminar item?')) return
    deleteItemMut.mutate({ id: data.id, itemId })
  }
  const addItem = () => {
    if (!newItem.nombre && !newItem.codigoInterno) { alert('Código o nombre requerido'); return }
    addItemMut.mutate({ id: data.id, data: newItem }, {
      onSuccess: () => setNewItem({ codigoInterno: '', nombre: '', descripcion: '', cantidad: '', cantAdjudicados: '', precio: '' }),
    })
  }
  const crearVenta = () => {
    if (!confirm('¿Crear venta desde esta licitación? Se generará una orden con los items adjudicados.')) return
    crearVentaMut.mutate(data.id, {
      onSuccess: (res) => {
        const msg = res.faltantes?.length
          ? `Venta creada (#${res.orden.id}). Faltantes en catálogo: ${res.faltantes.join(', ')}`
          : `Venta creada (#${res.orden.id})`
        alert(msg)
        navigate('/ventas/' + res.orden.id)
      },
      onError: (err) => alert(err?.response?.data?.error || 'Error al crear venta'),
    })
  }
  const imprimir = () => window.print()

  const hasAdjudicados = items.some(i => (i.cantAdjudicados || 0) > 0)

  const cols = [
    { key: 'codigoInterno', label: 'Código', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{v || '—'}</span> },
    { key: 'nombre', label: 'Producto', wrap: true, render: v => <span style={{ fontSize: 13 }}>{v || '—'}</span> },
    { key: 'descripcion', label: 'Descripción', wrap: true,
      render: v => <span style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 280, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '—'}</span> },
    { key: 'cantidad', label: 'Cant.', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace" }}>{v}</span> },
    { key: 'cantAdjudicados', label: 'Adjud.', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", color: v > 0 ? 'var(--green-700)' : 'var(--text-3)' }}>{v}</span> },
    { key: 'precio', label: 'Precio', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(v)}</span> },
    { key: '_total', label: 'Total', align: 'right',
      render: (_, row) => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 12 }}>{fmt((row.cantidad||0) * (row.precio||0))}</span> },
    { key: '_acc', label: '', align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <button onClick={() => startEditItem(row)} style={btnTiny}>Editar</button>
          <button onClick={() => deleteItem(row.id)} style={{ ...btnTiny, color: 'var(--red)' }}>×</button>
        </div>
      ) },
  ]

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title={`Licitación ${data.idLicitacion || `#${data.id}`}`}
        subtitle={data.referencia || 'Sin referencia'}
        breadcrumb={['Inicio', 'Ventas', 'Licitaciones', String(data.id)]}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!editing && <>
              <Btn variant="primary" size="sm" onClick={() => setEditing(true)}>Editar</Btn>
              {hasAdjudicados && (
                <Btn variant="secondary" size="sm" onClick={crearVenta} disabled={crearVentaMut.isPending}>
                  {crearVentaMut.isPending ? 'Creando…' : '→ Crear Venta'}
                </Btn>
              )}
              <Btn variant="secondary" size="sm" onClick={imprimir}>Imprimir</Btn>
              <Btn variant="secondary" size="sm" onClick={handleDelete} disabled={deleteMut.isPending}>Eliminar</Btn>
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
            <FormField label="Estado">
              <Select value={form.estado} onChange={v => setForm(f => ({ ...f, estado: v }))} options={ESTADOS} />
            </FormField>
            <FormField label="Fecha">
              <Input type="date" value={form.fecha} onChange={v => setForm(f => ({ ...f, fecha: v }))} />
            </FormField>
            <FormField label="Plazo">
              <Input value={form.plazo} onChange={v => setForm(f => ({ ...f, plazo: v }))} />
            </FormField>
            <FormField label="OC">
              <Input value={form.ordenCompra} onChange={v => setForm(f => ({ ...f, ordenCompra: v }))} />
            </FormField>
            <FormField label="Referencia">
              <Input value={form.referencia} onChange={v => setForm(f => ({ ...f, referencia: v }))} />
            </FormField>
          </div>
          <div style={{ marginTop: 12 }}>
            <FormField label="Observaciones">
              <Textarea value={form.obs} onChange={v => setForm(f => ({ ...f, obs: v }))} rows={4} />
            </FormField>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <InfoCard label="Estado"><Badge tone={ESTADO_TONE[data.estado] || 'gray'}>{data.estado}</Badge></InfoCard>
            <InfoCard label="Fecha cotización" value={data.fecha ? new Date(data.fecha).toLocaleDateString('es-CL') : '—'} />
            <InfoCard label="Fecha creación" value={data.fechaCreacion ? new Date(data.fechaCreacion).toLocaleDateString('es-CL') : '—'} />
            <InfoCard label="Plazo" value={data.plazo || '—'} />
            <InfoCard label="Vendedor" value={data.usuario || '—'} />
            <InfoCard label="OC" value={data.ordenCompra || '—'} />
          </div>

          {data.cliente && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
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
            <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 13 }}>
              RUT cliente <span style={{ fontFamily: "'DM Mono', monospace" }}>{data.rutCliente}</span> no encontrado en clientes registrados.
            </div>
          )}

          {data.obs && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Observaciones</div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-1)' }}>{data.obs}</div>
            </div>
          )}
        </>
      )}

      {data.orden && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cadena vinculada</div>
            <button onClick={() => navigate('/ventas/' + data.orden.id + '/editar')} style={btnSm}>Ver orden →</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, fontSize: 13 }}>
            <div><span style={{ color: 'var(--text-3)' }}>Orden:</span> <strong>#{data.orden.nInterno || data.orden.id}</strong></div>
            <div><span style={{ color: 'var(--text-3)' }}>Total:</span> <strong style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(data.orden.total)}</strong></div>
            <div><span style={{ color: 'var(--text-3)' }}>Estado pago:</span> {data.orden.estadoPago || '—'}</div>
            <div><span style={{ color: 'var(--text-3)' }}>Estado entrega:</span> {data.orden.estadoEntrega || '—'}</div>
            <div><span style={{ color: 'var(--text-3)' }}>ODTs:</span> <strong>{(data.odts || []).length}</strong></div>
            <div><span style={{ color: 'var(--text-3)' }}>Despachos:</span> <strong>{(data.despachos || []).length}</strong></div>
            <div><span style={{ color: 'var(--text-3)' }}>Guías:</span> <strong>{(data.guias || []).length}</strong></div>
          </div>

          {(data.odts || []).length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>ODTs ({data.odts.length})</div>
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

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Productos cotizados <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({items.length})</span></div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span><span style={{ color: 'var(--text-3)' }}>Subtotal cotizado:</span> <strong style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(subtotal)}</strong></span>
            <span><span style={{ color: 'var(--text-3)' }}>Adjudicado:</span> <strong style={{ fontFamily: "'DM Mono', monospace", color: 'var(--green-700)' }}>{fmt(totalAdjudicado)}</strong></span>
          </div>
        </div>
        <Table columns={cols} rows={items} emptyMessage="Sin productos cotizados" />

        {editItemId && (
          <div style={{ padding: 12, borderTop: '1px solid var(--border)', background: 'var(--bg-2)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Editar item</div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 80px 100px auto', gap: 6 }}>
              <input value={itemForm.codigoInterno} onChange={e => setItemForm(f => ({ ...f, codigoInterno: e.target.value }))} placeholder="Código" style={inputSm} />
              <input value={itemForm.nombre} onChange={e => setItemForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre" style={inputSm} />
              <input value={itemForm.cantidad} onChange={e => setItemForm(f => ({ ...f, cantidad: e.target.value }))} type="number" placeholder="Cant" style={inputSm} />
              <input value={itemForm.cantAdjudicados} onChange={e => setItemForm(f => ({ ...f, cantAdjudicados: e.target.value }))} type="number" placeholder="Adj" style={inputSm} />
              <input value={itemForm.precio} onChange={e => setItemForm(f => ({ ...f, precio: e.target.value }))} type="number" placeholder="Precio" style={inputSm} />
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={saveItem} disabled={updateItemMut.isPending} style={btnSmPrim}>Guardar</button>
                <button onClick={() => setEditItemId(null)} style={btnSm}>Cancelar</button>
              </div>
            </div>
            <input value={itemForm.descripcion} onChange={e => setItemForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción" style={{ ...inputSm, marginTop: 6, width: '100%' }} />
          </div>
        )}

        <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Agregar item</div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 80px 100px auto', gap: 6 }}>
            <input value={newItem.codigoInterno} onChange={e => setNewItem(f => ({ ...f, codigoInterno: e.target.value }))} placeholder="Código" style={inputSm} />
            <input value={newItem.nombre} onChange={e => setNewItem(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre producto" style={inputSm} />
            <input value={newItem.cantidad} onChange={e => setNewItem(f => ({ ...f, cantidad: e.target.value }))} type="number" placeholder="Cant" style={inputSm} />
            <input value={newItem.cantAdjudicados} onChange={e => setNewItem(f => ({ ...f, cantAdjudicados: e.target.value }))} type="number" placeholder="Adj" style={inputSm} />
            <input value={newItem.precio} onChange={e => setNewItem(f => ({ ...f, precio: e.target.value }))} type="number" placeholder="Precio" style={inputSm} />
            <button onClick={addItem} disabled={addItemMut.isPending} style={btnSmPrim}>+ Agregar</button>
          </div>
          <input value={newItem.descripcion} onChange={e => setNewItem(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción (opcional)" style={{ ...inputSm, marginTop: 6, width: '100%' }} />
        </div>
      </div>
    </main>
  )
}

const inputSm = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: '#fff' }
const btnTiny = { padding: '3px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }
const btnSm = { padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }
const btnSmPrim = { padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--green-600)', background: 'var(--green-600)', color: '#fff', cursor: 'pointer', fontWeight: 500 }
const chip = { padding: '4px 10px', fontSize: 12, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: "'DM Mono', monospace" }

function InfoCard({ label, value, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--border)', padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      {children ?? <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>}
    </div>
  )
}
