import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, Textarea, useForm } from '../../components/forms/index'
import {
  useOdt,
  useCreateOdt,
  useUpdateOdt,
  useOdtOperarios,
  useCentrosCosto,
  useCreateCentroCosto,
  useOdtItemTallerEstado,
  useOdtTallerEstadoMasivo,
  useCreateOdtConsumo,
  useOdtMateriales,
  useDeleteOdtMaterial,
  useOdtEstado,
  useAddBitacora,
  useDeleteBitacora,
  useAnularOdt,
  useCerrarOdt
} from '../../api/odts'
import { useProductos } from '../../api/productos'
import { useBodegaTallerAutocomplete, useBodegaTallerLotes } from '../../api/bodegaTaller'
import { useTelas } from '../../api/telas'
import { useHistorialMateriales } from '../../api/historialMateriales'
import { useAuthStore } from '../../store/auth'
import { can, ventaPath } from '../../utils/permissions'
import { Icon, Badge, Btn } from '../../components/shared'

const ESTADOS_ODT = [
  { value: 'Pendiente', label: 'Pendiente' },
  { value: 'En proceso', label: 'En proceso' },
  { value: 'Terminada', label: 'Listo' },
]

function normalizeOdtFormEstado(estado) {
  if (['Terminada', 'Entregada'].includes(estado)) return 'Terminada'
  if (estado === 'En proceso') return 'En proceso'
  return 'Pendiente'
}

const getErrorMessage = err => err?.response?.data?.error || err?.message || 'No se pudo completar la accion'

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

function odtNumeroOperativo(odt) {
  return odt?.nInterno || odt?.orden?.nInterno || odt?.id
}

