import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, Btn, PageHeader } from '../../components/shared'
import { useDespachoPacking, useUpdateDespachoPacking } from '../../api/despachos'
import { useVenta } from '../../api/ventas'
import { packingResumen, showError, btnSm, input, cardStyle } from './shared'
import { Mono, Field, Footer, PackingProgress } from './shared-ui'

// Packing de una venta (que se entrego, cuanto queda pendiente, en que bulto
// y despacho). Pagina propia (antes modal popup) para poder llegar directo
// desde la matriz o desde la venta sin perder el contexto.
export default function DespachoPackingPage() {
  const navigate = useNavigate()
  const { ordenId } = useParams()
  const volver = () => navigate('/despachos?tab=matriz')

  const ventaQuery = useVenta(Number(ordenId))
  if (ventaQuery.isLoading) {
    return <main className="page page-wide"><PageHeader title="Packing" breadcrumb={['Inicio', 'Logistica', 'Despachos', 'Packing']} /><div style={cardStyle}>Cargando...</div></main>
  }
  if (!ventaQuery.data) {
    return <main className="page page-wide"><PageHeader title="Packing" breadcrumb={['Inicio', 'Logistica', 'Despachos', 'Packing']} /><div style={cardStyle}>Venta no encontrada. <Btn variant="ghost" onClick={volver}>Volver</Btn></div></main>
  }

  const venta = ventaQuery.data
  const row = {
    ordenId: venta.id,
    nInterno: venta.nInterno,
    clienteNombre: venta.cliente?.razonSocial || venta.cliente?.nombre,
    despachos: venta.despachos || [],
    itemsDetalle: (venta.items || []).map(item => ({
      id: item.id,
      cantidad: item.cantidad,
      entregados: item.nEntregados,
      codigo: item.codigoInterno,
      nombre: item.nombre,
    })),
  }

  return (
    <main className="page page-wide">
      <PageHeader title={`Packing venta #${venta.nInterno || venta.id}`} breadcrumb={['Inicio', 'Logistica', 'Despachos', 'Packing']} />
      <PackingForm row={row} onDone={volver} onCancel={volver} />
    </main>
  )
}

