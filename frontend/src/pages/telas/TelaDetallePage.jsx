import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge, PageHeader, Btn, Table } from '../../components/shared'
import { useTela, useCreateTelaMovimiento } from '../../api/telas'

export default function TelaDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useTela(id)
  const createMov = useCreateTelaMovimiento()

  const [tipo, setTipo] = useState('ingreso')
  const [cantidad, setCantidad] = useState('')
  const [factura, setFactura] = useState('')
  const [cortador, setCortador] = useState('')
  const [ubicacion, setUbicacion] = useState('')

  if (isLoading) return <main style={{ padding: 24 }}>Cargando…</main>
  if (!data) return <main style={{ padding: 24 }}>No encontrada</main>

  const movimientos = data.movimientos ?? []

  const cols = [
    { key: 'fecha', label: 'Fecha',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v ? new Date(v).toLocaleString('es-CL') : '—'}</span> },
    { key: 'tipo', label: 'Tipo',
      render: v => <Badge tone={v === 'ingreso' ? 'green' : 'red'}>{v}</Badge> },
    { key: 'cantidad', label: 'Cantidad', align: 'right',
      render: (v, row) => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: row.tipo === 'ingreso' ? 'var(--green-700)' : 'var(--red-700)' }}>{row.tipo === 'ingreso' ? '+' : '−'}{v}</span> },
    { key: 'factura', label: 'Factura',
      render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'cortador', label: 'Cortador',
      render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'ubicacion', label: 'Ubicación',
      render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'usuario', label: 'Usuario',
      render: v => <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{v || '—'}</span> },
  ]

  async function handleSubmit(e) {
    e.preventDefault()
    if (!cantidad) return
    await createMov.mutateAsync({
      id,
      data: { tipo, cantidad: parseFloat(cantidad), factura, cortador, ubicacion },
    })
    setCantidad(''); setFactura(''); setCortador(''); setUbicacion('')
  }

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title={data.nombre || data.codigo}
        subtitle={data.tipo || 'Sin tipo'}
        breadcrumb={['Inicio', 'Taller', 'Telas', data.codigo]}
        actions={<Btn variant="secondary" size="sm" onClick={() => navigate('/telas')}>← Volver</Btn>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <InfoCard label="Código" value={data.codigo} />
        <InfoCard label="Stock">
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 700, color: data.stock > 0 ? 'var(--green-700)' : 'var(--red-700)' }}>{(data.stock || 0).toFixed(2)}</span>
        </InfoCard>
        <InfoCard label="Tipo" value={data.tipo || '—'} />
        <InfoCard label="Ubicación" value={data.ubicacion || '—'} />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Registrar movimiento</div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr) auto', gap: 8, alignItems: 'end' }}>
          <Field label="Tipo">
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={inputStyle}>
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
            </select>
          </Field>
          <Field label="Cantidad">
            <input type="number" step="0.01" value={cantidad} onChange={e => setCantidad(e.target.value)} style={inputStyle} required />
          </Field>
          <Field label="Factura">
            <input type="text" value={factura} onChange={e => setFactura(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Cortador">
            <input type="text" value={cortador} onChange={e => setCortador(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Ubicación">
            <input type="text" value={ubicacion} onChange={e => setUbicacion(e.target.value)} style={inputStyle} />
          </Field>
          <div />
          <Btn type="submit" variant="primary" size="sm" disabled={createMov.isPending}>
            {createMov.isPending ? 'Guardando…' : 'Registrar'}
          </Btn>
        </form>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 14 }}>
          Histórico de movimientos <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({movimientos.length})</span>
        </div>
        <Table columns={cols} rows={movimientos} emptyMessage="Sin movimientos" />
      </div>
    </main>
  )
}

function InfoCard({ label, value, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--border)', padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      {children ?? <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle = { width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)' }
