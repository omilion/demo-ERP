import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, Textarea, useForm } from '../../components/forms/index'
import { useOdt, useCreateOdt, useUpdateOdt } from '../../api/odts'

export default function TallerFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const { data: found } = useOdt(isEdit ? Number(id) : null)
  const createOdt = useCreateOdt()
  const updateOdt = useUpdateOdt()

  const { data, set, errors, validate } = useForm({
    tipo: 'Espumas', clienteNombre: '', descripcion: '',
    estado: 'Pendiente', prioridad: 'normal', plazo: '',
  })

  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (found && !initialized) {
      set('tipo', found.tipo || 'Espumas')
      set('clienteNombre', found.clienteNombre ?? '')
      set('descripcion', found.descripcion ?? '')
      set('estado', found.estado || 'Pendiente')
      set('prioridad', found.prioridad || 'normal')
      set('plazo', found.plazo ? new Date(found.plazo).toISOString().slice(0, 10) : '')
      setInitialized(true)
    }
  }, [found?.id])

  const handleSave = () => {
    if (!validate({ descripcion: { required: true } })) return
    const payload = {
      tipo: data.tipo,
      clienteNombre: data.clienteNombre,
      descripcion: data.descripcion,
      estado: data.estado,
      prioridad: data.prioridad,
      plazo: data.plazo ? new Date(data.plazo).toISOString() : undefined,
    }
    if (isEdit) {
      updateOdt.mutate({ id: Number(id), data: payload }, {
        onSuccess: () => navigate('/taller'),
        onError: () => alert('Error al guardar la ODT'),
      })
    } else {
      createOdt.mutate(payload, {
        onSuccess: () => navigate('/taller'),
        onError: () => alert('Error al crear la ODT'),
      })
    }
  }

  return (
    <FormPage
      title={isEdit ? 'Editar ODT' : 'Nueva ODT'}
      subtitle={isEdit ? `Editando ODT #${id}` : 'Crear orden de trabajo'}
      breadcrumb={['Inicio', 'Taller', isEdit ? 'Editar ODT' : 'Nueva ODT']}
      onSave={handleSave}
      saving={createOdt.isPending || updateOdt.isPending}
    >
      <FormDivider label="Trabajo" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Tipo de Trabajo">
          <Select value={data.tipo} onChange={v => set('tipo', v)} options={['Espumas', 'Confecciones', 'Madera']} />
        </FormField>
        <FormField label="Estado">
          <Select value={data.estado} onChange={v => set('estado', v)} options={['Pendiente', 'En proceso', 'Prioritaria', 'Terminada']} />
        </FormField>
        <FormField label="Prioridad">
          <Select value={data.prioridad} onChange={v => set('prioridad', v)} options={[
            { value: 'normal', label: 'Normal' },
            { value: 'alta', label: 'Alta' },
            { value: 'urgente', label: 'Urgente' },
          ]} />
        </FormField>
      </div>
      <FormField label="Cliente">
        <Input value={data.clienteNombre} onChange={v => set('clienteNombre', v)} placeholder="Nombre del cliente" />
      </FormField>
      <FormField label="Descripción del trabajo" required error={errors.descripcion}>
        <Textarea value={data.descripcion} onChange={v => set('descripcion', v)} placeholder="Detalle del trabajo a realizar" rows={3} error={errors.descripcion} />
      </FormField>
      <FormField label="Plazo de entrega">
        <Input type="date" value={data.plazo} onChange={v => set('plazo', v)} />
      </FormField>
    </FormPage>
  )
}
