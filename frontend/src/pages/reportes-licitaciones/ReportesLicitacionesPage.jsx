import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReportesLicitaciones } from '../../api/cotizaciones'

const fmt = n => '$' + Number(n || 0).toLocaleString('es-CL')
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('es-CL') : '—'

const ESTADO_COLOR = {
  Pendiente: 'var(--amber)',
  Adjudicada: 'var(--green-600)',
  Rechazada: 'var(--red)',
  Cerrada: 'var(--text-3)',
}

export default function ReportesLicitacionesPage() {
  const nav = useNavigate()
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [rutCliente, setRutCliente] = useState('')

  const { data, isLoading } = useReportesLicitaciones({
    fechaDesde: fechaDesde || undefined,
    fechaHasta: fechaHasta || undefined,
    rutCliente: rutCliente || undefined,
  })

  const items = data?.items || []
  const stats = data?.stats || { porEstado: {}, porCliente: {}, totalCotizado: 0, totalAdjudicado: 0 }
  const totalClientes = Object.keys(stats.porCliente).length

  const Kpi = ({ label, value, accent }) => (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', minWidth: 160 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: accent || 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>{value}</div>
    </div>
  )

  return (
    <main style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Reportes Licitaciones</h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 0' }}>
          Dashboard de cotizaciones de licitaciones por estado, cliente y período.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-2)' }} />
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-2)' }} />
        <input value={rutCliente} onChange={e => setRutCliente(e.target.value)} placeholder="RUT cliente"
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-2)', minWidth: 160 }} />
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Kpi label="Cotizaciones" value={data?.total ?? '—'} />
        <Kpi label="Clientes" value={totalClientes} />
        <Kpi label="Total cotizado" value={fmt(stats.totalCotizado)} />
        <Kpi label="Total adjudicado" value={fmt(stats.totalAdjudicado)} accent="var(--green-600)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
        {Object.entries(stats.porEstado).map(([estado, count]) => (
          <div key={estado} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: ESTADO_COLOR[estado] || 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>{estado}</div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "'DM Mono', monospace", marginTop: 4 }}>{count}</div>
          </div>
        ))}
      </div>

      <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-2)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              {['ID Licit.', 'Fecha', 'RUT Cliente', 'OC', 'Estado', 'Items', 'Usuario'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>Sin resultados</td></tr>}
            {items.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => nav(`/licitaciones/${c.id}`)}>
                <td style={{ padding: '9px 14px', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{c.idLicitacion}</td>
                <td style={{ padding: '9px 14px', color: 'var(--text-2)' }}>{fmtDate(c.fechaCreacion)}</td>
                <td style={{ padding: '9px 14px', fontFamily: "'DM Mono', monospace", color: 'var(--text-3)' }}>{c.rutCliente || '—'}</td>
                <td style={{ padding: '9px 14px', color: 'var(--text-3)' }}>{c.ordenCompra || '—'}</td>
                <td style={{ padding: '9px 14px' }}>
                  <span style={{ color: ESTADO_COLOR[c.estado] || 'var(--text-3)', fontWeight: 600, fontSize: 12 }}>{c.estado}</span>
                </td>
                <td style={{ padding: '9px 14px', fontFamily: "'DM Mono', monospace", textAlign: 'right' }}>{c.nItems}</td>
                <td style={{ padding: '9px 14px', color: 'var(--text-3)' }}>{c.usuario || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
