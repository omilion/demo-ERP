import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { useState, useEffect, useRef, useMemo } from 'react'
import { DndContext, DragOverlay, PointerSensor, pointerWithin, rectIntersection, useSensor, useSensors } from '@dnd-kit/core'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Icon } from '../../components/shared'
import { useCrm, useCrmEjecutivas, useCrmPatch, useCrmOrdenLink, useCrmConvertirCliente, useCrmPendientesHoy, useCrmMetricas, useCrmCreate, useCrmAsignarPendientes, useCrmCatalogos, useCrmDetalle, useCrmTransicion, useCrmGestionCreate } from '../../api/crm'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth'

const ESTADOS = [
  { id: 'PENDIENTE_CLASIFICACION', label: 'Por clasificar', tone: 'gray', color: '#64748b', bg: '#f8fafc' },
  { id: 'COTIZACION_ENVIADA', label: 'Cotización enviada', tone: 'amber', color: '#f59e0b', bg: '#fffbeb' },
  { id: 'SEGUIMIENTO', label: 'Seguimiento', tone: 'blue', color: '#3b82f6', bg: '#eff6ff' },
  { id: 'VENTA_APROBADA', label: 'Venta aprobada', tone: 'purple', color: '#8b5cf6', bg: '#f5f3ff' },
  { id: 'CERRADO', label: 'Cerrado', tone: 'green', color: '#16a34a', bg: '#f0fdf4' },
]

function prioridadTone(p) {
  if (!p) return 'gray'
  const l = p.toLowerCase()
  if (l === 'alta') return 'red'
  if (l === 'media') return 'amber'
  return 'gray'
}

