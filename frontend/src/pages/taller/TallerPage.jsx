import { useState, useEffect, useRef } from 'react'
import { DndContext, DragOverlay, PointerSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon, Badge, KpiCard, PageHeader, Btn, SearchBar, Tabs, Pager, Table } from '../../components/shared'
import { ColumnSelector, useColumnPreferences } from '../../components/ColumnSelector'
import { useOdts, useOdtKanban, useOdt, useOdtEstado, useAddBitacora, useDeleteBitacora, useAnularOdt, useCerrarOdt, useOdtOperarios, useOdtCargaOperarios, useOdtProductividad } from '../../api/odts'
import { downloadFromBackend } from '../../utils/csv'
import { useAuthStore } from '../../store/auth'
import { can, ventaPath } from '../../utils/permissions'

const ESTADO_TONE = {
  Prioritaria: 'red',
  'En proceso': 'blue',
  Asignada: 'blue',
  Pendiente:   'amber',
  'Control calidad': 'amber',
  Terminada:   'green',
  Entregada:   'green',
}

function estadoOperativoOdt(estado) {
  if (['Terminada', 'Entregada'].includes(estado)) return 'Listo'
  if (estado === 'En proceso') return 'En proceso'
  if (estado === 'Anulada') return 'Anulada'
  return 'Pendiente'
}

function estadoOperativoTone(estado) {
  const mapped = estadoOperativoOdt(estado)
  if (mapped === 'Listo') return 'green'
  if (mapped === 'En proceso') return 'blue'
  if (mapped === 'Anulada') return 'red'
  return 'amber'
}

function odtNumeroOperativo(odt) {
  return odt?.nInterno || odt?.orden?.nInterno || odt?.id
}

const TALLER_TABS = [
  { id: 'all',          label: 'Todos' },
  { id: 'Espumas',      label: 'Espumas' },
  { id: 'Confecciones', label: 'Confecciones' },
  { id: 'Madera',       label: 'Madera' },
  { id: 'Externo',      label: 'Externo' },
]

const TAB_PARAMS = {
  Espumas:      { tipo: 'Espumas' },
  Confecciones: { tipo: 'Confecciones' },
  Madera:       { tipo: 'Madera' },
  Externo:      { tipo: 'Externo' },
}

const getErrorMessage = err => err?.response?.data?.error || err?.message || 'No se pudo completar la accion'

const KANBAN_COLUMNS = [
  { id: 'Prioritaria', label: 'Criticas', tone: 'red' },
  { id: 'Pendiente', label: 'Pendientes', tone: 'amber' },
  { id: 'Asignada', label: 'Asignadas', tone: 'blue' },
  { id: 'En proceso', label: 'En proceso', tone: 'blue' },
  { id: 'Control calidad', label: 'Control', tone: 'amber' },
  { id: 'Terminada', label: 'Listas', tone: 'green', states: ['Terminada', 'Entregada'] },
]

const NEXT_ESTADO = {
  Prioritaria: 'En proceso',
  Pendiente: 'Asignada',
  Asignada: 'En proceso',
  'En proceso': 'Control calidad',
  'Control calidad': 'Terminada',
}

function kanbanColumnId(odt) {
  if (odt.estado === 'Entregada') return 'Terminada'
  return odt.estado
}

function formatDuration(hours) {
  if (hours == null) return '-'
  if (hours < 24) return `${hours.toLocaleString('es-CL', { maximumFractionDigits: 1 })} h`
  return `${(hours / 24).toLocaleString('es-CL', { maximumFractionDigits: 1 })} d`
}

function fmtMoney(value) {
  if (value == null) return '-'
  return '$' + Math.round(Number(value || 0)).toLocaleString('es-CL')
}

function formatAtraso(tiempos) {
  if (!tiempos?.atrasoHoras) return '-'
  return formatDuration(tiempos.atrasoHoras)
}

// Kept temporarily as reference while the taller UX is migrated from cards to list.
// eslint-disable-next-line no-unused-vars
const OdtCard = ({ odt, onSelect }) => {
  const [hov, setHov] = useState(false)
  const isPrioritaria = odt.estado === 'Prioritaria'
  const responsable = odt.operario
    ? `${odt.operario.nombres || ''} ${odt.operario.apellidoPaterno || ''}`.trim()
    : ''
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onSelect(odt)}
      style={{
        background: '#fff',
        borderRadius: 10,
        border: `1.5px solid ${isPrioritaria ? 'var(--red)' : hov ? 'var(--green-100)' : 'var(--border)'}`,
        padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
        boxShadow: hov ? '0 4px 14px oklch(0 0 0 / 0.08)' : 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, color: 'var(--green-700)' }}>
            ODT #{odtNumeroOperativo(odt)}
          </span>
          {odt.nInterno && (
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>
              N interno {odt.nInterno}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {odt.prioridad && odt.prioridad !== 'normal' && (
            <Badge tone={odt.prioridad === 'urgente' ? 'red' : 'amber'} style={{ fontSize: 10 }}>{odt.prioridad}</Badge>
          )}
          <Badge tone={ESTADO_TONE[odt.estado]}>{odt.estado}</Badge>
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 5, lineHeight: 1.3 }}>
        {odt.clienteNombre || '-'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.4 }}>
        {odt.descripcion}
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-3)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="calendar" size={12} /> {new Date(odt.createdAt).toLocaleDateString('es-CL')}
        </span>
        {responsable && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="user" size={12} /> {responsable}
          </span>
        )}
        {odt.tipo && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="tag" size={12} /> {odt.tipo}
          </span>
        )}
        <span style={{
          display: 'flex', alignItems: 'center', gap: 4,
          color: odt.plazo && new Date(odt.plazo) < new Date() && odt.estado !== 'Terminada' ? 'var(--red)' : 'var(--text-3)',
        }}>
          <Icon name="clock" size={12} /> {odt.plazo ? new Date(odt.plazo).toLocaleDateString('es-CL') : '-'}
        </span>
      </div>
    </div>
  )
}

