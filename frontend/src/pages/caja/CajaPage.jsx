import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, Table, Tabs, SearchBar } from '../../components/shared'
import { useTurnoActivo, useAbrirTurno, useCerrarTurno, useCajaHistorico, useCajaHistoricoYears } from '../../api/caja'

const MEDIOS_PAGO = ['Todos', 'Efectivo', 'Debito', 'Credito', 'Transferencia', 'Referencial']

export default function CajaPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('hoy')

  // Turno actual
  const { data: turno, isLoading } = useTurnoActivo()
  const abrirTurno = useAbrirTurno()
  const cerrarTurno = useCerrarTurno()

  // Histórico
  const [histYear, setHistYear] = useState('')
  const [histMedio, setHistMedio] = useState('')
  const [histTipo, setHistTipo] = useState('')
  const [histSearch, setHistSearch] = useState('')
  const [histDebounced, setHistDebounced] = useState('')
  const debounceRef = useRef(null)
  const { data: years = [] } = useCajaHistoricoYears()
  const histParams = {}
  if (histYear) histParams.year = histYear
  if (histMedio) histParams.medioPago = histMedio
  if (histTipo) histParams.tipo = histTipo
  if (histDebounced) histParams.search = histDebounced
  const { data: histResult = { items: [], total: 0, stats: { totalIngresos: 0, totalEgresos: 0 } }, isLoading: histLoading } = useCajaHistorico(histParams)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setHistDebounced(histSearch), 350)
    return () => clearTimeout(debounceRef.current)
  }, [histSearch])

  const movimientos = turno?.movimientos ?? []
  const fmt = n => '$' + Math.abs(n || 0).toLocaleString('es-CL')

  const ingresos = movimientos.filter(m => m.monto > 0).reduce((a, m) => a + m.monto, 0)
  const egresos = Math.abs(movimientos.filter(m => m.monto < 0).reduce((a, m) => a + m.monto, 0))
  const saldo = ingresos - egresos

  const colsHoy = [
    { key: 'createdAt', label: 'Hora', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-3)' }}>{new Date(v).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span> },
    { key: 'tipo', label: 'Tipo', render: v => <Badge tone={v === 'Ingreso' ? 'green' : 'red'}>{v}</Badge> },
    { key: 'medioPago', label: 'Forma pago', render: v => <Badge tone="gray">{v}</Badge> },
    { key: 'monto', label: 'Monto', align: 'right', render: v => (
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: v > 0 ? 'var(--green-600)' : 'var(--red)', fontSize: 13 }}>
        {v > 0 ? '+' : ''}{fmt(v)}
      </span>
    )},
  ]

  const colsHist = [
    { key: 'fecha', label: 'Fecha', render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{new Date(v).toLocaleDateString('es-CL')}</span> : '—' },
    { key: 'tipo', label: 'Tipo', render: v => <Badge tone={v === 'ingreso' ? 'green' : 'red'}>{v}</Badge> },
    { key: 'medioPago', label: 'Forma pago', render: v => <Badge tone="gray">{v}</Badge> },
    { key: 'referencia', label: 'Referencia', render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span> },
    { key: 'usuario', label: 'Usuario', render: v => <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{v || '—'}</span> },
    { key: 'monto', label: 'Monto', align: 'right', render: v => (
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: v > 0 ? 'var(--green-600)' : 'var(--red)', fontSize: 13 }}>
        {v > 0 ? '+' : ''}{fmt(v)}
      </span>
    )},
  ]

  const TABS = [
    { id: 'hoy', label: 'Turno Actual' },
    { id: 'historico', label: `Histórico (${histResult.total.toLocaleString('es-CL')})` },
  ]

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Caja"
        subtitle={turno ? `Turno abierto · Caja ${turno.caja?.nombre ?? ''}` : 'Sin turno activo'}
        breadcrumb={['Inicio', 'Caja']}
        actions={<>
          {turno ? (
            <>
              <Btn variant="secondary" icon="printer" size="sm" onClick={() => cerrarTurno.mutate(turno.id, { onError: (e) => alert(e?.response?.data?.error || 'Error') })} disabled={cerrarTurno.isPending}>Cerrar Turno</Btn>
              <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/caja/nuevo')}>Nuevo Movimiento</Btn>
            </>
          ) : (
            <Btn variant="primary" icon="unlock" size="sm" onClick={() => abrirTurno.mutate({ cajaId: 1 }, { onError: (e) => alert(e?.response?.data?.error || 'Error') })} disabled={abrirTurno.isPending}>Abrir Turno</Btn>
          )}
        </>}
      />

      {tab === 'hoy' && (
        <div className="kpi-strip">
          <KpiCard label="Ingresos turno" value={fmt(ingresos)} icon="trendingUp" tone="neutral" sublabel="Total entradas" />
          <KpiCard label="Egresos turno" value={fmt(egresos)} icon="trendingDown" tone="amber" sublabel="Total salidas" />
          <KpiCard label="Saldo del día" value={fmt(saldo)} icon="dollarSign" tone={saldo >= 0 ? 'neutral' : 'red'} sublabel="Resultado neto" />
          <KpiCard label="Movimientos" value={movimientos.length} icon="refreshCw" sublabel="Transacciones hoy" />
        </div>
      )}

      {tab === 'historico' && (
        <div className="kpi-strip">
          <KpiCard label="Ingresos" value={'$' + (histResult.stats.totalIngresos / 1_000_000).toFixed(1) + 'M'} icon="trendingUp" tone="neutral" sublabel="Período filtrado" />
          <KpiCard label="Egresos" value={'$' + (histResult.stats.totalEgresos / 1_000_000).toFixed(1) + 'M'} icon="trendingDown" tone="amber" sublabel="Período filtrado" />
          <KpiCard label="Saldo neto" value={'$' + ((histResult.stats.totalIngresos - histResult.stats.totalEgresos) / 1_000_000).toFixed(1) + 'M'} icon="dollarSign" tone={(histResult.stats.totalIngresos - histResult.stats.totalEgresos) >= 0 ? 'neutral' : 'red'} sublabel="Balance" />
          <KpiCard label="Registros" value={histResult.total.toLocaleString('es-CL')} icon="fileText" sublabel="Transacciones" />
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
          {tab === 'historico' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <select value={histYear} onChange={e => setHistYear(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
                <option value="">Todos los años</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={histTipo} onChange={e => setHistTipo(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
                <option value="">Ingreso + Egreso</option>
                <option value="ingreso">Solo Ingresos</option>
                <option value="egreso">Solo Egresos</option>
              </select>
              <select value={histMedio} onChange={e => setHistMedio(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
                <option value="">Todos los medios</option>
                {MEDIOS_PAGO.slice(1).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <SearchBar placeholder="Referencia, usuario..." value={histSearch} onChange={setHistSearch} style={{ width: 200 }} />
            </div>
          )}
        </div>

        {tab === 'hoy' ? (
          <>
            {turno && (ingresos + egresos) > 0 && (
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', gap: 2 }}>
                  <div style={{ flex: ingresos, background: 'var(--green-600)', borderRadius: '99px 0 0 99px' }} />
                  <div style={{ flex: egresos, background: 'var(--red)', borderRadius: '0 99px 99px 0' }} />
                </div>
              </div>
            )}
            {isLoading ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
            ) : !turno ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Sin turno activo. Abre un turno para registrar movimientos.</div>
            ) : (
              <Table columns={colsHoy} rows={movimientos} emptyMessage="Sin movimientos en este turno" />
            )}
          </>
        ) : (
          <>
            {histLoading ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
            ) : (
              <Table columns={colsHist} rows={histResult.items} emptyMessage="Sin registros para este filtro" />
            )}
          </>
        )}

        {tab === 'hoy' && (
          <div style={{ padding: '12px 20px', borderTop: '2px solid var(--border)', background: 'oklch(0.985 0.004 155)', display: 'flex', justifyContent: 'flex-end', gap: 32 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Ingresos: <strong style={{ color: 'var(--green-600)', fontFamily: "'DM Mono', monospace" }}>{fmt(ingresos)}</strong></span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Egresos: <strong style={{ color: 'var(--red)', fontFamily: "'DM Mono', monospace" }}>-{fmt(egresos)}</strong></span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Saldo: <span style={{ fontFamily: "'DM Mono', monospace", color: saldo >= 0 ? 'var(--green-600)' : 'var(--red)' }}>{fmt(saldo)}</span></span>
          </div>
        )}
        {tab === 'historico' && histResult.total > histResult.limit && (
          <div style={{ padding: '10px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
            Mostrando {histResult.limit} de {histResult.total.toLocaleString('es-CL')} registros. Usa filtros para acotar.
          </div>
        )}
      </div>
    </main>
  )
}
