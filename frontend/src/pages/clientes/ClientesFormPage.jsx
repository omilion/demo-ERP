import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, useForm, useSave } from '../../components/forms/index'
import { useCliente, useCreateCliente, useUpdateCliente } from '../../api/clientes'

export default function ClientesFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const { data: found, isLoading } = useCliente(isEdit ? Number(id) : null)

  const { data, set, errors, validate } = useForm({
    rut: '', nombre: '', tipo: 'Empresa', ciudad: '', email: '', telefono: '', limiteCredito: '',
  })

  useEffect(() => {
    if (found) {
      set('rut', found.rut || '')
      set('nombre', found.nombre || '')
      set('tipo', found.tipo || 'Empresa')
      set('ciudad', found.ciudad || '')
      set('email', found.email || '')
      set('telefono', found.telefono || '')
      set('limiteCredito', found.limiteCredito != null ? String(found.limiteCredito) : '')
    }
  }, [found])

  const createMutation = useCreateCliente()
  const updateMutation = useUpdateCliente()

  const saving = createMutation.isPending || updateMutation.isPending

  const handleSave = () => {
    if (!validate({ nombre: { required: true }, rut: { required: true } })) return

    const payload = {
      rut: data.rut,
      nombre: data.nombre,
      tipo: data.tipo || undefined,
      ciudad: data.ciudad || undefined,
      email: data.email || undefined,
      telefono: data.telefono || undefined,
      limiteCredito: data.limiteCredito ? Number(data.limiteCredito) : undefined,
    }

    if (isEdit) {
      const { rut, ...updatePayload } = payload
      updateMutation.mutate(
        { id: Number(id), data: updatePayload },
        {
          onSuccess: () => navigate('/clientes'),
          onError: (err) => alert(err?.response?.data?.error || 'Error al guardar'),
        }
      )
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => navigate('/clientes'),
        onError: (err) => alert(err?.response?.data?.error || 'Error al guardar'),
      })
    }
  }

  if (isEdit && isLoading) return <main style={{ padding: 24 }}><p>Cargando...</p></main>

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
        <Input value={data.rut} onChange={v => set('rut', v)} placeholder="76123456-7" error={errors.rut} disabled={isEdit} />
      </FormField>
      <FormField label="Nombre / Razón Social" required error={errors.nombre}>
        <Input value={data.nombre} onChange={v => set('nombre', v)} placeholder="Razón social completa" error={errors.nombre} />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Tipo de Cliente">
          <Select value={data.tipo} onChange={v => set('tipo', v)} options={['Empresa', 'Institucional', 'Municipal', 'Gobierno', 'Distribuidor']} />
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
        <Input value={data.telefono} onChange={v => set('telefono', v)} placeholder="+56 32 000 0000" />
      </FormField>

      <FormDivider label="Crédito" />
      <FormField label="Límite de Crédito" hint="Dejar en 0 para sin límite">
        <Input value={data.limiteCredito} onChange={v => set('limiteCredito', v)} type="number" prefix="$" placeholder="0" />
      </FormField>
    </FormPage>
  )
}
