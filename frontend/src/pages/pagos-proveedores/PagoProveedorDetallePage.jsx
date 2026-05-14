import { useParams, useNavigate } from 'react-router-dom'
import { Badge, PageHeader, Btn, Table } from '../../components/shared'
import { usePagoProveedor } from '../../api/pagosProveedores'

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

const ESTADO_TONE = {
  'Pendiente': 'amber', 'Pagado': 'green', 'Vencido': 'red', 'Anulado': 'neutral',
}

export default function PagoProveedorDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = usePagoProveedor(id)

  if (isLoading) return <main style={{ padding: 24 }}>Cargando…</main>
  if (!data) return <main style={{ padding: 24 }}>No encontrado</main>

  const detalles = data.detalles ?? []
  const subtotal = detalles.reduce((s, d) => s + (d.cantidad || 0) * (d.precio || 0), 0)

  const cols = [
    { key: 'codigoInterno', label: 'Código',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{v}</span> },
    { key: 'cantidad', label: 'Cantidad', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace" }}>{v}</span> },
    { key: 'precio', label: 'Precio', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(v)}</span> },
    { key: '_total', label: 'Total', align: 'right',
      render: (_, row) => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 12 }}>{fmt((row.cantidad||0) * (row.precio||0))}</span> },
  ]

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title={`Pago ${data.nDoc || `#${data.id}`}`}
        subtitle={data.documento || 'Sin tipo doc'}
        breadcrumb={['Inicio', 'Proveedores', 'Pagos', String(data.id)]}
        actions={<Btn variant="secondary" size="sm" onClick={() => navigate('/pagos-proveedores')}>← Volver</Btn>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <InfoCard label="Estado"><Badge tone={ESTADO_TONE[data.estado] || 'gray'}>{data.estado}</Badge></InfoCard>
        <InfoCard label="Total" value={<span style={{ color: 'var(--green-700)', fontWeight: 700 }}>{fmt(data.total)}</span>} />
        <InfoCard label="Fecha doc" value={data.fechaDoc ? new Date(data.fechaDoc).toLocaleDateString('es-CL') : '—'} />
        <InfoCard label="Vencimiento" value={data.fechaVencimiento ? new Date(data.fechaVencimiento).toLocaleDateString('es-CL') : '—'} />
        <InfoCard label="Fecha pago" value={data.fechaPago ? new Date(data.fechaPago).toLocaleDateString('es-CL') : '—'} />
        <InfoCard label="Usuario" value={data.usuario || '—'} />
        <InfoCard label="Bodega" value={data.bodega || '—'} />
        <InfoCard label="N.Crédito" value={data.nc ? (data.ncNumero || 'Sí') + ' (' + fmt(data.ncMonto) + ')' : '—'} />
      </div>

      {data.proveedor && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>Proveedor</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{data.proveedor.nombre}</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
            <span style={{ fontFamily: "'DM Mono', monospace" }}>{data.proveedor.rut}</span>
            {data.proveedor.email && <span> · {data.proveedor.email}</span>}
            {data.proveedor.telefono && <span> · {data.proveedor.telefono}</span>}
          </div>
        </div>
      )}

      {data.obs && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>Observaciones</div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{data.obs}</div>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Detalle factura <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({detalles.length})</span></div>
          <span style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)' }}>Subtotal:</span> <strong style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(subtotal)}</strong></span>
        </div>
        <Table columns={cols} rows={detalles} emptyMessage="Sin detalle" />
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
