import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, Textarea, useForm } from '../../components/forms/index'
import { Icon } from '../../components/shared'
import { useVenta, useCreateVenta, useUpdateVenta, useAnularVenta, useActivarVenta, useVentaCargos, useAddCargo, useDeleteCargo, useUpdateItemEntregados } from '../../api/ventas'
import { useAuthStore } from '../../store/auth'
import { useClientes, useClienteSucursales } from '../../api/clientes'
import { useProductos } from '../../api/productos'
import { useMultas, useCreateMulta, useDeleteMulta } from '../../api/multas'
import { can } from '../../utils/permissions'

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
              style={{ display: 'flex', width: '100%', padding: '9px 14px', gap: 10, textAlign: 'left', background: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', borderLeft: 'none', borderRight: 'none', borderTop: 'none', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--green-50)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {p.fotoUrl
                ? <img src={p.fotoUrl} alt="" loading="lazy" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }} onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
                : <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--border)', flexShrink: 0 }} />}
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

function requiredNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return NaN
  return Number(value)
}

function normalizeItems(items) {
  return items.map(i => ({
    productoId: requiredNumber(i.productoId),
    cantidad: requiredNumber(i.cantidad),
    precioUnitario: requiredNumber(i.precioUnitario),
  }))
}

function validateItems(items) {
  if (items.length === 0) return 'Agrega al menos un producto a la venta'

  const normalized = normalizeItems(items)
  const invalidIndex = normalized.findIndex(i =>
    !Number.isInteger(i.productoId) || i.productoId <= 0 ||
    !Number.isInteger(i.cantidad) || i.cantidad <= 0 ||
    !Number.isFinite(i.precioUnitario) || i.precioUnitario < 0
  )

  if (invalidIndex >= 0) return `Revisa producto, cantidad y precio del item ${invalidIndex + 1}`

  return null
}

function CargosSection({ ordenId }) {
  const { data: cargos = [], isLoading } = useVentaCargos(ordenId)
  const addCargo = useAddCargo()
  const delCargo = useDeleteCargo()
  const [draft, setDraft] = useState({ nombre: '', valor: '' })
  const fmt = n => '$' + (n || 0).toLocaleString('es-CL')
  const total = cargos.reduce((s, c) => s + (c.valor || 0), 0)

  function add() {
    if (!draft.nombre || !draft.valor) { alert('Nombre y valor requeridos'); return }
    addCargo.mutate({ ordenId, nombre: draft.nombre, valor: Number(draft.valor) }, {
      onSuccess: () => setDraft({ nombre: '', valor: '' }),
      onError: e => alert(e.response?.data?.error || 'Error'),
    })
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg)', padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Cargos transporte ({cargos.length})</span>
        <span style={{ fontSize: 13, fontFamily: "'DM Mono',monospace" }}>Total: {fmt(total)}</span>
      </div>
      {isLoading
        ? <div style={{ padding: 14, fontSize: 12, color: 'var(--text-3)' }}>Cargando…</div>
        : cargos.length === 0
          ? <div style={{ padding: 14, fontSize: 12, color: 'var(--text-3)' }}>Sin cargos</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {cargos.map(c => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 12px' }}>{c.nombre}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(c.valor)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'center', width: 36 }}>
                      <button onClick={() => delCargo.mutate({ ordenId, cargoId: c.id })} style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                        <Icon name="trash" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      <div style={{ background: '#fafafa', borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
        <input placeholder="Nombre cargo (ej. Despacho Santiago)" value={draft.nombre} onChange={e => setDraft({ ...draft, nombre: e.target.value })}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12 }} />
        <input type="number" placeholder="Valor" value={draft.valor} onChange={e => setDraft({ ...draft, valor: e.target.value })}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: 'right' }} />
        <button onClick={add} disabled={addCargo.isPending}
          style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid var(--green-700)', background: 'var(--green-700)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
          {addCargo.isPending ? '...' : 'Agregar'}
        </button>
      </div>
    </div>
  )
}