function BitacoraSection({ odtId, entries = [], canWrite, canDelete }) {
  const [texto, setTexto] = useState('')
  const addBitacora = useAddBitacora()
  const delBitacora = useDeleteBitacora()

  const handleAdd = () => {
    if (!texto.trim()) return
    addBitacora.mutate(
      { odtId, texto },
      {
        onSuccess: () => setTexto(''),
        onError: err => alert(getErrorMessage(err)),
      }
    )
  }

  const handleDelete = entryId => {
    if (!confirm('¿Eliminar esta entrada de bitacora? Esta accion no se puede deshacer.')) return
    delBitacora.mutate(
      { odtId, entryId },
      { onError: err => alert(getErrorMessage(err)) }
    )
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
        Bitacora ({entries.length})
      </div>

      {entries.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {entries.map(e => (
            <div key={e.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 3, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>{e.usuario}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>
                    {new Date(e.createdAt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.5 }}>{e.texto}</div>
              </div>
              {canDelete && <button
                onClick={() => handleDelete(e.id)}
                style={{ color: 'var(--text-3)', padding: '2px 4px', marginLeft: 8, flexShrink: 0 }}
                title="Eliminar entrada"
              >
                <Icon name="x" size={13} />
              </button>}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12, padding: '8px 0' }}>Sin entradas de bitacora</div>
      )}

      {canWrite && <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAdd()}
          placeholder="Agregar nota..."
          style={{ flex: 1, padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
        />
        <button
          onClick={handleAdd}
          disabled={!texto.trim() || addBitacora.isPending}
          style={{ padding: '8px 14px', borderRadius: 7, background: 'var(--green-600)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: !texto.trim() ? 0.5 : 1 }}
        >
          {addBitacora.isPending ? '...' : 'Agregar'}
        </button>
      </div>}
    </div>
  )
}

function kanbanDropEstado(columnId) {
  return columnId === 'Terminada' ? 'Terminada' : columnId
}

function OdtKanbanCardContent({ odt, canWrite, pending, onEstadoChange, isDragging = false }) {
  const responsable = odt.operario
    ? `${odt.operario.nombres || ''} ${odt.operario.apellidoPaterno || ''}`.trim()
    : ''
  const nextEstado = NEXT_ESTADO[odt.estado]
  const overdue = odt.tiempos?.enAtraso

  return (
    <div style={{
      textAlign: 'left',
      background: '#fff',
      border: `1px solid ${overdue ? 'var(--red)' : 'var(--border)'}`,
      borderRadius: 8,
      padding: 10,
      cursor: canWrite ? 'grab' : 'pointer',
      boxShadow: isDragging ? '0 10px 26px oklch(0 0 0 / 0.18)' : 'var(--shadow-sm)',
      opacity: isDragging ? 0.94 : 1,
      userSelect: 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 7 }}>
        <div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--green-700)', fontWeight: 700 }}>
            ODT #{odtNumeroOperativo(odt)}
          </div>
          {odt.nInterno && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-3)' }}>N {odt.nInterno}</div>}
        </div>
        <Badge tone={ESTADO_TONE[odt.estado] || 'gray'}>{odt.estado}</Badge>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.25, marginBottom: 5 }}>
        {odt.clienteNombre || '-'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.35, marginBottom: 8, minHeight: 30 }}>
        {(odt.descripcion || '-').slice(0, 110)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10.5, color: 'var(--text-3)', marginBottom: 8 }}>
        <span><Icon name="user" size={11} /> {responsable || '-'}</span>
        <span style={{ color: overdue ? 'var(--red)' : 'var(--text-3)' }}><Icon name="clock" size={11} /> {formatAtraso(odt.tiempos)}</span>
        <span><Icon name="tool" size={11} /> {formatDuration(odt.tiempos?.produccionHoras)}</span>
        <span><Icon name="dollarSign" size={11} /> {fmtMoney(odt.costeo?.costoTotal)}</span>
        <span><Icon name="calendar" size={11} /> {odt.plazo ? new Date(odt.plazo).toLocaleDateString('es-CL') : '-'}</span>
        <span><Icon name="barChart2" size={11} /> {odt.costeo?.unidadesPorHora ?? '-'} u/h</span>
      </div>
      {canWrite && nextEstado && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span
            role="button"
            tabIndex={0}
            onClick={event => {
              event.stopPropagation()
              if (pending) return
              onEstadoChange(odt.id, nextEstado)
            }}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                if (pending) return
                onEstadoChange(odt.id, nextEstado)
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: '1px solid var(--green-100)',
              color: 'var(--green-700)',
              borderRadius: 6,
              padding: '4px 7px',
              fontSize: 11,
              fontWeight: 700,
              opacity: pending ? 0.55 : 1,
              cursor: pending ? 'not-allowed' : 'pointer',
            }}
          >
            {nextEstado} <Icon name="arrowRight" size={11} />
          </span>
        </div>
      )}
    </div>
  )
}

