import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, useForm, useSave } from '../../components/forms/index'
import { CLIENTES_DATA } from '../../data/clientes'

export default function ClientesFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const found = isEdit ? CLIENTES_DATA.find(c => c.id === Number(id)) : null

  const { data, set, errors, validate } = useForm(found ? {
    rut: found.rut, nombre: found.nombre, tipo: found.tipo,
    ciudad: found.ciudad, email: found.email, tel: found.tel,
    credito: String(found.credito),
  } : {
    rut: '', nombre: '', tipo: 'Empresa', ciudad: '', email: '', tel: '', credito: '',
  })
  const { saving, save } = useSave(() => navigate('/clientes'))

  const handleSave = () => {
    if (!validate({ nombre: { required: true }, rut: { required: true } })) return
    save()
  }

  return (
    <FormPage
      title={isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}
      subtitle={isEdit ? `Editando cliente #${id}` : 'Registrar nuevo cliente en el sistema'}
      breadcrumb={['Inicio', 'Clientes', isEdit ? 'Editar Cliente' : 'Nuevo Cliente']}
      onSave={handleSave}
      saving={saving}
    >
      <FormDivider label="Identificación" />
      <FormField label="RUT / Identificador" required error={errors.rut}>
        <Input value={data.rut} onChange={v => set('rut', v)} placeholder="76123456-7" error={errors.rut} />
      </FormField>
      <FormField label="Nombre / Razón Social" required error={errors.nombre}>
        <Input value={data.nombre} onChange={v => set('nombre', v)} placeholder="Razón social completa" error={errors.nombre} />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Tipo de Cliente">
          <Select value={data.tipo} onChange={v => set('tipo', v)} options={['Empresa','Institucional','Municipal','Gobierno','Distribuidor']} />
        </FormField>
        <FormField label="Ciudad">
          <Input value={data.ciudad} onChange={v => set('ciudad', v)} placeholder="Ciudad" />
        </FormField>
      </div>

      <FormDivider label="Contacto" />
      <FormField label="Email">
        <Input value={data.email} onChange={v => set('email', v)} type="email" placeholder="correo@empresa.cl" />
      </FormField>
      <FormField label="Teléfono">
        <Input value={data.tel} onChange={v => set('tel', v)} placeholder="+56 32 000 0000" />
      </FormField>

      <FormDivider label="Crédito" />
      <FormField label="Límite de Crédito" hint="Dejar en 0 para sin límite">
        <Input value={data.credito} onChange={v => set('credito', v)} type="number" prefix="$" placeholder="0" />
      </FormField>
    </FormPage>
  )
}
