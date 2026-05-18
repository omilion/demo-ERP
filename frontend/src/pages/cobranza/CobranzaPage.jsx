import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Tabs } from '../../components/shared'
import { useVentas, useUpdateVenta } from '../../api/ventas'
import { useCobranzaHistorico, useCobranzaEjecutivas, useCobranzaMeses } from '../../api/cobranzaHistorico'
import { downloadFromBackend } from '../../utils/csv'
import { useAuthStore } from '../../store/auth'
import { can, ventaPath } from '../../utils/permissions'

const ESTADO_TABS = [
  { id: 'No pagada', label: 'No Pagadas' },
  { id: 'Parcial',   label: 'Con Abono Parcial' },
]

const MAIN_TABS = [
  { id: 'activo',     label: 'Por Cobrar' },
  { id: 'historico',  label: 'Historial de Cobro' },
]

function diasDesde(fecha) {
  if (!fecha) return 0
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
}

function urgencyTone(dias) {
  if (dias > 60) return 'red'
  if (dias > 30) return 'amber'
  return 'gray'
}

function estadoCobTone(estado) {
  const s = (estado || '').toUpperCase()
  if (s === 'CANCELADA') return 'green'
  if (s === 'PENDIENTE') return 'amber'
  if (s === 'NULA') return 'red'
  return 'gray'
}

