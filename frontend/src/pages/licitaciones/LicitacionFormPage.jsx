import { toast } from '../../store/notif'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Btn, PageHeader } from '../../components/shared'
import { useCreateCotizacion } from '../../api/cotizaciones'
import { sanitizeOrdenCompra, sanitizePlazoDias } from '../../utils/licitacionFields'

const ESTADOS = ['Pendiente', 'En proceso', 'Adjudicada', 'No Adjudicada', 'Rechazada', 'Cerrada']

export default function LicitacionFormPage() {
  const navigate = useNavigate()
  const createCotizacion = useCreateCotizacion()
  const [form, setForm] = useState({
    idLicitacion: '',
    fecha: '',
    rutCliente: '',
    referencia: '',
    ordenCompra: '',
    plazo: '',
    estado: 'Pendiente',
    obs: '',
  })

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const submit = (event) => {
    event.preventDefault()
    createCotizacion.mutate({
      ...form,
      plazo: sanitizePlazoDias(form.plazo),
      ordenCompra: sanitizeOrdenCompra(form.ordenCompra),
    }, {
      onSuccess: data => navigate(`/licitaciones/${data.id}`),
      onError: e => toast.error(e.response?.data?.error || 'Error al crear cotizacion'),
    })
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Nueva cotizacion de licitacion"
        subtitle="Registro manual de oportunidad publica"
        breadcrumb={['Inicio', 'Ventas', 'Licitaciones', 'Nueva']}
      />

      <form onSubmit={submit} style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          <Field label="ID licitacion" required>
            <input value={form.idLicitacion} onChange={e => setField('idLicitacion', e.target.value)} required style={inputStyle} />
          </Field>
          <Field label="Fecha licitacion" required>
            <input type="date" value={form.fecha} onChange={e => setField('fecha', e.target.value)} required style={inputStyle} />
          </Field>
          <Field label="RUT organismo">
            <input value={form.rutCliente} onChange={e => setField('rutCliente', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Estado">
            <select value={form.estado} onChange={e => setField('estado', e.target.value)} style={inputStyle}>
              {ESTADOS.map(estado => <option key={estado} value={estado}>{estado}</option>)}
            </select>
          </Field>
          <Field label="Referencia">
            <input value={form.referencia} onChange={e => setField('referencia', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Orden de compra">
            <input
              value={form.ordenCompra}
              onChange={e => setField('ordenCompra', sanitizeOrdenCompra(e.target.value))}
              maxLength={80}
              placeholder="Ej: OC-12345"
              title="Solo letras, números y guiones"
              style={inputStyle}
            />
          </Field>
          <Field label="Plazo de la licitación (días)">
            <input
              type="number"
              min="0"
              max="3650"
              step="1"
              inputMode="numeric"
              value={form.plazo}
              onChange={e => setField('plazo', sanitizePlazoDias(e.target.value))}
              onKeyDown={e => ['e', 'E', '+', '-', '.', ','].includes(e.key) && e.preventDefault()}
              placeholder="Ej: 30"
              style={inputStyle}
            />
          </Field>
        </div>
        <Field label="Observaciones">
          <textarea value={form.obs} onChange={e => setField('obs', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <Btn variant="ghost" onClick={() => navigate('/licitaciones')} disabled={createCotizacion.isPending}>Cancelar</Btn>
          <Btn type="submit" variant="primary" icon="check" disabled={createCotizacion.isPending}>
            {createCotizacion.isPending ? 'Guardando...' : 'Guardar'}
          </Btn>
        </div>
      </form>
    </main>
  )
}

function Field({ label, required, children }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 10 }}>
      <span style={{ display: 'block', marginBottom: 5 }}>{label}{required ? ' *' : ''}</span>
      {children}
    </label>
  )
}

const inputStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13,
  fontFamily: 'inherit',
  color: 'var(--text-1)',
  background: '#fff',
}
