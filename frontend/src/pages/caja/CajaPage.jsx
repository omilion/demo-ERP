import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, Table, Tabs } from '../../components/shared'
import { useTurnoActivo, useAbrirTurno, useCerrarTurno } from '../../api/caja'

export default function CajaPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('hoy')

  const { data: turno, isLoading } = useTurnoActivo()
  const abrirTurno = useAbrirTurno()
  const cerrarTurno = useCerrarTurno()

  const movimientos = turno?.movimientos ?? []
  const fmt = n => '$' + Math.abs(n).toLocaleString('es-CL')

  const ingresos = movimientos.filter(m => m.tipo === 'Ingreso').reduce((a, m) => a + m.monto, 0)
  const egresos = Math.abs(movimientos.filter(m => m.tipo === 'Egreso').reduce((a, m) => a + m.monto, 0))
  const saldo = ingresos - egresos

  const cols = [
    { key: 'createdAt', label: 'Hora', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-3)' }}>{new Date(v).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span> },
    { key: 'tipo', label: 'Tipo', render: v => <Badge tone={v === 'Ingreso' ? 'green' : 'red'}>{v}</Badge> },
    { key: 'medioPago', label: 'Forma de pago', render: v => <Badge tone="gray">{v}</Badge> },
    { key: 'monto', label: 'Monto', align: 'right', render: v => (
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: v > 0 ? 'var(--green-600)' : 'var(--red)', fontSize: 13 }}>
        {v > 0 ? '+' : ''}{fmt(v)}
      </span>
    )},
  ]

  const handleAbrirTurno = () => {
    abrirTurno.mutate({ cajaId: 1 }, {
      onError: (err) => alert(err?.response?.data?.error || 'Error al abrir turno'),
    })
  }

  const handleCerrarTurno = () => {
    if (!turno) return
    if (!confirm('¿Cerrar el turno actual?')) return
    cerrarTurno.mutate(turno.id, {
      onError: (err) => alert(err?.response?.data?.error || 'Error al cerrar turno'),
    })
  }

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Caja"
        subtitle={turno ? `Turno abierto · Caja ${turno.caja?.nombre ?? ''}` : 'Sin turno activo'}
        breadcrumb={['Inicio', 'Caja']}
        actions={<>
          {turno ? (
            <>
              <Btn variant="secondary" icon="printer" size="sm" onClick={handleCerrarTurno} disabled={cerrarTurno.isPending}>Cerrar Turno</Btn>
              <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/caja/nuevo')}>Nuevo Movimiento</Btn>
            </>
          ) : (
            <Btn variant="primary" icon="unlock" size="sm" onClick={handleAbrirTurno} disabled={abrirTurno.isPending}>Abrir Turno</Btn>
          )}
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Ingresos hoy" value={fmt(ingresos)} icon="trendingUp" tone="neutral" sublabel="Total entradas" />
        <KpiCard label="Egresos hoy" value={fmt(egresos)} icon="trendingDown" tone="amber" sublabel="Total salidas" />
        <KpiCard label="Saldo del día" value={fmt(saldo)} icon="dollarSign" tone={saldo >= 0 ? 'neutral' : 'red'} sublabel="Resultado neto" />
        <KpiCard label="Movimientos" value={movimientos.length} icon="refreshCw" sublabel="Transacciones registradas" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs tabs={[{ id: 'hoy', label: 'Hoy', count: movimientos.length }]} active={tab} onChange={setTab} />
          <Btn variant="secondary" icon="download" size="sm">Excel</Btn>
        </div>
        {isLoading ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
        ) : !turno ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>No hay turno activo. Abre un turno para registrar movimientos.</div>
        ) : (
          <Table columns={cols} rows={movimientos} />
        )}
        <div style={{ padding: '14px 20px', borderTop: '2px solid var(--border)', background: 'oklch(0.985 0.004 155)', display: 'flex', justifyContent: 'flex-end', gap: 32 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Ingresos: <strong style={{ color: 'var(--green-600)', fontFamily: "'DM Mono', monospace" }}>{fmt(ingresos)}</strong></span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Egresos: <strong style={{ color: 'var(--red)', fontFamily: "'DM Mono', monospace" }}>-{fmt(egresos)}</strong></span>
          <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 700 }}>Saldo: <span style={{ fontFamily: "'DM Mono', monospace", color: saldo >= 0 ? 'var(--green-600)' : 'var(--red)' }}>{saldo >= 0 ? fmt(saldo) : `-$${Math.abs(saldo).toLocaleString('es-CL')}`}</span></span>
        </div>
      </div>
    </main>
  )
}