function EntregaSection({ items }) {
  const updateEnt = useUpdateItemEntregados()
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {['Producto', 'Cant.', 'Entregados', 'Pendiente', ''].map((h, i) => (
              <th key={i} style={{ padding: '7px 12px', textAlign: i >= 1 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(it => {
            const cant = it.cantidad
            const ent = it.nEntregados ?? 0
            const pend = cant - ent
            return (
              <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 12px' }}>{it.nombre || it.producto?.nombre || `#${it.productoId}`}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace" }}>{cant}</td>
                <td style={{ padding: '4px 12px', textAlign: 'right' }}>
                  <input type="number" min={0} max={cant} defaultValue={ent}
                    onBlur={e => {
                      const n = parseInt(e.target.value || '0', 10)
                      if (n !== ent) updateEnt.mutate({ itemId: it.id, nEntregados: n }, {
                        onError: er => alert(er.response?.data?.error || 'Error'),
                      })
                    }}
                    style={{ width: 70, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: 'right' }} />
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: pend > 0 ? 'var(--amber)' : 'var(--green-600)', fontWeight: 600 }}>{pend}</td>
                <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                  {ent === cant
                    ? <Icon name="check" size={14} color="var(--green-600)" />
                    : ent === 0
                      ? <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
                      : <span style={{ color: 'var(--amber)', fontSize: 11, fontWeight: 600 }}>parcial</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MultasSection({ ordenId }) {
  const { data = { items: [], total: 0 }, isLoading } = useMultas({ ordenId })
  const createM = useCreateMulta()
  const deleteM = useDeleteMulta()
  const [draft, setDraft] = useState({ monto: '', nDocumento: '', numero: '', fecha: '', interno: '' })

  const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

  function add() {
    if (!draft.monto) { alert('Monto requerido'); return }
    createM.mutate({
      ordenId,
      monto: Number(draft.monto),
      nDocumento: draft.nDocumento || undefined,
      numero: draft.numero || undefined,
      fecha: draft.fecha || undefined,
      interno: draft.interno || undefined,
    }, {
      onSuccess: () => setDraft({ monto: '', nDocumento: '', numero: '', fecha: '', interno: '' }),
      onError: e => alert(e.response?.data?.error || 'Error'),
    })
  }

  function remove(id) {
    if (!confirm('¿Eliminar esta multa?')) return
    deleteM.mutate(id, { onError: e => alert(e.response?.data?.error || 'Error') })
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg)', padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Multas aplicadas ({data.items.length})</span>
        <span style={{ fontSize: 13, fontFamily: "'DM Mono',monospace", color: 'var(--red)' }}>Total: {fmt(data.total)}</span>
      </div>

      {isLoading
        ? <div style={{ padding: 16, fontSize: 12, color: 'var(--text-3)' }}>Cargando…</div>
        : data.items.length === 0
          ? <div style={{ padding: 16, fontSize: 12, color: 'var(--text-3)' }}>Sin multas registradas</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {['Fecha', 'N° Doc', 'N° Multa', 'Interno', 'Monto', ''].map((h, i) => (
                    <th key={i} style={{ padding: '6px 10px', textAlign: i === 4 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map(m => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px', fontFamily: "'DM Mono',monospace" }}>{m.fecha ? new Date(m.fecha).toLocaleDateString('es-CL') : '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{m.nDocumento || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{m.numero || '—'}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-3)' }}>{m.interno || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600, color: 'var(--red)' }}>{fmt(m.monto)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <button onClick={() => remove(m.id)} disabled={deleteM.isPending} style={{ padding: 4, borderRadius: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                        <Icon name="trash" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

      <div style={{ background: '#fafafa', borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'grid', gridTemplateColumns: '110px 1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
        <input type="date" value={draft.fecha} onChange={e => setDraft({ ...draft, fecha: e.target.value })}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit' }} />
        <input placeholder="N° documento" value={draft.nDocumento} onChange={e => setDraft({ ...draft, nDocumento: e.target.value })}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit' }} />
        <input placeholder="N° multa" value={draft.numero} onChange={e => setDraft({ ...draft, numero: e.target.value })}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit' }} />
        <input placeholder="Interno" value={draft.interno} onChange={e => setDraft({ ...draft, interno: e.target.value })}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit' }} />
        <input type="number" placeholder="Monto" value={draft.monto} onChange={e => setDraft({ ...draft, monto: e.target.value })}
          style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: 'right' }} />
        <button onClick={add} disabled={createM.isPending}
          style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid var(--green-700)', background: 'var(--green-700)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
          {createM.isPending ? '...' : 'Agregar'}
        </button>
      </div>
    </div>
  )
}

export default function VentasFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const user = useAuthStore(s => s.user)
  const canDeleteVentas = can(user, 'ventas', 'delete')
  const canWriteTaller = can(user, 'taller', 'write')

  const { data: found, isLoading } = useVenta(isEdit ? Number(id) : null)
  const { data: clientesResult } = useClientes()
  const clientesData = clientesResult?.items ?? []
  const createVenta = useCreateVenta()
  const updateVenta = useUpdateVenta()
  const anularVenta = useAnularVenta()
  const activarVenta = useActivarVenta()

  function handleAnular() {
    if (!confirm(`¿Anular venta #${id}? Quedará marcada como Nula y eliminada.`)) return
    anularVenta.mutate(Number(id), { onSuccess: () => navigate('/ventas'), onError: e => alert(e.response?.data?.error || 'Error') })
  }
  function handleActivar() {
    activarVenta.mutate(Number(id), { onError: e => alert(e.response?.data?.error || 'Error') })
  }
  function handleImprimir() {
    const w = window.open(`${window.location.origin}/ventas/${id}/imprimir`, '_blank')
    if (!w) alert('Habilita popups para imprimir')
  }
  function handlePasarTaller() {
    navigate(`/taller/nueva?ordenId=${id}`)
  }

  const { data, set } = useForm({
    clienteId: '', clienteSucursalId: '', tipo: 'Normal', estado: 'Activa',
    estadoPago: 'No pagada', estadoEntrega: 'Pendiente entrega',
    abono: '', guias: '', facturado: '', descuentoPct: '', licitacion: '', observaciones: '',
  })
  const selectedClienteId = data.clienteId ? Number(data.clienteId) : null
  const { data: sucursalesCliente = [] } = useClienteSucursales(selectedClienteId)

  const [items, setItems] = useState([])
  const [initializedId, setInitializedId] = useState(null)

  useEffect(() => {
    if (found && initializedId !== found.id) {
      set('clienteId', String(found.clienteId || ''))
      set('clienteSucursalId', String(found.clienteSucursalId || ''))
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
      const initialItems = found.items?.length
        ? found.items.map(i => ({
          productoId: i.productoId,
          nombre: i.nombre || i.producto?.nombre || i.descripcion || `Producto #${i.productoId}`,
          codigoInterno: i.codigoInterno || i.producto?.codigoInterno || i.codigo || '',
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario ?? i.precio ?? 0,
        }))
        : []
      const timer = setTimeout(() => {
        setItems(initialItems)
        setInitializedId(found.id)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [found, initializedId, set])

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
    const itemError = validateItems(items)
    if (itemError) { alert(itemError); return }

    const normalizedItems = normalizeItems(items)
    const payload = {
      tipo: data.tipo, estado: data.estado,
      estadoPago: data.estadoPago, estadoEntrega: data.estadoEntrega,
      licitacion: data.licitacion || undefined,
      observaciones: data.observaciones || undefined,
    }
    if (data.clienteId) payload.clienteId = Number(data.clienteId)
    payload.clienteSucursalId = data.clienteSucursalId ? Number(data.clienteSucursalId) : null
    if (data.descuentoPct !== '') payload.descuentoPct = Number(data.descuentoPct)

    if (isEdit) {
      if (data.abono !== '') payload.abono = Number(data.abono)
      if (data.guias !== '') payload.guias = parseInt(data.guias, 10)
      if (data.facturado !== '') payload.facturado = Number(data.facturado)
      payload.items = normalizedItems
      updateVenta.mutate({ id: Number(id), data: payload }, {
        onSuccess: () => navigate('/ventas'),
        onError: err => alert(err.response?.data?.error || 'Error al guardar'),
      })
    } else {
      createVenta.mutate({
        ...payload,
        items: normalizedItems,
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

  const sucursalOptions = [
    { value: '', label: sucursalesCliente.length ? 'Sin sucursal especifica' : 'Sin sucursales registradas' },
    ...sucursalesCliente.map(s => ({ value: String(s.id), label: `${s.nombre}${s.comuna ? ` - ${s.comuna}` : ''}` })),
  ]
  const selectedSucursal = sucursalesCliente.find(s => String(s.id) === data.clienteSucursalId)

  if (isEdit && isLoading) return <main style={{ padding: 24 }}><p>Cargando...</p></main>

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
        <Select value={data.clienteId} onChange={v => { set('clienteId', v); set('clienteSucursalId', '') }} options={clienteOptions} />
      </FormField>
      <FormField label="Sucursal / Direccion de entrega">
        <Select value={data.clienteSucursalId} onChange={v => set('clienteSucursalId', v)} options={sucursalOptions} disabled={!selectedClienteId || !sucursalesCliente.length} />
      </FormField>
      {isEdit && found?.cliente && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -8, marginBottom: 4 }}>
          Actual: <strong style={{ color: 'var(--text-2)' }}>{found.cliente.nombre}</strong> · {found.cliente.rut}
        </div>
      )}
      {selectedSucursal && (
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: -8, marginBottom: 4, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)' }}>
          {selectedSucursal.direccion || 'Sin direccion'} {selectedSucursal.comuna ? `- ${selectedSucursal.comuna}` : ''} {selectedSucursal.contacto ? `- Contacto: ${selectedSucursal.contacto}` : ''}
        </div>
      )}
      {isEdit && found?.cotizaciones?.length > 0 && (
        <div style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', background: 'var(--bg)', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Cotizacion / licitacion vinculada</div>
          {found.cotizaciones.map(c => (
            <button key={c.id} type="button" onClick={() => navigate(`/licitaciones/${c.id}`)} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', padding: '9px 10px', background: '#fff', borderTop: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', fontSize: 12 }}>
              <span><strong>{c.idLicitacion || `#${c.id}`}</strong> {c.referencia || c.ordenCompra || ''}</span>
              <span style={{ color: 'var(--green-700)', fontWeight: 600 }}>Ver</span>
            </button>
          ))}
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

      {isEdit && (
        <>
          <FormDivider label="Acciones" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={handleImprimir} style={actionBtn('var(--green-700)')}>
              <Icon name="printer" size={13} /> Imprimir nota
            </button>
            {canWriteTaller && (
              <button onClick={handlePasarTaller} style={actionBtn('var(--blue)')}>
                <Icon name="tool" size={13} /> Pasar a taller
              </button>
            )}
            {canDeleteVentas && found?.estado !== 'Nula' && (
              <button onClick={handleAnular} disabled={anularVenta.isPending} style={actionBtn('var(--red)')}>
                <Icon name="x" size={13} /> Anular
              </button>
            )}
            {canDeleteVentas && found?.estado === 'Nula' && (
              <button onClick={handleActivar} disabled={activarVenta.isPending} style={actionBtn('var(--green-700)')}>
                <Icon name="check" size={13} /> Reactivar
              </button>
            )}
          </div>
        </>
      )}

      {isEdit && found?.items?.length > 0 && (
        <>
          <FormDivider label="Entrega de productos" />
          <EntregaSection items={found.items} />
        </>
      )}

      {isEdit && (
        <>
          <FormDivider label="Cargos transporte" />
          <CargosSection ordenId={Number(id)} />
        </>
      )}

      {isEdit && data.tipo === 'Licitación' && (
        <>
          <FormDivider label="Multas" />
          <MultasSection ordenId={Number(id)} />
        </>
      )}

      <FormDivider label="Observaciones" />
      <FormField label="Notas internas">
        <Textarea value={data.observaciones || ''} onChange={v => set('observaciones', v)} placeholder="Instrucciones especiales, condiciones de entrega, etc." rows={3} />
      </FormField>
    </FormPage>
  )
}

const actionBtn = (color) => ({
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '7px 14px', fontSize: 12, fontWeight: 500,
  borderRadius: 6, border: `1px solid ${color}`,
  background: '#fff', color, cursor: 'pointer',
})
