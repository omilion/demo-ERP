import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, Btn, PageHeader, Table } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import { useAplicarStock } from '../../api/stockIngresos'
import { useAnularPagoProveedor, usePagoProveedor, useUpdatePagoProveedor } from '../../api/pagosProveedores'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const fmt = n => '$' + Number(n || 0).toLocaleString('es-CL')
const dateFmt = v => v ? new Date(v).toLocaleDateString('es-CL') : '-'

const STOCK_BODEGAS = new Set(['Inventario', 'Materias', 'Taller'])
const isStockBodega = bodega => STOCK_BODEGAS.has(bodega)
const ESTADO_TONE = { Pendiente: 'amber', Pagado: 'green', Vencido: 'red', Anulado: 'neutral' }
const ESTADOS = ['Pendiente', 'Pagado', 'Vencido']

const pagoProveedorForm = data => ({
  estado: data.estado || 'Pendiente',
  documento: data.documento || '',
  nDoc: data.nDoc || '',
  total: data.total ?? 0,
  fechaDoc: data.fechaDoc ? data.fechaDoc.slice(0, 10) : '',
  fechaVencimiento: data.fechaVencimiento ? data.fechaVencimiento.slice(0, 10) : '',
  fechaPago: data.fechaPago ? data.fechaPago.slice(0, 10) : '',
  usuario: data.usuario || '',
  bodega: data.bodega || '',
  nc: !!data.nc,
  ncNumero: data.ncNumero || '',
  ncMonto: data.ncMonto ?? '',
  obs: data.obs || '',
})

