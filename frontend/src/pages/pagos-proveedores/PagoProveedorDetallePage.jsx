import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { Badge, Btn, PageHeader, Table } from '../../components/shared'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import { useAplicarStock } from '../../api/stockIngresos'
import {
  useAnularAbonoProveedor,
  useAnularPagoProveedor,
  usePagoProveedor,
  useUpdatePagoProveedor,
} from '../../api/pagosProveedores'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import ModalRegistrarAbono from './ModalRegistrarAbono'

const fmt = n => '$' + Number(n || 0).toLocaleString('es-CL')
const dateFmt = v => v ? new Date(v).toLocaleDateString('es-CL') : '-'

const STOCK_BODEGAS = new Set(['Inventario', 'Materias', 'Taller'])
const isStockBodega = bodega => STOCK_BODEGAS.has(bodega)
const ESTADO_TONE = {
  Pendiente: 'amber',
  Abonado: 'blue',
  Pagado: 'green',
  Vencido: 'red',
  Anulado: 'neutral',
}
const ESTADOS = ['Pendiente', 'Abonado', 'Pagado', 'Vencido']

const pagoProveedorForm = data => ({
  estado: data.estado || 'Pendiente',
  documento: data.documento || '',
  nDoc: data.nDoc || '',
  total: data.total ?? 0,
  neto: data.neto ?? '',
  iva: data.iva ?? '',
  exento: data.exento ?? '',
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
  const canPay = can(user, 'caja.pagos_proveedores', 'write')
  const canWriteProveedores = can(user, 'proveedores', 'write') || canPay
  const canWriteBodega = can(user, 'bodega', 'write')
  const canReverse = can(user, 'caja.pagos_proveedores', 'delete') || can(user, 'proveedores', 'delete')

  const { data, isLoading } = usePagoProveedor(id)
  const updateMut = useUpdatePagoProveedor()
  const aplicarMut = useAplicarStock()
  const anularMut = useAnularPagoProveedor()
  const anularAbonoMut = useAnularAbonoProveedor()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [showAbonoModal, setShowAbonoModal] = useState(false)

  if (isLoading) return <main style={{ padding: 24 }}>Cargando...</main>
  if (!data) return <main style={{ padding: 24 }}>Documento no encontrado</main>

  const detalles = data.detalles ?? []
  const abonos = data.abonos ?? []
  const subtotal = detalles.reduce((s, d) => s + Number(d.cantidad || 0) * Number(d.precio || 0), 0)
  const stockLocked = !!data.stockAplicadoAt && !data.stockReversadoAt
  const saldoNum = Number(data.saldo ?? 0)

  const handleSave = () => {
    const payload = {
      ...form,
      total: form.total === '' ? undefined : Number(form.total),
      ncMonto: form.ncMonto === '' ? null : parseFloat(form.ncMonto),
      neto: form.neto === '' ? null : parseFloat(form.neto),
      iva: form.iva === '' ? null : parseFloat(form.iva),
      exento: form.exento === '' ? null : parseFloat(form.exento),
    }
    updateMut.mutate({ id: data.id, data: payload }, {
      onSuccess: () => {
        toast.success('Documento actualizado correctamente')
        setEditing(false)
      },
      onError: err => toast.error(err.response?.data?.error || 'Error al guardar'),
    })
  }

  const handleAplicarStock = async () => {
    if (!await confirmDialog({ title: 'Confirmar ingreso de stock', detail: `¿Aplicar stock físico del documento ${data.nDoc || data.id}?` })) return
    aplicarMut.mutate(data.id, {
      onSuccess: () => toast.success('Stock aplicado con éxito'),
      onError: err => toast.error(err.response?.data?.error || 'No se pudo aplicar stock'),
    })
  }

  const handleAnular = async () => {
    const motivo = await promptDialog({ title: `Motivo de anulación para ${data.documento} ${data.nDoc || data.id}` })
    if (motivo === null) return
    if (!motivo.trim()) return toast.warning('Motivo requerido')
    anularMut.mutate({ id: data.id, motivo: motivo.trim() }, {
      onSuccess: () => toast.success('Documento anulado correctamente'),
      onError: err => toast.error(err.response?.data?.error || 'No se pudo anular'),
    })
  }

  const handleAnularAbono = async (abono) => {
    const motivo = await promptDialog({
      title: `Anular abono de ${fmt(abono.monto)}`,
      detail: 'Se revertirá el saldo pendiente y el movimiento de caja asociado.',
    })
    if (motivo === null) return
    if (!motivo.trim()) return toast.warning('Motivo requerido')

    anularAbonoMut.mutate({
      id: data.id,
      abonoId: abono.id,
      motivo: motivo.trim(),
    }, {
      onSuccess: () => toast.success('Abono anulado con éxito'),
      onError: err => toast.error(err.response?.data?.error || 'Error al anular abono'),
    })
  }

  const colsDetalles = [
    { key: 'codigoInterno', label: 'Código', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{v}</span> },
    { key: 'destino', label: 'Destino', render: v => <Badge tone="neutral">{v || 'producto'}</Badge> },
    { key: 'nombre', label: 'Nombre', render: v => v || '-' },
    { key: 'unidadMedida', label: 'Unidad', render: v => v || '-' },
    { key: 'cantidad', label: 'Cantidad', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace" }}>{v}</span> },
    { key: 'precio', label: 'Costo Unit.', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{fmt(v)}</span> },
    { key: '_total', label: 'Total', align: 'right', render: (_, row) => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 12 }}>{fmt(Number(row.cantidad || 0) * Number(row.precio || 0))}</span> },
  ]

  const colsAbonos = [
    { key: 'fechaPago', label: 'Fecha Pago', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{dateFmt(v)}</span> },
    { key: 'monto', label: 'Monto Abonado', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: 'var(--green-700)' }}>{fmt(v)}</span> },
    { key: 'origenFondos', label: 'Origen', render: v => <Badge tone={v === 'Caja' ? 'amber' : 'blue'}>{v || 'Banco'}</Badge> },
    { key: 'medioPago', label: 'Medio', render: v => v || 'Efectivo' },
    {
      key: '_bancoOp',
      label: 'Banco / Operación',
      render: (_, row) => (
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          {[row.bancoOrigen, row.numeroOperacion ? `Op: ${row.numeroOperacion}` : null].filter(Boolean).join(' - ') || '-'}
        </span>
      ),
    },
    {
      key: 'movimientoCajaId',
      label: 'Mov. Caja',
      render: v => v ? <Badge tone="neutral">ID #{v}</Badge> : '-',
    },
    { key: 'usuario', label: 'Registrado por', render: v => <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{v || '-'}</span> },
    {
      key: 'comprobanteUrl',
      label: 'Comprobante',
      render: v => v ? (
        <a href={v} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'underline' }}>
          Ver archivo
        </a>
      ) : '-',
    },
    {
      key: 'anulado',
      label: 'Estado',
      render: (v, row) => v ? (
        <Badge tone="red" title={row.motivoAnulacion || 'Anulado'}>Anulado</Badge>
      ) : (
        <Badge tone="green">Válido</Badge>
      ),
    },
    {
      key: '_acc',
      label: '',
      align: 'right',
      render: (_, row) => !row.anulado && canReverse && (
        <Btn
          variant="danger"
          size="xs"
          onClick={() => handleAnularAbono(row)}
          disabled={anularAbonoMut.isPending}
        >
          Anular Abono
        </Btn>
      ),
    },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title={`${data.documento || 'Documento'} ${data.nDoc ? `N° ${data.nDoc}` : `#${data.id}`}`}
        subtitle={data.proveedor?.nombre ? `Proveedor: ${data.proveedor.nombre}` : 'Sin proveedor asignado'}
        breadcrumb={['Inicio', 'Caja', 'Pagos a Proveedores', String(data.id)]}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {canPay && saldoNum > 0 && data.estado !== 'Anulado' && (
              <Btn
                variant="primary"
                size="sm"
                icon="creditCard"
                onClick={() => setShowAbonoModal(true)}
              >
                Registrar Pago / Abono
              </Btn>
            )}
            {canWriteProveedores && !editing && data.estado !== 'Anulado' && (
              <Btn
                variant="secondary"
                size="sm"
                icon="edit"
                onClick={() => { setForm(pagoProveedorForm(data)); setEditing(true) }}
              >
                Editar
              </Btn>
            )}
            {canWriteBodega && isStockBodega(data.bodega) && !data.stockAplicadoAt && detalles.length > 0 && (
              <Btn
                variant="secondary"
                size="sm"
                icon="check"
                onClick={handleAplicarStock}
                disabled={aplicarMut.isPending}
              >
                Aplicar Stock
              </Btn>
            )}
            {canReverse && !data.eliminado && (
              <Btn
                variant="danger"
                size="sm"
                icon="trash"
                onClick={handleAnular}
                disabled={anularMut.isPending}
              >
                Anular Documento
              </Btn>
            )}
            {editing && (
              <>
                <Btn variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={updateMut.isPending}>
                  Cancelar
                </Btn>
                <Btn variant="primary" size="sm" onClick={handleSave} disabled={updateMut.isPending}>
                  {updateMut.isPending ? 'Guardando...' : 'Guardar Cambios'}
                </Btn>
              </>
            )}
            <Btn variant="secondary" size="sm" onClick={() => navigate('/pagos-proveedores')}>
              Volver
            </Btn>
          </div>
        }
      />

      {/* DTE Recibido SII Banner */}
      {data.documentoRecibido && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px',
          marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
              Documento Tributario Electrónico (DTE) Vinculado
            </div>
            <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>
              Folio: <strong>{data.documentoRecibido.folio}</strong> | Tipo DTE: <strong>{data.documentoRecibido.tipoDte}</strong> | Emisor: {data.documentoRecibido.razonSocialEmisor || data.documentoRecibido.rutEmisor}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href={`/api/facturacion/recibidos/${data.documentoRecibido.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              style={{
                textDecoration: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: '#16a34a', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              Descargar PDF DTE
            </a>
            <a
              href={`/api/facturacion/recibidos/${data.documentoRecibido.id}/xml`}
              download
              style={{
                textDecoration: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: '#fff', color: '#166534', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              XML Original
            </a>
          </div>
        </div>
      )}

      {/* Panel de Edición */}
      {editing ? (
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
          {stockLocked && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'var(--amber-bg)', color: 'oklch(0.48 0.14 68)', fontSize: 12 }}>
              Documento con stock aplicado: los campos de inventario y total están bloqueados para proteger la trazabilidad.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <FormField label="Estado">
              <Select value={form.estado} onChange={v => setForm(f => ({ ...f, estado: v }))} options={ESTADOS} />
            </FormField>
            <FormField label="Documento">
              <Input value={form.documento} onChange={v => setForm(f => ({ ...f, documento: v }))} disabled={stockLocked} />
            </FormField>
            <FormField label="N Doc">
              <Input value={form.nDoc} onChange={v => setForm(f => ({ ...f, nDoc: v }))} disabled={stockLocked} />
            </FormField>
            <FormField label="Total Factura">
              <Input type="number" value={form.total} onChange={v => setForm(f => ({ ...f, total: v }))} disabled={stockLocked} />
            </FormField>
            <FormField label="Neto">
              <Input type="number" value={form.neto} onChange={v => setForm(f => ({ ...f, neto: v }))} />
            </FormField>
            <FormField label="IVA">
              <Input type="number" value={form.iva} onChange={v => setForm(f => ({ ...f, iva: v }))} />
            </FormField>
            <FormField label="Exento">
              <Input type="number" value={form.exento} onChange={v => setForm(f => ({ ...f, exento: v }))} />
            </FormField>
            <FormField label="Fecha Doc">
              <Input type="date" value={form.fechaDoc} onChange={v => setForm(f => ({ ...f, fechaDoc: v }))} disabled={stockLocked} />
            </FormField>
            <FormField label="Vencimiento">
              <Input type="date" value={form.fechaVencimiento} onChange={v => setForm(f => ({ ...f, fechaVencimiento: v }))} />
            </FormField>
            <FormField label="Bodega">
              <Input value={form.bodega} onChange={v => setForm(f => ({ ...f, bodega: v }))} disabled={stockLocked} />
            </FormField>
            <FormField label="Nota de Crédito">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={form.nc} onChange={e => setForm(f => ({ ...f, nc: e.target.checked }))} disabled={stockLocked} />
                <Input value={form.ncNumero} onChange={v => setForm(f => ({ ...f, ncNumero: v }))} placeholder="N° NC" disabled={stockLocked} />
                <Input type="number" value={form.ncMonto} onChange={v => setForm(f => ({ ...f, ncMonto: v }))} placeholder="Monto NC" disabled={stockLocked} />
              </div>
            </FormField>
          </div>
          <div style={{ marginTop: 12 }}>
            <FormField label="Observaciones">
              <Textarea value={form.obs} onChange={v => setForm(f => ({ ...f, obs: v }))} rows={2} />
            </FormField>
          </div>
        </div>
      ) : (
        <>
          {/* Tarjetas Financieras Clave */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
            <InfoCard label="Estado">
              <Badge tone={ESTADO_TONE[data.estado] || 'gray'}>{data.estado}</Badge>
            </InfoCard>
            <InfoCard label="Total Documento" value={<span style={{ fontWeight: 600 }}>{fmt(data.total)}</span>} />
            <InfoCard label="Neto" value={fmt(data.neto)} />
            <InfoCard label="IVA (19%)" value={fmt(data.iva)} />
            <InfoCard label="Nota de Crédito" value={data.nc ? `${data.ncNumero || 'Si'} (${fmt(data.ncMonto)})` : '$0'} />
            <InfoCard label="Total Pagado" value={<span style={{ color: 'var(--green-700)', fontWeight: 600 }}>{fmt(data.montoPagado)}</span>} />
            <InfoCard
              label="Saldo Pendiente"
              value={
                <span style={{
                  fontSize: 16, fontWeight: 700,
                  color: saldoNum > 0 ? 'var(--amber-700, #b45309)' : 'var(--green-700)',
                }}>
                  {fmt(data.saldo)}
                </span>
              }
            />
            <InfoCard label="Fecha Doc" value={dateFmt(data.fechaDoc)} />
            <InfoCard label="Vencimiento" value={dateFmt(data.fechaVencimiento)} />
            <InfoCard label="Stock Bodega" value={data.stockAplicadoAt ? (data.stockReversadoAt ? 'Reversado' : 'Aplicado') : 'Pendiente'} />
          </div>

          {/* Datos del Proveedor */}
          {data.proveedor && (
            <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>
                Información del Proveedor
              </div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{data.proveedor.nombre}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                <span style={{ fontFamily: "'DM Mono', monospace" }}>{data.proveedor.rut}</span>
                {data.proveedor.email && <span> • {data.proveedor.email}</span>}
                {data.proveedor.telefono && <span> • {data.proveedor.telefono}</span>}
              </div>
            </div>
          )}

          {data.obs && (
            <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>
                Observaciones
              </div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{data.obs}</div>
            </div>
          )}
        </>
      )}

      {/* Historial de Pagos y Abonos de Tesorería */}
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 16 }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Historial de Pagos y Abonos</span>{' '}
            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>({abonos.length} pagos registrados)</span>
          </div>
          {canPay && saldoNum > 0 && data.estado !== 'Anulado' && (
            <Btn size="xs" variant="primary" icon="plus" onClick={() => setShowAbonoModal(true)}>
              Nuevo Abono
            </Btn>
          )}
        </div>
        <Table
          columns={colsAbonos}
          rows={abonos}
          emptyMessage="No se han registrado pagos o abonos para este documento"
          ariaLabel="Historial de abonos proveedor"
          getRowKey={row => row.id}
        />
      </div>

      {/* Detalle de Ítems / Productos */}
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            Detalle de la Factura <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({detalles.length} ítems)</span>
          </div>
          <span style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--text-3)' }}>Subtotal ítems:</span>{' '}
            <strong style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(subtotal)}</strong>
          </span>
        </div>
        <Table
          columns={colsDetalles}
          rows={detalles}
          emptyMessage="Documento registrado sin detalle individual de ítems (registro contable simple)"
          ariaLabel="Detalle de factura proveedor"
          getRowKey={row => row.id}
        />
      </div>

      {/* Modal Registrar Abono */}
      {showAbonoModal && (
        <ModalRegistrarAbono
          pago={data}
          onClose={() => setShowAbonoModal(false)}
          onSuccess={() => setShowAbonoModal(false)}
        />
      )}
    </main>
  )
}

function InfoCard({ label, value, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>
        {label}
      </div>
      {children ?? <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>}
    </div>
  )
}
