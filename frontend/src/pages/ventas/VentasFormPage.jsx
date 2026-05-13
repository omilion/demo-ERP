import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, Textarea, useForm, useSave } from '../../components/forms/index'
import { useVenta, useCreateVenta, useUpdateVenta } from '../../api/ventas'
import { useClientes } from '../../api/clientes'

export default function VentasFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const { data: found } = useVenta(isEdit ? Number(id) : null)
  const { data: clientesData = [] } = useClientes()
  const createVenta = useCreateVenta()
  const updateVenta = useUpdateVenta()

  const { data, set, errors, validate } = useForm(found ? {
    clienteId: String(found.clienteId || ''),
    tipo: found.tipo || 'Normal',
    estado: found.estado || 'Activa',
    estadoPago: found.estadoPago || 'No pagada',
    estadoEntrega: found.estadoEntrega || 'Pendiente entrega',
    total: String(found.total || ''),
    licitacion: found.licitacion || '',
    observaciones: found.observaciones || '',
  } : {
    clienteId: '', tipo: 'Normal', estado: 'Activa',
    estadoPago: 'No pagada', estadoEntrega: 'Pendiente entrega',
    total: '', licitacion: '', observaciones: '',
  })

  const saving = createVenta.isPending || updateVenta.isPending

  const handleSave = () => {
    if (!validate({ total: { required: true } })) return
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
      updateVenta.mutate({ id: Number(id), data: payload }, {
        onSuccess: () => navigate('/ventas'),
        onError: (err) => alert(err.response?.data?.error || 'Error al guardar'),
      })
    } else {
      const createPayload = {
        ...payload,
        items: [{ productoId: 1, cantidad: 1, precioUnitario: Number(data.total) || 0 }],
      }
      createVenta.mutate(createPayload, {
        onSuccess: () => navigate('/ventas'),
        onError: (err) => alert(err.response?.data?.error || 'Error al crear'),
      })
    }
  }

  const clienteOptions = [
    { value: '', label: '— Seleccionar cliente —' },
    ...clientesData.map(c => ({ value: String(c.id), label: `${c.nombre} (${c.rut})` })),
  ]

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

      <FormDivider label="Venta" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Tipo de Venta" required>
          <Select value={data.tipo} onChange={v => set('tipo', v)} options={['Normal', 'Licitación', 'Convenio Marco', 'Venta Web', 'Venta Sala']} />
        </FormField>
        {!isEdit && (
          <FormField label="Total Venta" required error={errors.total}>
            <Input value={data.total} onChange={v => set('total', v)} placeholder="0" type="number" prefix="$" error={errors.total} />
          </FormField>
        )}
      </div>
      {(data.tipo === 'Licitación' || data.tipo === 'Convenio Marco') && (
        <FormField label="ID Licitación / Convenio" hint="Ej: 61602954-LE15-1">
          <Input value={data.licitacion || ''} onChange={v => set('licitacion', v)} placeholder="ID Mercado Público" />
        </FormField>
      )}

      <FormDivider label="Estado" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Estado">
          <Select value={data.estado} onChange={v => set('estado', v)} options={['Activa', 'Cerrada']} />
        </FormField>
        <FormField label="Pago">
          <Select value={data.estadoPago} onChange={v => set('estadoPago', v)} options={['No pagada', 'Pagada']} />
        </FormField>
        <FormField label="Entrega">
          <Select value={data.estadoEntrega} onChange={v => set('estadoEntrega', v)} options={['Pendiente entrega', 'Entregada']} />
        </FormField>
      </div>

      <FormDivider label="Observaciones" />
      <FormField label="Notas internas">
        <Textarea value={data.observaciones || ''} onChange={v => set('observaciones', v)} placeholder="Observaciones, instrucciones especiales, etc." rows={3} />
      </FormField>
    </FormPage>
  )
}
