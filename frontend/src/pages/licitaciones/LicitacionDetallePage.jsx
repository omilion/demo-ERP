import { useParams, useNavigate } from 'react-router-dom'
import { Badge, PageHeader, Btn, Table } from '../../components/shared'
import { useCotizacion } from '../../api/cotizaciones'

const ESTADO_TONE = {
  'Pendiente':  'amber', 'Adjudicada': 'green', 'Cerrada': 'neutral',
  'Rechazada':  'red',   'En proceso': 'blue',
}

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

export default function LicitacionDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useCotizacion(id)

  if (isLoading) return <main style={{ padding: 24 }}>Cargando…</main>
  if (!data) return <main style={{ padding: 24 }}>No encontrada</main>

  const items = data.items ?? []
  const subtotal = items.reduce((s, i) => s + (i.cantidad || 0) * (i.precio || 0), 0)
  const totalAdjudicado = items.reduce((s, i) => s + (i.cantAdjudicados || 0) * (i.precio || 0), 0)

  const cols = [
    { key: 'codigoInterno', label: 'Código',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{v || '—'}</span> },
    { key: 'nombre', label: 'Producto', wrap: true,
      render: v => <span style={{ fontSize: 13 }}>{v || '—'}</span> },
    { key: 'descripcion', label: 'Descripción', wrap: true,
      render: v => <span style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 280, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '—'}</span> },
    { key: 'cantidad', label: 'Cant.', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace" }}>{v}</span> },
    { key: 'cantAdjudicados', label: 'Adjud.', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", color: v > 0 ? 'var(--green-700)' : 'var(--text-3)' }}>{v}</span> },
    { key: 'precio', label: 'Precio', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(v)}</span> },
    { key: '_total', label: 'Total', align: 'right',
      render: (_, row) => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 12 }}>{fmt((row.cantidad||0) * (row.precio||0))}</span> },
  ]

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title={`Licitación ${data.idLicitacion || `#${data.id}`}`}
        subtitle={data.referencia || 'Sin referencia'}
        breadcrumb={['Inicio', 'Ventas', 'Licitaciones', String(data.id)]}
        actions={<Btn variant="secondary" size="sm" onClick={() => navigate('/licitaciones')}>← Volver</Btn>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <InfoCard label="Estado"><Badge tone={ESTADO_TONE[data.estado] || 'gray'}>{data.estado}</Badge></InfoCard>
        <InfoCard label="Fecha cotización" value={data.fecha ? new Date(data.fecha).toLocaleDateString('es-CL') : '—'} />
        <InfoCard label="Fecha creación" value={data.fechaCreacion ? new Date(data.fechaCreacion).toLocaleDateString('es-CL') : '—'} />
        <InfoCard label="Plazo" value={data.plazo || '—'} />
        <InfoCard label="Vendedor" value={data.usuario || '—'} />
        <InfoCard label="OC" value={data.ordenCompra || '—'} />
      </div>

      {data.cliente && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Organismo / Cliente</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{data.cliente.nombre}</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
            <span style={{ fontFamily: "'DM Mono', monospace" }}>{data.cliente.rut}</span>
            {data.cliente.email && <span> · {data.cliente.email}</span>}
            {data.cliente.telefono && <span> · {data.cliente.telefono}</span>}
          </div>
        </div>
      )}
      {!data.cliente && data.rutCliente && (
        <div style={{ background: 'var(--amber-50)', border: '1px solid var(--amber-200)', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 13 }}>
          RUT cliente <span style={{ fontFamily: "'DM Mono', monospace" }}>{data.rutCliente}</span> no encontrado en clientes registrados.
        </div>
      )}

      {data.obs && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Observaciones</div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-1)' }}>{data.obs}</div>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Productos cotizados <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({items.length})</span></div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span><span style={{ color: 'var(--text-3)' }}>Subtotal cotizado:</span> <strong style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(subtotal)}</strong></span>
            <span><span style={{ color: 'var(--text-3)' }}>Adjudicado:</span> <strong style={{ fontFamily: "'DM Mono', monospace", color: 'var(--green-700)' }}>{fmt(totalAdjudicado)}</strong></span>
          </div>
        </div>
        <Table columns={cols} rows={items} emptyMessage="Sin productos cotizados" />
      </div>
    </main>
  )
}

function InfoCard({ label, value, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--border)', padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      {children ?? <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>}
    </div>
  )
}