function PackingForm({ row, onDone, onCancel }) {
  const { data: trace = { items: [], bultos: [], eventos: [] }, isLoading } = useDespachoPacking(row.ordenId)
  const defaultDespachoId = row.despachos?.[0]?.id ? String(row.despachos[0].id) : ''
  const [despachoId, setDespachoId] = useState(defaultDespachoId)
  const [bultoNumero, setBultoNumero] = useState('')
  const [observacion, setObservacion] = useState('')
  const [drafts, setDrafts] = useState({})
  const updatePackingMut = useUpdateDespachoPacking()
  const sourceLines = trace.items?.length
    ? trace.items.map(item => ({
      ...item,
      codigo: item.codigoInterno,
      entregados: item.nEntregados,
    }))
    : (row.itemsDetalle || [])
  const lines = sourceLines.map(line => ({
    ...line,
    entregadosDraft: drafts[line.id] ?? String(line.entregados ?? 0),
  }))

  const setLine = (id, value) => setDrafts(prev => ({ ...prev, [id]: value }))

  const completeLine = line => setLine(line.id, String(line.cantidad || 0))
  const clearLine = line => setLine(line.id, '0')
  const resumen = packingResumen({
    itemsDetalle: lines.map(line => ({
      ...line,
      entregados: Math.max(0, Number.parseInt(line.entregadosDraft || '0', 10) || 0),
    })),
  })

  const save = () => {
    const items = lines.map(line => {
      const parsed = Math.max(0, Number.parseInt(line.entregadosDraft || '0', 10) || 0)
      return { itemId: line.id, nEntregados: Math.min(parsed, Number(line.cantidad || 0)) }
    })
    updatePackingMut.mutate(
      {
        ordenId: row.ordenId,
        despachoId: despachoId || undefined,
        bultoNumero: bultoNumero.trim() || undefined,
        observacion: observacion.trim() || undefined,
        items,
      },
      { onSuccess: onDone, onError: showError },
    )
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{row.clienteNombre || '-'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Orden #{row.ordenId}</div>
        </div>
        <PackingProgress row={{ itemsDetalle: lines.map(line => ({ ...line, entregados: Number.parseInt(line.entregadosDraft || '0', 10) || 0 })) }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 0.8fr) minmax(150px, 1fr) minmax(180px, 1.5fr)', gap: 10, marginBottom: 12 }}>
        <Field label="Despacho">
          <select value={despachoId} onChange={event => setDespachoId(event.target.value)} style={input}>
            <option value="">Sin despacho asociado</option>
            {(row.despachos || []).map(despacho => (
              <option key={despacho.id} value={String(despacho.id)}>
                #{despacho.id} {despacho.tipoDespacho || ''} {despacho.transporte || ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bulto">
          <input value={bultoNumero} onChange={event => setBultoNumero(event.target.value)} placeholder="Ej: B1" style={input} />
        </Field>
        <Field label="Observacion">
          <input value={observacion} onChange={event => setObservacion(event.target.value)} placeholder="Nota del ajuste" style={input} />
        </Field>
      </div>

      {!lines.length ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 8 }}>
          Sin lineas de venta para packing
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Producto', 'Cant.', 'Entregados', 'Pendiente', ''].map((h, i) => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: i >= 1 && i <= 3 ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map(line => {
                const cantidad = Number(line.cantidad || 0)
                const entregados = Math.min(Math.max(0, Number.parseInt(line.entregadosDraft || '0', 10) || 0), cantidad)
                const pendiente = Math.max(0, cantidad - entregados)
                return (
                  <tr key={line.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 600 }}>{line.nombre || 'Producto'}</div>
                      <Mono muted>{line.codigo || `Item #${line.id}`}</Mono>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}><Mono strong>{cantidad}</Mono></td>
                    <td style={{ padding: '5px 10px', textAlign: 'right' }}>
                      <input
                        type="number"
                        min="0"
                        max={cantidad}
                        value={line.entregadosDraft}
                        onChange={event => setLine(line.id, event.target.value)}
                        style={{ width: 78, padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontFamily: "'DM Mono', monospace", textAlign: 'right' }}
                      />
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: pendiente > 0 ? 'var(--amber)' : 'var(--green-600)', fontWeight: 700 }}>
                      <Mono strong>{pendiente}</Mono>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button type="button" onClick={() => completeLine(line)} style={btnSm('var(--green-700)')}>Completar</button>
                        <button type="button" onClick={() => clearLine(line)} style={btnSm('var(--text-2)')}>Cero</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <Badge tone={resumen.estado === 'Completo' ? 'green' : resumen.estado === 'Parcial' ? 'amber' : 'gray'}>
          {resumen.entregados}/{resumen.total}
        </Badge>
        <Footer saving={updatePackingMut.isPending} onClose={onCancel} onSave={save} />
      </div>

      <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Trazabilidad packing</div>
          {isLoading && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Cargando...</span>}
        </div>
        {(trace.bultos || []).length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {(trace.bultos || []).slice(0, 8).map(bulto => (
              <Badge key={bulto.id} tone="blue">{bulto.numero} - {bulto.estado}</Badge>
            ))}
          </div>
        )}
        {(trace.eventos || []).length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Sin eventos registrados todavia.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
            {(trace.eventos || []).slice(0, 10).map(evento => (
              <div key={evento.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{evento.ordenItem?.nombre || `Item #${evento.ordenItemId}`}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {evento.usuario || 'Sistema'} - {new Date(evento.createdAt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {evento.bulto?.numero ? ` - Bulto ${evento.bulto.numero}` : ''}
                  </div>
                  {evento.observacion && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{evento.observacion}</div>}
                </div>
                <Mono strong>{evento.cantidadAnterior} -&gt; {evento.cantidadNueva}</Mono>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
