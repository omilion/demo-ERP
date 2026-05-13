import { useState, useEffect, useRef, useMemo } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table } from '../../components/shared'
import { useCrm, useCrmEjecutivas, useCrmPatch } from '../../api/crm'

const ESTADOS = [
  { id: 0, label: 'Pendiente',   tone: 'amber', color: '#f59e0b', bg: '#fffbeb' },
  { id: 1, label: 'En Gestión',  tone: 'blue',  color: '#3b82f6', bg: '#eff6ff' },
  { id: 2, label: 'En Espera',   tone: 'gray',  color: '#6b7280', bg: '#f9fafb' },
  { id: 3, label: 'Cerrado',     tone: 'green', color: '#16a34a', bg: '#f0fdf4' },
]

const PRIORIDAD_COLOR = { alta: 'var(--red)', media: 'var(--amber)', baja: 'var(--text-3)' }

function prioridadTone(p) {
  if (!p) return 'gray'
  const l = p.toLowerCase()
  if (l === 'alta') return 'red'
  if (l === 'media') return 'amber'
  return 'gray'
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
function DraggableCard({ item }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={{ marginBottom: 8 }}>
      <CrmCard item={item} isDragging={isDragging} />
    </div>
  )
}

// ── Kanban column ──────────────────────────────────────────────────────────────
function KanbanColumn({ estado, items, isOver }) {
  const { setNodeRef } = useDroppable({ id: String(estado.id) })
  return (
    <div ref={setNodeRef} style={{
      flex: '1 1 220px', minWidth: 220, maxWidth: 320,
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
        {items.map(item => <DraggableCard key={item.id} item={item} />)}
      </div>
    </div>
  )
}

// ── Table view ─────────────────────────────────────────────────────────────────
function TableView({ items, total, limit }) {
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
        const e = ESTADOS.find(s => s.id === v)
        return e ? <Badge tone={e.tone}>{e.label}</Badge> : '—'
      }
    },
    {
      key: 'fechaProximo', label: 'Próximo',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{new Date(v).toLocaleDateString('es-CL')}</span> : '—'
    },
  ]
  return (
    <>
      <Table columns={cols} rows={items} emptyMessage="Sin registros para este filtro" />
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
  const [view, setView]               = useState('pipeline')
  const [ejecutiva, setEjecutiva]     = useState('')
  const [prioridad, setPrioridad]     = useState('')
  const [search, setSearch]           = useState('')
  const [debounced, setDebounced]     = useState('')
  const [fechaDesde, setFechaDesde]   = useState('')
  const [fechaHasta, setFechaHasta]   = useState('')
  const [activeId, setActiveId]       = useState(null)
  const [overId, setOverId]           = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    clearTimeout(ref.current)
    ref.current = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(ref.current)
  }, [search])

  const { data: ejecutivas = [] } = useCrmEjecutivas()
  const patch = useCrmPatch()

  const params = {}
  if (ejecutiva)  params.ejecutiva  = ejecutiva
  if (prioridad)  params.prioridad  = prioridad
  if (debounced)  params.search     = debounced
  if (fechaDesde) params.fechaDesde = fechaDesde
  if (fechaHasta) params.fechaHasta = fechaHasta

  const { data: result = { items: [], total: 0, limit: 500 }, isLoading } = useCrm(params)
  const items = result.items ?? []
  const total = result.total ?? 0

  const byEstado = useMemo(() => {
    const map = {}
    ESTADOS.forEach(e => { map[e.id] = [] })
    items.forEach(i => {
      const col = map[i.estado ?? 0]
      if (col) col.push(i)
    })
    return map
  }, [items])

  const activeItem = activeId != null ? items.find(i => i.id === activeId) : null

  const pendientes    = items.filter(c => c.estado === 0).length
  const enGestion     = items.filter(c => c.estado === 1).length
  const cerrados      = items.filter(c => c.estado === 3).length
  const altaPrioridad = items.filter(c => c.prioridad?.toLowerCase() === 'alta').length

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  function handleDragStart({ active }) { setActiveId(active.id) }
  function handleDragOver({ over })    { setOverId(over?.id ?? null) }

  async function handleDragEnd({ active, over }) {
    setActiveId(null)
    setOverId(null)
    if (!over) return
    const newEstado = parseInt(over.id)
    const item = items.find(i => i.id === active.id)
    if (!item || item.estado === newEstado) return
    patch.mutate({ id: item.id, estado: newEstado })
  }

  const ViewToggle = () => (
    <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
      {[['pipeline', '⬛ Pipeline'], ['table', '☰ Tabla']].map(([v, label]) => (
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

  return (
    <main style={{ maxWidth: 1500, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="CRM — Pipeline de Ventas"
        subtitle={`${total.toLocaleString('es-CL')} registros de seguimiento`}
        breadcrumb={['Inicio', 'Ventas', 'CRM']}
        actions={<>
          <ViewToggle />
          <Btn variant="secondary" icon="download" size="sm">Exportar</Btn>
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total registros"   value={total.toLocaleString('es-CL')} icon="fileText"      sublabel="Seguimientos CRM" />
        <KpiCard label="Pendientes"         value={pendientes}                     icon="clock"   tone="amber" sublabel="Sin cerrar" />
        <KpiCard label="En gestión"         value={enGestion}                      icon="phone"   tone="blue"  sublabel="Activamente gestionados" />
        <KpiCard label="Prioridad Alta"     value={altaPrioridad}                  icon="alertTriangle" tone="red" sublabel="Requieren atención" />
        <KpiCard label="Cerrados"           value={cerrados}                       icon="checkCircle" tone="neutral" sublabel="En período filtrado" />
      </div>

      {/* Filters */}
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

      {/* Pipeline view */}
      {view === 'pipeline' && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {isLoading ? (
            <div style={{ padding: '80px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando pipeline…</div>
          ) : (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 16 }}>
              {ESTADOS.map(estado => (
                <KanbanColumn
                  key={estado.id}
                  estado={estado}
                  items={byEstado[estado.id] ?? []}
                  isOver={overId === String(estado.id)}
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
            : <TableView items={items} total={total} limit={result.limit} />
          }
        </div>
      )}
    </main>
  )
}
