import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { useState, useEffect, useRef, useMemo } from 'react'
import { DndContext, DragOverlay, PointerSensor, pointerWithin, rectIntersection, useSensor, useSensors } from '@dnd-kit/core'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Icon } from '../../components/shared'
import { useCrm, useCrmEjecutivas, useCrmPatch, useCrmOrdenLink, useCrmConvertirCliente, useCrmPendientesHoy, useCrmMetricas } from '../../api/crm'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth'

const ESTADOS = [
  { id: '0', label: 'Pendiente',  tone: 'amber', color: '#f59e0b', bg: '#fffbeb' },
  { id: '1', label: 'En Gestion', tone: 'blue',  color: '#3b82f6', bg: '#eff6ff' },
  { id: '2', label: 'En Espera',  tone: 'gray',  color: '#6b7280', bg: '#f9fafb' },
  { id: '3', label: 'Cerrado',    tone: 'green', color: '#16a34a', bg: '#f0fdf4' },
]

function prioridadTone(p) {
  if (!p) return 'gray'
  const l = p.toLowerCase()
  if (l === 'alta') return 'red'
  if (l === 'media') return 'amber'
  return 'gray'
}

function normalizeEstado(value) {
  if (value === null || value === undefined || value === '') return '0'
  const estado = String(value)
  return ESTADOS.some(e => e.id === estado) ? estado : '0'
}

function Field({ label, children, full }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: full ? '1 / -1' : 'auto' }}>
      <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  )
}

function ViewToggle({ view, setView }) {
  return (
    <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
      {[['pipeline', 'Pipeline'], ['table', 'Tabla']].map(([v, label]) => (
        <button key={v} onClick={() => setView(v)} style={{
          padding: '5px 12px', fontSize: 12, fontWeight: view === v ? 700 : 400,
          background: view === v ? 'var(--green-700)' : 'transparent',
          color: view === v ? '#fff' : 'var(--text-2)',
          cursor: 'pointer', border: 'none',
          borderRight: v === 'pipeline' ? '1px solid var(--border)' : 'none',
        }}>{label}</button>
      ))}
    </div>
  )
}

// ── Drag card ─────────────────────────────────────────────────────────────────
function CrmCard({ item, isDragging }) {
  const fechaF = item.fecha ? new Date(item.fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : null
  const proximo = item.fechaProximo ? new Date(item.fechaProximo).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : null
  const vencido = item.fechaProximo && new Date(item.fechaProximo) < new Date()

  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      border: '1px solid var(--border)',
      padding: '10px 12px',
      boxShadow: isDragging ? '0 8px 24px oklch(0 0 0/0.18)' : '0 1px 3px oklch(0 0 0/0.07)',
      cursor: isDragging ? 'grabbing' : 'grab',
      opacity: isDragging ? 0.92 : 1,
      transition: 'box-shadow 0.15s',
      userSelect: 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.3, flex: 1 }}>
          {item.nombre || item.rsocial || '—'}
        </div>
        {item.prioridad && (
          <Badge tone={prioridadTone(item.prioridad)} style={{ flexShrink: 0, fontSize: 10 }}>{item.prioridad}</Badge>
        )}
      </div>

      {item.rsocial && item.rsocial !== item.nombre && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{item.rsocial}</div>
      )}

      {item.ncotizacion && (
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--green-700)', fontWeight: 600, marginBottom: 5 }}>
          #{item.ncotizacion}
        </div>
      )}

      {item.accion && (
        <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 5, lineHeight: 1.4, borderLeft: '2px solid var(--border)', paddingLeft: 6 }}>
          {item.accion.length > 80 ? item.accion.slice(0, 80) + '…' : item.accion}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>
          {item.ejecutiva || '—'}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {fechaF && <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{fechaF}</span>}
          {proximo && (
            <span style={{
              fontSize: 10, fontFamily: "'DM Mono', monospace",
              color: vencido ? 'var(--red)' : 'var(--green-600)',
              fontWeight: vencido ? 700 : 400,
            }}>
              → {proximo}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Draggable wrapper ──────────────────────────────────────────────────────────
function DraggableCard({ item, onOpen }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: String(item.id) })
  const dragListeners = listeners ?? {}
  const downRef = useRef({ x: 0, y: 0, t: 0 })
  return (
    <div
      ref={setNodeRef}
      {...dragListeners}
      {...attributes}
      onPointerDown={e => {
        downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
        dragListeners.onPointerDown?.(e)
      }}
      onPointerUp={e => {
        const d = downRef.current
        const dx = Math.abs(e.clientX - d.x), dy = Math.abs(e.clientY - d.y)
        if (dx < 5 && dy < 5 && Date.now() - d.t < 300) onOpen(item)
      }}
      style={{ marginBottom: 8, touchAction: 'none' }}
    >
      <CrmCard item={item} isDragging={isDragging} />
    </div>
  )
}

