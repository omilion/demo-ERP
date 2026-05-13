import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, Textarea, useForm } from '../../components/forms/index'
import { useVenta, useCreateVenta, useUpdateVenta } from '../../api/ventas'
import { useClientes } from '../../api/clientes'

const TIPOS = ['Normal', 'Licitación', 'Convenio Marco', 'Venta Web', 'Venta Sala']

export default function VentasFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const { data: found, isLoading } = useVenta(isEdit ? Number(id) : null)
  const { data: clientesResult } = useClientes()
  const clientesData = clientesResult?.items ?? []
  const createVenta = useCreateVenta()
  const updateVenta = useUpdateVenta()

  const { data, set, errors, validate } = useForm({
    clienteId: '', tipo: 'Normal', estado: 'Activa',
    estadoPago: 'No pagada', estadoEntrega: 'Pendiente entrega',
    total: '', abono: '', guias: '', facturado: '',
    descuentoPct: '', licitacion: '', observaciones: '',
  })

  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (found && !initialized) {
      set('clienteId', String(found.clienteId || ''))
      set('tipo', found.tipo || 'Normal')
      set('estado', found.estado || 'Activa')
      set('estadoPago', found.estadoPago || 'No pagada')
      set('estadoEntrega', found.estadoEntrega || 'Pendiente entrega')
      set('abono', found.abono != null ? String(found.abono) : '')
      set('guias', found.guias != null ? String(found.guias) : '')
      set('facturado', found.facturado != null ? String(found.facturado) : '')
      set('descuentoPct', found.descuentoPct != null ? String(found.descuentoPct) : '')
      set('licitacion', found.licitacion || '')
      set('observaciones', found.observaciones || '')
      setInitialized(true)
    }
  }, [found?.id])

  const saving = createVenta.isPending || updateVenta.isPending

  const handleSave = () => {
    if (!isEdit && !validate({ total: { required: true } })) return
    const payload = {
      tipo: data.tipo,
      estado: data.estado,
      estadoPago: data.estadoPago,
      estadoEntrega: data.estadoEntrega,
      licitacion: data.licitacion || undefined,
      observaciones: data.observaciones || undefined,
    }
    if (data.clienteId) payload.clienteId = Number(data.clienteId)
    if (isEdit) {
      if (data.abono !== '') payload.abono = Number(data.abono)
      if (data.guias !== '') payload.guias = parseInt(data.guias, 10)
      if (data.facturado !== '') payload.facturado = Number(data.facturado)
      if (data.descuentoPct !== '') payload.descuentoPct = Number(data.descuentoPct)
      updateVenta.mutate({ id: Number(id), data: payload }, {
        onSuccess: () => navigate('/ventas'),
        onError: (err) => alert(err.response?.data?.error || 'Error al guardar'),
      })
    } else {
      createVenta.mutate({
        ...payload,
        items: [{ productoId: 1, cantidad: 1, precioUnitario: Number(data.total) || 0 }],
      }, {
        onSuccess: () => navigate('/ventas'),
        onError: (err) => alert(err.response?.data?.error || 'Error al crear'),
      })
    }
  }

  const clienteOptions = [
    { value: '', label: '— Seleccionar cliente —' },
    ...clientesData.map(c => ({ value: String(c.id), label: `${c.nombre} (${c.rut})` })),
  ]

  if (isEdit && isLoading) return <main style={{ padding: 24 }}><p>Cargando…</p></main>

  const tipoValue = TIPOS.includes(data.tipo) ? data.tipo : data.tipo
  const showLicitacion = data.tipo === 'Licitación' || data.tipo === 'Convenio Marco'

  return (
    <FormPage
      title={isEdit ? 'Editar Venta' : 'Nueva Venta'}
      subtitle={isEdit ? `Editando venta #${id}` : 'Crear nueva orden de venta'}
      breadcrumb={['Inicio', 'Ventas', isEdit ? 'Editar Venta' : 'Nueva Venta']}
      onSave={handleSave}
      saving={saving}
    >
      <FormDivider label="Cliente" />
      <FormField label="Cliente / Organismo">
        <Select value={data.clienteId} onChange={v => set('clienteId', v)} options={clienteOptions} />
      </FormField>
      {isEdit && found?.cliente && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -8, marginBottom: 4 }}>
          Actual: <strong style={{ color: 'var(--text-2)' }}>{found.cliente.nombre}</strong> · RUT {found.cliente.rut}
        </div>
      )}

      <FormDivider label="Venta" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Tipo de Venta">
          <Select value={tipoValue} onChange={v => set('tipo', v)} options={TIPOS} />
        </FormField>
        {!isEdit && (
          <FormField label="Total Venta" required error={errors.total}>
            <Input value={data.total} onChange={v => set('total', v)} placeholder="0" type="number" prefix="$" error={errors.total} />
          </FormField>
        )}
      </div>
      <FormField label="ID Licitación / N° OC" hint="Ej: 61602954-LE15-1">
        <Input value={data.licitacion || ''} onChange={v => set('licitacion', v)} placeholder="Código o número de seguimiento" />
      </FormField>

      <FormDivider label="Estado" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Estado">
          <Select value={data.estado} onChange={v => set('estado', v)} options={['Activa', 'Cerrada', 'Nula', 'Completada', 'En proceso']} />
        </FormField>
        <FormField label="Pago">
          <Select value={data.estadoPago} onChange={v => set('estadoPago', v)} options={['No pagada', 'Pagada', 'Parcial']} />
        </FormField>
        <FormField label="Entrega">
          <Select value={data.estadoEntrega} onChange={v => set('estadoEntrega', v)} options={['Pendiente entrega', 'Entregada', 'En despacho', 'Parcial']} />
        </FormField>
      </div>

      {isEdit && (
        <>
          <FormDivider label="Montos y Seguimiento" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
            <FormField label="Abono recibido" hint="Pago parcial">
              <Input value={data.abono} onChange={v => set('abono', v)} type="number" prefix="$" placeholder="0" />
            </FormField>
            <FormField label="Monto facturado">
              <Input value={data.facturado} onChange={v => set('facturado', v)} type="number" prefix="$" placeholder="0" />
            </FormField>
            <FormField label="N° Guía despacho" hint="Número de seguimiento">
              <Input value={data.guias} onChange={v => set('guias', v)} type="number" placeholder="—" />
            </FormField>
            <FormField label="Descuento %" hint="Porcentaje">
              <Input value={data.descuentoPct} onChange={v => set('descuentoPct', v)} type="number" placeholder="0" />
            </FormField>
          </div>
        </>
      )}

      <FormDivider label="Observaciones" />
      <FormField label="Notas internas">
        <Textarea value={data.observaciones || ''} onChange={v => set('observaciones', v)} placeholder="Observaciones, instrucciones especiales, etc." rows={3} />
      </FormField>
    </FormPage>
  )
}
