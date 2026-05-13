import { ViewPanel, FormDivider, DetailRow } from './index'

export function ViewVentaPanel({ venta, onClose, onEdit }) {
  const fecha = venta.createdAt ? new Date(venta.createdAt).toLocaleDateString('es-CL') : '—'
  const clienteNombre = venta.cliente?.nombre || '—'
  const clienteRut = venta.cliente?.rut || '—'
  const total = venta.total || 0
  const abono = venta.abono || 0
  const facturado = venta.facturado || 0

  return (
    <ViewPanel title={`Venta #${venta.id}`} subtitle={`${fecha} · ${venta.creadorNombre || '—'}`} onClose={onClose} onEdit={onEdit} onDelete={() => {}}>
      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 6 }}>Cliente</div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{clienteNombre}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace", marginTop: 3 }}>{clienteRut}</div>
      </div>
      <FormDivider label="Montos" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          ['Total Venta', `$${total.toLocaleString('es-CL')}`, true],
          ['Abono', `$${abono.toLocaleString('es-CL')}`, true],
          ['Saldo', `$${(total - abono).toLocaleString('es-CL')}`, true, (total - abono) > 0],
          ['Facturado', `$${facturado.toLocaleString('es-CL')}`, true],
        ].map(([l, v, m, warn], i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>{l}</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 15, color: warn ? 'var(--red)' : 'var(--text-1)' }}>{v}</div>
          </div>
        ))}
      </div>
      <FormDivider label="Estado" />
      <DetailRow label="Estado venta" value={venta.estado} />
      <DetailRow label="Pago" value={venta.estadoPago} />
      <DetailRow label="Entrega" value={venta.estadoEntrega} />
      <DetailRow label="Tipo" value={venta.tipo} />
      {venta.licitacion && <DetailRow label="ID Licitación" value={venta.licitacion} mono />}
      <FormDivider label="Referencias" />
      <DetailRow label="Guía" value={venta.guias ? `#${venta.guias}` : '—'} mono />
      <DetailRow label="Creada por" value={venta.creadorNombre || '—'} />
    </ViewPanel>
  )
}
