import { FormPanel, FormField, FormDivider, Input, Select, useForm, useSave } from './index'
import { Icon } from '../shared'

export function FormMovimiento({ onClose, onSaved }) {
  const { data, set, errors, validate } = useForm({ tipo: 'Ingreso', concepto: '', monto: '', forma: 'Efectivo' })
  const { saving, save } = useSave(() => { onSaved && onSaved(data); onClose() })
  const handleSave = () => { if (!validate({ concepto: { required: true }, monto: { required: true } })) return; save() }

  return (
    <FormPanel title="Nuevo Movimiento" subtitle="Registrar ingreso o egreso de caja" onClose={onClose} onSave={handleSave} saving={saving} width={460}>
      <FormDivider label="Movimiento" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {['Ingreso', 'Egreso'].map(t => (
          <button key={t} onClick={() => set('tipo', t)} style={{
            flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14, transition: 'all 0.15s', fontFamily: 'inherit',
            background: data.tipo === t ? (t === 'Ingreso' ? 'var(--green-100)' : 'var(--red-bg)') : '#fff',
            color: data.tipo === t ? (t === 'Ingreso' ? 'var(--green-700)' : 'var(--red)') : 'var(--text-3)',
            border: `2px solid ${data.tipo === t ? (t === 'Ingreso' ? 'var(--green-600)' : 'var(--red)') : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Icon name={t === 'Ingreso' ? 'trendingUp' : 'trendingDown'} size={16} /> {t}
          </button>
        ))}
      </div>
      <FormField label="Concepto" required error={errors.concepto}>
        <Input value={data.concepto} onChange={v => set('concepto', v)} placeholder="Descripción del movimiento" error={errors.concepto} />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Monto" required error={errors.monto}>
          <Input value={data.monto} onChange={v => set('monto', v)} type="number" prefix="$" placeholder="0" error={errors.monto} />
        </FormField>
        <FormField label="Forma de Pago">
          <Select value={data.forma} onChange={v => set('forma', v)} options={['Efectivo','Transferencia','Cheque','Débito','Crédito']} />
        </FormField>
      </div>
    </FormPanel>
  )
}