export default function PagoProveedorDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const canWriteProveedores = can(user, 'proveedores', 'write')
  const canWriteBodega = can(user, 'bodega', 'write')
  const canReverse = can(user, 'proveedores', 'delete')
  const { data, isLoading } = usePagoProveedor(id)
  const updateMut = useUpdatePagoProveedor()
  const aplicarMut = useAplicarStock()
  const anularMut = useAnularPagoProveedor()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})

  if (isLoading) return <main style={{ padding: 24 }}>Cargando...</main>
  if (!data) return <main style={{ padding: 24 }}>No encontrado</main>

  const detalles = data.detalles ?? []
  const subtotal = detalles.reduce((s, d) => s + Number(d.cantidad || 0) * Number(d.precio || 0), 0)
  const stockLocked = !!data.stockAplicadoAt && !data.stockReversadoAt

  const handleSave = () => {
    const payload = { ...form, ncMonto: form.ncMonto === '' ? null : parseFloat(form.ncMonto) }
    updateMut.mutate({ id: data.id, data: payload }, { onSuccess: () => setEditing(false) })
  }
  const handleAplicarStock = () => {
    if (!confirm(`Aplicar stock del documento ${data.nDoc || data.id}?`)) return
    aplicarMut.mutate(data.id, { onError: err => alert(err.response?.data?.error || 'No se pudo aplicar stock') })
  }
  const handleAnular = () => {
    const motivo = prompt(`Motivo de anulacion para ${data.nDoc || data.id}`)
    if (motivo === null) return
    if (!motivo.trim()) return alert('Motivo requerido')
    anularMut.mutate({ id: data.id, motivo: motivo.trim() }, { onError: err => alert(err.response?.data?.error || 'No se pudo anular') })
  }

  const cols = [
    { key: 'codigoInterno', label: 'Codigo', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{v}</span> },
    { key: 'destino', label: 'Destino', render: v => <Badge tone="neutral">{v || 'producto'}</Badge> },
    { key: 'nombre', label: 'Nombre', render: v => v || '-' },
    { key: 'unidadMedida', label: 'Unidad', render: v => v || '-' },
    { key: 'cantidad', label: 'Cantidad', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace" }}>{v}</span> },
    { key: 'precio', label: 'Costo', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(v)}</span> },
    { key: '_total', label: 'Total', align: 'right', render: (_, row) => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 12 }}>{fmt(Number(row.cantidad || 0) * Number(row.precio || 0))}</span> },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title={`Pago ${data.nDoc || `#${data.id}`}`}
        subtitle={data.documento || 'Sin tipo doc'}
        breadcrumb={['Inicio', 'Proveedores', 'Pagos', String(data.id)]}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {canWriteProveedores && !editing && <Btn variant="primary" size="sm" onClick={() => { setForm(pagoProveedorForm(data)); setEditing(true) }}>Editar</Btn>}
            {canWriteBodega && isStockBodega(data.bodega) && !data.stockAplicadoAt && detalles.length > 0 && <Btn variant="secondary" size="sm" icon="check" onClick={handleAplicarStock} disabled={aplicarMut.isPending}>Aplicar stock</Btn>}
            {canReverse && !data.eliminado && <Btn variant="danger" size="sm" icon="trash" onClick={handleAnular} disabled={anularMut.isPending}>Anular</Btn>}
            {editing && <>
              <Btn variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={updateMut.isPending}>Cancelar</Btn>
              <Btn variant="primary" size="sm" onClick={handleSave} disabled={updateMut.isPending}>{updateMut.isPending ? 'Guardando...' : 'Guardar'}</Btn>
            </>}
            <Btn variant="secondary" size="sm" onClick={() => navigate('/pagos-proveedores')}>Volver</Btn>
          </div>
        }
      />

      {editing ? (
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          {stockLocked && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'var(--amber-bg)', color: 'oklch(0.48 0.14 68)', fontSize: 12 }}>
              Documento con stock aplicado: solo se permite ajustar estado de pago, fecha de pago, vencimiento y observaciones.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <FormField label="Estado"><Select value={form.estado} onChange={v => setForm(f => ({ ...f, estado: v }))} options={ESTADOS} /></FormField>
            <FormField label="Documento"><Input value={form.documento} onChange={v => setForm(f => ({ ...f, documento: v }))} disabled={stockLocked} /></FormField>
            <FormField label="N Doc"><Input value={form.nDoc} onChange={v => setForm(f => ({ ...f, nDoc: v }))} disabled={stockLocked} /></FormField>
            <FormField label="Total"><Input type="number" value={form.total} onChange={v => setForm(f => ({ ...f, total: v }))} disabled={stockLocked} /></FormField>
            <FormField label="Fecha doc"><Input type="date" value={form.fechaDoc} onChange={v => setForm(f => ({ ...f, fechaDoc: v }))} disabled={stockLocked} /></FormField>
            <FormField label="Vencimiento"><Input type="date" value={form.fechaVencimiento} onChange={v => setForm(f => ({ ...f, fechaVencimiento: v }))} /></FormField>
            <FormField label="Fecha pago"><Input type="date" value={form.fechaPago} onChange={v => setForm(f => ({ ...f, fechaPago: v }))} /></FormField>
            <FormField label="Usuario"><Input value={form.usuario} onChange={v => setForm(f => ({ ...f, usuario: v }))} /></FormField>
            <FormField label="Bodega"><Input value={form.bodega} onChange={v => setForm(f => ({ ...f, bodega: v }))} disabled={stockLocked} /></FormField>
            <FormField label="N.Credito">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={form.nc} onChange={e => setForm(f => ({ ...f, nc: e.target.checked }))} disabled={stockLocked} />
                <Input value={form.ncNumero} onChange={v => setForm(f => ({ ...f, ncNumero: v }))} placeholder="N" disabled={stockLocked} />
                <Input type="number" value={form.ncMonto} onChange={v => setForm(f => ({ ...f, ncMonto: v }))} placeholder="Monto" disabled={stockLocked} />
              </div>
            </FormField>
          </div>
          <FormField label="Observaciones"><Textarea value={form.obs} onChange={v => setForm(f => ({ ...f, obs: v }))} rows={3} /></FormField>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <InfoCard label="Estado"><Badge tone={ESTADO_TONE[data.estado] || 'gray'}>{data.estado}</Badge></InfoCard>
            <InfoCard label="Total" value={<span style={{ color: 'var(--green-700)', fontWeight: 700 }}>{fmt(data.total)}</span>} />
            <InfoCard label="Fecha doc" value={dateFmt(data.fechaDoc)} />
            <InfoCard label="Vencimiento" value={dateFmt(data.fechaVencimiento)} />
            <InfoCard label="Fecha pago" value={dateFmt(data.fechaPago)} />
            <InfoCard label="Usuario" value={data.usuario || '-'} />
            <InfoCard label="Bodega" value={data.bodega || '-'} />
            <InfoCard label="Stock" value={data.stockAplicadoAt ? (data.stockReversadoAt ? 'Reversado' : 'Aplicado') : 'Pendiente'} />
            <InfoCard label="N.Credito" value={data.nc ? `${data.ncNumero || 'Si'} (${fmt(data.ncMonto)})` : '-'} />
          </div>

          {data.proveedor && (
            <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>Proveedor</div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{data.proveedor.nombre}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                <span style={{ fontFamily: "'DM Mono', monospace" }}>{data.proveedor.rut}</span>
                {data.proveedor.email && <span> - {data.proveedor.email}</span>}
                {data.proveedor.telefono && <span> - {data.proveedor.telefono}</span>}
              </div>
            </div>
          )}

          {data.obs && (
            <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>Observaciones</div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{data.obs}</div>
            </div>
          )}
        </>
      )}

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Detalle factura <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({detalles.length})</span></div>
          <span style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)' }}>Subtotal:</span> <strong style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(subtotal)}</strong></span>
        </div>
        <Table columns={cols} rows={detalles} emptyMessage="Sin detalle" keyboard ariaLabel="Detalle de factura proveedor" getRowKey={row => row.id} />
      </div>
    </main>
  )
}

function InfoCard({ label, value, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>{label}</div>
      {children ?? <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>}
    </div>
  )
}
