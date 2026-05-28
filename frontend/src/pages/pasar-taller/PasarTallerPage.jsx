import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Btn, PageHeader, Table } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import { useEliminarItemTaller, useEnviarTaller, usePasarTallerOrden } from '../../api/pasarTaller'
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

  const items = useMemo(() => data.items || [], [data.items])
  const talleres = useMemo(() => data.talleres || [], [data.talleres])
  const odt = data.odt
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
    if (!params.ordenId && !params.nInterno) return alert('Ingresa ID de venta o N interno')
    setLineOverrides({})
    setPrioridad('')
    setObsGeneral('')
    setObsGeneralTouched(false)
    setSearchParams(params)
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

  function enviarItems(payloadItems) {
    if (!data.orden?.id) return alert('Primero carga una venta')
    if (!payloadItems.length && currentPrioridad === (normalizeText(odt?.prioridad) || 'alta') && currentObsGeneral === (odt?.obsGeneral || '')) {
      return alert('No hay cambios para notificar')
    }
    enviarMut.mutate({
      ordenId: data.orden.id,
      prioridad: currentPrioridad,
      obsGeneral: currentObsGeneral,
      items: payloadItems,
    }, {
      onSuccess: (res) => {
        alert('Taller notificado')
        setSearchParams({ ordenId: String(data.orden.id) })
        if (res?.odtId) navigate(`/pasar-taller?ordenId=${data.orden.id}`, { replace: true })
      },
      onError: e => alert(e.response?.data?.error || 'Error al notificar taller'),
    })
  }

  function enviarPendientes() {
    const payloadItems = rowsToSend.map(({ item, line }) => ({
      ordenItemId: item.ordenItemId,
      cantidad: Number(line.cantidad || item.cantidad),
      obs: line.obs || '',
      tallerIds: line.tallerIds || [],
    }))
    enviarItems(payloadItems)
  }

  function enviarUno(item) {
    const line = getLine(item)
    if (!line.tallerIds?.length) return alert('Selecciona al menos un taller para este producto')
    enviarItems([{
      ordenItemId: item.ordenItemId,
      cantidad: Number(line.cantidad || item.cantidad),
      obs: line.obs || '',
      tallerIds: line.tallerIds || [],
    }])
  }

  function eliminarItem(item) {
    const tallerItemId = item.talleres?.[0]?.id
    const odtItemId = odt?.items?.find(i => i.codigoInterno === item.codigoInterno)?.id
    const id = odtItemId || item.id || tallerItemId
    if (!id) return alert('No se encontro item de taller para eliminar')
    if (!confirm(`Quitar ${item.codigoInterno || item.nombre} de la OT?`)) return
    eliminarMut.mutate(id, {
      onError: e => alert(e.response?.data?.error || 'Error al quitar item'),
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

  return (
    <main className="page page-wide">
      <PageHeader
        title="Pasar a Taller"
        subtitle={data.orden ? `Venta ${data.orden.nInterno || data.orden.id} - ${data.orden.cliente?.razonSocial || data.orden.cliente?.nombre || 'Sin cliente'}` : 'Notificar productos transitorios de una venta'}
        breadcrumb={['Inicio', 'Ventas', 'Pasar a Taller']}
        actions={(
          <>
            {odt?.id && <Btn variant="secondary" size="sm" icon="tool" onClick={() => navigate(`/taller/${odt.id}/editar`)}>Ver ODT</Btn>}
            <Btn variant="primary" size="sm" icon="send" onClick={enviarPendientes} disabled={enviarMut.isPending || (!rowsToSend.length && !data.orden)}>
              {enviarMut.isPending ? 'Notificando...' : `Notificar ${rowsToSend.length || ''}`.trim()}
            </Btn>
          </>
        )}
      />

      <section style={sectionStyle}>
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
          {odt && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--text-3)' }}>
              <Badge tone={priorityTone(odt.prioridad)}>Prioridad {odt.prioridad || 'normal'}</Badge>
              <span>Ingreso: {odt.fechaIngreso ? new Date(odt.fechaIngreso).toLocaleString('es-CL') : '-'}</span>
              <span>Estado: {odt.estado || '-'}</span>
            </div>
          )}
        </section>
      )}

      <section style={{ ...sectionStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 700 }}>Productos para enviar a taller</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{items.length} producto(s) transitorio(s) pendiente(s)</div>
        </div>
        <Table columns={cols} rows={items} emptyMessage={data.orden ? 'No hay productos transitorios pendientes en esta venta' : 'Busca una venta para ver sus productos'} keyboard ariaLabel="Productos para enviar a taller" getRowKey={(row, index) => row.ordenItemId || index} />
      </section>
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
