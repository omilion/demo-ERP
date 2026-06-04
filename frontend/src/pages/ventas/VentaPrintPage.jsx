import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useVenta } from '../../api/ventas'

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-CL') : '—'
const discountAmount = (base, pct, frozenAmount) => {
  const frozen = Number(frozenAmount || 0)
  if (frozen > 0) return Math.min(Math.round(frozen), Math.round(Number(base || 0)))
  return Math.round(Number(base || 0) * (Number(pct || 0) / 100))
}

function discountLabel(venta, pct) {
  const snapshot = venta.descuentoSnapshot || {}
  const name = snapshot.reglaNombre || snapshot.nombre || null
  const label = name ? `Descuento ${name}` : 'Descuento'
  return Number(pct || 0) > 0 ? `${label} (${pct}%)` : label
}

function normalizeItem(it) {
  const cantidad = Number(it.cantidad) || 0
  const precioUnitario = Number(it.precioUnitario ?? it.precio) || 0

  return {
    id: it.id,
    codigo: it.codigoInterno ?? it.producto?.codigoInterno ?? it.codigo ?? it.producto?.codigo ?? '—',
    nombre: it.nombre ?? it.producto?.nombre ?? it.descripcion ?? '—',
    cantidad,
    precioUnitario,
    subtotal: cantidad * precioUnitario,
  }
}

export default function VentaPrintPage() {
  const { id } = useParams()
  const { data: venta, isLoading } = useVenta(Number(id))

  useEffect(() => {
    if (venta && !isLoading) {
      const t = setTimeout(() => window.print(), 300)
      return () => clearTimeout(t)
    }
  }, [venta, isLoading])

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', fontSize: 14 }}>Cargando…</div>
  if (!venta) return <div style={{ padding: 40, textAlign: 'center', fontSize: 14 }}>Venta no encontrada</div>

  const items = (venta.items || []).map(normalizeItem)
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0)
  const cargosTotal = (venta.cargos || []).reduce((s, c) => s + Number(c.valor || 0), 0)
  const totalBase = subtotal + cargosTotal
  const descuentoPct = Number(venta.descuentoSnapshot?.porcentaje ?? venta.descuentoPct ?? 0)
  const descMonto = discountAmount(totalBase, descuentoPct, venta.descuentoMonto)
  const total = totalBase - descMonto

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 28, fontFamily: 'system-ui, sans-serif', color: '#111', background: '#fff' }}>
      <style>{`@media print { @page { margin: 12mm } body { -webkit-print-color-adjust: exact } .no-print { display: none } }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 22 }}>Plastimar</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>Nota de venta interna</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#555' }}>N° Interno</div>
          <div style={{ fontWeight: 700, fontSize: 20, fontFamily: 'monospace' }}>{venta.nInterno || venta.id}</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{fmtDate(venta.createdAt)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#777', marginBottom: 4 }}>Cliente</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{venta.cliente?.razonSocial || venta.cliente?.nombre || '—'}</div>
          <div style={{ fontSize: 12, color: '#444', fontFamily: 'monospace' }}>{venta.rutCliente || venta.cliente?.rut || '—'}</div>
          {venta.cliente?.direccion && <div style={{ fontSize: 11, color: '#555' }}>{venta.cliente.direccion}</div>}
          {venta.cliente?.telefono && <div style={{ fontSize: 11, color: '#555' }}>Tel: {venta.cliente.telefono}</div>}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#777', marginBottom: 4 }}>Detalles</div>
          <div style={{ fontSize: 12 }}>Tipo: <b>{venta.tipo || '—'}</b></div>
          <div style={{ fontSize: 12 }}>Vendedor: {venta.creadorNombre || '—'}</div>
          {venta.licitacion && <div style={{ fontSize: 12 }}>OC/Ref: {venta.licitacion}</div>}
          <div style={{ fontSize: 12 }}>Estado pago: {venta.estadoPago || '—'}</div>
          <div style={{ fontSize: 12 }}>Estado entrega: {venta.estadoEntrega || '—'}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18, fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={th}>Código</th>
            <th style={th}>Descripción</th>
            <th style={{ ...th, textAlign: 'right' }}>Cant.</th>
            <th style={{ ...th, textAlign: 'right' }}>Precio</th>
            <th style={{ ...th, textAlign: 'right' }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={it.id || idx} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ ...td, fontFamily: 'monospace' }}>{it.codigo}</td>
              <td style={td}>{it.nombre}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{it.cantidad}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(it.precioUnitario)}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(it.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
        <table style={{ fontSize: 12, minWidth: 280 }}>
          <tbody>
            <tr><td style={{ padding: '4px 12px', color: '#555' }}>Subtotal</td><td style={{ padding: '4px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(subtotal)}</td></tr>
            {cargosTotal > 0 && (
              <tr><td style={{ padding: '4px 12px', color: '#555' }}>Cargos transporte</td><td style={{ padding: '4px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(cargosTotal)}</td></tr>
            )}
            {descMonto > 0 && (
              <tr><td style={{ padding: '4px 12px', color: '#555' }}>{discountLabel(venta, descuentoPct)}</td><td style={{ padding: '4px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#a00' }}>-{fmt(descMonto)}</td></tr>
            )}
            <tr style={{ borderTop: '2px solid #111' }}><td style={{ padding: '6px 12px', fontWeight: 700 }}>Total</td><td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 15 }}>{fmt(total)}</td></tr>
            {(venta.abono || 0) > 0 && (
              <>
                <tr><td style={{ padding: '4px 12px', color: '#555' }}>Abono</td><td style={{ padding: '4px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#070' }}>{fmt(venta.abono)}</td></tr>
                <tr><td style={{ padding: '4px 12px', fontWeight: 700 }}>Saldo</td><td style={{ padding: '4px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmt(total - (venta.abono || 0))}</td></tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {venta.observaciones && (
        <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#777', marginBottom: 4 }}>Observaciones</div>
          <div style={{ fontSize: 12, color: '#333', whiteSpace: 'pre-wrap' }}>{venta.observaciones}</div>
        </div>
      )}

      <div className="no-print" style={{ textAlign: 'center', marginTop: 24, paddingTop: 16, borderTop: '1px dashed #ccc' }}>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Imprimir</button>
      </div>
    </div>
  )
}

const th = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #ccc' }
const td = { padding: '7px 10px' }
