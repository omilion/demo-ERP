import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, Textarea, useForm } from '../../components/forms/index'
import { useOdt, useCreateOdt, useUpdateOdt, useOdtOperarios, useOdtItemTallerEstado, useOdtTallerEstadoMasivo, useCreateOdtConsumo, useOdtMateriales, useDeleteOdtMaterial } from '../../api/odts'
import { useProductos } from '../../api/productos'
import { useBodegaTaller } from '../../api/bodegaTaller'
import { useTelas } from '../../api/telas'
import { useHistorialMateriales } from '../../api/historialMateriales'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const ESTADOS_ODT = ['Pendiente', 'Asignada', 'En proceso', 'Control calidad', 'Terminada', 'Entregada', 'Prioritaria']

export default function TallerFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const isEdit = !!id
  const ordenIdParam = new URLSearchParams(location.search).get('ordenId') || ''
  const { data: found } = useOdt(isEdit ? Number(id) : null)
  const { data: operariosMeta = { items: [] } } = useOdtOperarios()
  const createOdt = useCreateOdt()
  const updateOdt = useUpdateOdt()

  const { data, set, errors, validate } = useForm({
    tipo: 'Espumas', clienteNombre: '', descripcion: '',
    obsGeneral: '', estado: 'Pendiente', prioridad: 'normal', plazo: '', fechaIngreso: '',
    fechaInicio: '', fechaTermino: '', ordenId: ordenIdParam, operarioId: '',
  })

  const initializedRef = useRef(false)
  useEffect(() => {
    if (found && !initializedRef.current) {
      set('tipo', found.tipo || 'Espumas')
      set('clienteNombre', found.clienteNombre ?? '')
      set('descripcion', found.descripcion ?? '')
      set('obsGeneral', found.obsGeneral ?? '')
      set('estado', found.estado || 'Pendiente')
      set('prioridad', found.prioridad || 'normal')
      set('plazo', found.plazo ? new Date(found.plazo).toISOString().slice(0, 10) : '')
      set('fechaIngreso', found.fechaIngreso ? new Date(found.fechaIngreso).toISOString().slice(0, 10) : '')
      set('fechaInicio', found.fechaInicio ? new Date(found.fechaInicio).toISOString().slice(0, 10) : '')
      set('fechaTermino', found.fechaTermino ? new Date(found.fechaTermino).toISOString().slice(0, 10) : '')
      set('ordenId', found.ordenId ? String(found.ordenId) : '')
      set('operarioId', found.operarioId ? String(found.operarioId) : '')
      initializedRef.current = true
    }
  }, [found, set])

  const operarioOptions = [
    { value: '', label: 'Sin responsable asignado' },
    ...(operariosMeta.items || []).map(t => ({
      value: String(t.id),
      label: `${t.nombres} ${t.apellidoPaterno || ''}${t.cargo ? ` - ${t.cargo}` : ''}`.trim(),
    })),
  ]

  const handleSave = () => {
    if (!validate({ ordenId: { required: true }, descripcion: { required: true } })) return
    const payload = {
      tipo: data.tipo,
      clienteNombre: data.clienteNombre,
      descripcion: data.descripcion,
      obsGeneral: data.obsGeneral || null,
      estado: data.estado,
      prioridad: data.prioridad,
      ordenId: Number(data.ordenId),
      operarioId: data.operarioId ? Number(data.operarioId) : null,
      plazo: data.plazo ? new Date(data.plazo).toISOString() : undefined,
      fechaIngreso: data.fechaIngreso ? new Date(data.fechaIngreso).toISOString() : null,
      fechaInicio: data.fechaInicio ? new Date(data.fechaInicio).toISOString() : null,
      fechaTermino: data.fechaTermino ? new Date(data.fechaTermino).toISOString() : null,
    }
    if (isEdit) {
      updateOdt.mutate({ id: Number(id), data: payload }, {
        onSuccess: () => navigate('/taller'),
        onError: () => alert('Error al guardar la ODT'),
      })
    } else {
      createOdt.mutate(payload, {
        onSuccess: () => navigate('/taller'),
        onError: () => alert('Error al crear la ODT'),
      })
    }
  }

  return (
    <FormPage
      title={isEdit ? 'Editar ODT' : 'Nueva ODT'}
      subtitle={isEdit ? `Editando ODT #${id}` : 'Crear orden de trabajo'}
      breadcrumb={['Inicio', 'Taller', isEdit ? 'Editar ODT' : 'Nueva ODT']}
      onSave={handleSave}
      saving={createOdt.isPending || updateOdt.isPending}
    >
      <FormDivider label="Trabajo" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Orden vinculada" required error={errors.ordenId}>
          <Input type="number" value={data.ordenId} onChange={v => set('ordenId', v)} placeholder="ID de venta/orden" error={errors.ordenId} />
        </FormField>
        <FormField label="Tipo de Trabajo">
          <Select value={data.tipo} onChange={v => set('tipo', v)} options={['Espumas', 'Confecciones', 'Madera', 'Externo']} />
        </FormField>
        <FormField label="Estado">
          <Select value={data.estado} onChange={v => set('estado', v)} options={ESTADOS_ODT} />
        </FormField>
        <FormField label="Prioridad">
          <Select value={data.prioridad} onChange={v => set('prioridad', v)} options={[
            { value: 'normal', label: 'Normal' },
            { value: 'alta', label: 'Alta' },
            { value: 'urgente', label: 'Urgente' },
          ]} />
        </FormField>
        <FormField label="Responsable operativo">
          <Select value={data.operarioId} onChange={v => set('operarioId', v)} options={operarioOptions} />
        </FormField>
      </div>
      <FormField label="Cliente">
        <Input value={data.clienteNombre} onChange={v => set('clienteNombre', v)} placeholder="Nombre del cliente" />
      </FormField>
      <FormField label="Descripción del trabajo" required error={errors.descripcion}>
        <Textarea value={data.descripcion} onChange={v => set('descripcion', v)} placeholder="Detalle del trabajo a realizar" rows={3} error={errors.descripcion} />
      </FormField>
      <FormField label="Obs OT / observacion general">
        <Textarea value={data.obsGeneral} onChange={v => set('obsGeneral', v)} placeholder="Observaciones internas de produccion" rows={3} />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <FormField label="Fecha ingreso">
          <Input type="date" value={data.fechaIngreso} onChange={v => set('fechaIngreso', v)} />
        </FormField>
        <FormField label="Fecha inicio">
          <Input type="date" value={data.fechaInicio} onChange={v => set('fechaInicio', v)} />
        </FormField>
        <FormField label="Fecha termino">
          <Input type="date" value={data.fechaTermino} onChange={v => set('fechaTermino', v)} />
        </FormField>
        <FormField label="Plazo de entrega">
          <Input type="date" value={data.plazo} onChange={v => set('plazo', v)} />
        </FormField>
      </div>

      {isEdit && <OdtConsumosSection odtId={Number(id)} />}

      {isEdit && found?.items?.length > 0 && (
        <>
          <FormDivider label={`Items en proceso (${found.items.length})`} />
          <OdtItemsTable odtId={Number(id)} items={found.items} />
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
  const createConsumo = useCreateOdtConsumo()
  const deleteMaterial = useDeleteOdtMaterial()

  const trimmedSearch = search.trim()
  const productoParams = tipo === 'producto' && trimmedSearch ? { search: trimmedSearch } : {}
  const bodegaParams = {
    page: '1',
    ...(tipo === 'material_taller' && trimmedSearch ? { search: trimmedSearch } : {}),
  }
  const telaParams = tipo === 'tela' && trimmedSearch ? { search: trimmedSearch } : {}

  const { data: productosResult = { items: [] }, isLoading: loadingProductos } = useProductos(productoParams)
  const { data: bodegaResult = { items: [] }, isLoading: loadingBodega } = useBodegaTaller(bodegaParams)
  const { data: telasResult = { items: [] }, isLoading: loadingTelas } = useTelas(telaParams)
  const { data: historial = { items: [] }, isLoading: loadingHistorial } = useHistorialMateriales({ odtId })
  const { data: materiales = { items: [] }, isLoading: loadingMateriales } = useOdtMateriales(odtId)

  const source = {
    producto: { items: productosResult.items || [], loading: loadingProductos },
    material_taller: { items: bodegaResult.items || [], loading: loadingBodega },
    tela: { items: telasResult.items || [], loading: loadingTelas },
  }[tipo]

  const items = source.items
  const selectedItem = items.find(item => String(item.id) === String(itemId))
  const itemOptions = [
    { value: '', label: source.loading ? 'Cargando...' : items.length ? 'Seleccione item' : 'Sin resultados' },
    ...items.map(item => ({ value: String(item.id), label: consumoLabel(tipo, item) })),
  ]

  const submitConsumo = () => {
    const parsedCantidad = parseCantidad(cantidad)
    if (!selectedItem) return alert('Seleccione un item')
    if (parsedCantidad <= 0) return alert('Ingrese una cantidad mayor a cero')

    const numericItemId = Number(selectedItem.id)
    const payload = {
      tipo,
      id: numericItemId,
      itemId: numericItemId,
      [CONSUMO_ITEM_KEY[tipo]]: numericItemId,
      cantidad: parsedCantidad,
      taller: taller.trim() || undefined,
      motivo: motivo.trim() || undefined,
      codigoInterno: consumoCodigo(tipo, selectedItem) || undefined,
      nombre: consumoNombre(tipo, selectedItem) || undefined,
      unidad: consumoUnidad(tipo, selectedItem) || undefined,
    }

    createConsumo.mutate({ odtId, data: payload }, {
      onSuccess: () => {
        setItemId('')
        setCantidad('')
        setMotivo('')
      },
      onError: (error) => alert(error?.response?.data?.error || 'Error al registrar consumo'),
    })
  }

  const recent = (historial.items || []).slice(0, 5)
  const materialesActuales = materiales.items || []
  const disabled = createConsumo.isPending || !itemId || !cantidad

  const handleDeleteMaterial = material => {
    if (!confirm(`Eliminar material ${material.nombre || material.codigoInterno || material.id} de la ODT?`)) return
    deleteMaterial.mutate({ odtId, materialId: material.id }, {
      onError: error => alert(error?.response?.data?.error || 'Error al eliminar material'),
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
            <Select value={itemId} onChange={setItemId} options={itemOptions} disabled={createConsumo.isPending || source.loading} />
          </FormField>
          <FormField label="Cantidad">
            <Input type="number" value={cantidad} onChange={setCantidad} placeholder="0" disabled={createConsumo.isPending} />
          </FormField>
          <FormField label="Taller">
            <Input value={taller} onChange={setTaller} placeholder="Corte, costura..." disabled={createConsumo.isPending} />
          </FormField>
          <FormField label="Motivo">
            <Input value={motivo} onChange={setMotivo} placeholder="Produccion ODT" disabled={createConsumo.isPending} />
          </FormField>
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
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>Sin materiales asignados a esta ODT</div>
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
            <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>Sin consumos registrados para esta ODT</div>
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
      onError: () => alert('Error al cambiar el estado del taller'),
    })
  }

  const handleTallerMasivo = taller => {
    if (!confirm(`Marcar como listos ${taller.pendientes} item(s) de ${taller.nombre}?`)) return
    cambiarTallerMasivo.mutate({
      odtId,
      tallerId: taller.tallerId,
      estado: 'listo',
    }, {
      onError: () => alert('Error al actualizar el taller completo'),
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
