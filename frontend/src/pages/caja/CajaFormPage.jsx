import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormDivider, Input, Select, useForm } from '../../components/forms/index'
import { Icon } from '../../components/shared'
import { useTurnoActivo, useCreateMovimiento, useGastos } from '../../api/caja'

const MEDIOS = ['Efectivo', 'Debito', 'Credito', 'Transferencia', 'Cheque dia', 'Cheque fecha', 'Webpay', 'Transbank', 'Referencial']

export default function CajaFormPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { data: turno } = useTurnoActivo()
  const { data: gastos = [] } = useGastos()
  const createMovimiento = useCreateMovimiento()

  const { data, set, errors, validate } = useForm({
    tipo: 'Ingreso', monto: '', medioPago: 'Efectivo',
    referencia: '', ordenId: '', documento: '', nDoc: '', tipoDocumento: '',
    cuotas: '', pagaCon: '', nMedioPago: '', gastoTipoId: '',
  })

  useEffect(() => {
    const ordenId = params.get('ordenId')
    const nInterno = params.get('nInterno')
    const tipo = params.get('tipo')
    if (ordenId && (tipo === 'egreso' || tipo === 'Egreso')) set('ordenId', ordenId)
    if (nInterno) set('referencia', `N° interno ${nInterno}`)
    if (tipo === 'egreso' || tipo === 'Egreso') set('tipo', 'Egreso')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = () => {
    if (!validate({ monto: { required: true } })) return
    if (!turno) { alert('No hay turno activo. Abre un turno primero.'); return }
    if (data.tipo === 'Ingreso' && data.ordenId) {
      alert('Los pagos de ventas se registran desde Cobranza, no como movimiento manual.')
      return
    }
    if (data.tipo === 'Egreso' && !data.gastoTipoId && !data.ordenId) {
      alert('Para un egreso debes indicar categoria de gasto o N Venta.')
      return
    }
    const payload = {
      tipo: data.tipo,
      monto: Number(data.monto),
      medioPago: data.medioPago,
      referencia: data.referencia || undefined,
      ordenId: data.tipo === 'Egreso' && data.ordenId ? Number(data.ordenId) : undefined,
      documento: data.documento || undefined,
      nDoc: data.nDoc || undefined,
      tipoDocumento: data.tipoDocumento || undefined,
      cuotas: data.cuotas ? Number(data.cuotas) : undefined,
      pagaCon: data.pagaCon ? Number(data.pagaCon) : undefined,
      nMedioPago: data.nMedioPago || undefined,
      gastoTipoId: data.tipo === 'Egreso' && data.gastoTipoId ? Number(data.gastoTipoId) : undefined,
    }
    createMovimiento.mutate({ turnoId: turno.id, data: payload }, {
      onSuccess: () => navigate('/caja'),
      onError: (err) => alert(err?.response?.data?.error || 'Error al registrar movimiento'),
    })
  }

  const vuelto = data.pagaCon && data.monto ? Number(data.pagaCon) - Number(data.monto) : 0
  const showVuelto = data.tipo === 'Ingreso' && data.medioPago === 'Efectivo' && data.pagaCon

  return (
    <FormPage
      title="Nuevo Movimiento"
      subtitle="Registrar ingreso o egreso de caja"
      breadcrumb={['Inicio', 'Caja', 'Nuevo Movimiento']}
      onSave={handleSave}
      saving={createMovimiento.isPending}
    >
      <FormDivider label="Tipo de movimiento" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {['Ingreso', 'Egreso'].map(t => (
          <button key={t} onClick={() => {
            set('tipo', t)
            if (t === 'Ingreso') {
              set('ordenId', '')
              set('gastoTipoId', '')
            }
          }} style={{
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
        <FormField label="Forma de pago">
          <Select value={data.medioPago} onChange={v => set('medioPago', v)} options={MEDIOS} />
        </FormField>
      </div>

      {data.tipo === 'Ingreso' && data.medioPago === 'Efectivo' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormField label="Paga con" hint="Para calcular vuelto">
            <Input value={data.pagaCon} onChange={v => set('pagaCon', v)} type="number" prefix="$" placeholder="0" />
          </FormField>
          {showVuelto && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ fontSize: 13, color: vuelto >= 0 ? 'var(--green-700)' : 'var(--red)', fontWeight: 600 }}>
                Vuelto: ${vuelto.toLocaleString('es-CL')}
              </div>
            </div>
          )}
        </div>
      )}

      {data.tipo === 'Ingreso' && (data.medioPago === 'Credito' || data.medioPago === 'Debito') && (
        <FormField label="Cuotas" hint="1 para sin cuotas">
          <Input value={data.cuotas} onChange={v => set('cuotas', v)} type="number" placeholder="1" />
        </FormField>
      )}

      {data.medioPago !== 'Efectivo' && (
        <FormField label="N° / Identificador medio pago" hint="N° voucher, transferencia, cheque">
          <Input value={data.nMedioPago} onChange={v => set('nMedioPago', v)} placeholder="123456" />
        </FormField>
      )}

      <FormDivider label="Documento asociado (opcional)" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Tipo documento">
          <Select value={data.tipoDocumento} onChange={v => set('tipoDocumento', v)} options={['', 'Boleta', 'Factura', 'Nota crédito', 'Guía', 'Otro']} />
        </FormField>
        <FormField label="N° Documento">
          <Input value={data.nDoc} onChange={v => set('nDoc', v)} placeholder="0000123" />
        </FormField>
        {data.tipo === 'Egreso' && (
          <FormField label="N Venta (ordenId)" hint="Solo egresos asociados a venta">
            <Input value={data.ordenId} onChange={v => set('ordenId', v)} type="number" placeholder="0" />
          </FormField>
        )}
      </div>
      <FormField label="Referencia / Glosa">
        <Input value={data.referencia} onChange={v => set('referencia', v)} placeholder="Detalle libre" />
      </FormField>

      {data.tipo === 'Egreso' && (
        <FormField label="Categoría de gasto">
          <select value={data.gastoTipoId} onChange={e => set('gastoTipoId', e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }}>
            <option value="">— Sin categoría —</option>
            {gastos.filter(g => g.activo).map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </FormField>
      )}
    </FormPage>
  )
}