export default function CobranzaPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const canWriteCobranza = can(user, 'cobranza', 'write') || can(user, 'ventas', 'write') || can(user, 'caja', 'write')
  const [mainTab, setMainTab] = useState('activo')
  const [estadoTab, setEstadoTab] = useState('No pagada')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const debounceRef = useRef(null)

  // Historico filters
  const [histEjecutiva, setHistEjecutiva] = useState('')
  const [histEstado, setHistEstado] = useState('')
  const [histMes, setHistMes] = useState('')
  const [histSearch, setHistSearch] = useState('')
  const [histDebounced, setHistDebounced] = useState('')
  const histDebRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  useEffect(() => {
    clearTimeout(histDebRef.current)
    histDebRef.current = setTimeout(() => setHistDebounced(histSearch), 350)
    return () => clearTimeout(histDebRef.current)
  }, [histSearch])

  // Active cobranza
  const activeParams = { orderBy: 'asc', estadoPago: estadoTab }
  if (debounced) activeParams.search = debounced
  const { data: activeResult = { items: [], total: 0 }, isLoading } = useVentas(activeParams)
  const updateVentaMut = useUpdateVenta()
  const ventas = activeResult.items ?? []
  const total = activeResult.total ?? 0

  // Historico cobranza
  const histParams = {}
  if (histEjecutiva) histParams.ejecutiva = histEjecutiva
  if (histEstado) histParams.estado = histEstado
  if (histMes) histParams.mes = histMes
  if (histDebounced) histParams.search = histDebounced
  const { data: histResult = { items: [], total: 0, stats: { cobrado: 0, pendiente: 0, n_canceladas: 0, n_pendientes: 0 } }, isLoading: histLoading } = useCobranzaHistorico(histParams)
  const { data: ejecutivas = [] } = useCobranzaEjecutivas()
  const { data: meses = [] } = useCobranzaMeses()

  const fmt = n => '$' + Math.abs(n || 0).toLocaleString('es-CL')
  const fmtM = n => '$' + (Math.abs(n || 0) / 1_000_000).toFixed(1) + 'M'

  // Active cobranza KPIs
  const montoPendiente = ventas.reduce((s, v) => s + Math.max(0, (v.total || 0) - (v.abono || 0)), 0)
  const masde30 = ventas.filter(v => diasDesde(v.createdAt) > 30).length
  const conAbono = ventas.filter(v => (v.abono || 0) > 0).length

  const colsActivo = [
    {
      key: 'id', label: 'N° Venta',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--green-700)' }}>{v}</span>
    },
    {
      key: 'cliente', label: 'Cliente', wrap: true,
      render: v => (
        <div style={{ maxWidth: 200 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{v?.nombre || '—'}</div>
          {v?.rut && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{v.rut}</div>}
        </div>
      )
    },
    {
      key: 'total', label: 'Total Venta', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 13 }}>{fmt(v)}</span>
    },
    {
      key: 'abono', label: 'Abono', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: v > 0 ? 'var(--green-600)' : 'var(--text-3)' }}>{v > 0 ? fmt(v) : '—'}</span>
    },
    {
      key: '_saldo', label: 'Saldo Pendiente', align: 'right',
      render: (_, row) => {
        const saldo = (row.total || 0) - (row.abono || 0)
        return <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13, color: saldo > 0 ? 'var(--red)' : 'var(--green-600)' }}>{fmt(saldo)}</span>
      }
    },
    {
      key: 'createdAt', label: 'Antigüedad',
      render: v => {
        const dias = diasDesde(v)
        return (
          <div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{new Date(v).toLocaleDateString('es-CL')}</div>
            {dias > 0 && <span style={{ marginTop: 2, display: 'inline-block' }}><Badge tone={urgencyTone(dias)}>{dias}d</Badge></span>}
          </div>
        )
      }
    },
    {
      key: 'estadoPago', label: 'Estado',
      render: v => <Badge tone={v === 'No pagada' ? 'red' : v === 'Parcial' ? 'amber' : 'green'}>{v}</Badge>
    },
    {
      key: 'tipo', label: 'Tipo',
      render: v => <Badge tone={v === 'Licitación' ? 'blue' : v === 'Convenio Marco' ? 'neutral' : 'gray'}>{v}</Badge>
    },
    {
      key: 'observaciones', label: 'Notas', wrap: true,
      render: v => <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{v || '—'}</span>
    },
    {
      key: '_acc', label: '',
      render: (_, row) => {
        const saldo = (row.total || 0) - (row.abono || 0)
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            {canWriteCobranza && (
            <button
              onClick={e => {
                e.stopPropagation()
                const monto = prompt(`Abono para venta #${row.id} (saldo: $${saldo.toLocaleString('es-CL')})`, String(saldo))
                if (!monto) return
                const n = parseInt(monto, 10)
                if (!n || n <= 0) return alert('Monto inválido')
                const nuevoAbono = (row.abono || 0) + n
                const estadoPago = nuevoAbono >= (row.total || 0) ? 'Pagada' : 'Parcial'
                updateVentaMut.mutate({ id: row.id, data: { abono: nuevoAbono, estadoPago } }, {
                  onError: err => alert(err.response?.status === 403 ? 'No tienes permiso para registrar abonos.' : (err.response?.data?.error || 'Error al registrar abono')),
                })
              }}
              disabled={updateVentaMut.isPending}
              style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--green-700)', background: 'var(--green-700)', cursor: 'pointer', color: '#fff', fontWeight: 500, whiteSpace: 'nowrap' }}
              title="Registrar abono"
            >Pagar</button>
            )}
            <button
              onClick={e => { e.stopPropagation(); navigate(ventaPath(row.id, user)) }}
              style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500, whiteSpace: 'nowrap' }}
            >{can(user, 'ventas', 'write') ? 'Gestionar' : 'Ver'}</button>
          </div>
        )
      }
    },
  ]

  const colsHist = [
    {
      key: 'fechaFactura', label: 'Fecha Factura',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{new Date(v).toLocaleDateString('es-CL')}</span> : '—'
    },
    {
      key: 'ndoc', label: 'N° Doc',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, color: 'var(--green-700)' }}>{v}</span> : '—'
    },
    {
      key: 'cliente', label: 'Cliente / RUT', wrap: true,
      render: (v, row) => (
        <div style={{ maxWidth: 220 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{v || '—'}</div>
          {row.rut && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{row.rut}</div>}
        </div>
      )
    },
    {
      key: 'valorFactura', label: 'Valor Factura', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600 }}>{v ? fmt(v) : '—'}</span>
    },
    {
      key: 'monto', label: 'Monto Cobrado', align: 'right',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'var(--green-600)', fontWeight: 700 }}>{fmt(v)}</span> : '—'
    },
    {
      key: 'estado', label: 'Estado',
      render: v => v ? <Badge tone={estadoCobTone(v)}>{v}</Badge> : '—'
    },
    {
      key: 'ejecutiva', label: 'Ejecutiva',
      render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span>
    },
    {
      key: 'fechaPago', label: 'Fecha Pago',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--green-600)' }}>{new Date(v).toLocaleDateString('es-CL')}</span> : '—'
    },
    {
      key: 'banco', label: 'Banco',
      render: v => <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{v || '—'}</span>
    },
    {
      key: 'mesAnio', label: 'Período',
      render: v => <Badge tone="gray">{v || '—'}</Badge>
    },
  ]

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Cobranza"
        subtitle={mainTab === 'activo' ? `${total.toLocaleString('es-CL')} documentos por cobrar` : `${histResult.total.toLocaleString('es-CL')} registros históricos`}
        breadcrumb={['Inicio', 'Caja', 'Cobranza']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm"
            onClick={() => {
              if (mainTab === 'activo') {
                downloadFromBackend('/reportes/export/ventas', `cobranza_${new Date().toISOString().slice(0,10)}.csv`, { estadoPago: estadoTab })
              } else {
                const params = {}
                if (histEjecutiva) params.ejecutiva = histEjecutiva
                if (histEstado) params.estado = histEstado
                if (histMes) params.mes = histMes
                if (histDebounced) params.search = histDebounced
                downloadFromBackend('/reportes/export/cobranza', `cobranza_historico_${new Date().toISOString().slice(0,10)}.csv`, params)
              }
            }}
          >Exportar</Btn>
        </>}
      />

      {mainTab === 'activo' && (
        <div className="kpi-strip">
          <KpiCard label="Saldo total pendiente" value={fmtM(montoPendiente)} icon="dollarSign" tone="red" sublabel="Suma de saldos sin cobrar" />
          <KpiCard label="Documentos" value={total.toLocaleString('es-CL')} icon="fileText" sublabel="Ventas no pagadas o parciales" />
          <KpiCard label="Más de 30 días" value={masde30} icon="alertTriangle" tone="amber" sublabel="Gestión urgente requerida" />
          <KpiCard label="Con abono parcial" value={conAbono} icon="check" sublabel="Pago parcial recibido" />
        </div>
      )}

      {mainTab === 'historico' && (
        <div className="kpi-strip">
          <KpiCard label="Cobrado históricamente" value={fmtM(histResult.stats.cobrado)} icon="trendingUp" tone="neutral" sublabel="Total recuperado" />
          <KpiCard label="Pendientes registrados" value={histResult.stats.n_pendientes} icon="clock" tone="amber" sublabel="Sin cobrar en historial" />
          <KpiCard label="Facturas canceladas" value={(histResult.stats.n_canceladas || 0).toLocaleString('es-CL')} icon="checkCircle" tone="neutral" sublabel="Cobros completados" />
          <KpiCard label="Notas crédito / Nulas" value={histResult.stats.n_nulas} icon="xCircle" tone="red" sublabel="Anuladas" />
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          <Tabs tabs={MAIN_TABS} active={mainTab} onChange={t => setMainTab(t)} />

          {mainTab === 'activo' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
              <Tabs tabs={ESTADO_TABS} active={estadoTab} onChange={t => { setEstadoTab(t); setSearch('') }} />
              <SearchBar placeholder="Buscar cliente, N° venta…" value={search} onChange={setSearch} style={{ width: 240 }} />
            </div>
          )}

          {mainTab === 'historico' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={histEjecutiva} onChange={e => setHistEjecutiva(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
                <option value="">Todas las ejecutivas</option>
                {ejecutivas.map(e => <option key={e.ejecutiva} value={e.ejecutiva}>{e.ejecutiva} ({e.total})</option>)}
              </select>
              <select value={histEstado} onChange={e => setHistEstado(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
                <option value="">Todos los estados</option>
                <option value="CANCELADA">Cancelada</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="NULA">Nula</option>
              </select>
              <select value={histMes} onChange={e => setHistMes(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
                <option value="">Todos los períodos</option>
                {meses.map(m => <option key={m.mes_anio} value={m.mes_anio}>{m.mes_anio} ({m.total})</option>)}
              </select>
              <SearchBar placeholder="Cliente, RUT..." value={histSearch} onChange={setHistSearch} style={{ width: 200 }} />
            </div>
          )}
        </div>

        {mainTab === 'activo' ? (
          isLoading
            ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
            : <Table columns={colsActivo} rows={ventas} onRowClick={row => navigate(ventaPath(row.id, user))} emptyMessage="Sin documentos pendientes de cobro" />
        ) : (
          histLoading
            ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
            : <Table columns={colsHist} rows={histResult.items} emptyMessage="Sin registros históricos para este filtro" />
        )}

        {mainTab === 'historico' && histResult.total > histResult.limit && (
          <div style={{ padding: '10px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
            Mostrando {histResult.limit} de {histResult.total.toLocaleString('es-CL')} registros. Usa filtros para acotar.
          </div>
        )}
      </div>
    </main>
  )
}
