import { useNavigate } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, useForm } from '../../components/forms/index'
import { Icon } from '../../components/shared'
import { useTurnoActivo, useCreateMovimiento } from '../../api/caja'

export default function CajaFormPage() {
  const navigate = useNavigate()
  const { data: turno } = useTurnoActivo()
  const createMovimiento = useCreateMovimiento()

  const { data, set, errors, validate } = useForm({ tipo: 'Ingreso', monto: '', medioPago: 'Efectivo' })

  const handleSave = () => {
    if (!validate({ monto: { required: true } })) return
    if (!turno) { alert('No hay turno activo. Abre un turno primero.'); return }
    createMovimiento.mutate(
      { turnoId: turno.id, data: { tipo: data.tipo, monto: Number(data.monto), medioPago: data.medioPago } },
      {
        onSuccess: () => navigate('/caja'),
        onError: (err) => alert(err?.response?.data?.error || 'Error al registrar movimiento'),
      }
    )
  }

  return (
    <FormPage
      title="Nuevo Movimiento"
      subtitle="Registrar ingreso o egreso de caja"
      breadcrumb={['Inicio', 'Caja', 'Nuevo Movimiento']}
      onSave={handleSave}
      saving={createMovimiento.isPending}
    >
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Monto" required error={errors.monto}>
          <Input value={data.monto} onChange={v => set('monto', v)} type="number" prefix="$" placeholder="0" error={errors.monto} />
        </FormField>
        <FormField label="Forma de Pago">
          <Select value={data.medioPago} onChange={v => set('medioPago', v)} options={['Efectivo', 'Transferencia', 'Cheque', 'Débito', 'Crédito']} />
        </FormField>
      </div>
    </FormPage>
  )
}