// ── Detail modal ───────────────────────────────────────────────────────────────
function CrmDetailModal({ item, ejecutivas, onClose, onSaved }) {
  const { user } = useAuthStore()
  const convertirCliente = useCrmConvertirCliente()

  const [form, setForm] = useState(() => ({
    estado:          normalizeEstado(item.estado),
    prioridad:       item.prioridad || '',
    ejecutiva:       item.ejecutiva || '',
    fechaProximo:    item.fechaProximo ? item.fechaProximo.slice(0, 10) : '',
    fechaCotizacion: item.fechaCotizacion ? item.fechaCotizacion.slice(0, 10) : '',
    nombre:          item.nombre || '',
    rsocial:         item.rsocial || '',
    rut:             item.rut || '',
    email:           item.email || '',
    telefono:        item.telefono || '',
    ncotizacion:     item.ncotizacion || '',
    accion:          item.accion || '',
    resultado:       item.resultado || '',
    comentarios:     item.comentarios || '',
  }))
  const patch = useCrmPatch()
  const { data: ordenLink } = useCrmOrdenLink(item.id, true)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function save() {
    await patch.mutateAsync({ id: item.id, ...form, estado: normalizeEstado(form.estado) })
    onSaved?.()
    onClose()
  }

  const hasValidRut = String(form.rut || '').trim().length > 0

  async function handleConvertir() {
    if (!hasValidRut) return
    try {
      const res = await convertirCliente.mutateAsync(item.id)
      if (res.creado) {
        toast.success('Lead convertido a cliente exitosamente.')
      } else {
        toast.warning('El cliente ya existe en el sistema con ese RUT.')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al convertir cliente')
    }
  }

  const inputStyle = { padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)', width: '100%', fontFamily: 'inherit' }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'oklch(0 0 0/0.45)', zIndex: 9000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, maxWidth: 700, width: '100%',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px oklch(0 0 0/0.25)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Detalle registro CRM</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>#{item.id}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-3)', padding: 0, width: 28, height: 28 }}>×</button>
        </div>

        {ordenLink?.orden && (
          <div style={{ padding: '10px 20px', background: 'var(--green-50, #f0fdf4)', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
            <span style={{ color: 'var(--text-2)' }}>Cotización vinculada a orden: </span>
            <Link to={`/ventas/${ordenLink.orden.id}/editar`} style={{ color: 'var(--green-700)', fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
              #{ordenLink.orden.nInterno} → ver orden
            </Link>
            <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--text-3)' }}>
              {ordenLink.orden.estado} · pago: {ordenLink.orden.estadoPago} · entrega: {ordenLink.orden.estadoEntrega}
            </span>
          </div>
        )}

        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Estado">
            <select value={form.estado} onChange={set('estado')} style={inputStyle}>
              {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </Field>
          <Field label="Prioridad">
            <select value={form.prioridad} onChange={set('prioridad')} style={inputStyle}>
              <option value="">—</option>
              <option value="Alta">Alta</option>
              <option value="Media">Media</option>
              <option value="Baja">Baja</option>
            </select>
          </Field>

          <Field label="Ejecutiva">
            <input list="crm-ejecutivas" value={form.ejecutiva} onChange={set('ejecutiva')} style={inputStyle} disabled={user?.role !== 'admin'} />
            <datalist id="crm-ejecutivas">
              {ejecutivas.map(e => <option key={e.ejecutiva} value={e.ejecutiva} />)}
            </datalist>
          </Field>
          <Field label="N° cotización">
            <input value={form.ncotizacion} onChange={set('ncotizacion')} style={{ ...inputStyle, fontFamily: "'DM Mono', monospace" }} />
          </Field>

          <Field label="Fecha cotización">
            <input type="date" value={form.fechaCotizacion} onChange={set('fechaCotizacion')} style={inputStyle} />
          </Field>
          <Field label="Próximo contacto">
            <input type="date" value={form.fechaProximo} onChange={set('fechaProximo')} style={inputStyle} />
          </Field>

          <Field label="Contacto">
            <input value={form.nombre} onChange={set('nombre')} style={inputStyle} />
          </Field>
          <Field label="Razón social">
            <input value={form.rsocial} onChange={set('rsocial')} style={inputStyle} />
          </Field>

          <Field label="RUT">
            <input value={form.rut} disabled style={{ ...inputStyle, background: 'var(--surface)', color: 'var(--text-3)' }} />
          </Field>
          <Field label="Teléfono">
            <input value={form.telefono} onChange={set('telefono')} style={inputStyle} />
          </Field>

          <Field label="Email" full>
            <input type="email" value={form.email} onChange={set('email')} style={inputStyle} />
          </Field>

          <Field label="Acción / siguiente paso" full>
            <textarea value={form.accion} onChange={set('accion')} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>

          <Field label="Resultado última gestión" full>
            <textarea value={form.resultado} onChange={set('resultado')} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>

          <Field label="Comentarios internos" full>
            <textarea value={form.comentarios} onChange={set('comentarios')} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Notas privadas del equipo…" />
          </Field>
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {form.estado === '3' && (
            <Btn
              variant="secondary"
              size="sm"
              disabled={convertirCliente.isPending || !hasValidRut}
              onClick={handleConvertir}
              style={{ marginRight: 'auto', border: '1px solid var(--green-600)', color: 'var(--green-700)' }}
            >
              {convertirCliente.isPending ? 'Convirtiendo...' : 'Convertir a Cliente'}
            </Btn>
          )}
          <Btn variant="secondary" size="sm" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" size="sm" onClick={save} disabled={patch.isPending}>
            {patch.isPending ? 'Guardando…' : 'Guardar'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ── Kanban column ──────────────────────────────────────────────────────────────
function KanbanColumn({ estado, items, isOver, onOpen }) {
  const { setNodeRef } = useDroppable({ id: String(estado.id) })
  return (
    <div ref={setNodeRef} style={{
      width: '100%', minWidth: 0,
      background: isOver ? estado.bg : 'var(--surface)',
      borderRadius: 12,
      border: `1.5px solid ${isOver ? estado.color : 'var(--border)'}`,
      transition: 'border-color 0.15s, background 0.15s',
      display: 'flex', flexDirection: 'column',
      minHeight: 400,
    }}>
      {/* Column header */}
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: `2px solid ${estado.color}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: estado.color }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{estado.label}</span>
        </div>
        <span style={{
          fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700,
          color: '#fff', background: estado.color,
          borderRadius: 99, padding: '1px 7px', minWidth: 22, textAlign: 'center',
        }}>
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, padding: '10px 10px 10px', overflowY: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
        {items.length === 0 && (
          <div style={{
            height: 80, border: '2px dashed var(--border)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: 'var(--text-3)',
          }}>
            Sin registros
          </div>
        )}
        {items.map(item => <DraggableCard key={item.id} item={item} onOpen={onOpen} />)}
      </div>
    </div>
  )
}

// ── Table view ─────────────────────────────────────────────────────────────────
function TableView({ items, total, limit, onOpen, view, setView, ejecutiva, setEjecutiva, ejecutivas, prioridad, setPrioridad, fechaDesde, setFechaDesde, fechaHasta, setFechaHasta, search, setSearch }) {
  const cols = [
    {
      key: 'fecha', label: 'Fecha',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{new Date(v).toLocaleDateString('es-CL')}</span> : '—'
    },
    {
      key: 'ncotizacion', label: 'N° Cotización',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--green-700)', fontWeight: 600 }}>{v}</span> : '—'
    },
    {
      key: 'nombre', label: 'Contacto / Organismo', wrap: true,
      render: (v, row) => (
        <div style={{ maxWidth: 220 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{v || '—'}</div>
          {row.rsocial && row.rsocial !== v && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{row.rsocial}</div>}
          {row.rut && <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{row.rut}</div>}
        </div>
      )
    },
    { key: 'accion', label: 'Acción', render: v => v ? <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v}</span> : '—' },
    { key: 'resultado', label: 'Resultado', render: v => v ? <span style={{ fontSize: 12, color: 'var(--text-2)', fontStyle: 'italic' }}>{v}</span> : '—' },
    { key: 'ejecutiva', label: 'Ejecutiva', render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span> },
    { key: 'prioridad', label: 'Prioridad', render: v => v ? <Badge tone={prioridadTone(v)}>{v}</Badge> : '—' },
    {
      key: 'estado', label: 'Estado',
      render: v => {
        const e = ESTADOS.find(s => s.id === normalizeEstado(v))
        return e ? <Badge tone={e.tone}>{e.label}</Badge> : '—'
      }
    },
    {
      key: 'fechaProximo', label: 'Próximo',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{new Date(v).toLocaleDateString('es-CL')}</span> : '—'
    },
  ]

  const toolbarExtra = (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
      <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <button onClick={() => setView('pipeline')} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', background: view === 'pipeline' ? 'var(--green-900)' : '#fff', color: view === 'pipeline' ? '#fff' : 'var(--text-2)', border: 'none' }}>Pipeline</button>
        <button onClick={() => setView('table')} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', background: view === 'table' ? 'var(--green-900)' : '#fff', color: view === 'table' ? '#fff' : 'var(--text-2)', border: 'none' }}>Tabla</button>
      </div>
      <select value={ejecutiva} onChange={e => setEjecutiva(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
        <option value="">Ejecutiva</option>
        {ejecutivas.map(e => <option key={e.ejecutiva} value={e.ejecutiva}>{e.ejecutiva} ({e.total})</option>)}
      </select>
      <select value={prioridad} onChange={e => setPrioridad(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
        <option value="">Prioridad</option>
        <option value="Alta">Alta</option>
        <option value="Media">Media</option>
        <option value="Baja">Baja</option>
      </select>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Desde</span>
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Hasta</span>
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }} />
      </div>
      {(fechaDesde || fechaHasta) && (
        <button onClick={() => { setFechaDesde(''); setFechaHasta('') }} style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
          Limpiar fechas ✕
        </button>
      )}
      <div style={{ flex: 1, minWidth: 160 }}>
        <SearchBar placeholder="Contacto, organismo, RUT, cotización..." value={search} onChange={setSearch} />
      </div>
    </div>
  )

  return (
    <>
      <Table columns={cols} rows={items} onRowClick={onOpen} emptyMessage="Sin registros para este filtro" ariaLabel="Registros CRM" getRowKey={row => row.id} toolbarExtra={toolbarExtra} />
      {total > limit && (
        <div style={{ padding: '10px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
          Mostrando {limit} de {total.toLocaleString('es-CL')} registros. Usa los filtros para acotar.
        </div>
      )}
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CrmPage() {
  const queryClient = useQueryClient()
  const [view, setView]               = useState('pipeline')
  const [ejecutiva, setEjecutiva]     = useState('')
  const [prioridad, setPrioridad]     = useState('')
  const [search, setSearch]           = useState('')
  const [debounced, setDebounced]     = useState('')
  const [fechaDesde, setFechaDesde]   = useState('')
  const [fechaHasta, setFechaHasta]   = useState('')
  const [activeId, setActiveId]       = useState(null)
  const [overId, setOverId]           = useState(null)
  const [selected, setSelected]       = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    clearTimeout(ref.current)
    ref.current = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(ref.current)
  }, [search])

  const { data: ejecutivas = [] } = useCrmEjecutivas()
  const { data: pendientesHoyData } = useCrmPendientesHoy()
  const { data: metricas } = useCrmMetricas({ fechaDesde, fechaHasta })
  const patch = useCrmPatch()

  const params = {}
  if (ejecutiva)  params.ejecutiva  = ejecutiva
  if (prioridad)  params.prioridad  = prioridad
  if (debounced)  params.search     = debounced
  if (fechaDesde) params.fechaDesde = fechaDesde
  if (fechaHasta) params.fechaHasta = fechaHasta

  const { data: result = { items: [], total: 0, limit: 500 }, isLoading } = useCrm(params)
  const items = useMemo(() => result.items ?? [], [result.items])
  const total = result.total ?? 0

  const byEstado = useMemo(() => {
    const map = {}
    ESTADOS.forEach(e => { map[e.id] = [] })
    items.forEach(i => {
      const col = map[normalizeEstado(i.estado)]
      if (col) col.push(i)
    })
    return map
  }, [items])

  const activeItem = activeId != null ? items.find(i => String(i.id) === String(activeId)) : null

  const altaPrioridad = items.filter(c => c.prioridad?.toLowerCase() === 'alta').length
  const tasaCierreVal = metricas?.tasaCierre != null ? `${Math.round(metricas.tasaCierre)}%` : '—'
  const tiempoPipeVal = metricas?.tiempoPromedioEnPipeline != null ? `${Math.round(metricas.tiempoPromedioEnPipeline)} días` : '—'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  function handleDragStart({ active }) { setActiveId(active.id) }
  function handleDragOver({ over })    { setOverId(over?.id ?? null) }

  async function handleDragEnd({ active, over }) {
    setActiveId(null)
    setOverId(null)
    if (!over) return
    const newEstado = normalizeEstado(over.id)
    const item = items.find(i => String(i.id) === String(active.id))
    if (!item || normalizeEstado(item.estado) === newEstado) return

    const queryKey = ['crm', params]
    const previousData = queryClient.getQueryData(queryKey)

    queryClient.setQueryData(queryKey, old => {
      if (!old || !old.items) return old
      return {
        ...old,
        items: old.items.map(i =>
          String(i.id) === String(item.id)
            ? { ...i, estado: newEstado }
            : i
        )
      }
    })

    patch.mutate(
      { id: item.id, estado: newEstado },
      {
        onError: err => {
          queryClient.setQueryData(queryKey, previousData)
          toast.error(err.response?.data?.error || 'No se pudo cambiar el estado CRM')
        }
      }
    )
  }

  const totalPendientes = (pendientesHoyData?.hoy?.length || 0) + (pendientesHoyData?.vencidas?.length || 0)

  return (
    <main className="page page-wide">
      <PageHeader
        title="CRM — Pipeline de Ventas"
        subtitle={`${total.toLocaleString('es-CL')} registros de seguimiento`}
        breadcrumb={['Inicio', 'Ventas', 'CRM']}
        actions={<>
          <ViewToggle view={view} setView={setView} />
          <Btn variant="secondary" icon="download" size="sm">Exportar</Btn>
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total registros"   value={total.toLocaleString('es-CL')} icon="fileText"      sublabel="Seguimientos CRM" />
        <KpiCard label="Tasa de Cierre"     value={tasaCierreVal}                  icon="checkCircle"   tone="green" sublabel="Leads ganados" />
        <KpiCard label="Promedio Pipeline"  value={tiempoPipeVal}                  icon="clock"   tone="blue"  sublabel="Días transcurridos" />
        <KpiCard label="Prioridad Alta"     value={altaPrioridad}                  icon="alertTriangle" tone="red" sublabel="Requieren atención" />
      </div>

      {/* Agenda de pendientes */}
      {totalPendientes > 0 && (
        <div style={{
          background: 'oklch(0.985 0.003 240)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 16,
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="clock" size={16} style={{ color: 'var(--amber-600)' }} />
            Mis Pendientes de Hoy y Atrasados ({totalPendientes})
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pendientesHoyData.vencidas.map(lead => (
              <div
                key={lead.id}
                onClick={() => setSelected(lead)}
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: '#b91c1c',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span style={{ fontWeight: 700 }}>Atrasado:</span>
                <span>{lead.nombre || lead.rsocial}</span>
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace" }}>({new Date(lead.fechaProximo).toLocaleDateString('es-CL')})</span>
              </div>
            ))}
            {pendientesHoyData.hoy.map(lead => (
              <div
                key={lead.id}
                onClick={() => setSelected(lead)}
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: '#b45309',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span style={{ fontWeight: 700 }}>Hoy:</span>
                <span>{lead.nombre || lead.rsocial}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      {view === 'pipeline' && (
        <div style={{
          background: '#fff', borderRadius: 12, border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)', padding: '12px 16px', marginBottom: 16,
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <select value={ejecutiva} onChange={e => setEjecutiva(e.target.value)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
            <option value="">Todas las ejecutivas</option>
            {ejecutivas.map(e => <option key={e.ejecutiva} value={e.ejecutiva}>{e.ejecutiva} ({e.total})</option>)}
          </select>
          <select value={prioridad} onChange={e => setPrioridad(e.target.value)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
            <option value="">Toda prioridad</option>
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Desde</span>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Hasta</span>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }} />
          </div>
          {(fechaDesde || fechaHasta) && (
            <button onClick={() => { setFechaDesde(''); setFechaHasta('') }} style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
              Limpiar fechas ✕
            </button>
          )}
          <div style={{ flex: 1, minWidth: 160 }}>
            <SearchBar placeholder="Contacto, organismo, RUT, cotización..." value={search} onChange={setSearch} />
          </div>
        </div>
      )}

      {/* Pipeline view */}
      {view === 'pipeline' && (
        <DndContext
          sensors={sensors}
          collisionDetection={(args) => {
            const pointerCollisions = pointerWithin(args)
            return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args)
          }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {isLoading ? (
            <div style={{ padding: '80px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando pipeline…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ESTADOS.length}, minmax(0, 1fr))`, gap: 12, alignItems: 'flex-start', paddingBottom: 16 }}>
              {ESTADOS.map(estado => (
                <KanbanColumn
                  key={estado.id}
                  estado={estado}
                  items={byEstado[estado.id] ?? []}
                  isOver={overId === String(estado.id)}
                  onOpen={setSelected}
                />
              ))}
            </div>
          )}

          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18,0.67,0.6,1.22)' }}>
            {activeItem && <CrmCard item={activeItem} isDragging />}
          </DragOverlay>
        </DndContext>
      )}

      {/* Table view */}
      {view === 'table' && (
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {isLoading
            ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
            : <TableView
                items={items}
                total={total}
                limit={result.limit}
                onOpen={setSelected}
                view={view}
                setView={setView}
                ejecutiva={ejecutiva}
                setEjecutiva={setEjecutiva}
                ejecutivas={ejecutivas}
                prioridad={prioridad}
                setPrioridad={setPrioridad}
                fechaDesde={fechaDesde}
                setFechaDesde={setFechaDesde}
                fechaHasta={fechaHasta}
                setFechaHasta={setFechaHasta}
                search={search}
                setSearch={setSearch}
              />
          }
        </div>
      )}

      {selected && (
        <CrmDetailModal
          item={selected}
          ejecutivas={ejecutivas}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  )
}
