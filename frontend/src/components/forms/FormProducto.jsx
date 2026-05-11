import { FormPanel, FormField, FormDivider, Input, Select, useForm, useSave } from './index'

export function FormProducto({ initial, onClose, onSaved }) {
  const isEdit = !!initial
  const { data, set, errors, validate } = useForm(initial || {
    cod: '', nombre: '', cat: 'Espumas', bodega: 'Inventario', stock: '', minimo: '', precio: '',
  })
  const { saving, save } = useSave(() => { onSaved && onSaved(data); onClose() })
  const handleSave = () => { if (!validate({ nombre: { required: true }, cod: { required: true } })) return; save() }

  return (
    <FormPanel title={isEdit ? `Editar Producto` : 'Nuevo Producto'} subtitle={isEdit ? initial.nombre : 'Registrar producto en bodega'} onClose={onClose} onSave={handleSave} saving={saving}>
      <FormDivider label="Identificación" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Código" required error={errors.cod}>
          <Input value={data.cod} onChange={v => set('cod', v)} placeholder="ESP-001" error={errors.cod} />
        </FormField>
        <FormField label="Categoría">
          <Select value={data.cat} onChange={v => set('cat', v)} options={['Espumas','Viscoelástico','Telas','Maderas','Colchones','Fibras','Accesorios','Látex','Bases','Protectores']} />
        </FormField>
      </div>
      <FormField label="Nombre / Descripción" required error={errors.nombre}>
        <Input value={data.nombre} onChange={v => set('nombre', v)} placeholder="Espuma Alta Densidad 15cm 2x1" error={errors.nombre} />
      </FormField>
      <FormField label="Bodega">
        <Select value={data.bodega} onChange={v => set('bodega', v)} options={['Inventario','Taller']} />
      </FormField>

      <FormDivider label="Stock y Precio" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Stock actual" hint="Unidades">
          <Input value={data.stock} onChange={v => set('stock', v)} type="number" placeholder="0" />
        </FormField>
        <FormField label="Stock mínimo" hint="Alerta bajo">
          <Input value={data.minimo} onChange={v => set('minimo', v)} type="number" placeholder="0" />
        </FormField>
        <FormField label="Precio">
          <Input value={data.precio} onChange={v => set('precio', v)} type="number" prefix="$" placeholder="0" />
        </FormField>
      </div>
    </FormPanel>
  )
}
