import { FormPanel, ViewPanel, FormField, FormDivider, DetailRow, Input, Select, useForm, useSave } from './index'
import { Badge } from '../shared'

export function FormCliente({ initial, onClose, onSaved }) {
  const isEdit = !!initial
  const { data, set, errors, validate } = useForm(initial || {
    rut: '', nombre: '', tipo: 'Empresa', ciudad: '', email: '', tel: '', credito: '',
  })
  const { saving, save } = useSave(() => { onSaved && onSaved(data); onClose() })
  const handleSave = () => { if (!validate({ nombre: { required: true }, rut: { required: true } })) return; save() }

  return (
    <FormPanel title={isEdit ? `Editar Cliente` : 'Nuevo Cliente'} subtitle={isEdit ? initial.nombre : 'Registrar nuevo cliente en el sistema'} onClose={onClose} onSave={handleSave} saving={saving}>
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
    </FormPanel>
  )
}

export function ViewClientePanel({ cliente, onClose, onEdit }) {
  return (
    <ViewPanel title={cliente.nombre} subtitle={`RUT: ${cliente.rut}`} onClose={onClose} onEdit={onEdit} onDelete={() => {}}>
      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 18, display: 'flex', gap: 12 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--green-700)' }}>{cliente.nombre[0]}</span>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{cliente.nombre}</div>
          <Badge tone={{ Institucional:'blue', Municipal:'neutral', Gobierno:'neutral', Distribuidor:'amber', Empresa:'gray' }[cliente.tipo]||'gray'}>{cliente.tipo}</Badge>
        </div>
      </div>
      <FormDivider label="Datos" />
      <DetailRow label="RUT" value={cliente.rut} mono />
      <DetailRow label="Ciudad" value={cliente.ciudad} />
      <DetailRow label="Email" value={cliente.email} />
      <DetailRow label="Teléfono" value={cliente.tel} />
      <FormDivider label="Crédito" />
      <DetailRow label="Límite crédito" value={`$${cliente.credito.toLocaleString('es-CL')}`} mono />
      <DetailRow label="Saldo deuda" value={cliente.saldo > 0 ? `$${cliente.saldo.toLocaleString('es-CL')}` : 'Sin deuda'} mono />
    </ViewPanel>
  )
}
