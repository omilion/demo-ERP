import { toast, confirmDialog } from '../../store/notif'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, Table } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import { useEliminarItemTaller, useEnviarTaller, usePasarTallerOrden, usePasarTallerPendientes } from '../../api/pasarTaller'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const PRIORIDAD_OPTIONS = [
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'baja', label: 'Baja' },
]

const mono = { fontFamily: "'DM Mono', monospace" }

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function toIdList(list = []) {
  return list.map(item => Number(item.tallerId || item.id)).filter(Boolean)
}

function initialLineState(item) {
  return {
    cantidad: String(item.cantidad || 1),
    obs: item.obs || item.descripcion || '',
    tallerIds: toIdList(item.talleres),
  }
}

function sameIds(a = [], b = []) {
  const left = [...new Set(a.map(Number).filter(Boolean))].sort((x, y) => x - y)
  const right = [...new Set(b.map(Number).filter(Boolean))].sort((x, y) => x - y)
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function itemNeedsSubmit(item, line) {
  if (!line?.tallerIds?.length) return false
  if (!item.enTaller) return true
  if (item.requiereNotificarCantidad) return true
  if (Number(line.cantidad || 0) !== Number(item.cantidad || 0)) return true
  if ((line.obs || '') !== (item.obs || item.descripcion || '')) return true
  if (!sameIds(line.tallerIds, toIdList(item.talleres))) return true
  return false
}

function priorityTone(value) {
  const normalized = normalizeText(value)
  if (normalized === 'alta' || normalized === 'urgente') return 'red'
  if (normalized === 'media') return 'amber'
  return 'gray'
}

function tallerColor(kind) {
  if (kind === 'espumas') return 'var(--blue)'
  if (kind === 'confecciones') return 'var(--green-700)'
  return 'var(--amber)'
}

// La auto-notificacion desde la venta cubre el caso normal. Estos son los
// bordes donde no llega y, hasta ahora, nadie se enteraba: la bandeja existe
// para que un producto vendido no quede sin fabricar en silencio.
const MOTIVO_TONE = {
  sin_odt: 'red',
  odt_cerrada: 'red',
  items_faltantes: 'amber',
  cantidad_desfasada: 'amber',
  taller_por_defecto: 'blue',
}

const MOTIVO_TEXTO = {
  sin_odt: 'Sin OT',
  odt_cerrada: 'OT cerrada',
  items_faltantes: 'Faltan items',
  cantidad_desfasada: 'Cantidad distinta',
  taller_por_defecto: 'Taller por defecto',
}

function fmtFecha(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('es-CL')
}

export default function PasarTallerPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useAuthStore(s => s.user)
  const canDeleteTaller = can(user, 'taller', 'delete')

  const ordenIdParam = searchParams.get('ordenId') || ''
  const nInternoParam = searchParams.get('nInterno') || ''
  const [ordenIdInput, setOrdenIdInput] = useState(ordenIdParam)
  const [nInternoInput, setNInternoInput] = useState(nInternoParam)
  const [lineOverrides, setLineOverrides] = useState({})
  const [prioridad, setPrioridad] = useState('')
  const [obsGeneral, setObsGeneral] = useState('')
  const [obsGeneralTouched, setObsGeneralTouched] = useState(false)

  const { data = { orden: null, odt: null, items: [], talleres: [] }, isFetching, isError, error } = usePasarTallerOrden({
    ordenId: ordenIdParam,
    nInterno: nInternoParam,
  })
  const enviarMut = useEnviarTaller()
  const eliminarMut = useEliminarItemTaller()

  const ordenSeleccionada = Boolean(ordenIdParam || nInternoParam)
  const pendientesQuery = usePasarTallerPendientes()
  const pendientes = pendientesQuery.data?.items || []

  const items = useMemo(() => data.items || [], [data.items])
  const talleres = useMemo(() => data.talleres || [], [data.talleres])
  const odt = data.odt
  // El backend ya entrega como OT vigente la abierta; si la que llega esta
  // cerrada es porque no queda ninguna abierta en la venta.
  const odtCerrada = Boolean(odt && ['terminada', 'entregada', 'anulada'].includes(normalizeText(odt.estado)))
  const currentPrioridad = prioridad || normalizeText(odt?.prioridad) || 'alta'
  const currentObsGeneral = obsGeneralTouched
    ? obsGeneral
    : (odt?.obsGeneral && odt.obsGeneral !== 'No hay' ? odt.obsGeneral : '')

  const getLine = useCallback((item) => {
    return { ...initialLineState(item), ...(lineOverrides[item.ordenItemId] || {}) }
  }, [lineOverrides])

  const rowsToSend = useMemo(() => {
    return items
      .map(item => ({ item, line: getLine(item) }))
      .filter(({ item, line }) => itemNeedsSubmit(item, line))
  }, [items, getLine])

  function buscarOrden() {
    const params = {}
    if (ordenIdInput) params.ordenId = ordenIdInput
    if (nInternoInput) params.nInterno = nInternoInput
    if (!params.ordenId && !params.nInterno) return toast.warning('Ingresa ID de venta o N interno')
    setLineOverrides({})
    setPrioridad('')
    setObsGeneral('')
    setObsGeneralTouched(false)
    setSearchParams(params)
  }

  function abrirVenta(row) {
    setLineOverrides({})
    setPrioridad('')
    setObsGeneral('')
    setObsGeneralTouched(false)
    setOrdenIdInput(String(row.ordenId))
    setNInternoInput('')
    setSearchParams({ ordenId: String(row.ordenId) })
  }

  function volverABandeja() {
    setLineOverrides({})
    setPrioridad('')
    setObsGeneral('')
    setObsGeneralTouched(false)
    setOrdenIdInput('')
    setNInternoInput('')
    setSearchParams({})
  }

  function setLine(id, patch) {
    setLineOverrides(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }))
  }

  function toggleTaller(itemId, tallerId) {
    setLineOverrides(prev => {
      const item = items.find(row => row.ordenItemId === itemId)
      const current = { ...(item ? initialLineState(item) : {}), ...(prev[itemId] || {}) }
      const ids = new Set(current.tallerIds || [])
      if (ids.has(tallerId)) ids.delete(tallerId)
      else ids.add(tallerId)
      return { ...prev, [itemId]: { ...current, tallerIds: [...ids] } }
    })
  }

  function enviarItems(payloadItems, { nuevaOdt = false } = {}) {
    if (!data.orden?.id) return toast.warning('Primero carga una venta')
    if (!payloadItems.length && currentPrioridad === (normalizeText(odt?.prioridad) || 'alta') && currentObsGeneral === (odt?.obsGeneral || '')) {
      return toast.warning('No hay cambios para notificar')
    }
    enviarMut.mutate({
      ordenId: data.orden.id,
      prioridad: currentPrioridad,
      obsGeneral: currentObsGeneral,
      items: payloadItems,
      ...(nuevaOdt ? { nuevaOdt: true } : {}),
    }, {
      onSuccess: (res) => {
        toast.warning('Taller notificado')
        setSearchParams({ ordenId: String(data.orden.id) })
        if (res?.odtId) navigate(`/excepciones-taller?ordenId=${data.orden.id}`, { replace: true })
      },
      onError: e => toast.error(e.response?.data?.error || 'Error al notificar taller'),
    })
  }

  function payloadDePendientes() {
    return rowsToSend.map(({ item, line }) => ({
      ordenItemId: item.ordenItemId,
      cantidad: Number(line.cantidad || item.cantidad),
      obs: line.obs || '',
      tallerIds: line.tallerIds || [],
    }))
  }

  function enviarPendientes() {
    enviarItems(payloadDePendientes())
  }

  // Cuando la OT de la venta ya se cerro, agregarle trabajo no es posible ni
  // deseable: se abre otra para lo que quedo fuera, con confirmacion explicita
  // porque el taller vera una OT nueva sobre una venta que creia terminada.
  async function abrirNuevaOdt() {
    const payloadItems = payloadDePendientes()
    if (!payloadItems.length) return toast.warning('Marca los talleres de al menos un producto')
    const confirmado = await confirmDialog({
      title: 'Abrir nueva OT',
      detail: `La OT ${odt ? `#${odt.id} ` : ''}de esta venta está ${(odt?.estado || 'cerrada').toLowerCase()}. Se abrirá una OT nueva con ${payloadItems.length} producto(s) que quedaron fuera.`,
    })
    if (!confirmado) return
    enviarItems(payloadItems, { nuevaOdt: true })
  }

  function enviarUno(item) {
    const line = getLine(item)
    if (!line.tallerIds?.length) return toast.warning('Selecciona al menos un taller para este producto')
    enviarItems([{
      ordenItemId: item.ordenItemId,
      cantidad: Number(line.cantidad || item.cantidad),
      obs: line.obs || '',
      tallerIds: line.tallerIds || [],
    }])
  }

  async function eliminarItem(item) {
    const tallerItemId = item.talleres?.[0]?.id
    const odtItemId = odt?.items?.find(i => i.codigoInterno === item.codigoInterno)?.id
    const id = odtItemId || item.id || tallerItemId
    if (!id) return toast.warning('No se encontro item de taller para eliminar')
    if (!await confirmDialog({ title: 'Confirmar', detail: `Quitar ${item.codigoInterno || item.nombre} de la OT?`, tone: 'danger' })) return
    eliminarMut.mutate(id, {
      onError: e => toast.error(e.response?.data?.error || 'Error al quitar item'),
    })
  }

  const cols = [
    { key: 'codigoInterno', label: 'Cod.',
      render: v => <span style={{ ...mono, fontSize: 11, fontWeight: 600 }}>{v || '-'}</span> },
    { key: 'cantidad', label: 'Cant.', align: 'right',
      render: (_, row) => {
        const line = getLine(row)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <Input type="number" value={line.cantidad} onChange={v => setLine(row.ordenItemId, { cantidad: v })} style={{ width: 72 }} />
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>pend. {row.pendienteEntrega}</span>
          </div>
        )
      } },
    { key: 'nombre', label: 'Producto', wrap: true,
      render: (_, row) => (
        <div style={{ minWidth: 180, maxWidth: 280 }}>
          <div style={{ fontWeight: 600 }}>{row.nombre || '-'}</div>
          {row.descripcion && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{row.descripcion}</div>}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
            {row.enTaller ? <Badge tone="green">En taller</Badge> : <Badge tone="red">Sin notificar</Badge>}
            {row.requiereNotificarCantidad && <Badge tone="red">Cantidad cambiada</Badge>}
            {row.estadoProducto && <Badge tone={normalizeText(row.estadoProducto) === 'listo' ? 'green' : 'gray'}>{row.estadoProducto}</Badge>}
          </div>
        </div>
      ) },
    { key: 'obs', label: 'Obs venta / OT', wrap: true,
      render: (_, row) => {
        const line = getLine(row)
        return <Textarea value={line.obs} onChange={v => setLine(row.ordenItemId, { obs: v })} rows={2} />
      } },
    { key: 'talleres', label: 'Elije taller', wrap: true,
      render: (_, row) => {
        const line = getLine(row)
        const ids = new Set(line.tallerIds || [])
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150 }}>
            {talleres.map(taller => (
              <label key={taller.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={ids.has(taller.id)} onChange={() => toggleTaller(row.ordenItemId, taller.id)} />
                <span style={{ color: tallerColor(taller.kind), fontWeight: 600 }}>{taller.label || taller.nombre}</span>
              </label>
            ))}
          </div>
        )
      } },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button type="button" onClick={() => enviarUno(row)} disabled={enviarMut.isPending}
          style={smallBtn('var(--green-700)')} title="Notificar este producto">
          Notificar
        </button>
        {canDeleteTaller && row.enTaller && (
          <button type="button" onClick={() => eliminarItem(row)} disabled={eliminarMut.isPending}
            style={smallBtn('var(--red)')} title="Quitar de taller">
            Quitar
          </button>
        )}
      </div>
    ) },
  ]

  const bandejaCols = [
    { key: 'nInterno', label: 'Venta', required: true, render: (v, row) => (
      <span style={{ ...mono, fontWeight: 700 }}>{v || row.ordenId}</span>
    ) },
    { key: 'cliente', label: 'Cliente', render: (_, row) => row.cliente?.razonSocial || row.cliente?.nombre || 'Sin cliente' },
    { key: 'createdAt', label: 'Venta del', render: v => <span style={mono}>{fmtFecha(v)}</span> },
    { key: 'fechaPlazo', label: 'Compromiso', render: v => <span style={mono}>{fmtFecha(v)}</span> },
    { key: 'motivos', label: 'Problema', required: true, render: (v = []) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {v.map(motivo => (
          <Badge key={motivo} tone={MOTIVO_TONE[motivo] || 'gray'}>{MOTIVO_TEXTO[motivo] || motivo}</Badge>
        ))}
      </div>
    ) },
    { key: 'itemsFaltantes', label: 'Sin llegar', align: 'right', render: (v, row) => (
      <span style={mono}>{v} / {row.itemsTransitorios}</span>
    ) },
    { key: 'odtId', label: 'OT', render: (v, row) => v
      ? <span style={mono}>#{v} <span style={{ color: 'var(--text-3)' }}>{row.odtEstado || ''}</span></span>
      : <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: 12 }}>ninguna</span> },
    { key: '_acc', label: '', required: true, render: (_, row) => (
      <Btn variant="secondary" size="sm" icon="arrowRight" onClick={() => abrirVenta(row)}>Revisar</Btn>
    ) },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Excepciones de Taller"
        subtitle={data.orden
          ? `Venta ${data.orden.nInterno || data.orden.id} - ${data.orden.cliente?.razonSocial || data.orden.cliente?.nombre || 'Sin cliente'}`
          : 'Ventas con productos de fabricación que no llegaron a taller'}
        breadcrumb={['Inicio', 'Taller', 'Excepciones de Taller']}
        actions={(
          <>
            {ordenSeleccionada && <Btn variant="ghost" size="sm" icon="chevronLeft" onClick={volverABandeja}>Volver a pendientes</Btn>}
            {odt?.id && <Btn variant="secondary" size="sm" icon="tool" onClick={() => navigate(`/taller/${odt.id}/editar`)}>Ver OT</Btn>}
            {ordenSeleccionada && (odtCerrada ? (
              <Btn variant="primary" size="sm" icon="plusCircle" onClick={abrirNuevaOdt} disabled={enviarMut.isPending || !rowsToSend.length}>
                {enviarMut.isPending ? 'Abriendo...' : `Abrir nueva OT ${rowsToSend.length || ''}`.trim()}
              </Btn>
            ) : (
              <Btn variant="primary" size="sm" icon="send" onClick={enviarPendientes} disabled={enviarMut.isPending || (!rowsToSend.length && !data.orden)}>
                {enviarMut.isPending ? 'Notificando...' : `Notificar ${rowsToSend.length || ''}`.trim()}
              </Btn>
            ))}
          </>
        )}
      />

      {!ordenSeleccionada && (
        <>
          <div className="kpi-strip">
            <KpiCard label="Ventas pendientes" value={pendientesQuery.data?.total ?? 0} icon="alertTriangle" tone={pendientes.length ? 'red' : undefined} sublabel="Con productos sin llegar a taller" />
            <KpiCard label="Sin OT" value={pendientes.filter(row => row.motivos.includes('sin_odt')).length} icon="fileText" sublabel="Nunca se generó orden" />
            <KpiCard label="OT cerrada" value={pendientes.filter(row => row.motivos.includes('odt_cerrada')).length} icon="lock" tone="amber" sublabel="Se agregó después del cierre" />
            <KpiCard label="Taller por defecto" value={pendientes.filter(row => row.motivos.includes('taller_por_defecto')).length} icon="info" tone="blue" sublabel="Asignado sin regla" />
          </div>

          <section style={{ ...sectionStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700 }}>Pendientes de notificar a taller</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                La venta notifica al taller sola. Aquí quedan los casos donde no pudo: sin OT, con la OT ya cerrada, con items que no entraron o con el taller elegido por defecto.
              </div>
            </div>
            {pendientesQuery.isError ? (
              <div style={{ padding: 24, color: 'var(--red)', fontSize: 13 }}>No se pudo cargar la bandeja de pendientes</div>
            ) : (
              <Table
                columns={bandejaCols}
                rows={pendientes}
                emptyMessage={pendientesQuery.isFetching ? 'Buscando ventas pendientes...' : 'Todo al día: no hay ventas con productos sin llegar a taller'}
                keyboard
                stickyHeader
                ariaLabel="Ventas pendientes de pasar a taller"
                getRowKey={row => row.ordenId}
                onRowDoubleClick={abrirVenta}
              />
            )}
          </section>
        </>
      )}

      <section style={sectionStyle}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>
          Buscar una venta puntual que no aparezca en la lista (por ejemplo, una migrada del sistema anterior).
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <FormField label="ID de venta">
            <Input type="number" value={ordenIdInput} onChange={v => setOrdenIdInput(v)} placeholder="ID interno de orden" />
          </FormField>
          <FormField label="N interno legacy">
            <Input type="number" value={nInternoInput} onChange={v => setNInternoInput(v)} placeholder="N interno" />
          </FormField>
          <Btn variant="secondary" size="sm" icon="search" onClick={buscarOrden} disabled={isFetching}>Buscar</Btn>
        </div>
        {isError && (
          <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 13 }}>
            {error?.response?.data?.error || 'No se pudo cargar la venta'}
          </div>
        )}
      </section>

      {data.orden && (
        <section style={sectionStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, alignItems: 'start' }}>
            <Info label="Venta" value={data.orden.nInterno || data.orden.id} mono />
            <Info label="Tipo" value={data.orden.tipo || '-'} />
            <Info label="Estado" value={data.orden.estado || '-'} />
            <Info label="OT taller" value={odt ? `#${odt.id}` : 'Sin OT notificada'} mono tone={odt ? 'green' : 'red'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, marginTop: 14 }}>
            <FormField label="Prioridad OT">
              <Select value={currentPrioridad} onChange={setPrioridad} options={PRIORIDAD_OPTIONS} />
            </FormField>
            <FormField label="Obs OT">
              <Textarea value={currentObsGeneral} onChange={v => { setObsGeneral(v); setObsGeneralTouched(true) }} rows={2} />
            </FormField>
          </div>
          {odtCerrada && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', fontSize: 12, lineHeight: 1.45 }}>
              <strong>La OT #{odt.id} está {String(odt.estado || '').toLowerCase()}.</strong> No se le puede agregar trabajo.
              Marca los talleres de los productos que quedaron fuera y usa <strong>Abrir nueva OT</strong>: se crea una OT nueva
              para esta misma venta, sin tocar la que ya se cerró.
            </div>
          )}
          {odt && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--text-3)' }}>
              <Badge tone={priorityTone(odt.prioridad)}>Prioridad {odt.prioridad || 'normal'}</Badge>
              <span>Ingreso: {odt.fechaIngreso ? new Date(odt.fechaIngreso).toLocaleString('es-CL') : '-'}</span>
              <span>Estado: {odt.estado || '-'}</span>
            </div>
          )}
        </section>
      )}

      {ordenSeleccionada && (
        <section style={{ ...sectionStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ fontWeight: 700 }}>Productos para enviar a taller</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{items.length} producto(s) transitorio(s) pendiente(s)</div>
          </div>
          <Table columns={cols} rows={items} emptyMessage={data.orden ? 'No hay productos transitorios pendientes en esta venta' : 'Busca una venta para ver sus productos'} keyboard ariaLabel="Productos para enviar a taller" getRowKey={(row, index) => row.ordenItemId || index} />
        </section>
      )}
    </main>
  )
}

function Info({ label, value, mono: useMono = false, tone }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ ...(useMono ? mono : {}), fontSize: 14, fontWeight: 700, color: tone === 'green' ? 'var(--green-700)' : tone === 'red' ? 'var(--red)' : 'var(--text-1)', marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}

function smallBtn(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    border: '1px solid ' + color,
    background: color,
    color: '#fff',
    borderRadius: 5,
    padding: '5px 8px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  }
}

const sectionStyle = {
  background: '#fff',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
}
