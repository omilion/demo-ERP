import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, Textarea, useForm, useSave } from '../../components/forms/index'
import { VENTAS_DATA } from '../../data/ventas'

const CLIENTES_LIST = ['SERVICIO NAC. DE SALUD – HOSPITAL CARLOS VAN BUREN','INSTITUTO DE HUMANIDADES LUIS CAMPINO','CONSTRUCTORA SANTA ELENA LTDA.','MUNICIPALIDAD DE VIÑA DEL MAR','HOTEL ENJOY VIÑA DEL MAR','CLÍNICA SANTA MARÍA S.A.','DISTRIBUIDORA LOS ANDES','COLEGIO INGLÉS VALPARAÍSO','DIR. SALUD REG. METROPOLITANA','EMPRESA PORTUARIA VALPARAÍSO']

export default function VentasFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const found = isEdit ? VENTAS_DATA.find(v => v.id === Number(id)) : null

  const { data, set, errors, validate } = useForm(found ? {
    cliente: found.cliente, rut: found.rut, tipo: found.tipo, estado: found.estado,
    pago: found.pago, entrega: found.entrega, total: String(found.total),
    licitacion: found.licitacion || '', observaciones: found.observaciones || '',
  } : {
    cliente: '', rut: '', tipo: 'Normal', estado: 'Activa',
    pago: 'No pagada', entrega: 'Pendiente entrega', total: '', observaciones: '',
  })
  const { saving, save } = useSave(() => navigate('/ventas'))

  const handleSave = () => {
    if (!validate({ cliente: { required: true }, total: { required: true } })) return
    save()
  }

  return (
    <FormPage
      title={isEdit ? 'Editar Venta' : 'Nueva Venta'}
      subtitle={isEdit ? `Editando venta #${id}` : 'Crear nueva orden de venta'}
      breadcrumb={['Inicio', 'Ventas', isEdit ? 'Editar Venta' : 'Nueva Venta']}
      onSave={handleSave}
      saving={saving}
    >
      <FormDivider label="Cliente" />
      <FormField label="Cliente / Organismo" required error={errors.cliente}>
        <Select value={data.cliente} onChange={v => set('cliente', v)} error={errors.cliente} options={['', ...CLIENTES_LIST].map(c => ({ value: c, label: c || '— Seleccionar cliente —' }))} />
      </FormField>
      <FormField label="RUT" hint="Ej: 76123456-7 o RUT licitación">
        <Input value={data.rut} onChange={v => set('rut', v)} placeholder="76123456-7" />
      </FormField>

      <FormDivider label="Venta" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Tipo de Venta" required>
          <Select value={data.tipo} onChange={v => set('tipo', v)} options={['Normal', 'Licitación', 'Convenio Marco', 'Venta Web', 'Venta Sala']} />
        </FormField>
        <FormField label="Total Venta" required error={errors.total}>
          <Input value={data.total} onChange={v => set('total', v)} placeholder="0" type="number" prefix="$" error={errors.total} />
        </FormField>
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
          <Select value={data.pago} onChange={v => set('pago', v)} options={['No pagada', 'Pagada']} />
        </FormField>
        <FormField label="Entrega">
          <Select value={data.entrega} onChange={v => set('entrega', v)} options={['Pendiente entrega', 'Entregada']} />
        </FormField>
      </div>

      <FormDivider label="Observaciones" />
      <FormField label="Notas internas">
        <Textarea value={data.observaciones || ''} onChange={v => set('observaciones', v)} placeholder="Observaciones, instrucciones especiales, etc." rows={3} />
      </FormField>
    </FormPage>
  )
}
