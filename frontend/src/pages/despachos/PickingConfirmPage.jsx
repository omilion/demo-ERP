import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Btn, PageHeader } from '../../components/shared'
import { useDespachoPacking, useConfirmarPicking } from '../../api/despachos'
import { useVenta } from '../../api/ventas'
import { showError, cardStyle, input } from './shared'
import { Mono, Footer } from './shared-ui'

// Picking confirma linea por linea que lo pedido en la venta esta
// disponible (o documenta el ajuste, ej. sustitucion de color) antes de
// habilitar esa linea para Packing. Ver gate en PUT .../packing (backend).
export default function PickingConfirmPage() {
  const navigate = useNavigate()
  const { ordenId } = useParams()
  const volver = () => navigate('/despachos?tab=admin')

  const ventaQuery = useVenta(Number(ordenId))
  const { data: trace = { items: [] }, isLoading } = useDespachoPacking(Number(ordenId))
  const confirmarMut = useConfirmarPicking()

  const [drafts, setDrafts] = useState({})

  if (ventaQuery.isLoading || isLoading) {
    return <main className="page page-wide"><PageHeader title="Picking" breadcrumb={['Inicio', 'Logistica', 'Bodega', 'Picking']} /><div style={cardStyle}>Cargando...</div></main>
  }
  if (!ventaQuery.data) {
    return <main className="page page-wide"><PageHeader title="Picking" breadcrumb={['Inicio', 'Logistica', 'Bodega', 'Picking']} /><div style={cardStyle}>Venta no encontrada. <Btn variant="ghost" onClick={volver}>Volver</Btn></div></main>
  }

  const venta = ventaQuery.data
  const getDraft = item => drafts[item.id] || {
    confirmado: item.pickingConfirmado,
    observacion: item.pickingObservacion || '',
  }
  const setDraft = (itemId, patch) => setDrafts(prev => ({ ...prev, [itemId]: { ...getDraft({ id: itemId, pickingConfirmado: false, pickingObservacion: '' }), ...prev[itemId], ...patch } }))

  const guardar = () => {
    const items = trace.items.map(item => {
      const draft = getDraft(item)
      return { itemId: item.id, confirmado: !!draft.confirmado, observacion: draft.observacion || undefined }
    })
    confirmarMut.mutate({ ordenId: Number(ordenId), items }, { onSuccess: volver, onError: showError })
  }

  return (
    <main className="page page-wide">
      <PageHeader title={`Picking venta #${venta.nInterno || venta.id}`} breadcrumb={['Inicio', 'Logistica', 'Bodega', 'Picking']} />
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{venta.cliente?.razonSocial || venta.cliente?.nombre || '-'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Orden #{ordenId}</div>
          </div>
        </div>

        {!trace.items?.length ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 8 }}>
            Sin lineas de venta para picking
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {trace.items.map(item => {
              const draft = getDraft(item)
              return (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: draft.confirmado ? 'var(--green-50, #f0fdf4)' : 'var(--bg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{item.nombre || 'Producto'}</div>
                      <Mono muted>{item.codigoInterno || `Item #${item.id}`} - Cant. {item.cantidad}</Mono>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={!!draft.confirmado}
                        onChange={event => setDraft(item.id, { confirmado: event.target.checked })}
                      />
                      Tengo lo pedido
                    </label>
                  </div>
                  <input
                    value={draft.observacion}
                    onChange={event => setDraft(item.id, { observacion: event.target.value })}
                    placeholder="Ajuste si algo no calzo (ej: color rojo agotado, se lleva azul con autorizacion cliente)"
                    style={{ ...input, marginTop: 8 }}
                  />
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <Footer saving={confirmarMut.isPending} onClose={volver} onSave={guardar} />
        </div>
      </div>
    </main>
  )
}
