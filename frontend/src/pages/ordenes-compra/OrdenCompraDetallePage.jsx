import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge, PageHeader, Btn, Table } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import { useOrdenCompra, useProcesarOrdenCompraVenta, useUpdateOrdenCompra } from '../../api/ordenesCompra'
import { useClientes, useClienteSucursales } from '../../api/clientes'

const ESTADOS = ['', 'Pendiente', 'En proceso', 'Despachada', 'Entregada', 'Cancelada', 'Pagada']
const CANALES = ['', 'Web', 'Convenio Marco', 'Venta Sala', 'Telefónica']

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

const ordenCompraForm = data => ({
  estadoCompra: data.estadoCompra || '',
  tipoDocumento: data.tipoDocumento || '',
  codigoVendedor: data.codigoVendedor || '',
  canal: data.canal || '',
  obsCliente: data.obsCliente || '',
  cargoServicio: data.cargoServicio || '',
  total: data.total ?? 0,
  costoEnvio: data.costoEnvio ?? 0,
})

export default function OrdenCompraDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useOrdenCompra(id)
  const updateMut = useUpdateOrdenCompra()
  const procesarMut = useProcesarOrdenCompraVenta()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [clienteId, setClienteId] = useState('')
  const [clienteSucursalId, setClienteSucursalId] = useState('')
  const { data: clientesResult } = useClientes()
  const clientes = clientesResult?.items ?? []
  const { data: sucursalesCliente = [] } = useClienteSucursales(clienteId ? Number(clienteId) : null)

  if (isLoading) return <main style={{ padding: 24 }}>Cargando…</main>
  if (!data) return <main style={{ padding: 24 }}>No encontrada</main>

  const items = data.items ?? []
  const subtotal = items.reduce((s, i) => s + (i.cantidad || 0) * (i.precio || 0), 0)

  const handleSave = () => {
    updateMut.mutate({ id: data.id, data: form }, { onSuccess: () => setEditing(false) })
  }

  const handleProcesarVenta = () => {
    if (!clienteId) return toast.warning('Selecciona el cliente ERP para crear la Venta Web')
    procesarMut.mutate({
      id: data.id,
      data: { clienteId: Number(clienteId), clienteSucursalId: clienteSucursalId ? Number(clienteSucursalId) : undefined },
    }, {
      onSuccess: venta => navigate(`/ventas/${venta.id}/editar`),
      onError: err => {
        const ventaId = err?.response?.data?.ventaId
        if (ventaId) return navigate(`/ventas/${ventaId}/editar`)
        toast.error(err?.response?.data?.error || 'No se pudo procesar la OC online')
      },
    })
  }

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
  const clienteOptions = [
    { value: '', label: 'Seleccionar cliente ERP' },
    ...clientes.map(c => ({ value: String(c.id), label: `${c.nombre} (${c.rut})` })),
  ]
  const sucursalOptions = [
    { value: '', label: sucursalesCliente.length ? 'Sin sucursal especifica' : 'Sin sucursales registradas' },
    ...sucursalesCliente.map(s => ({ value: String(s.id), label: `${s.nombre}${s.comuna ? ` - ${s.comuna}` : ''}` })),
  ]
  const canProcess = !['Procesada', 'Anulada', 'Cancelada'].includes(data.estadoCompra)

  return (
    <main className="page page-wide">
      <PageHeader
        title={`OC ${data.nCompra}`}
        subtitle={data.emailComprador || 'Sin email'}
        breadcrumb={['Inicio', 'Ventas', 'OC Online', data.nCompra]}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {!editing && <Btn variant="primary" size="sm" onClick={() => { setForm(ordenCompraForm(data)); setEditing(true) }}>Editar</Btn>}
            {editing && <>
              <Btn variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={updateMut.isPending}>Cancelar</Btn>
              <Btn variant="primary" size="sm" onClick={handleSave} disabled={updateMut.isPending}>
                {updateMut.isPending ? 'Guardando…' : 'Guardar'}
              </Btn>
            </>}
            <Btn variant="secondary" size="sm" onClick={() => navigate('/ordenes-compra')}>← Volver</Btn>
          </div>
        }
      />

      {editing ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <FormField label="Estado">
              <Select value={form.estadoCompra} onChange={v => setForm(f => ({ ...f, estadoCompra: v }))} options={ESTADOS} />
            </FormField>
            <FormField label="Canal">
              <Select value={form.canal} onChange={v => setForm(f => ({ ...f, canal: v }))} options={CANALES} />
            </FormField>
            <FormField label="Documento">
              <Input value={form.tipoDocumento} onChange={v => setForm(f => ({ ...f, tipoDocumento: v }))} />
            </FormField>
            <FormField label="Vendedor">
              <Input value={form.codigoVendedor} onChange={v => setForm(f => ({ ...f, codigoVendedor: v }))} />
            </FormField>
            <FormField label="Total">
              <Input type="number" value={form.total} onChange={v => setForm(f => ({ ...f, total: v }))} />
            </FormField>
            <FormField label="Costo envío">
              <Input type="number" value={form.costoEnvio} onChange={v => setForm(f => ({ ...f, costoEnvio: v }))} />
            </FormField>
            <FormField label="Cargo servicio">
              <Input value={form.cargoServicio} onChange={v => setForm(f => ({ ...f, cargoServicio: v }))} />
            </FormField>
          </div>
          <div style={{ marginTop: 12 }}>
            <FormField label="Observación cliente">
              <Textarea value={form.obsCliente} onChange={v => setForm(f => ({ ...f, obsCliente: v }))} rows={3} />
            </FormField>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}

      {!editing && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Procesar como Venta Web</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr) auto', gap: 10, alignItems: 'end' }}>
            <FormField label="Cliente ERP">
              <Select value={clienteId} onChange={v => { setClienteId(v); setClienteSucursalId('') }} options={clienteOptions} disabled={!canProcess} />
            </FormField>
            <FormField label="Sucursal / entrega">
              <Select value={clienteSucursalId} onChange={setClienteSucursalId} options={sucursalOptions} disabled={!canProcess || !clienteId || !sucursalesCliente.length} />
            </FormField>
            <Btn variant="primary" size="sm" onClick={handleProcesarVenta} disabled={!canProcess || procesarMut.isPending}>
              {procesarMut.isPending ? 'Procesando...' : 'Crear venta'}
            </Btn>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Productos <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({items.length})</span></div>
          <span style={{ fontSize: 12 }}><span style={{ color: 'var(--text-3)' }}>Subtotal items:</span> <strong style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(subtotal)}</strong></span>
        </div>
        <Table columns={cols} rows={items} emptyMessage="Sin productos" keyboard ariaLabel="Productos de orden de compra" getRowKey={row => row.id} />
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