function DraggableOdtCard({ odt, canWrite, pending, onSelect, onEstadoChange }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(odt.id),
    data: { odt },
    disabled: !canWrite || pending,
  })
  const dragListeners = listeners ?? {}
  const downRef = useRef({ x: 0, y: 0, t: 0 })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...dragListeners}
      role="button"
      tabIndex={0}
      onPointerDown={event => {
        downRef.current = { x: event.clientX, y: event.clientY, t: Date.now() }
        dragListeners.onPointerDown?.(event)
      }}
      onPointerUp={event => {
        const down = downRef.current
        const dx = Math.abs(event.clientX - down.x)
        const dy = Math.abs(event.clientY - down.y)
        if (dx < 5 && dy < 5 && Date.now() - down.t < 300) onSelect(odt)
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(odt)
        }
      }}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        touchAction: canWrite ? 'none' : 'auto',
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      <OdtKanbanCardContent odt={odt} canWrite={canWrite} pending={pending} onEstadoChange={onEstadoChange} isDragging={isDragging} />
    </div>
  )
}

function KanbanColumn({ column, items, canWrite, pending, onSelect, onEstadoChange }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div ref={setNodeRef} style={{ border: `1px solid ${isOver ? 'var(--green-600)' : 'var(--border)'}`, borderRadius: 8, background: isOver ? 'var(--green-50)' : 'oklch(0.985 0.002 220)', minHeight: 420, display: 'flex', flexDirection: 'column', transition: 'border-color 0.15s, background 0.15s' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#fff', borderRadius: '8px 8px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge tone={column.tone}>{column.label}</Badge>
        </div>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-3)' }}>{items.length}</span>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
        {items.length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: 12, padding: '18px 8px', textAlign: 'center', border: isOver ? '1px dashed var(--green-600)' : '1px dashed transparent', borderRadius: 8 }}>Sin ODTs</div>
        ) : items.map(odt => (
          <DraggableOdtCard
            key={odt.id}
            odt={odt}
            canWrite={canWrite}
            pending={pending}
            onSelect={onSelect}
            onEstadoChange={onEstadoChange}
          />
        ))}
      </div>
    </div>
  )
}

