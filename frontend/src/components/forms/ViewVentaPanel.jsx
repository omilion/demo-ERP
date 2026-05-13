import { Badge } from '../shared'
import { ViewPanel, FormDivider, DetailRow } from './index'

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

function EstadoBadge({ v }) {
  const tone = v === 'Pagada' || v === 'Entregada' || v === 'Completada' ? 'green'
    : v === 'Parcial' || v === 'En despacho' ? 'amber'
    : v === 'No pagada' || v === 'Pendiente entrega' ? 'red'
    : 'gray'
  return <Badge tone={tone}>{v || '—'}</Badge>
}

export function ViewVentaPanel({ venta, onClose, onEdit }) {
  const fecha = venta.createdAt
    ? new Date(venta.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'
  const total = venta.total || 0
  const abono = venta.abono || 0
  const saldo = total - abono
  const descuento = venta.descuentoPct || 0
  const items = venta.items || []
  const subtotal = items.reduce((s, i) => s + (i.precioUnitario * i.cantidad), 0)

  return (
    <ViewPanel
      title={`Venta #${venta.id}`}
      subtitle={`${fecha} · ${venta.creadorNombre || 'Sin vendedor'}`}
      onClose={onClose}
      onEdit={onEdit}
      onDelete={() => {}}
    >
      {/* Cliente + tipo */}
      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 5 }}>Cliente</div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{venta.cliente?.nombre || '—'}</div>
          {venta.cliente?.rut && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace", marginTop: 2 }}>{venta.cliente.rut}</div>}
        </div>
        <Badge tone={venta.tipo === 'Licitación' ? 'blue' : venta.tipo === 'Convenio Marco' ? 'neutral' : 'gray'}>{venta.tipo}</Badge>
      </div>

      {/* Estado pills */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[['Pago', venta.estadoPago], ['Entrega', venta.estadoEntrega], ['Estado', venta.estado]].map(([label, v], i) => (
          <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', textAlign: 'center', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</div>
            <EstadoBadge v={v} />
          </div>
        ))}
      </div>

      {/* Líneas de venta */}
      {items.length > 0 && (
        <>
          <FormDivider label={`Líneas de venta (${items.length})`} />
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Producto', 'Cant.', 'P. Unit.', 'Subtotal'].map((h, i) => (
                    <th key={i} style={{ padding: '7px ' + (i === 0 ? '12px' : '8px'), textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{item.producto?.nombre || `Producto #${item.productoId}`}</div>
                      {item.producto?.codigoInterno && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>{item.producto.codigoInterno}</div>
                      )}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: 'var(--text-2)' }}>{item.cantidad}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: 'var(--text-2)' }}>{fmt(item.precioUnitario)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(item.precioUnitario * item.cantidad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Resumen financiero */}
      <FormDivider label="Resumen financiero" />
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        {items.length > 0 && subtotal !== total && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-2)' }}>Subtotal</span>
            <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(subtotal)}</span>
          </div>
        )}
        {descuento > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', color: 'var(--green-600)' }}>
            <span>Descuento ({descuento}%)</span>
            <span style={{ fontFamily: "'DM Mono',monospace" }}>−{fmt(subtotal * descuento / 100)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', fontSize: 14, fontWeight: 700, borderBottom: abono > 0 ? '1px solid var(--border)' : 'none' }}>
          <span>Total Venta</span>
          <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(total)}</span>
        </div>
        {abono > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', color: 'var(--green-600)' }}>
            <span>Abono recibido</span>
            <span style={{ fontFamily: "'DM Mono',monospace" }}>−{fmt(abono)}</span>
          </div>
        )}
        {(abono > 0 || saldo > 0) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', fontSize: 14, fontWeight: 700, background: saldo > 0 ? 'var(--red-bg)' : 'var(--green-50)' }}>
            <span style={{ color: saldo > 0 ? 'var(--red)' : 'var(--green-700)' }}>Saldo Pendiente</span>
            <span style={{ fontFamily: "'DM Mono',monospace", color: saldo > 0 ? 'var(--red)' : 'var(--green-700)' }}>{fmt(saldo)}</span>
          </div>
        )}
      </div>

      {/* Referencias */}
      {(venta.licitacion || venta.guias || venta.facturado > 0) && (
        <>
          <FormDivider label="Referencias" />
          {venta.licitacion && <DetailRow label="ID Licitación / OC" value={venta.licitacion} mono />}
          {venta.guias && <DetailRow label="N° Guía de despacho" value={`#${venta.guias}`} mono />}
          {venta.facturado > 0 && <DetailRow label="Monto facturado" value={fmt(venta.facturado)} mono />}
        </>
      )}

      {venta.observaciones && (
        <>
          <FormDivider label="Observaciones" />
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 8px', padding: '0 2px' }}>{venta.observaciones}</p>
        </>
      )}
    </ViewPanel>
  )
}