function normalizeEstado(value) {
  if (value === '3') return 'CERRADO'
  if (value === '2' || value === '1') return 'SEGUIMIENTO'
  if (value === '0') return 'PENDIENTE_CLASIFICACION'
  const estado = String(value || '').toUpperCase()
  return ESTADOS.some(e => e.id === estado) ? estado : 'PENDIENTE_CLASIFICACION'
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

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5 }}>
        {item.canalVenta && <Badge tone="gray" style={{ fontSize: 9 }}>{item.canalVenta}</Badge>}
        {item.tipoVenta && <Badge tone="gray" style={{ fontSize: 9 }}>{item.tipoVenta.replaceAll('_', ' ')}</Badge>}
        {item.semaforo && item.semaforo !== 'NORMAL' && <Badge tone={item.semaforo === 'AMARILLO' ? 'amber' : 'red'} style={{ fontSize: 9 }}>{item.semaforo} · {item.diasSinGestion}d</Badge>}
        {item.resultadoCierre && <Badge tone={item.resultadoCierre === 'GANADO' ? 'green' : item.resultadoCierre === 'PERDIDO' ? 'red' : 'gray'} style={{ fontSize: 9 }}>{item.resultadoCierre.replaceAll('_', ' ')}</Badge>}
      </div>

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
  const transicion = useCrmTransicion()
  const crearGestion = useCrmGestionCreate()
  const { data: catalogos } = useCrmCatalogos()
  const { data: detalle } = useCrmDetalle(item.id)

  const [form, setForm] = useState(() => ({
    estado:          normalizeEstado(item.etapaComercial || item.estado),
    prioridad:       item.prioridad || '',
    ejecutiva:       item.ejecutiva || '',
    vendedorId:      item.vendedorId ? String(item.vendedorId) : '',
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
    canalVenta:      item.canalVenta || 'OTRO',
    tipoVenta:       item.tipoVenta || 'OTRA',
    resultadoCierre: item.resultadoCierre === 'SIN_CLASIFICAR' ? '' : (item.resultadoCierre || ''),
    motivoPerdida:   item.motivoPerdida || '',
    motivoPerdidaDetalle: item.motivoPerdidaDetalle || '',
    confirmacionTipo: item.confirmacionTipo || '',
    confirmacionReferencia: item.confirmacionReferencia || '',
    motivoTransicion: '',
  }))
  const [gestion, setGestion] = useState({ tipo: 'LLAMADA', resultado: '', siguienteAccion: '', fechaProximo: '' })
  const patch = useCrmPatch()
  const { data: ordenLink } = useCrmOrdenLink(item.id, true)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function save() {
    const { estado, resultadoCierre, motivoPerdida, motivoPerdidaDetalle, confirmacionTipo, confirmacionReferencia, motivoTransicion, ...editable } = form
    const payload = { id: item.id, ...editable }
    if (user?.role === 'admin' && String(item.vendedorId || '') !== String(form.vendedorId || '')) {
      const motivo = await promptDialog({ title: 'Motivo de reasignacion', detail: 'La reasignacion quedara registrada en el historial CRM.', placeholder: 'Ej.: redistribucion de cartera' })
      if (!motivo || String(motivo).trim().length < 5) return toast.warning('Indica un motivo de reasignacion.')
      payload.motivoReasignacion = String(motivo).trim()
    }
    try {
      await patch.mutateAsync(payload)
      const previousStage = normalizeEstado(item.etapaComercial || item.estado)
      const classifyingHistoricalClose = estado === 'CERRADO' && resultadoCierre && resultadoCierre !== item.resultadoCierre
      if (estado !== previousStage || classifyingHistoricalClose) {
        await transicion.mutateAsync({
          id: item.id,
          etapa: estado,
          resultadoCierre: resultadoCierre || undefined,
          motivoPerdida: motivoPerdida || undefined,
          detalle: motivoPerdidaDetalle || undefined,
          confirmacionTipo: confirmacionTipo || undefined,
          confirmacionReferencia: confirmacionReferencia || undefined,
          motivo: motivoTransicion || undefined,
        })
      }
    } catch (error) {
      return toast.error(error.response?.data?.error || 'No se pudo guardar el CRM')
    }
    onSaved?.()
    onClose()
  }

  async function handleGestion() {
    try {
      await crearGestion.mutateAsync({ id: item.id, ...gestion })
      setGestion({ tipo: 'LLAMADA', resultado: '', siguienteAccion: '', fechaProximo: '' })
      toast.success('Gestión registrada')
      onSaved?.()
    } catch (error) {
      toast.error(error.response?.data?.error || 'No se pudo registrar la gestión')
    }
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

          <Field label="Canal de venta">
            <select value={form.canalVenta} onChange={set('canalVenta')} style={inputStyle}>
              {(catalogos?.canales || ['WEB', 'SALA', 'LICITACION', 'OTRO']).map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Tipo de venta">
            <select value={form.tipoVenta} onChange={set('tipoVenta')} style={inputStyle}>
              {(catalogos?.tiposVenta || ['COMPRA_AGIL', 'PUBLICA', 'PRIVADA', 'OTRA']).map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
            </select>
          </Field>

          {form.estado === 'VENTA_APROBADA' && <>
            <Field label="Confirmación">
              <select value={form.confirmacionTipo} onChange={set('confirmacionTipo')} style={inputStyle}>
                <option value="">Seleccionar…</option>
                {(catalogos?.confirmaciones || ['OC', 'PAGO', 'WEBPAY', 'OTRO']).map(value => <option key={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Referencia confirmación"><input value={form.confirmacionReferencia} onChange={set('confirmacionReferencia')} style={inputStyle} /></Field>
          </>}

          {form.estado === 'CERRADO' && <>
            <Field label="Resultado de cierre">
              <select value={form.resultadoCierre} onChange={set('resultadoCierre')} style={inputStyle}><option value="">Seleccionar…</option><option value="GANADO">GANADO</option><option value="PERDIDO">PERDIDO</option></select>
            </Field>
            {form.resultadoCierre === 'PERDIDO' && <Field label="Motivo de pérdida"><select value={form.motivoPerdida} onChange={set('motivoPerdida')} style={inputStyle}><option value="">Seleccionar…</option>{(catalogos?.motivosPerdida || []).map(value => <option key={value}>{value}</option>)}</select></Field>}
            {form.resultadoCierre === 'PERDIDO' && <Field label="Detalle de pérdida" full><textarea value={form.motivoPerdidaDetalle} onChange={set('motivoPerdidaDetalle')} rows={2} style={inputStyle} /></Field>}
          </>}

          {normalizeEstado(item.etapaComercial || item.estado) === 'CERRADO' && form.estado !== 'CERRADO' && <Field label="Motivo de reapertura" full><input value={form.motivoTransicion} onChange={set('motivoTransicion')} style={inputStyle} placeholder="Obligatorio, mínimo 5 caracteres" /></Field>}

          <Field label="Ejecutiva">
            {user?.role === 'admin' ? <select value={form.vendedorId} onChange={set('vendedorId')} style={inputStyle}><option value="">Sin asignar</option>{ejecutivas.filter(e => e.vendedorId).map(e => <option key={e.vendedorId} value={e.vendedorId}>{e.ejecutiva}</option>)}</select> : <input value={form.ejecutiva} style={inputStyle} disabled />}
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
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}><strong style={{ fontSize: 13 }}>Registrar gestión</strong></div>
          <Field label="Tipo"><select value={gestion.tipo} onChange={e => setGestion(g => ({ ...g, tipo: e.target.value }))} style={inputStyle}>{(catalogos?.tiposGestion || ['LLAMADA', 'CORREO', 'REUNION', 'VISITA', 'COTIZACION', 'NOTA', 'OTRO']).map(value => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Próximo contacto"><input type="date" value={gestion.fechaProximo} onChange={e => setGestion(g => ({ ...g, fechaProximo: e.target.value }))} style={inputStyle} /></Field>
          <Field label="Resultado" full><textarea value={gestion.resultado} onChange={e => setGestion(g => ({ ...g, resultado: e.target.value }))} rows={2} style={inputStyle} /></Field>
          <Field label="Siguiente acción" full><input value={gestion.siguienteAccion} onChange={e => setGestion(g => ({ ...g, siguienteAccion: e.target.value }))} style={inputStyle} /></Field>
          <div style={{ gridColumn: '1 / -1' }}><Btn variant="secondary" size="sm" onClick={handleGestion} disabled={crearGestion.isPending || !gestion.resultado.trim()}>Registrar gestión</Btn></div>

          {(detalle?.gestiones?.length > 0 || detalle?.estadosHistorial?.length > 0) && <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <strong style={{ fontSize: 13 }}>Historial reciente</strong>
            {[...(detalle?.gestiones || []).map(row => ({ fecha: row.realizadaAt, texto: `${row.tipo}: ${row.resultado}` })), ...(detalle?.estadosHistorial || []).map(row => ({ fecha: row.createdAt, texto: `${row.estadoAnterior || 'Inicio'} → ${row.estadoNuevo}${row.resultadoCierre ? ` (${row.resultadoCierre})` : ''}` }))].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 15).map((row, index) => <div key={`${row.fecha}-${index}`} style={{ fontSize: 11, padding: '5px 0', borderBottom: '1px solid var(--border)' }}><span style={{ color: 'var(--text-3)', marginRight: 8 }}>{new Date(row.fecha).toLocaleString('es-CL')}</span>{row.texto}</div>)}
          </div>}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {form.estado === 'CERRADO' && (
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
          <Btn variant="primary" size="sm" onClick={save} disabled={patch.isPending || transicion.isPending}>
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
      key: 'etapaComercial', label: 'Etapa',
      render: (v, row) => {
        const e = ESTADOS.find(s => s.id === normalizeEstado(v || row.estado))
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
function NuevoLeadModal({ onClose }) {
  const [form, setForm] = useState({ nombre: '', rsocial: '', rut: '', email: '', telefono: '', prioridad: 'Media', canalVenta: 'OTRO', tipoVenta: 'OTRA', comentarios: '' })
  const { data: catalogos } = useCrmCatalogos()
  const create = useCrmCreate()
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const fieldStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, font: 'inherit', fontSize: 12 }
  const save = async () => {
    try {
      const result = await create.mutateAsync(form)
      toast.success(`Lead asignado automaticamente a ${result.vendedor.nombre}.`)
      onClose()
    } catch (error) {
      toast.error(error?.response?.data?.error || 'No se pudo crear el lead.')
    }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'oklch(0 0 0 / .45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={event => event.stopPropagation()} style={{ width: 560, maxWidth: '100%', background: '#fff', borderRadius: 12, boxShadow: '0 16px 48px oklch(0 0 0 / .2)' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}><div><strong>Nuevo lead CRM</strong><div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>Asignacion round-robin, maximo 10 leads diarios por vendedor.</div></div><button onClick={onClose} style={{ border: 0, background: 'none' }}><Icon name="x" size={18} /></button></div>
        <div style={{ padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[['nombre', 'Nombre contacto'], ['rsocial', 'Razon social'], ['rut', 'RUT'], ['email', 'Correo'], ['telefono', 'Telefono']].map(([key, label]) => <label key={key} style={{ fontSize: 11, fontWeight: 600 }}>{label}<input type={key === 'email' ? 'email' : 'text'} value={form[key]} onChange={event => set(key, event.target.value)} style={{ ...fieldStyle, display: 'block', marginTop: 5 }} /></label>)}
            <label style={{ fontSize: 11, fontWeight: 600 }}>Prioridad<select value={form.prioridad} onChange={event => set('prioridad', event.target.value)} style={{ ...fieldStyle, display: 'block', marginTop: 5 }}><option>Alta</option><option>Media</option><option>Baja</option></select></label>
            <label style={{ fontSize: 11, fontWeight: 600 }}>Canal<select value={form.canalVenta} onChange={event => set('canalVenta', event.target.value)} style={{ ...fieldStyle, display: 'block', marginTop: 5 }}>{(catalogos?.canales || ['WEB', 'SALA', 'LICITACION', 'OTRO']).map(value => <option key={value}>{value}</option>)}</select></label>
            <label style={{ fontSize: 11, fontWeight: 600 }}>Tipo de venta<select value={form.tipoVenta} onChange={event => set('tipoVenta', event.target.value)} style={{ ...fieldStyle, display: 'block', marginTop: 5 }}>{(catalogos?.tiposVenta || ['COMPRA_AGIL', 'PUBLICA', 'PRIVADA', 'OTRA']).map(value => <option key={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
          </div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginTop: 12 }}>Comentarios<textarea value={form.comentarios} onChange={event => set('comentarios', event.target.value)} rows={3} style={{ ...fieldStyle, display: 'block', marginTop: 5, resize: 'vertical' }} /></label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={save} disabled={create.isPending}>{create.isPending ? 'Asignando...' : 'Crear y asignar'}</Btn></div>
        </div>
      </div>
    </div>
  )
}

export default function CrmPage() {
  const user = useAuthStore(s => s.user)
  const queryClient = useQueryClient()
  const [view, setView]               = useState('pipeline')
  const [ejecutiva, setEjecutiva]     = useState('')
  const [prioridad, setPrioridad]     = useState('')
  const [canalVenta, setCanalVenta]   = useState('')
  const [tipoVenta, setTipoVenta]     = useState('')
  const [semaforo, setSemaforo]       = useState('')
  const [search, setSearch]           = useState('')
  const [debounced, setDebounced]     = useState('')
  const [fechaDesde, setFechaDesde]   = useState('')
  const [fechaHasta, setFechaHasta]   = useState('')
  const [activeId, setActiveId]       = useState(null)
  const [overId, setOverId]           = useState(null)
  const [selected, setSelected]       = useState(null)
  const [creating, setCreating]       = useState(false)
  const [agendaOpen, setAgendaOpen]   = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    clearTimeout(ref.current)
    ref.current = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(ref.current)
  }, [search])

  const { data: ejecutivas = [] } = useCrmEjecutivas()
  const { data: pendientesHoyData } = useCrmPendientesHoy()
  const { data: metricas } = useCrmMetricas({ fechaDesde, fechaHasta })
  const { data: catalogos } = useCrmCatalogos()
  const transicion = useCrmTransicion()
  const assignPending = useCrmAsignarPendientes()

  const runAssignPending = async () => {
    const accepted = await confirmDialog({ title: 'Asignar leads pendientes', detail: 'Se repartiran equitativamente entre vendedores activos, respetando el maximo de 10 asignaciones por vendedor durante el dia.', confirmLabel: 'Asignar' })
    if (!accepted) return
    assignPending.mutate(undefined, {
      onSuccess: result => toast.success(`${result.total} leads asignados. ${result.pendientesSinAsignar} quedaron pendientes por capacidad.`),
      onError: error => toast.error(error?.response?.data?.error || 'No se pudieron asignar los pendientes.'),
    })
  }

  const params = {}
  if (ejecutiva)  params.ejecutiva  = ejecutiva
  if (prioridad)  params.prioridad  = prioridad
  if (canalVenta) params.canalVenta = canalVenta
  if (tipoVenta) params.tipoVenta = tipoVenta
  if (semaforo) params.semaforo = semaforo
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
      const col = map[normalizeEstado(i.etapaComercial || i.estado)]
      if (col) col.push(i)
    })
    return map
  }, [items])

  const activeItem = activeId != null ? items.find(i => String(i.id) === String(activeId)) : null

  const altaPrioridad = metricas?.prioridadAlta ?? items.filter(c => c.prioridad?.toLowerCase() === 'alta').length
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
    if (!item || normalizeEstado(item.etapaComercial || item.estado) === newEstado) return
    const currentStage = normalizeEstado(item.etapaComercial || item.estado)
    if (['VENTA_APROBADA', 'CERRADO'].includes(newEstado) || currentStage === 'CERRADO') {
      setSelected(item)
      toast.warning('Completa los datos obligatorios de la transición en el detalle.')
      return
    }

    const queryKey = ['crm', params]
    const previousData = queryClient.getQueryData(queryKey)

    queryClient.setQueryData(queryKey, old => {
      if (!old || !old.items) return old
      return {
        ...old,
        items: old.items.map(i =>
          String(i.id) === String(item.id)
            ? { ...i, etapaComercial: newEstado }
            : i
        )
      }
    })

    transicion.mutate(
      { id: item.id, etapa: newEstado },
      {
        onError: err => {
          queryClient.setQueryData(queryKey, previousData)
          toast.error(err.response?.data?.error || 'No se pudo cambiar el estado CRM')
        }
      }
    )
  }

  const agendaResumen = pendientesHoyData?.resumen || {
    total: (pendientesHoyData?.hoy?.length || 0) + (pendientesHoyData?.vencidas?.length || 0),
    hoy: pendientesHoyData?.hoy?.length || 0,
    vencidas: pendientesHoyData?.vencidas?.length || 0,
    sinAsignar: 0,
  }
  const totalPendientes = agendaResumen.total

  return (
    <main className="page page-wide">
      <PageHeader
        title="CRM — Pipeline de Ventas"
        subtitle={`${total.toLocaleString('es-CL')} registros de seguimiento`}
        breadcrumb={['Inicio', 'Ventas', 'CRM']}
        actions={<>
          <Btn variant="primary" icon="plus" size="sm" onClick={() => setCreating(true)}>Nuevo lead</Btn>
          {user?.role === 'admin' && <Btn variant="secondary" icon="users" size="sm" onClick={runAssignPending} disabled={assignPending.isPending}>Asignar pendientes</Btn>}
          <ViewToggle view={view} setView={setView} />
          <Btn variant="secondary" icon="download" size="sm">Exportar</Btn>
        </>}
      />
      {creating && <NuevoLeadModal onClose={() => setCreating(false)} />}

      <div className="kpi-strip">
        <KpiCard label="Total registros"   value={total.toLocaleString('es-CL')} icon="fileText"      sublabel="Seguimientos CRM" />
        <KpiCard label="Tasa de Cierre"     value={tasaCierreVal}                  icon="checkCircle"   tone="green" sublabel={`Ganadas / cierres clasificados · ${metricas?.porResultado?.SIN_CLASIFICAR || 0} cierres por clasificar`} />
        <KpiCard label="Antigüedad abiertos" value={tiempoPipeVal}                 icon="clock"   tone="blue"  sublabel="Promedio desde su creación" />
        <KpiCard label="Prioridad Alta"     value={altaPrioridad}                  icon="alertTriangle" tone="red" sublabel="Total según período" />
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Icon name="clock" size={16} style={{ color: 'var(--amber-600)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                {user?.role === 'admin' ? 'Pendientes del equipo' : 'Mis pendientes'}
              </span>
              <Badge tone="red">{agendaResumen.vencidas.toLocaleString('es-CL')} atrasados</Badge>
              <Badge tone="amber">{agendaResumen.hoy.toLocaleString('es-CL')} para hoy</Badge>
              {user?.role === 'admin' && agendaResumen.sinAsignar > 0 && (
                <Badge tone="gray">{agendaResumen.sinAsignar.toLocaleString('es-CL')} sin asignar</Badge>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAgendaOpen(open => !open)}
              style={{ border: '1px solid var(--border)', borderRadius: 6, background: '#fff', padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}
            >
              {agendaOpen ? 'Ocultar muestra' : 'Mostrar 10 más antiguos'}
            </button>
          </div>
          {agendaOpen && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
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
                {user?.role === 'admin' && <span style={{ fontSize: 10 }}>· {lead.vendedorId ? (lead.ejecutiva || 'Asignado') : 'Sin asignar'}</span>}
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
                {user?.role === 'admin' && <span style={{ fontSize: 10 }}>· {lead.vendedorId ? (lead.ejecutiva || 'Asignado') : 'Sin asignar'}</span>}
              </div>
            ))}
          </div>}
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
          <select value={canalVenta} onChange={e => setCanalVenta(e.target.value)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff' }}><option value="">Todos los canales</option>{(catalogos?.canales || []).map(value => <option key={value}>{value}</option>)}</select>
          <select value={tipoVenta} onChange={e => setTipoVenta(e.target.value)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff' }}><option value="">Todos los tipos</option>{(catalogos?.tiposVenta || []).map(value => <option key={value}>{value.replaceAll('_', ' ')}</option>)}</select>
          <select value={semaforo} onChange={e => setSemaforo(e.target.value)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff' }}><option value="">Todo semáforo</option><option>NORMAL</option><option>AMARILLO</option><option>ROJO</option><option>VENCIDO</option></select>
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
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ESTADOS.length}, minmax(260px, 1fr))`, gap: 12, alignItems: 'flex-start', paddingBottom: 16, overflowX: 'auto' }}>
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
