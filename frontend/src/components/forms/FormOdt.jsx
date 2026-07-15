import { FormPanel, FormField, FormDivider, Input, Select, Textarea, useForm, useSave } from './index'

const CLIENTES_LIST = ['SERVICIO NAC. DE SALUD – HOSPITAL CARLOS VAN BUREN','INSTITUTO DE HUMANIDADES LUIS CAMPINO','CONSTRUCTORA SANTA ELENA LTDA.','MUNICIPALIDAD DE VIÑA DEL MAR','HOTEL ENJOY VIÑA DEL MAR','CLÍNICA SANTA MARÍA S.A.','DISTRIBUIDORA LOS ANDES','COLEGIO INGLÉS VALPARAÍSO','DIR. SALUD REG. METROPOLITANA','EMPRESA PORTUARIA VALPARAÍSO']

export function FormOdt({ initial, onClose, onSaved }) {
  const isEdit = !!initial
  const { data, set, errors, validate } = useForm(initial || {
    tipo: 'Espumas', cliente: '', descripcion: '', plazo: '', responsable: '', estado: 'Pendiente',
  })
  const { saving, save } = useSave(() => { onSaved && onSaved(data); onClose() })
  const handleSave = () => { if (!validate({ cliente: { required: true }, descripcion: { required: true }, plazo: { required: true } })) return; save() }

  return (
    <FormPanel title={isEdit ? `Editar OT #${initial?.id}` : 'Nueva Orden de Trabajo'} subtitle="Asignar tarea al taller" onClose={onClose} onSave={handleSave} saving={saving}>
      <FormDivider label="Asignación" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Tipo de Taller" required>
          <Select value={data.tipo} onChange={v => set('tipo', v)} options={['Espumas','Confecciones','Madera']} />
        </FormField>
        <FormField label="Responsable">
          <Select value={data.responsable} onChange={v => set('responsable', v)} options={['','Pedro M.','Carmen L.','Roberto A.','Marcelo'].map(r=>({value:r,label:r||'— Asignar —'}))} />
        </FormField>
      </div>
      <FormField label="Cliente" required error={errors.cliente}>
        <Select value={data.cliente} onChange={v => set('cliente', v)} error={errors.cliente} options={['', ...CLIENTES_LIST].map(c=>({value:c,label:c||'— Seleccionar —'}))} />
      </FormField>

      <FormDivider label="Trabajo" />
      <FormField label="Descripción del trabajo" required error={errors.descripcion}>
        <Textarea value={data.descripcion} onChange={v => set('descripcion', v)} error={errors.descripcion} placeholder="Describir materiales, medidas, cantidad y especificaciones técnicas…" rows={4} />
      </FormField>

      <FormDivider label="Planificación" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Plazo de entrega" required error={errors.plazo}>
          <Input value={data.plazo} onChange={v => set('plazo', v)} type="date" error={errors.plazo} />
        </FormField>
        <FormField label="Estado inicial">
          <Select value={data.estado} onChange={v => set('estado', v)} options={['Pendiente','Prioritaria','En proceso','Terminada']} />
        </FormField>
      </div>
    </FormPanel>
  )
}
