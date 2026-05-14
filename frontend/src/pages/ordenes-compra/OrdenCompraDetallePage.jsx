import { useParams, useNavigate } from 'react-router-dom'
import { Badge, PageHeader, Btn, Table } from '../../components/shared'
import { useOrdenCompra } from '../../api/ordenesCompra'

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

export default function OrdenCompraDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useOrdenCompra(id)

  if (isLoading) return <main style={{ padding: 24 }}>Cargando…</main>
  if (!data) return <main style={{ padding: 24 }}>No encontrada</main>

  const items = data.items ?? []
  const subtotal = items.reduce((s, i) => s + (i.cantidad || 0) * (i.precio || 0), 0)

  const cols = [
    { key: 'codigoInterno', label: 'Código',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{v || '—'}</span> },
    { key: 'nombre', label: 'Producto', wrap: true,
      render: v => <span style={{ fontSize: 13 }}>{v || '—'}</span> },
    { key: 'descripcion', label: 'Descripción', wrap: true,
      render: v => <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{v || '—'}</span> },
    { key: 'cantidad', label: 'Cant.', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace" }}>{v}</span> },
    { key: 'precio', label: 'Precio', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(v)}</span> },
    { key: '_total', label: 'Total', align: 'right',
      render: (_, row) => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 12 }}>{fmt((row.cantidad||0) * (row.precio||0))}</span> },
  ]

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title={`OC ${data.nCompra}`}
        subtitle={data.emailComprador || 'Sin email'}
        breadcrumb={['Inicio', 'Ventas', 'OC Online', data.nCompra]}
        actions={<Btn variant="secondary" size="sm" onClick={() => navigate('/ordenes-compra')}>← Volver</Btn>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <InfoCard label="Fecha" value={data.fechaHora ? new Date(data.fechaHora).toLocaleString('es-CL') : '—'} />
        <InfoCard label="Total" value={<span style={{ color: 'var(--green-700)', fontWeight: 700 }}>{fmt(data.total)}</span>} />
        <InfoCard label="Estado">{data.estadoCompra ? <Badge tone="blue">{data.estadoCompra}</Badge> : '—'}</InfoCard>
        <InfoCard label="Canal" value={data.canal || '—'} />
        <InfoCard label="Documento" value={data.tipoDocumento || '—'} />
        <InfoCard label="Vendedor" value={data.codigoVendedor || '—'} />
        <InfoCard label="Costo envío" value={fmt(data.costoEnvio)} />
        <InfoCard label="Cargo servicio" value={data.cargoServicio || '—'} />
      </div>

      {data.obsCliente && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>Observación cliente</div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{data.obsCliente}</div>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Productos <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({items.length})</span></div>
          <span style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)' }}>Subtotal items:</span> <strong style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(subtotal)}</strong></span>
        </div>
        <Table columns={cols} rows={items} emptyMessage="Sin productos" />
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
