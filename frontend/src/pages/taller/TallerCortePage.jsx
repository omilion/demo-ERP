import { useMemo, useState } from 'react'
import { toast, promptDialog } from '../../store/notif'
import { Badge, Btn, Icon, KpiCard, PageHeader } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import { useOdtItemTallerEstado, useOdtOperarios } from '../../api/odts'
import { useRegistrarTallerCorteAvance, useSubirTallerCorteEvidencia, useTallerCorteConfig, useTallerCorteItems } from '../../api/tallerCorte'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const STATE = {
  sin_asignar: { label: 'Sin Asignar', tone: 'red' },
  pendiente: { label: 'Pendiente', tone: 'amber' },
  en_proceso: { label: 'En Proceso', tone: 'blue' },
  listo: { label: 'Listo', tone: 'green' },
  rechazado: { label: 'Rechazado', tone: 'red' },
  cancelado: { label: 'Cancelado', tone: 'gray' },
}

const FILTERS = [
  ['', 'Todos'],
  ['sin_asignar', 'Sin asignar'],
  ['pendiente', 'Pendientes'],
  ['en_proceso', 'En proceso'],
  ['listo', 'Listos'],
  ['rechazado', 'Rechazados'],
]

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
}

function formatMinutes(value) {
  if (value == null) return 'En curso'
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`
}

export default function TallerCortePage() {
  const [soloMias, setSoloMias] = useState(true)
  const [estado, setEstado] = useState('')
  const [activeItem, setActiveItem] = useState(null)
  const [avance, setAvance] = useState({ cantidadTerminada: '', observacion: '', fechaTrabajo: new Date().toISOString().slice(0, 16), file: null, data: '' })
  const { data: config } = useTallerCorteConfig()
  const user = useAuthStore(s => s.user)
  const canWrite = can(user, 'taller', 'write')
  const { data = { items: [] }, isLoading, isError, error } = useTallerCorteItems({ mine: soloMias ? 'true' : undefined, estado: estado || undefined })
  const { data: operariosData } = useOdtOperarios()
  const updateEstado = useOdtItemTallerEstado()
  const registrarAvance = useRegistrarTallerCorteAvance()
  const subirEvidencia = useSubirTallerCorteEvidencia()

  const items = useMemo(() => data.items || [], [data.items])
  const operarios = operariosData?.items || []
  const stats = useMemo(() => ({
    total: items.length,
    sinAsignar: items.filter(item => item.estadoVista === 'sin_asignar').length,
    enProceso: items.filter(item => item.estado === 'en_proceso').length,
    listos: items.filter(item => item.estado === 'listo').length,
  }), [items])

  function relationPayload(item, extra) {
    return {
      odtId: item.odt?.id,
      itemId: item.odtItem?.id,
      tallerItemId: item.id,
      ...extra,
    }
  }

  async function changeState(item, next) {
    const obs = next === 'rechazado'
      ? await promptDialog({ title: 'Motivo del rechazo', detail: 'Este motivo quedará en la trazabilidad del taller.' })
      : undefined
    if (next === 'rechazado' && !obs?.trim()) return
    updateEstado.mutate(relationPayload(item, { estado: next, obs: obs?.trim() }), {
      onError: e => toast.error(e.response?.data?.error || 'No se pudo actualizar el estado'),
    })
  }

  function assign(item, value) {
    updateEstado.mutate(relationPayload(item, { operarioResponsableId: value ? Number(value) : null }), {
      onError: e => toast.error(e.response?.data?.error || 'No se pudo asignar el usuario'),
    })
  }

  function openAdvance(item) {
    setActiveItem(item)
    setAvance({
      cantidadTerminada: '',
      observacion: '',
      fechaTrabajo: new Date().toISOString().slice(0, 16),
      file: null,
      data: '',
    })
  }

  async function saveAdvance() {
    if (!activeItem || !avance.cantidadTerminada) return
    try {
      await registrarAvance.mutateAsync({
        tallerItemId: activeItem.id,
        data: {
          cantidadTerminada: Number(avance.cantidadTerminada),
          observacion: avance.observacion,
          fechaTrabajo: avance.fechaTrabajo,
        },
      })
      if (avance.data) {
        await subirEvidencia.mutateAsync({
          tallerItemId: activeItem.id,
          data: avance.data,
          nombreArchivo: avance.file?.name,
        })
      }
      toast.success('Avance y evidencia registrados')
      setActiveItem(null)
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo registrar el avance')
    }
  }

  async function selectFile(file) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast.warning('Selecciona una imagen JPG, PNG o WEBP')
    if (file.size > 5 * 1024 * 1024) return toast.warning('La imagen no puede superar 5 MB')
    const data = await fileAsDataUrl(file)
    setAvance(current => ({ ...current, file, data }))
  }

  return (
    <main className="page page-wide">
      <PageHeader
        title="Taller de Corte"
        subtitle="Primer paso de producción: asignación, avance diario, evidencia y trazabilidad de la OT"
        breadcrumb={['Inicio', 'Taller', 'Taller de Corte']}
        actions={<Btn variant="secondary" size="sm" icon="refresh" onClick={() => window.location.reload()}>Actualizar</Btn>}
      />

      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: '#1e3a8a' }}>
        <strong>Flujo:</strong> notificar desde la venta → asignar usuario → iniciar corte → registrar cantidad terminada y foto → marcar listo para continuar a confección u otro taller.
        {config?.taller ? ` Taller activo #${config.taller.id}.` : ' Taller pendiente de configurar en la base de datos.'}
      </div>

      <div className="kpi-strip">
        <KpiCard label="Tareas visibles" value={stats.total} icon="tool" sublabel={soloMias ? 'Mi cola' : 'Todas'} />
        <KpiCard label="Sin asignar" value={stats.sinAsignar} icon="users" tone="red" />
        <KpiCard label="En proceso" value={stats.enProceso} icon="clock" tone="amber" />
        <KpiCard label="Listas" value={stats.listos} icon="check" tone="green" />
      </div>

      <section style={panelStyle}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[true, false].map(value => (
              <button key={String(value)} onClick={() => setSoloMias(value)} style={filterButton(soloMias === value)}>{value ? 'Mis tareas' : 'Cola completa'}</button>
            ))}
            {FILTERS.map(([value, label]) => (
              <button key={value || 'all'} onClick={() => setEstado(value)} style={filterButton(estado === value)}>{label}</button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Prioridad por fecha de compromiso de entrega</span>
        </div>
      </section>

      {isError && <div style={{ ...panelStyle, color: 'var(--red)' }}>{error?.response?.data?.error || 'No se pudo cargar Taller de Corte'}</div>}
      {isLoading ? <div style={{ padding: 48, textAlign: 'center' }}>Cargando tareas de corte...</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
          {items.map(item => <CorteCard key={item.id} item={item} operarios={operarios} canWrite={canWrite} onAssign={assign} onChangeState={changeState} onAdvance={openAdvance} />)}
          {!items.length && <div style={{ ...panelStyle, gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-3)' }}>No hay tareas para este filtro.</div>}
        </div>
      )}

      {activeItem && (
        <div style={modalBackdrop} onClick={() => setActiveItem(null)}>
          <div style={modalStyle} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div><strong>Registrar avance</strong><div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 3 }}>{activeItem.odtItem?.codigoInterno || activeItem.odtItem?.nombre} · OT #{activeItem.odt?.id}</div></div>
              <button onClick={() => setActiveItem(null)} style={closeButton}>×</button>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 10, fontSize: 12, marginBottom: 12 }}>Restante: <strong>{activeItem.progreso?.restante ?? activeItem.odtItem?.cantidad}</strong> de {activeItem.odtItem?.cantidad}</div>
            <FormField label="Cantidad terminada hoy" required><Input type="number" min="0.01" step="0.01" value={avance.cantidadTerminada} onChange={value => setAvance(current => ({ ...current, cantidadTerminada: value }))} /></FormField>
            <FormField label="Fecha y hora del trabajo" required><Input type="datetime-local" value={avance.fechaTrabajo} onChange={value => setAvance(current => ({ ...current, fechaTrabajo: value }))} /></FormField>
            <FormField label="Observación append-only"><Textarea rows={4} value={avance.observacion} onChange={value => setAvance(current => ({ ...current, observacion: value }))} placeholder="Medidas, variación de receta, incidencia o control realizado" /></FormField>
            <FormField label="Evidencia fotográfica" hint="JPG, PNG o WEBP. Máximo 5 MB.">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => selectFile(event.target.files?.[0])} />
              {avance.file && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{avance.file.name}</div>}
            </FormField>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <Btn variant="secondary" size="sm" onClick={() => setActiveItem(null)}>Cancelar</Btn>
              <Btn variant="primary" size="sm" icon="upload" onClick={saveAdvance} disabled={!avance.cantidadTerminada || registrarAvance.isPending || subirEvidencia.isPending}>{registrarAvance.isPending || subirEvidencia.isPending ? 'Guardando...' : 'Guardar avance'}</Btn>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function CorteCard({ item, operarios, canWrite, onAssign, onChangeState, onAdvance }) {
  const status = STATE[item.estadoVista] || STATE.pendiente
  const progress = item.progreso || { porcentaje: 0, totalTerminado: 0, objetivo: item.odtItem?.cantidad || 0, restante: item.odtItem?.cantidad || 0, registros: [] }
  const sale = item.orden
  const client = item.cliente
  const image = item.producto?.fotoUrlGrande || item.producto?.fotoUrl
  return (
    <article style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div><div style={mono}>OT #{item.odt?.id || '-'}{sale?.nInterno ? ` · Venta #${sale.nInterno}` : ''}</div><div style={{ fontWeight: 700, marginTop: 4 }}>{item.odtItem?.nombre || item.producto?.nombre || 'Producto'}</div><div style={{ ...mono, marginTop: 3 }}>{item.odtItem?.codigoInterno || item.producto?.codigoInterno || '-'}</div></div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {image && <img src={image} alt="Producto de la OT" style={{ width: '100%', height: 120, objectFit: 'contain', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }} />}
      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
        <div><strong>Cantidad:</strong> {progress.objetivo} · <strong>Terminado:</strong> {progress.totalTerminado} · <strong>Restante:</strong> {progress.restante}</div>
        {client && <div style={{ marginTop: 3 }}><strong>Cliente:</strong> {client.razonSocial || client.nombre}</div>}
        {sale?.licitacion && <div style={{ marginTop: 3 }}><strong>Licitación:</strong> <span style={mono}>{sale.licitacion}</span></div>}
        {item.odtItem?.obs && <div style={{ marginTop: 7, background: 'var(--bg)', padding: 8, borderRadius: 6 }}><strong>Detalle / receta:</strong> {item.odtItem.obs}</div>}
      </div>
      <div style={{ height: 8, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}><div style={{ width: '100%', height: '100%', background: progress.porcentaje >= 100 ? 'var(--green-600)' : 'var(--blue)', transformOrigin: 'left center', transform: `scaleX(${Math.max(0, Math.min(100, Number(progress.porcentaje) || 0)) / 100})`, transition: 'transform .2s ease-out' }} /></div>
      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{progress.porcentaje}% de avance · {item.tiempoRealMinutos == null ? 'Tiempo real en curso' : `Tiempo real ${formatMinutes(item.tiempoRealMinutos)}`}</div>
      <FormField label="Usuario responsable"><Select value={item.operarioResponsableId || ''} onChange={value => onAssign(item, value)} disabled={!canWrite} options={[{ value: '', label: 'Sin asignar' }, ...operarios.map(user => ({ value: String(user.usuarioId || ''), label: `${user.nombres} ${user.apellidoPaterno || ''}${user.usuarioId ? '' : ' (sin cuenta)'}` }))]} /></FormField>
      {progress.registros?.slice(0, 3).map(registro => <div key={registro.id} style={{ fontSize: 11, color: 'var(--text-3)', borderTop: '1px solid var(--border)', paddingTop: 5 }}><strong>{registro.cantidadTerminada}</strong> terminadas · {formatDate(registro.fechaTrabajo)} · {registro.usuario}{registro.observacion ? ` · ${registro.observacion}` : ''}</div>)}
      {item.evidencias?.slice(0, 3).map(evidencia => <a key={evidencia.id} href={evidencia.archivoUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--blue)' }}><Icon name="upload" size={11} /> {evidencia.nombreArchivo}</a>)}
      <div style={{ display: 'flex', gap: 7, marginTop: 'auto' }}>
        {canWrite && item.estado === 'pendiente' && <Btn variant="secondary" size="sm" onClick={() => onChangeState(item, 'en_proceso')}>Iniciar</Btn>}
        {canWrite && item.estado === 'en_proceso' && <Btn variant="primary" size="sm" onClick={() => onAdvance(item)}>Registrar avance</Btn>}
        {canWrite && item.estado === 'en_proceso' && <Btn variant="secondary" size="sm" onClick={() => onChangeState(item, 'listo')}>Marcar listo</Btn>}
        {canWrite && ['pendiente', 'en_proceso', 'pausado'].includes(item.estado) && <Btn variant="ghost" size="sm" onClick={() => onChangeState(item, 'rechazado')}>Rechazar</Btn>}
        {canWrite && item.estado === 'rechazado' && <Btn variant="secondary" size="sm" onClick={() => onChangeState(item, 'en_proceso')}>Reprocesar</Btn>}
        {item.estado === 'listo' && <span style={{ fontSize: 12, color: 'var(--green-700)', fontWeight: 700 }}>Listo para el siguiente taller</span>}
      </div>
    </article>
  )
}

const panelStyle = { background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 14, boxShadow: 'var(--shadow-sm)' }
const mono = { fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }
const filterButton = active => ({ border: `1px solid ${active ? 'var(--green-700)' : 'var(--border)'}`, background: active ? 'var(--green-50)' : '#fff', color: active ? 'var(--green-800)' : 'var(--text-2)', borderRadius: 7, padding: '7px 10px', fontSize: 11, fontWeight: active ? 700 : 500, cursor: 'pointer' })
const modalBackdrop = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const modalStyle = { background: '#fff', borderRadius: 12, width: 'min(620px, 100%)', maxHeight: '92vh', overflowY: 'auto', padding: 20 }
const closeButton = { border: 0, background: 'transparent', fontSize: 24, lineHeight: 1, cursor: 'pointer', color: 'var(--text-3)' }
