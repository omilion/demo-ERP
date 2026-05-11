import { ViewPanel, FormDivider, DetailRow } from './index'

export function ViewVentaPanel({ venta, onClose, onEdit }) {
  return (
    <ViewPanel title={`Venta #${venta.id}`} subtitle={`${venta.fecha} · ${venta.creador}`} onClose={onClose} onEdit={onEdit} onDelete={() => {}}>
      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 6 }}>Cliente</div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{venta.cliente}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace", marginTop: 3 }}>{venta.rut}</div>
      </div>
      <FormDivider label="Montos" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[['Total Venta', `$${venta.total.toLocaleString('es-CL')}`, true],['Abono', `$${venta.abono.toLocaleString('es-CL')}`, true],['Saldo', `$${(venta.total-venta.abono).toLocaleString('es-CL')}`, true, venta.total-venta.abono>0],['Facturado', `$${venta.facturado.toLocaleString('es-CL')}`, true]].map(([l,v,m,warn],i)=>(
          <div key={i} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>{l}</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 15, color: warn ? 'var(--red)' : 'var(--text-1)' }}>{v}</div>
          </div>
        ))}
      </div>
      <FormDivider label="Estado" />
      <DetailRow label="Estado venta" value={venta.estado} />
      <DetailRow label="Pago" value={venta.pago} />
      <DetailRow label="Entrega" value={venta.entrega} />
      <DetailRow label="Tipo" value={venta.tipo} />
      {venta.licitacion && <DetailRow label="ID Licitación" value={venta.licitacion} mono />}
      <FormDivider label="Referencias" />
      <DetailRow label="ODT" value={venta.odts ? `#${venta.odts}` : '—'} mono />
      <DetailRow label="Guía" value={venta.guias ? `#${venta.guias}` : '—'} mono />
      <DetailRow label="Creada por" value={venta.creador} />
    </ViewPanel>
  )
}