function KanbanBoard({ odts, canWrite, pending, onSelect, onEstadoChange, onEstadoDrop }) {
  const [activeId, setActiveId] = useState(null)
  const grouped = KANBAN_COLUMNS.reduce((acc, column) => ({ ...acc, [column.id]: [] }), {})
  for (const odt of odts) {
    const columnId = kanbanColumnId(odt)
    if (grouped[columnId]) grouped[columnId].push(odt)
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const activeOdt = activeId ? odts.find(odt => String(odt.id) === String(activeId)) : null

  function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over || !canWrite || pending) return
    const odt = active.data.current?.odt || odts.find(item => String(item.id) === String(active.id))
    if (!odt) return
    const targetColumn = String(over.id)
    if (!KANBAN_COLUMNS.some(column => column.id === targetColumn)) return
    if (kanbanColumnId(odt) === targetColumn) return
    onEstadoDrop(odt, kanbanDropEstado(targetColumn))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) => {
        const pointerCollisions = pointerWithin(args)
        return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args)
      }}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))', gap: 12, minWidth: 1360 }}>
          {KANBAN_COLUMNS.map(column => (
            <KanbanColumn
              key={column.id}
              column={column}
              items={grouped[column.id]}
              canWrite={canWrite}
              pending={pending}
              onSelect={onSelect}
              onEstadoChange={onEstadoChange}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18,0.67,0.6,1.22)' }}>
        {activeOdt && (
          <OdtKanbanCardContent
            odt={activeOdt}
            canWrite={canWrite}
            pending={pending}
            onEstadoChange={onEstadoChange}
            isDragging
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}

function OdtCosteoPanel({ costeo }) {
  if (!costeo) return null
  const alertas = []
  if (costeo.alertas?.materialesSinPrecio) alertas.push(`${costeo.alertas.materialesSinPrecio} material(es) sin precio`)
  if (costeo.alertas?.manoObraSinSueldo) alertas.push('Responsable sin sueldo liquido')
  if (costeo.alertas?.sinHorasProduccion) alertas.push('Sin horas de produccion')

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Costeo estimado</div>
        {alertas.length > 0 && <Badge tone="amber">Datos incompletos</Badge>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          ['Materiales', fmtMoney(costeo.costoMateriales)],
          ['Mano obra', fmtMoney(costeo.costoManoObra)],
          ['Total costo', fmtMoney(costeo.costoTotal)],
          ['Costo unit.', fmtMoney(costeo.costoPorUnidad)],
          ['Unid./hora', costeo.unidadesPorHora == null ? '-' : `${costeo.unidadesPorHora}`],
          ['Margen est.', fmtMoney(costeo.margenEstimado)],
        ].map(([label, value]) => (
          <div key={label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>
      {alertas.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
          {alertas.map(alerta => <Badge key={alerta} tone="amber">{alerta}</Badge>)}
        </div>
      )}
      {(costeo.materiales || []).length > 0 && (
        <div style={{ marginTop: 10, maxHeight: 138, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {(costeo.materiales || []).slice(0, 8).map((material, index) => (
            <div key={`${material.codigoInterno || material.nombre}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, fontSize: 11, alignItems: 'center', padding: '5px 0', borderTop: index ? '1px dashed var(--border)' : 'none' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{material.nombre || material.codigoInterno || '-'}</span>
              <span style={{ color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{material.cantidad} {material.unidad || ''}</span>
              <span style={{ fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{fmtMoney(material.costo)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProductividadPanel({ items = [], totalOdts = 0, onSelectOperario }) {
  if (!items.length) return null
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Productividad reciente</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{totalOdts.toLocaleString('es-CL')} ODTs cerradas en el rango</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(238px, 1fr))', gap: 10 }}>
        {items.slice(0, 6).map(item => (
          <button
            key={item.operarioId || 'sin-responsable'}
            type="button"
            onClick={() => item.operarioId && onSelectOperario?.(String(item.operarioId))}
            style={{
              textAlign: 'left',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              borderRadius: 8,
              padding: '10px 12px',
              cursor: item.operarioId ? 'pointer' : 'default',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{item.responsable}</span>
              <Badge tone={item.alertas?.materialesSinPrecio || item.alertas?.manoObraSinSueldo ? 'amber' : 'green'}>{item.odts} ODT</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
              <span style={{ color: 'var(--text-3)' }}>Unidades <b style={{ color: 'var(--text-1)' }}>{item.unidades}</b></span>
              <span style={{ color: 'var(--text-3)' }}>Unid./h <b style={{ color: 'var(--text-1)' }}>{item.unidadesPorHora ?? '-'}</b></span>
              <span style={{ color: 'var(--text-3)' }}>Costo <b style={{ color: 'var(--text-1)' }}>{fmtMoney(item.costoTotal)}</b></span>
              <span style={{ color: 'var(--text-3)' }}>Margen <b style={{ color: item.margenEstimado < 0 ? 'var(--red)' : 'var(--green-700)' }}>{fmtMoney(item.margenEstimado)}</b></span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function OdtModal({ odt, onClose, onEdit, onEstadoChange, onCloseOdt, onAnularOdt, canWrite, canDelete, lifecyclePending }) {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const { data: full } = useOdt(odt.id)
  const o = full || odt
  const orden = full?.orden ?? null
  const bitacora = full?.bitacora ?? []
  const responsable = o.operario
    ? `${o.operario.nombres || ''} ${o.operario.apellidoPaterno || ''}`.trim()
    : ''

  const handleImprimir = () => window.print()

  const estadoActions = [
    { from: ['Pendiente', 'Asignada'], to: 'En proceso', label: 'Iniciar trabajo', tone: 'blue' },
    { from: ['Prioritaria'], to: 'En proceso', label: 'Volver a En proceso', tone: 'blue' },
    { from: ['En proceso', 'Prioritaria'], to: 'Control calidad', label: 'Dejar pendiente', tone: 'amber' },
    { from: ['Pendiente', 'Asignada', 'En proceso', 'Prioritaria', 'Control calidad'], to: 'Terminada', label: 'Marcar lista', tone: 'green' },
    { from: ['Terminada'], to: 'Pendiente', label: 'Reabrir ODT', tone: 'amber' },
    { from: ['Entregada'], to: 'Terminada', label: 'Reabrir entrega', tone: 'amber' },
  ]
  const available = estadoActions.filter(a => a.from.includes(o.estado))
  const canCloseOdt = !['Terminada', 'Entregada'].includes(o.estado)
  const canReopenOdt = ['Terminada', 'Entregada'].includes(o.estado)
  const canAnularOdt = !['Anulada'].includes(o.estado)

  const fmtDate = d => d ? new Date(d).toLocaleDateString('es-CL') : '-'

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'oklch(0 0 0 / 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: 540, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px oklch(0 0 0 / 0.20)', animation: 'dropIn 0.18s ease' }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>ODT #{odtNumeroOperativo(o)}</span>
            {o.prioridad && o.prioridad !== 'normal' && (
              <Badge tone={o.prioridad === 'urgente' ? 'red' : 'amber'}>{o.prioridad}</Badge>
            )}
            <Badge tone={estadoOperativoTone(o.estado)}>{estadoOperativoOdt(o.estado)}</Badge>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-3)', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ padding: '20px 22px' }}>
          {/* Venta origen */}
          {orden && (
            <div style={{ background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--green-700)', marginBottom: 3 }}>Venta origen</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                  #{orden.nInterno || orden.id} - {orden.cliente?.nombre || 'Sin cliente'}
                </div>
                {orden.cliente?.rut && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>{orden.cliente.rut}</div>}
              </div>
              <button onClick={() => { navigate(ventaPath(orden.id, user)); onClose() }} style={{ fontSize: 11, color: 'var(--green-700)', background: '#fff', border: '1px solid var(--green-600)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                Ver Venta
              </button>
            </div>
          )}

          <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Cliente</div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>{o.clienteNombre || '-'}</div>

          <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Descripcion</div>
          <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.6, marginBottom: 18, background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
            {o.descripcion || '-'}
          </div>

          {o.obsGeneral && (
            <>
              <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Obs OT</div>
              <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.6, marginBottom: 18, background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                {o.obsGeneral}
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            {[
              ['Tipo',         o.tipo || '-'],
              ['Responsable',  responsable || '-'],
              ['Prioridad',    o.prioridad || 'normal'],
              ['Creada',       fmtDate(o.createdAt)],
              ['Ingreso',      fmtDate(o.fechaIngreso)],
              ['Plazo',        fmtDate(o.plazo)],
              ['Inicio',       fmtDate(o.fechaInicio)],
              ['Termino',      fmtDate(o.fechaTermino)],
              ['Tiempo prod.',  formatDuration(o.tiempos?.produccionHoras)],
              ['Ciclo',         formatDuration(o.tiempos?.cicloHoras)],
              ['Atraso',        formatAtraso(o.tiempos)],
            ].map(([l, v], i) => (
              <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>{l}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
              </div>
            ))}
          </div>

          <OdtCosteoPanel costeo={o.costeo} />

          {/* Estado transitions */}
          {canWrite && available.length > 0 && (
            <div style={{ marginTop: 8, padding: '12px 14px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                Cambiar estado
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {available.map(a => (
                  <button
                    key={a.to}
                    onClick={() => { onEstadoChange(odt.id, a.to); onClose() }}
                    style={{
                      padding: '6px 14px', fontSize: 12, borderRadius: 7, cursor: 'pointer', fontWeight: 600,
                      background: a.tone === 'green' ? 'var(--green-600)' : a.tone === 'red' ? 'var(--red)' : a.tone === 'blue' ? 'var(--blue)' : 'var(--amber)',
                      color: '#fff', border: 'none',
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bitacora */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }}>
            <BitacoraSection odtId={o.id} entries={bitacora} canWrite={canWrite} canDelete={canDelete} />
          </div>
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {canWrite && <Btn variant="primary" icon="edit" onClick={onEdit}>Editar ODT</Btn>}
            <Btn variant="ghost" icon="printer" onClick={handleImprimir}>Imprimir</Btn>
          </div>
          {canWrite && canCloseOdt && <Btn variant="ghost" icon="checkCircle" onClick={() => onCloseOdt(o, 'Terminada')} disabled={lifecyclePending} style={{ color: 'var(--green-700)' }}>Marcar lista</Btn>}
          {canWrite && canReopenOdt && <Btn variant="ghost" icon="refreshCw" onClick={() => onCloseOdt(o, 'Pendiente')} disabled={lifecyclePending} style={{ color: 'var(--amber)' }}>Reabrir ODT</Btn>}
          {canDelete && canAnularOdt && <Btn variant="ghost" icon="xCircle" onClick={() => onAnularOdt(o)} disabled={lifecyclePending} style={{ color: 'var(--red)' }}>Anular ODT</Btn>}
        </div>
      </div>
    </div>
  )
}

export default function TallerPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialSearch = searchParams.get('search') || ''
  const initialTipo = searchParams.get('tipo')
  const initialPrioridad = searchParams.get('prioridad')
  const initialPendiente = searchParams.get('pendiente') === 'si'
  const initialFechaCampo = searchParams.get('fechaCampo') || 'createdAt'
  const initialFechaDesde = searchParams.get('fechaDesde') || ''
  const initialFechaHasta = searchParams.get('fechaHasta') || ''
  const { user } = useAuthStore()
  const canWriteTaller = can(user, 'taller', 'write')
  const canDeleteTaller = can(user, 'taller', 'delete')
  const [tab, setTab]               = useState(initialTipo && TALLER_TABS.some(t => t.id === initialTipo) ? initialTipo : 'all')
  const [search, setSearch]         = useState(initialSearch)
  const [debouncedSearch, setDeb]   = useState(initialSearch)
  const [pageState, setPageState]   = useState({ key: '', page: 1 })
  const [estadoFilter, setEst]      = useState(initialPendiente ? 'Pendiente' : initialPrioridad === 'urgente' || initialPrioridad === 'alta' ? 'Pendiente' : 'all')
  const [operarioFilter, setOperarioFilter] = useState('all')
  const [fechaCampo, setFechaCampo] = useState(initialFechaCampo)
  const [fechaDesde, setFechaDesde] = useState(initialFechaDesde)
  const [fechaHasta, setFechaHasta] = useState(initialFechaHasta)
  const [selected, setSelected]     = useState(null)
  const [viewMode, setViewMode]     = useState('kanban')
  const debRef = useRef(null)
  const cambiarEstado = useOdtEstado()
  const cerrarOdt = useCerrarOdt()
  const anularOdt = useAnularOdt()
  const { data: operariosMeta = { items: [] } } = useOdtOperarios()
  const { data: cargaOperarios = { items: [] } } = useOdtCargaOperarios()
  const productividadParams = {}
  if (fechaDesde) productividadParams.fechaDesde = fechaDesde
  if (fechaHasta) productividadParams.fechaHasta = fechaHasta
  if (tab !== 'all') productividadParams.tipo = tab
  if (operarioFilter !== 'all') productividadParams.operarioId = operarioFilter
  const { data: productividad = { items: [], totalOdts: 0 } } = useOdtProductividad(productividadParams)

  useEffect(() => {
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => setDeb(search), 400)
    return () => clearTimeout(debRef.current)
  }, [search])

  const filterParams = { ...TAB_PARAMS[tab] }
  if (estadoFilter === 'Listo') filterParams.estados = 'Terminada,Entregada'
  else if (estadoFilter !== 'all') filterParams.estado = estadoFilter
  if (estadoFilter === 'Anulada') filterParams.includeEliminados = 'true'
  if (operarioFilter !== 'all') filterParams.operarioId = operarioFilter
  if (debouncedSearch) filterParams.search = debouncedSearch
  if (fechaDesde) filterParams.fechaDesde = fechaDesde
  if (fechaHasta) filterParams.fechaHasta = fechaHasta
  if (fechaDesde || fechaHasta) filterParams.fechaCampo = fechaCampo
  const filterKey = JSON.stringify(filterParams)
  const page = pageState.key === filterKey ? pageState.page : 1
  const setPagerPage = nextPage => setPageState({ key: filterKey, page: nextPage })
  const apiParams = { ...filterParams, page: String(page) }

  const { data: odtResult = { items: [], total: 0, limit: 100, stats: {} }, isLoading } = useOdts(apiParams)
  const { data: kanbanResult = { items: [], total: 0, limit: 1000, stats: {} }, isLoading: kanbanLoading } = useOdtKanban(filterParams, viewMode === 'kanban')
  const odts  = odtResult.items ?? []
  const kanbanOdts = kanbanResult.items ?? []
  const total = odtResult.total ?? 0
  const LIMIT = odtResult.limit ?? 100
  const pages = odtResult.pages ?? Math.max(1, Math.ceil(total / LIMIT))
  const stats = odtResult.stats ?? {}

  const prioritarias = stats['Prioritaria'] ?? 0
  const enProceso    = stats['En proceso'] ?? 0
  const asignadas    = stats['Asignada'] ?? 0
  const enControl    = stats['Control calidad'] ?? 0
  const pendientes   = stats['Pendiente'] ?? 0
  const terminadas   = (stats['Terminada'] ?? 0) + (stats['Entregada'] ?? 0)
  const fmtDate = d => d ? new Date(d).toLocaleDateString('es-CL') : '-'
  const responsableDe = odt => odt.operario
    ? `${odt.operario.nombres || ''} ${odt.operario.apellidoPaterno || ''}`.trim()
    : ''
  const odtColumns = [
    { key: 'id', label: 'ODT', required: true, render: (_, row) => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>#{odtNumeroOperativo(row)}</span> },
    { key: 'nInterno', label: 'N interno', render: v => v || '-' },
    { key: 'clienteNombre', label: 'Cliente', required: true, render: v => v || '-' },
    { key: 'descripcion', label: 'Trabajo', render: v => <span title={v}>{v || '-'}</span> },
    { key: 'tipo', label: 'Taller', render: v => v || '-' },
    { key: 'estado', label: 'Estado', required: true, render: v => <Badge tone={estadoOperativoTone(v)}>{estadoOperativoOdt(v)}</Badge> },
    { key: 'prioridad', label: 'Prioridad', render: v => <Badge tone={v === 'urgente' ? 'red' : v === 'alta' ? 'amber' : 'gray'}>{v || 'normal'}</Badge> },
    { key: 'responsable', label: 'Responsable', render: (_, row) => responsableDe(row) || '-' },
    { key: 'createdAt', label: 'Creada', render: v => fmtDate(v) },
    { key: 'plazo', label: 'Plazo', render: (v, row) => (
      <span style={{ color: v && new Date(v) < new Date() && !['Terminada', 'Entregada'].includes(row.estado) ? 'var(--red)' : 'inherit' }}>
        {fmtDate(v)}
      </span>
    ) },
    { key: 'tiempos', label: 'Tiempo prod.', render: (_, row) => formatDuration(row.tiempos?.produccionHoras) },
    { key: 'costeo', label: 'Costo est.', render: (_, row) => (
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: row.costeo?.alertas?.materialesSinPrecio || row.costeo?.alertas?.manoObraSinSueldo ? 'var(--amber)' : 'var(--text-1)' }}>
        {fmtMoney(row.costeo?.costoTotal)}
      </span>
    ) },
    { key: 'atraso', label: 'Atraso', render: (_, row) => (
      <span style={{ color: row.tiempos?.enAtraso ? 'var(--red)' : 'var(--text-3)', fontWeight: row.tiempos?.enAtraso ? 700 : 500 }}>
        {formatAtraso(row.tiempos)}
      </span>
    ) },
    { key: '_acc', label: '', required: true, render: (_, row) => (
      <Btn variant="ghost" size="sm" icon="eye" onClick={e => { e.stopPropagation(); setSelected(row) }}>Ver</Btn>
    ) },
  ]
  const { selected: selectedColumns, setSelected: setSelectedColumns, reset: resetColumns, visibleColumns, required: requiredColumns } = useColumnPreferences('taller-odts', odtColumns, user)

  function handleEstadoChange(id, estado) {
    cambiarEstado.mutate({ id, estado }, {
      onSuccess: updated => {
        if (selected?.id === id) setSelected(updated)
      },
      onError: err => alert(getErrorMessage(err)),
    })
  }

  function handleKanbanDrop(odt, estado) {
    if (!canWriteTaller || cambiarEstado.isPending) return
    const current = odt.estado || 'Sin estado'
    if (current === estado) return
    const odtNumero = odtNumeroOperativo(odt)
    if (!confirm(`Confirmas mover la ODT #${odtNumero} de ${current} a ${estado}?`)) return
    handleEstadoChange(odt.id, estado)
  }

  function handleCloseOdt(odt, estado) {
    const isReopen = estado === 'Pendiente'
    const action = isReopen ? 'reabrir' : 'cerrar'
    const odtNumero = odtNumeroOperativo(odt)
    const detail = isReopen
      ? 'La ODT volvera a Pendiente y quedara disponible para trabajo operativo.'
      : 'La ODT pasara a Terminada y se registrara fecha de termino si aun no existe.'
    if (!confirm(`¿Confirmas ${action} la ODT #${odtNumero}?\n\n${detail}`)) return
    if (isReopen) {
      cambiarEstado.mutate(
        { id: odt.id, estado },
        {
          onSuccess: updated => setSelected(updated),
          onError: err => alert(getErrorMessage(err)),
        }
      )
      return
    }
    cerrarOdt.mutate(
      { id: odt.id, estado },
      {
        onSuccess: updated => setSelected(updated),
        onError: err => alert(getErrorMessage(err)),
      }
    )
  }

  function handleAnularOdt(odt) {
    const odtNumero = odtNumeroOperativo(odt)
    const razon = prompt(`Motivo para anular la ODT #${odtNumero}`)
    if (razon == null) return
    if (!razon.trim()) { alert('Debes indicar un motivo para anular la ODT.'); return }
    if (!confirm(`¿Confirmas anular la ODT #${odtNumero}?\n\nEsta accion la sacara del flujo operativo y conservara trazabilidad en bitacora.`)) return
    anularOdt.mutate(
      { id: odt.id, razon: razon.trim() },
      {
        onSuccess: () => setSelected(null),
        onError: err => alert(getErrorMessage(err)),
      }
    )
  }

  function handleExport() {
    downloadFromBackend('/reportes/export/odts', `odts-${new Date().toISOString().slice(0,10)}.csv`, filterParams)
  }

  return (
    <main className="page page-wide">
      <PageHeader
        title="Taller - Ordenes de Trabajo"
        subtitle={`${total.toLocaleString('es-CL')} ODTs en total`}
        breadcrumb={['Inicio', 'Taller', 'ODTs']}
        actions={<>
          <Btn variant="secondary" icon={viewMode === 'kanban' ? 'list' : 'grid'} size="sm" onClick={() => setViewMode(viewMode === 'kanban' ? 'tabla' : 'kanban')}>
            {viewMode === 'kanban' ? 'Tabla' : 'Kanban'}
          </Btn>
          {viewMode === 'tabla' && <ColumnSelector columns={odtColumns} selected={selectedColumns} onChange={setSelectedColumns} onReset={resetColumns} required={requiredColumns} />}
          <Btn variant="secondary" icon="download" size="sm" onClick={handleExport}>Exportar</Btn>
          {canWriteTaller && <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/taller/nueva')}>Nueva ODT</Btn>}
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Pendientes criticas" value={isLoading ? '...' : prioritarias.toLocaleString('es-CL')} icon="zap" tone={prioritarias > 0 ? 'red' : 'neutral'} sublabel="Prioridad urgente" onClick={() => setEst('Pendiente')} />
        <KpiCard label="En Proceso"   value={isLoading ? '...' : enProceso.toLocaleString('es-CL')}    icon="tool"  tone="blue"   sublabel="Trabajos activos"   onClick={() => setEst('En proceso')} />
        <KpiCard label="Asignadas"    value={isLoading ? '...' : asignadas.toLocaleString('es-CL')}    icon="user"  tone="blue"   sublabel="Con responsable"    onClick={() => setEst('Asignada')} />
        <KpiCard label="Pendientes"   value={isLoading ? '...' : pendientes.toLocaleString('es-CL')}   icon="clock" tone="amber"  sublabel="Por iniciar"       onClick={() => setEst('Pendiente')} />
        <KpiCard label="Control"      value={isLoading ? '...' : enControl.toLocaleString('es-CL')}    icon="search" tone="amber" sublabel="Pendiente de cierre"   onClick={() => setEst('Control calidad')} />
        <KpiCard label="Listas"       value={isLoading ? '...' : terminadas.toLocaleString('es-CL')}   icon="checkCircle" tone="neutral" sublabel="Terminadas/entregadas" onClick={() => setEst('Listo')} />
      </div>

      {(cargaOperarios.items || []).length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Carga por responsable</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>ODTs abiertas asignadas</div>
            </div>
            <button
              onClick={() => setOperarioFilter('all')}
              style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, background: '#fff', color: 'var(--text-2)', cursor: 'pointer', opacity: operarioFilter === 'all' ? 0.5 : 1 }}
            >
              Ver todos
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
            {(cargaOperarios.items || []).slice(0, 8).map(item => {
              const nombre = item.operario
                ? `${item.operario.nombres || ''} ${item.operario.apellidoPaterno || ''}`.trim()
                : `Trabajador #${item.operarioId}`
              const active = operarioFilter === String(item.operarioId)
              return (
                <button
                  key={item.operarioId}
                  onClick={() => setOperarioFilter(String(item.operarioId))}
                  style={{
                    textAlign: 'left',
                    border: `1px solid ${active ? 'var(--green-600)' : 'var(--border)'}`,
                    background: active ? 'var(--green-50)' : 'var(--bg)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{nombre}</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'var(--green-700)', fontWeight: 700 }}>{item.total}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['Prioritaria', 'En proceso', 'Asignada', 'Pendiente', 'Control calidad'].map(estado => (
                      item.estados?.[estado] > 0
                        ? <Badge key={estado} tone={ESTADO_TONE[estado]}>{estado}: {item.estados[estado]}</Badge>
                        : null
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <ProductividadPanel
        items={productividad.items || []}
        totalOdts={productividad.totalOdts || 0}
        onSelectOperario={setOperarioFilter}
      />

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Tabs tabs={TALLER_TABS} active={tab} onChange={t => { setTab(t); setSearch('') }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <select
                value={estadoFilter}
                onChange={e => setEst(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}
              >
                <option value="all">Todos los estados</option>
                <option value="Prioritaria">Prioritarias</option>
                <option value="Pendiente">Pendientes</option>
                <option value="Asignada">Asignadas</option>
                <option value="En proceso">En proceso</option>
                <option value="Control calidad">Control calidad</option>
                <option value="Listo">Listas</option>
                <option value="Anulada">Anuladas</option>
              </select>
              <select
                value={operarioFilter}
                onChange={e => setOperarioFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', cursor: 'pointer', maxWidth: 190 }}
              >
                <option value="all">Todos los responsables</option>
                {(operariosMeta.items || []).map(t => (
                  <option key={t.id} value={String(t.id)}>
                    {`${t.nombres || ''} ${t.apellidoPaterno || ''}`.trim() || `Trabajador #${t.id}`}
                  </option>
                ))}
              </select>
              <select
                value={fechaCampo}
                onChange={e => setFechaCampo(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', cursor: 'pointer', maxWidth: 150 }}
              >
                <option value="createdAt">Fecha creada</option>
                <option value="fechaIngreso">Fecha ingreso</option>
                <option value="fechaInicio">Fecha inicio</option>
                <option value="fechaTermino">Fecha termino</option>
                <option value="plazo">Plazo</option>
              </select>
              <input
                type="date"
                value={fechaDesde}
                onChange={e => setFechaDesde(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff' }}
                title="Fecha desde"
              />
              <input
                type="date"
                value={fechaHasta}
                onChange={e => setFechaHasta(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff' }}
                title="Fecha hasta"
              />
              {(fechaDesde || fechaHasta) && (
                <button
                  type="button"
                  onClick={() => { setFechaDesde(''); setFechaHasta('') }}
                  style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, background: '#fff', color: 'var(--text-2)', cursor: 'pointer' }}
                  title="Limpiar fechas"
                >
                  <Icon name="x" size={13} />
                </button>
              )}
              <SearchBar placeholder="Buscar ODT, N interno, cliente..." value={search} onChange={setSearch} style={{ width: 260 }} />
            </div>
          </div>
        </div>


        <div style={{ padding: 16 }}>
          {viewMode === 'kanban' && kanbanResult.truncated && (
            <div style={{ marginBottom: 12, padding: '9px 12px', border: '1px solid var(--amber-bg)', borderRadius: 8, background: 'var(--amber-bg)', color: 'oklch(0.42 0.12 68)', fontSize: 12, fontWeight: 600 }}>
              Mostrando {kanbanOdts.length.toLocaleString('es-CL')} de {kanbanResult.total.toLocaleString('es-CL')} ODTs. Ajusta filtros para acotar.
            </div>
          )}
          {(viewMode === 'kanban' ? kanbanLoading : isLoading) ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>
              Cargando ODTs...
            </div>
          ) : (viewMode === 'kanban' ? kanbanOdts : odts).length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>
              <Icon name="info" size={24} color="var(--border)" />
              <p style={{ marginTop: 12 }}>Sin ODTs con ese criterio</p>
            </div>
          ) : viewMode === 'kanban' ? (
            <KanbanBoard
              odts={kanbanOdts}
              canWrite={canWriteTaller}
              pending={cambiarEstado.isPending}
              onSelect={setSelected}
              onEstadoChange={handleEstadoChange}
              onEstadoDrop={handleKanbanDrop}
            />
          ) : (
            <Table columns={visibleColumns} rows={odts} onRowClick={setSelected} columnPrefs={false} />
          )}
        </div>
        {viewMode === 'tabla' && <Pager page={page} pages={pages} total={total} limit={LIMIT} shown={odts.length} onChange={setPagerPage} disabled={isLoading} />}
      </div>

      {selected && (
        <OdtModal
          odt={selected}
          onClose={() => setSelected(null)}
          onEdit={() => { navigate('/taller/' + selected.id + '/editar'); setSelected(null) }}
          onEstadoChange={handleEstadoChange}
          onCloseOdt={handleCloseOdt}
          onAnularOdt={handleAnularOdt}
          canWrite={canWriteTaller}
          canDelete={canDeleteTaller}
          lifecyclePending={cerrarOdt.isPending || anularOdt.isPending || cambiarEstado.isPending}
        />
      )}
    </main>
  )
}