function OdtCosteoPanel({ costeo }) {
  if (!costeo) return null
  const alertas = []
  if (costeo.alertas?.materialesSinPrecio) alertas.push(`${costeo.alertas.materialesSinPrecio} material(es) sin precio`)
  if (costeo.alertas?.manoObraSinSueldo) alertas.push('Responsable sin sueldo liquido')
  if (costeo.alertas?.sinHorasProduccion) alertas.push('Sin horas de produccion')

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-muted)' }}>
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
        onError: err => toast.error(getErrorMessage(err)),
      }
    )
  }

  const handleDelete = async entryId => {
    if (!await confirmDialog({ title: 'Confirmar', detail: '¿Eliminar esta entrada de bitacora? Esta accion no se puede deshacer.', tone: 'danger' })) return
    delBitacora.mutate(
      { odtId, entryId },
      { onError: err => toast.error(getErrorMessage(err)) }
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
            <div key={e.id} style={{ background: 'var(--bg-muted)', borderRadius: 8, padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
                type="button"
                onClick={() => handleDelete(e.id)}
                style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', padding: '2px 4px', marginLeft: 8, flexShrink: 0, cursor: 'pointer' }}
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
          type="button"
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

export default function TallerFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = !!id
  const ordenIdParam = !isEdit ? (searchParams.get('ordenId') || '') : ''

  const isUrlEdit = location.pathname.endsWith('/editar')
  const [isEditMode, setIsEditMode] = useState(!id || isUrlEdit)

  const { data: found } = useOdt(isEdit ? Number(id) : null)
  const { data: operariosMeta = { items: [] } } = useOdtOperarios()
  const { data: centrosCostoMeta = { items: [] } } = useCentrosCosto()
  const createOdt = useCreateOdt()
  const updateOdt = useUpdateOdt()
  const createCentroCosto = useCreateCentroCosto()

  const cambiarEstado = useOdtEstado()
  const cerrarOdt = useCerrarOdt()
  const anularOdt = useAnularOdt()

  const user = useAuthStore(s => s.user)
  const canWriteTaller = can(user, 'taller', 'write')
  const canDeleteTaller = can(user, 'taller', 'delete')

  const { data, set, errors, validate } = useForm({
    tipo: 'Espumas', clienteNombre: '', descripcion: '',
    obsGeneral: '', estado: 'Pendiente', prioridad: 'normal', plazo: '', fechaIngreso: '',
    fechaInicio: '', fechaTermino: '', ordenId: ordenIdParam, operarioId: '', centroCostoId: '',
  })

  const initializedRef = useRef(false)
  useEffect(() => {
    if (found && !initializedRef.current) {
      set('tipo', found.tipo || 'Espumas')
      set('clienteNombre', found.clienteNombre ?? '')
      set('descripcion', found.descripcion ?? '')
      set('obsGeneral', found.obsGeneral ?? '')
      set('estado', normalizeOdtFormEstado(found.estado))
      set('prioridad', found.prioridad || 'normal')
      set('plazo', found.plazo ? new Date(found.plazo).toISOString().slice(0, 10) : '')
      set('fechaIngreso', found.fechaIngreso ? new Date(found.fechaIngreso).toISOString().slice(0, 10) : '')
      set('fechaInicio', found.fechaInicio ? new Date(found.fechaInicio).toISOString().slice(0, 10) : '')
      set('fechaTermino', found.fechaTermino ? new Date(found.fechaTermino).toISOString().slice(0, 10) : '')
      set('ordenId', found.ordenId ? String(found.ordenId) : '')
      set('centroCostoId', found.centroCostoId ? String(found.centroCostoId) : '')
      set('operarioId', found.operarioId ? String(found.operarioId) : '')
      initializedRef.current = true
    }
  }, [found, set])

  useEffect(() => {
    // If the id changes or URL mode changes, update edit mode
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsEditMode(!id || isUrlEdit)
    initializedRef.current = false
  }, [id, isUrlEdit])

  const operarioOptions = [
    { value: '', label: 'Sin responsable asignado' },
    ...(operariosMeta.items || []).map(t => ({
      value: String(t.id),
      label: `${t.nombres} ${t.apellidoPaterno || ''}${t.cargo ? ` - ${t.cargo}` : ''}`.trim(),
    })),
  ]

  const handleSave = () => {
    if (!validate({ descripcion: { required: true }, ...(data.ordenId ? {} : { centroCostoId: { required: true } }) })) return
    const payload = {
      tipo: data.tipo,
      clienteNombre: data.clienteNombre,
      descripcion: data.descripcion,
      obsGeneral: data.obsGeneral || null,
      estado: data.estado,
      prioridad: data.prioridad,
      ordenId: data.ordenId ? Number(data.ordenId) : null,
      centroCostoId: data.centroCostoId ? Number(data.centroCostoId) : null,
      operarioId: data.operarioId ? Number(data.operarioId) : null,
      plazo: data.plazo ? new Date(data.plazo).toISOString() : undefined,
      fechaIngreso: data.fechaIngreso ? new Date(data.fechaIngreso).toISOString() : null,
      fechaInicio: data.fechaInicio ? new Date(data.fechaInicio).toISOString() : null,
      fechaTermino: data.fechaTermino ? new Date(data.fechaTermino).toISOString() : null,
    }
    if (isEdit) {
      updateOdt.mutate({ id: Number(id), data: payload }, {
        onSuccess: () => {
          initializedRef.current = false
          setIsEditMode(false)
          navigate(`/taller/${id}`)
        },
        onError: () => toast.error('Error al guardar la OT'),
      })
    } else {
      createOdt.mutate(payload, {
        onSuccess: () => navigate('/taller'),
        onError: () => toast.error('Error al crear la OT'),
      })
    }
  }

  const handleCancelEdit = () => {
    if (id) {
      set('tipo', found.tipo || 'Espumas')
      set('clienteNombre', found.clienteNombre ?? '')
      set('descripcion', found.descripcion ?? '')
      set('obsGeneral', found.obsGeneral ?? '')
      set('estado', normalizeOdtFormEstado(found.estado))
      set('prioridad', found.prioridad || 'normal')
      set('plazo', found.plazo ? new Date(found.plazo).toISOString().slice(0, 10) : '')
      set('fechaIngreso', found.fechaIngreso ? new Date(found.fechaIngreso).toISOString().slice(0, 10) : '')
      set('fechaInicio', found.fechaInicio ? new Date(found.fechaInicio).toISOString().slice(0, 10) : '')
      set('fechaTermino', found.fechaTermino ? new Date(found.fechaTermino).toISOString().slice(0, 10) : '')
      set('ordenId', found.ordenId ? String(found.ordenId) : '')
      set('centroCostoId', found.centroCostoId ? String(found.centroCostoId) : '')
      set('operarioId', found.operarioId ? String(found.operarioId) : '')
      setIsEditMode(false)
      navigate(`/taller/${id}`)
    } else {
      navigate('/taller')
    }
  }

  async function handleCloseOdt(estado) {
    const isReopen = estado === 'Pendiente'
    const action = isReopen ? 'reabrir' : 'cerrar'
    const odtNumero = odtNumeroOperativo(found)
    const detail = isReopen
      ? 'La OT volvera a Pendiente y quedara disponible para trabajo operativo.'
      : 'La OT pasara a Terminada y se registrara fecha de termino si aun no existe.'
    if (!await confirmDialog({ title: 'Confirmar', detail: `¿Confirmas ${action} la OT #${odtNumero}?\n\n${detail}` })) return
    if (isReopen) {
      cambiarEstado.mutate(
        { id: Number(id), estado },
        {
          onError: err => toast.error(getErrorMessage(err)),
        }
      )
      return
    }
    cerrarOdt.mutate(
      { id: Number(id), estado },
      {
        onError: err => toast.error(getErrorMessage(err)),
      }
    )
  }

  async function handleAnularOdt() {
    const odtNumero = odtNumeroOperativo(found)
    const razon = await promptDialog({ title: `Motivo para anular la OT #${odtNumero}` })
    if (razon == null) return
    if (!razon.trim()) { toast.warning('Debes indicar un motivo para anular la OT.'); return }
    if (!await confirmDialog({ title: 'Confirmar', detail: `¿Confirmas anular la OT #${odtNumero}?\n\nEsta accion la sacara del flujo operativo y conservara trazabilidad en bitacora.`, tone: 'danger' })) return
    anularOdt.mutate(
      { id: Number(id), razon: razon.trim() },
      {
        onSuccess: () => navigate('/taller'),
        onError: err => toast.error(getErrorMessage(err)),
      }
    )
  }

  // Lifecycle Transitions calculation
  const estadoActions = [
    { from: ['Pendiente', 'Asignada'], to: 'En proceso', label: 'Iniciar trabajo', tone: 'blue' },
    { from: ['Prioritaria'], to: 'En proceso', label: 'Volver a En proceso', tone: 'blue' },
    { from: ['En proceso', 'Prioritaria'], to: 'Control calidad', label: 'Dejar pendiente', tone: 'amber' },
    { from: ['Pendiente', 'Asignada', 'En proceso', 'Prioritaria', 'Control calidad'], to: 'Terminada', label: 'Marcar lista', tone: 'green' },
    { from: ['Terminada'], to: 'Pendiente', label: 'Reabrir OT', tone: 'amber' },
    { from: ['Entregada'], to: 'Terminada', label: 'Reabrir entrega', tone: 'amber' },
  ]
  const available = found ? estadoActions.filter(a => a.from.includes(found.estado)) : []
  const canAnularOdt = found ? !['Anulada'].includes(found.estado) : false
  const lifecyclePending = cambiarEstado.isPending || cerrarOdt.isPending || anularOdt.isPending

  const orden = found?.orden ?? null
  const bitacora = found?.bitacora ?? []

  // Action layouts
  const editActions = (
    <>
      <Btn variant="ghost" onClick={handleCancelEdit}>Cancelar</Btn>
      <Btn variant="primary" icon={updateOdt.isPending || createOdt.isPending ? 'refreshCw' : 'check'} onClick={handleSave} disabled={updateOdt.isPending || createOdt.isPending}>
        {updateOdt.isPending || createOdt.isPending ? 'Guardando…' : 'Guardar'}
      </Btn>
    </>
  )

  const viewActions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Btn variant="ghost" onClick={() => navigate('/taller')}>Volver</Btn>
      <Btn variant="ghost" icon="printer" onClick={() => window.print()}>Imprimir</Btn>
      {canWriteTaller && <Btn variant="primary" icon="edit" onClick={() => { setIsEditMode(true); navigate(`/taller/${id}/editar`) }}>Editar</Btn>}
      {canWriteTaller && available.map(a => (
        <Btn
          key={a.to}
          variant="secondary"
          onClick={() => handleCloseOdt(a.to)}
          disabled={lifecyclePending}
          style={{
            background: a.tone === 'green' ? 'var(--green-600)' : a.tone === 'blue' ? 'var(--blue)' : 'var(--amber)',
            color: '#fff',
            borderColor: 'transparent'
          }}
        >
          {a.label}
        </Btn>
      ))}
      {canDeleteTaller && canAnularOdt && (
        <Btn variant="ghost" icon="xCircle" onClick={handleAnularOdt} disabled={lifecyclePending} style={{ color: 'var(--red)' }}>
          Anular OT
        </Btn>
      )}
    </div>
  )

  return (
    <FormPage
      title={isEdit ? (isEditMode ? 'Editar OT' : 'Detalle OT') : 'Nueva OT'}
      subtitle={isEdit ? (isEditMode ? `Editando OT #${id}` : `Visualizando OT #${id}`) : 'Crear orden de trabajo'}
      breadcrumb={['Inicio', 'Taller', isEdit ? 'Ver/Editar OT' : 'Nueva OT']}
      onSave={handleSave}
      saving={createOdt.isPending || updateOdt.isPending}
      headerActions={isEditMode ? editActions : viewActions}
      footerActions={isEditMode ? editActions : viewActions}
    >
      {isEdit && orden && (
        <div style={{ background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--green-700)', marginBottom: 3 }}>Venta origen</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
              #{orden.nInterno || orden.id} - {orden.cliente?.nombre || 'Sin cliente'}
            </div>
            {orden.cliente?.rut && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>{orden.cliente.rut}</div>}
          </div>
          <Btn variant="secondary" onClick={() => navigate(ventaPath(orden.id, user))} style={{ background: '#fff' }}>
            Ver Venta
          </Btn>
        </div>
      )}

      <FormDivider label="Resumen OT" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Orden vinculada (opcional)" error={errors.ordenId}>
          <Input type="number" value={data.ordenId} onChange={v => set('ordenId', v)} placeholder="ID de venta/orden; vacío para trabajo interno" error={errors.ordenId} disabled={!isEditMode} />
        </FormField>
        <FormField label="Centro de costo" required={!data.ordenId} error={errors.centroCostoId}>
          <Select value={data.centroCostoId} onChange={v => set('centroCostoId', v)} options={[{ value: '', label: data.ordenId ? 'Sin imputación' : 'Selecciona centro de costo' }, ...(centrosCostoMeta.items || []).map(c => ({ value: String(c.id), label: c.codigo === c.nombre ? c.nombre : `${c.codigo} — ${c.nombre}` }))]} disabled={!isEditMode} />
          {isEditMode && <Btn size="sm" variant="ghost" onClick={async () => { const codigo = await promptDialog({ title: 'Nuevo centro de costo', detail: 'Código corto y único.' }); if (!codigo?.trim()) return; const nombre = await promptDialog({ title: 'Nombre del centro de costo' }); if (!nombre?.trim()) return; createCentroCosto.mutate({ codigo: codigo.trim(), nombre: nombre.trim() }, { onSuccess: centro => set('centroCostoId', String(centro.id)), onError: err => toast.error(getErrorMessage(err)) }) }}>Agregar centro</Btn>}
        </FormField>
        <FormField label="Tipo de Trabajo">
              <Select value={data.tipo} onChange={v => set('tipo', v)} options={['Corte', 'Espumas', 'Confecciones', 'Madera', 'Externo']} disabled={!isEditMode} />
        </FormField>
        <FormField label="Estado">
          <Select value={data.estado} onChange={v => set('estado', v)} options={ESTADOS_ODT} disabled={!isEditMode} />
        </FormField>
        <FormField label="Prioridad">
          <Select value={data.prioridad} onChange={v => set('prioridad', v)} options={[
            { value: 'normal', label: 'Normal' },
            { value: 'alta', label: 'Alta' },
            { value: 'urgente', label: 'Urgente' },
          ]} disabled={!isEditMode} />
        </FormField>
        <FormField label="Responsable operativo">
          <Select value={data.operarioId} onChange={v => set('operarioId', v)} options={operarioOptions} disabled={!isEditMode} />
        </FormField>
      </div>

      <FormDivider label="Cliente / venta origen" />
      <FormField label="Cliente">
        <Input value={data.clienteNombre} onChange={v => set('clienteNombre', v)} placeholder="Nombre del cliente" disabled={!isEditMode} />
      </FormField>

      <FormDivider label="Trabajo solicitado" />
      <FormField label="Descripción del trabajo" required error={errors.descripcion}>
        <Textarea value={data.descripcion} onChange={v => set('descripcion', v)} placeholder="Detalle del trabajo a realizar" rows={3} error={errors.descripcion} disabled={!isEditMode} />
      </FormField>
      <FormField label="Obs OT / observacion general">
        <Textarea value={data.obsGeneral} onChange={v => set('obsGeneral', v)} placeholder="Observaciones internas de produccion" rows={3} disabled={!isEditMode} />
      </FormField>

      <FormDivider label="Produccion y fechas" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <FormField label="Fecha ingreso">
          <Input type="date" value={data.fechaIngreso} onChange={v => set('fechaIngreso', v)} disabled={!isEditMode} />
        </FormField>
        <FormField label="Fecha inicio">
          <Input type="date" value={data.fechaInicio} onChange={v => set('fechaInicio', v)} disabled={!isEditMode} />
        </FormField>
        <FormField label="Fecha termino">
          <Input type="date" value={data.fechaTermino} onChange={v => set('fechaTermino', v)} disabled={!isEditMode} />
        </FormField>
        <FormField label="Plazo de entrega">
          <Input type="date" value={data.plazo} onChange={v => set('plazo', v)} disabled={!isEditMode} />
        </FormField>
      </div>

      {isEdit && found && (
        <>
          <FormDivider label="Tiempos y Métricas de Producción" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
            {[
              ['Creada', new Date(found.createdAt).toLocaleDateString('es-CL')],
              ['Fecha Ingreso', found.fechaIngreso ? new Date(found.fechaIngreso).toLocaleDateString('es-CL') : '-'],
              ['Plazo de Entrega', found.plazo ? new Date(found.plazo).toLocaleDateString('es-CL') : '-'],
              ['Fecha Inicio', found.fechaInicio ? new Date(found.fechaInicio).toLocaleDateString('es-CL') : '-'],
              ['Fecha Término', found.fechaTermino ? new Date(found.fechaTermino).toLocaleDateString('es-CL') : '-'],
              ['Tiempo Producción', formatDuration(found.tiempos?.produccionHoras)],
              ['Ciclo', formatDuration(found.tiempos?.cicloHoras)],
              ['Atraso', formatAtraso(found.tiempos)],
            ].map(([l, v], i) => (
              <div key={i} style={{ background: 'var(--bg-muted)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>{l}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
              </div>
            ))}
          </div>
          <OdtCosteoPanel costeo={found.costeo} />
        </>
      )}

      {isEdit && <OdtConsumosSection odtId={Number(id)} />}

      {isEdit && found?.items?.length > 0 && (
        <>
          <FormDivider label={`Items en proceso (${found.items.length})`} />
          <OdtItemsTable odtId={Number(id)} items={found.items} />
        </>
      )}

      {isEdit && found && (
        <>
          <FormDivider label="Bitácora" />
          <BitacoraSection odtId={Number(id)} entries={bitacora} canWrite={canWriteTaller} canDelete={canDeleteTaller} />
        </>
      )}
    </FormPage>
  )
}

const CONSUMO_TIPOS = [
  { value: 'producto', label: 'Producto' },
  { value: 'material_taller', label: 'Material taller' },
  { value: 'tela', label: 'Tela' },
]

const CONSUMO_ITEM_KEY = {
  producto: 'productoId',
  material_taller: 'bodegaTallerId',
  tela: 'telaId',
}

function parseCantidad(value) {
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function fmtCantidad(value) {
  const n = Number(value || 0)
  return n.toLocaleString('es-CL', { maximumFractionDigits: 2 })
}

function consumoCodigo(tipo, item) {
  if (!item) return ''
  return tipo === 'tela' ? item.codigo : item.codigoInterno
}

function consumoNombre(tipo, item) {
  if (!item) return ''
  if (tipo === 'tela') return [item.tipo, item.nombre].filter(Boolean).join(' / ') || item.codigo
  return item.nombre || item.codigoInterno
}

function consumoUnidad(tipo, item) {
  if (!item) return ''
  return item.unidadMedida || (tipo === 'tela' ? 'm' : '')
}

function consumoLabel(tipo, item) {
  const codigo = consumoCodigo(tipo, item)
  const nombre = consumoNombre(tipo, item)
  const unidad = consumoUnidad(tipo, item)
  const stock = item?.stock != null ? ` stock ${fmtCantidad(item.stock)}${unidad ? ` ${unidad}` : ''}` : ''
  return `${[codigo, nombre].filter(Boolean).join(' - ')}${stock ? ` (${stock})` : ''}`.trim()
}

function OdtConsumosSection({ odtId }) {
  const user = useAuthStore(s => s.user)
  const canDelete = can(user, 'taller', 'delete')
  const [tipo, setTipo] = useState('producto')
  const [search, setSearch] = useState('')
  const [itemId, setItemId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [taller, setTaller] = useState('')
  const [motivo, setMotivo] = useState('')
  const [loteId, setLoteId] = useState('')
  const [calidad, setCalidad] = useState('aprobado')
  const [mermaCantidad, setMermaCantidad] = useState('')
  const [mermaMotivo, setMermaMotivo] = useState('')
  const createConsumo = useCreateOdtConsumo()
  const deleteMaterial = useDeleteOdtMaterial()

  const trimmedSearch = search.trim()
  const productoParams = tipo === 'producto' && trimmedSearch ? { search: trimmedSearch } : {}
  const telaParams = tipo === 'tela' && trimmedSearch ? { search: trimmedSearch } : {}

  const { data: productosResult = { items: [] }, isLoading: loadingProductos } = useProductos(productoParams)
  const { data: bodegaItems = [], isLoading: loadingBodega } = useBodegaTallerAutocomplete(
    trimmedSearch,
    tipo === 'material_taller',
  )
  const selectedBodegaId = tipo === 'material_taller' ? itemId : null
  const { data: lotesData = { items: [] }, isLoading: loadingLotes } = useBodegaTallerLotes(selectedBodegaId)
  const { data: telasResult = { items: [] }, isLoading: loadingTelas } = useTelas(telaParams)
  const { data: historial = { items: [] }, isLoading: loadingHistorial } = useHistorialMateriales({ odtId })
  const { data: materiales = { items: [] }, isLoading: loadingMateriales } = useOdtMateriales(odtId)

  const source = {
    producto: { items: productosResult.items || [], loading: loadingProductos },
    material_taller: { items: bodegaItems || [], loading: loadingBodega },
    tela: { items: telasResult.items || [], loading: loadingTelas },
  }[tipo]

  const items = source.items
  const selectedItem = items.find(item => String(item.id) === String(itemId))
  const requiereLote = tipo === 'material_taller' && selectedItem?.densidadKgM3 != null
  const lotesAprobados = (lotesData.items || []).filter(lote => lote.estadoCalidad === 'aprobado' && Number(lote.cantidadDisponible) > 0)
  const loteOptions = [
    { value: '', label: loadingLotes ? 'Cargando lotes...' : lotesAprobados.length ? 'Seleccione lote aprobado' : 'Sin lotes aprobados disponibles' },
    ...lotesAprobados.map(lote => ({ value: String(lote.id), label: `${lote.codigo} · disponible ${Number(lote.cantidadDisponible).toFixed(2)}` })),
  ]
  const itemOptions = [
    { value: '', label: source.loading ? 'Cargando...' : items.length ? 'Seleccione item' : 'Sin resultados' },
    ...items.map(item => ({ value: String(item.id), label: consumoLabel(tipo, item) })),
  ]

  const submitConsumo = () => {
    const parsedCantidad = parseCantidad(cantidad)
    if (!selectedItem) return toast.warning('Seleccione un item')
    if (parsedCantidad <= 0) return toast.warning('Ingrese una cantidad mayor a cero')
    if (requiereLote && !loteId) return toast.warning('Seleccione un lote aprobado para la espuma')

    const numericItemId = Number(selectedItem.id)
    const payload = {
      tipo,
      id: numericItemId,
      itemId: numericItemId,
      [CONSUMO_ITEM_KEY[tipo]]: numericItemId,
      cantidad: parsedCantidad,
      taller: taller.trim() || undefined,
      motivo: motivo.trim() || undefined,
      loteId: loteId ? Number(loteId) : undefined,
      calidad,
      mermaCantidad: mermaCantidad || undefined,
      mermaMotivo: mermaMotivo.trim() || undefined,
      codigoInterno: consumoCodigo(tipo, selectedItem) || undefined,
      nombre: consumoNombre(tipo, selectedItem) || undefined,
      unidad: consumoUnidad(tipo, selectedItem) || undefined,
    }

    createConsumo.mutate({ odtId, data: payload }, {
      onSuccess: () => {
        setItemId('')
        setCantidad('')
        setMotivo('')
        setLoteId('')
        setMermaCantidad('')
        setMermaMotivo('')
      },
      onError: (error) => toast.error(error?.response?.data?.error || 'Error al registrar consumo'),
    })
  }

  const recent = (historial.items || []).slice(0, 5)
  const materialesActuales = materiales.items || []
  const disabled = createConsumo.isPending || !itemId || !cantidad || (requiereLote && !loteId)

  const handleDeleteMaterial = async material => {
    if (!await confirmDialog({ title: 'Confirmar', detail: `Eliminar material ${material.nombre || material.codigoInterno || material.id} de la OT?`, tone: 'danger' })) return
    deleteMaterial.mutate({ odtId, materialId: material.id }, {
      onError: error => toast.error(error?.response?.data?.error || 'Error al eliminar material'),
    })
  }

  return (
    <>
      <FormDivider label="Consumos de produccion" />
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg-muted)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <FormField label="Tipo">
            <Select value={tipo} onChange={v => { setTipo(v); setItemId('') }} options={CONSUMO_TIPOS} disabled={createConsumo.isPending} />
          </FormField>
          <FormField label="Buscar">
            <Input value={search} onChange={v => { setSearch(v); setItemId('') }} placeholder="Codigo o nombre" disabled={createConsumo.isPending} />
          </FormField>
          <FormField label="Item">
            <Select value={itemId} onChange={v => { setItemId(v); setLoteId('') }} options={itemOptions} disabled={createConsumo.isPending || source.loading} />
          </FormField>
          <FormField label="Cantidad">
            <Input type="number" value={cantidad} onChange={setCantidad} placeholder="0" disabled={createConsumo.isPending} />
          </FormField>
          <FormField label="Taller">
            <Input value={taller} onChange={setTaller} placeholder="Corte, costura..." disabled={createConsumo.isPending} />
          </FormField>
          <FormField label="Motivo">
            <Input value={motivo} onChange={setMotivo} placeholder="Produccion OT" disabled={createConsumo.isPending} />
          </FormField>
          {tipo === 'material_taller' && <FormField label={requiereLote ? 'Lote de espuma *' : 'Lote (opcional)'}>
            <Select value={loteId} onChange={setLoteId} options={loteOptions} disabled={createConsumo.isPending || !selectedItem || loadingLotes} />
          </FormField>}
          {tipo === 'material_taller' && <FormField label="Control calidad">
            <Select value={calidad} onChange={setCalidad} options={[{ value: 'aprobado', label: 'Aprobado' }, { value: 'reproceso', label: 'Reproceso' }, { value: 'rechazado', label: 'Rechazado' }]} disabled={createConsumo.isPending} />
          </FormField>}
          {tipo === 'material_taller' && <FormField label="Merma">
            <Input type="number" value={mermaCantidad} onChange={setMermaCantidad} placeholder="0" disabled={createConsumo.isPending} />
          </FormField>}
          {tipo === 'material_taller' && <FormField label="Motivo merma">
            <Input value={mermaMotivo} onChange={setMermaMotivo} placeholder="Corte, defecto..." disabled={createConsumo.isPending} />
          </FormField>}
          <div style={{ marginBottom: 18 }}>
            <button
              type="button"
              onClick={submitConsumo}
              disabled={disabled}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 7, border: 'none',
                background: disabled ? 'var(--border)' : 'var(--green-600)',
                color: disabled ? 'var(--text-3)' : '#fff', fontWeight: 700, fontSize: 12,
                cursor: disabled ? 'default' : 'pointer',
              }}
            >
              {createConsumo.isPending ? 'Registrando...' : 'Registrar consumo'}
            </button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontSize: 12, color: 'var(--text-2)' }}>Materiales asignados</strong>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{materiales.total || 0} registros</span>
          </div>
          {loadingMateriales ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>Cargando materiales...</div>
          ) : materialesActuales.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>Sin materiales asignados a esta OT</div>
          ) : (
            <div style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
              {materialesActuales.map(material => (
                <div key={material.id} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr) 90px 70px', gap: 8, alignItems: 'center', fontSize: 11, padding: '5px 0', borderTop: '1px dashed var(--border)' }}>
                  <span style={{ color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{material.codigoInterno || 'Sin codigo'}</span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {material.nombre || '-'}{material.taller ? ` (${material.taller})` : ''}
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", color: 'var(--green-700)', fontWeight: 700 }}>
                    {fmtCantidad(material.cantidad)}{material.unidad ? ` ${material.unidad}` : ''}
                  </span>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteMaterial(material)}
                      disabled={deleteMaterial.isPending}
                      style={{ border: 'none', background: 'transparent', color: 'var(--red-700)', fontSize: 11, cursor: deleteMaterial.isPending ? 'default' : 'pointer' }}
                    >
                      Quitar
                    </button>
                  ) : <span />}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontSize: 12, color: 'var(--text-2)' }}>Historial reciente</strong>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{historial.total || 0} movimientos</span>
          </div>
          {loadingHistorial ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>Cargando historial...</div>
          ) : recent.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>Sin consumos registrados para esta OT</div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {recent.map(entry => {
                const egreso = Number(entry.egreso || 0)
                const ingreso = Number(entry.ingreso || 0)
                const qty = egreso ? `-${fmtCantidad(egreso)}` : ingreso ? `+${fmtCantidad(ingreso)}` : '0'
                return (
                  <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr) 90px', gap: 8, alignItems: 'center', fontSize: 11, padding: '5px 0', borderTop: '1px dashed var(--border)' }}>
                    <span style={{ color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{entry.fecha ? new Date(entry.fecha).toLocaleDateString('es-CL') : 'Sin fecha'}</span>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <b style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-2)' }}>{entry.codigoInterno || 'Sin codigo'}</b>
                      {entry.nombre ? ` - ${entry.nombre}` : ''}
                      {entry.taller ? ` (${entry.taller})` : ''}
                    </span>
                    <span style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", color: egreso ? 'var(--red-700)' : 'var(--green-700)', fontWeight: 700 }}>
                      {qty}{entry.unidad ? ` ${entry.unidad}` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const TALLER_TONE = {
  pendiente: 'gray', en_proceso: 'blue', pausado: 'amber', en_pausa: 'amber', listo: 'green', completado: 'green', terminado: 'green', cancelado: 'red',
}

const TALLER_STATE_ACTIONS = [
  { key: 'iniciar', label: 'Iniciar', estado: 'en_proceso', from: ['pendiente'], tone: 'blue' },
  { key: 'pausar', label: 'Pausar', estado: 'pausado', from: ['en_proceso'], tone: 'amber' },
  { key: 'reanudar', label: 'Reanudar', estado: 'en_proceso', from: ['pausado', 'en_pausa'], tone: 'blue' },
  { key: 'listo', label: 'Marcar listo', estado: 'listo', from: ['pendiente', 'en_proceso', 'pausado', 'en_pausa'], tone: 'green' },
  { key: 'reabrir', label: 'Reabrir', estado: 'pendiente', from: ['listo', 'completado', 'terminado', 'cancelado'], tone: 'amber' },
]

function normalizeTallerEstado(estado) {
  return (estado || 'pendiente').toString().trim().toLowerCase().replace(/\s+/g, '_')
}

function OdtItemsTable({ odtId, items }) {
  const cambiarEstadoTaller = useOdtItemTallerEstado()
  const cambiarTallerMasivo = useOdtTallerEstadoMasivo()

  const talleresResumen = []
  const talleresMap = new Map()
  for (const item of items) {
    for (const taller of item.talleres || []) {
      const key = taller.tallerId
      const current = talleresMap.get(key) || {
        tallerId: taller.tallerId,
        nombre: taller.taller?.nombre || `Taller ${taller.tallerId}`,
        total: 0,
        pendientes: 0,
      }
      current.total += 1
      if (normalizeTallerEstado(taller.estado) !== 'listo') current.pendientes += 1
      talleresMap.set(key, current)
    }
  }
  talleresResumen.push(...talleresMap.values())

  const handleTallerEstado = (item, taller, action) => {
    cambiarEstadoTaller.mutate({
      odtId,
      itemId: item.id,
      tallerItemId: taller.id,
      estado: action.estado,
    }, {
      onError: () => toast.error('Error al cambiar el estado del taller'),
    })
  }

  const handleTallerMasivo = async taller => {
    if (!await confirmDialog({ title: 'Confirmar', detail: `Marcar como listos ${taller.pendientes} item(s) de ${taller.nombre}?` })) return
    cambiarTallerMasivo.mutate({
      odtId,
      tallerId: taller.tallerId,
      estado: 'listo',
    }, {
      onError: () => toast.error('Error al actualizar el taller completo'),
    })
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {talleresResumen.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-muted)' }}>
          {talleresResumen.map(taller => {
            const isPending = cambiarTallerMasivo.isPending && cambiarTallerMasivo.variables?.tallerId === taller.tallerId
            return (
              <button
                key={taller.tallerId}
                type="button"
                onClick={() => handleTallerMasivo(taller)}
                disabled={cambiarTallerMasivo.isPending || taller.pendientes === 0}
                style={{
                  padding: '6px 10px', borderRadius: 7, border: '1px solid var(--green-100)',
                  background: taller.pendientes === 0 ? '#fff' : 'var(--green-600)',
                  color: taller.pendientes === 0 ? 'var(--green-700)' : '#fff',
                  fontSize: 11, fontWeight: 700, cursor: taller.pendientes === 0 ? 'default' : 'pointer',
                  opacity: cambiarTallerMasivo.isPending && !isPending ? 0.45 : 1,
                }}
              >
                {isPending ? 'Actualizando...' : `Marcar todo listo: ${taller.nombre} (${taller.pendientes}/${taller.total})`}
              </button>
            )
          })}
        </div>
      )}
      {items.map(it => (
        <div key={it.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{it.nombre || it.codigoInterno || `Item #${it.id}`}</div>
              {it.codigoInterno && it.nombre && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{it.codigoInterno}</div>
              )}
              {it.obs && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{it.obs}</div>}
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600 }}>{it.cantidad} u.</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-muted)', textTransform: 'uppercase' }}>{it.estado}</span>
            </div>
          </div>
          {it.talleres && it.talleres.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
              {it.talleres.map(t => {
                const estadoKey = normalizeTallerEstado(t.estado)
                const tone = TALLER_TONE[estadoKey] || 'gray'
                const actions = TALLER_STATE_ACTIONS.filter(a => a.from.includes(estadoKey))
                return (
                  <div key={t.id} style={{ padding: 8, background: 'var(--bg-muted)', borderRadius: 6, fontSize: 11 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <strong style={{ textTransform: 'capitalize', fontSize: 12 }}>{t.taller?.nombre || `Taller ${t.tallerId}`}</strong>
                      <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: `var(--${tone}-100, var(--bg-card))`, color: `var(--${tone}-700, var(--text-2))` }}>{t.estado || 'pendiente'}</span>
                    </div>
                    {t.fechaInicio && <div style={{ color: 'var(--text-3)' }}>Inicio: {new Date(t.fechaInicio).toLocaleDateString('es-CL')}</div>}
                    {t.fechaListo && <div style={{ color: 'var(--green-700)' }}>Listo: {new Date(t.fechaListo).toLocaleDateString('es-CL')}</div>}
                    {t.usuario && <div style={{ color: 'var(--text-3)' }}>Por: {t.usuario}{t.usuarioListo && ` → ${t.usuarioListo}`}</div>}
                    {t.obs && <div style={{ color: 'var(--text-2)', marginTop: 4, fontStyle: 'italic' }}>{t.obs}</div>}
                    {actions.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                        {actions.map(action => {
                          const isPending = cambiarEstadoTaller.isPending &&
                            cambiarEstadoTaller.variables?.itemId === it.id &&
                            cambiarEstadoTaller.variables?.tallerItemId === t.id &&
                            cambiarEstadoTaller.variables?.estado === action.estado
                          const disabled = cambiarEstadoTaller.isPending
                          const bg = action.tone === 'green' ? 'var(--green-600)' : action.tone === 'blue' ? 'var(--blue)' : 'var(--amber)'
                          return (
                            <button
                              key={action.key}
                              type="button"
                              onClick={() => handleTallerEstado(it, t, action)}
                              disabled={disabled}
                              style={{
                                padding: '3px 7px', borderRadius: 5, border: 'none', background: bg, color: '#fff',
                                fontSize: 10, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
                                opacity: disabled && !isPending ? 0.45 : 1,
                              }}
                            >
                              {isPending ? '...' : action.label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
