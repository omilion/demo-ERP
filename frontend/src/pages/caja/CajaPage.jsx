import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, Table, Tabs, SearchBar, Pager } from '../../components/shared'
import { useTurnoActivo, useAbrirTurno, useCerrarTurno, useCajaHistorico, useCajaHistoricoYears, useDeleteMovimiento, useReactivateMovimiento } from '../../api/caja'
import { downloadFromBackend } from '../../utils/csv'
import { useAuthStore } from '../../store/auth'
import { can, ventaPath } from '../../utils/permissions'
import BotonExportar from '../../components/BotonExportar'

const MEDIOS_PAGO = ['Todos', 'Efectivo', 'Debito', 'Credito', 'Transferencia', 'Cheque dia', 'Cheque fecha', 'Webpay', 'Transbank', 'Referencial']
const TIPOS_VENTA = ['', 'Normal', 'Venta Directa', 'Venta Web', 'Convenio Marco', 'Licitacion']
const CIERRE_FIELDS = [
  ['efectivo', 'Efectivo'],
  ['debito', 'Debito'],
  ['credito', 'Credito'],
  ['transferencia', 'Transferencia'],
  ['chequeDia', 'Cheque dia'],
  ['chequeFecha', 'Cheque fecha'],
  ['webpay', 'Webpay'],
  ['transbank', 'Transbank'],
  ['otros', 'Otros'],
]

function normalizeMedioPago(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function medioKey(medioPago = '') {
  const mp = normalizeMedioPago(medioPago)
  if (mp === 'efectivo') return 'efectivo'
  if (mp === 'debito') return 'debito'
  if (mp === 'credito') return 'credito'
  if (mp === 'transferencia') return 'transferencia'
  if (mp === 'cheque' || mp === 'cheque dia') return 'chequeDia'
  if (mp === 'cheque fecha') return 'chequeFecha'
  if (mp === 'webpay') return 'webpay'
  if (mp === 'transbank') return 'transbank'
  return 'otros'
}

function gastoLabel(row) {
  return row?.gastoTipo?.nombre || row?.gastoTipoNombre || ''
}

export default function CajaPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canReadVentas = can(user, 'ventas')
  const canWriteCaja = can(user, 'caja', 'write')
  const canDeleteCaja = can(user, 'caja', 'delete')
  const [urlParams, setUrlParams] = useSearchParams()
  const nInternoUrl = urlParams.get('nInterno') || ''
  const [tab, setTab] = useState(nInternoUrl ? 'historico' : 'hoy')
  const [nInterno, setNInterno] = useState(nInternoUrl)

  // Turno actual
  const { data: turno, isLoading, isError: turnoError, error: turnoQueryError } = useTurnoActivo()
  const abrirTurno = useAbrirTurno()
  const cerrarTurno = useCerrarTurno()
  const deleteMovimiento = useDeleteMovimiento()
  const reactivateMovimiento = useReactivateMovimiento()

  // Histórico
  const [histYear, setHistYear] = useState('')
  const [histDesde, setHistDesde] = useState('')
  const [histHasta, setHistHasta] = useState('')
  const [histMedio, setHistMedio] = useState('')
  const [histTipo, setHistTipo] = useState('')
  const [histTipoVenta, setHistTipoVenta] = useState('')
  const [histNDoc, setHistNDoc] = useState('')
  const [histEstado, setHistEstado] = useState('activos')
  const [histSearch, setHistSearch] = useState('')
  const [histDebounced, setHistDebounced] = useState('')
  const [histPageState, setHistPageState] = useState({ key: '', page: 1 })
  const [cierreOpen, setCierreOpen] = useState(false)
  const [cierreForm, setCierreForm] = useState({ obs: '', conteo: {} })
  const debounceRef = useRef(null)
  const { data: years = [] } = useCajaHistoricoYears()
  const histFilterParams = {}
  if (histYear) histFilterParams.year = histYear
  if (histDesde) histFilterParams.desde = histDesde
  if (histHasta) histFilterParams.hasta = histHasta
  if (histMedio) histFilterParams.medioPago = histMedio
  if (histTipo) histFilterParams.tipo = histTipo
  if (histTipoVenta) histFilterParams.tipoVenta = histTipoVenta
  if (histNDoc) histFilterParams.nDoc = histNDoc
  if (histEstado !== 'activos') histFilterParams.estado = histEstado
  if (histDebounced) histFilterParams.search = histDebounced
  if (nInterno) histFilterParams.nInterno = nInterno
  const histFilterKey = JSON.stringify(histFilterParams)
  const histPage = histPageState.key === histFilterKey ? histPageState.page : 1
  const setHistPagerPage = nextPage => setHistPageState({ key: histFilterKey, page: nextPage })
  const histParams = { ...histFilterParams, page: String(histPage) }
  const { data: histResult = { items: [], total: 0, stats: { totalIngresos: 0, totalEgresos: 0 } }, isLoading: histLoading, isError: histError, error: histQueryError } = useCajaHistorico(histParams)
  const histLimit = histResult.limit ?? 100
  const histPages = histResult.pages ?? Math.max(1, Math.ceil((histResult.total ?? 0) / histLimit))
  const exportParams = tab === 'historico' ? histFilterParams : (turno?.id ? { turnoId: turno.id } : {})

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setHistDebounced(histSearch), 350)
    return () => clearTimeout(debounceRef.current)
  }, [histSearch])

  const movimientos = turno?.movimientos ?? []
  const fmt = n => '$' + Math.abs(n || 0).toLocaleString('es-CL')

  const movimientosCajaReal = movimientos.filter(m => normalizeMedioPago(m.medioPago) !== 'referencial')
  const ingresos = movimientosCajaReal.filter(m => m.monto > 0).reduce((a, m) => a + m.monto, 0)
  const egresos = Math.abs(movimientosCajaReal.filter(m => m.monto < 0).reduce((a, m) => a + m.monto, 0))
  const saldo = ingresos - egresos
  const horasTurnoAbierto = turno?.apertura
    ? Math.floor((Date.now() - new Date(turno.apertura).getTime()) / (1000 * 60 * 60))
    : 0
  const turnoRequiereRevision = horasTurnoAbierto >= 24
  const systemConteo = CIERRE_FIELDS.reduce((acc, [key]) => ({ ...acc, [key]: 0 }), {})
  for (const mov of movimientos) {
    if (normalizeMedioPago(mov.medioPago) === 'referencial') continue
    systemConteo[medioKey(mov.medioPago)] += Number(mov.monto || 0)
  }
  const countedTotal = CIERRE_FIELDS.reduce((sum, [key]) => sum + Number(cierreForm.conteo?.[key] || 0), 0)
  const cierreDiferencia = countedTotal - saldo

  const handleExport = archivo => {
    if (tab === 'hoy' && !turno?.id) {
      toast.warning('No hay turno activo para exportar')
      return
    }
    downloadFromBackend('/reportes/export/caja', `caja_${new Date().toISOString().slice(0, 10)}.${archivo}`, { ...exportParams, archivo })
      .catch(err => toast.error(err?.response?.data?.error || 'No se pudo exportar caja'))
  }

  const handleAbrirTurno = async () => {
    if (!await confirmDialog({ title: 'Confirmar', detail: 'Abrir turno de caja?' })) return
    abrirTurno.mutate({ cajaId: 1 }, {
      onError: (e) => toast.error(e?.response?.data?.error || 'No se pudo abrir el turno'),
    })
  }

  const handleCerrarTurno = () => {
    if (!turno?.id) return
    setCierreForm({ obs: '', conteo: systemConteo })
    setCierreOpen(true)
  }

  const handleConfirmarCierre = async () => {
    if (!turno?.id) return
    if (!await confirmDialog({ title: 'Confirmar', detail: `Cerrar turno #${turno.id} con diferencia ${fmt(cierreDiferencia)}?` })) return
    cerrarTurno.mutate({ id: turno.id, obs: cierreForm.obs || undefined, conteo: cierreForm.conteo }, {
      onSuccess: () => setCierreOpen(false),
      onError: (e) => toast.error(e?.response?.data?.error || 'No se pudo cerrar el turno'),
    })
  }

  const handleDeleteMovimiento = async (mov) => {
    if (!await confirmDialog({ title: 'Confirmar', detail: `Eliminar movimiento #${mov.id}? Esta accion deja el registro marcado como eliminado.`, tone: 'danger' })) return
    const motivo = await promptDialog({ title: 'Motivo de anulacion' })
    if (!motivo?.trim()) return
    deleteMovimiento.mutate({ id: mov.id, motivo: motivo.trim() }, {
      onError: (e) => toast.error(e?.response?.data?.error || 'No se pudo eliminar el movimiento'),
    })
  }

  const handleReactivateMovimiento = async (mov) => {
    if (!await confirmDialog({ title: 'Confirmar', detail: `Reactivar movimiento #${mov.id}?` })) return
    const motivo = await promptDialog({ title: 'Motivo de reactivacion' })
    if (!motivo?.trim()) return
    reactivateMovimiento.mutate({ id: mov.id, motivo: motivo.trim() }, {
      onError: (e) => toast.error(e?.response?.data?.error || 'No se pudo reactivar el movimiento'),
    })
  }

  const colsHoy = [
    { key: 'createdAt', label: 'Hora', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-3)' }}>{new Date(v).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span> },
    { key: 'tipo', label: 'Tipo', render: v => <Badge tone={v === 'Ingreso' ? 'green' : 'red'}>{v}</Badge> },
    { key: 'gastoTipo', label: 'Gasto', render: (_v, row) => gastoLabel(row) ? <Badge tone="amber">{gastoLabel(row)}</Badge> : <span style={{ color: 'var(--text-3)' }}>-</span> },
    { key: 'medioPago', label: 'Forma pago', render: v => <Badge tone="gray">{v}</Badge> },
    { key: 'monto', label: 'Monto', align: 'right', render: v => (
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: v > 0 ? 'var(--green-600)' : 'var(--red)', fontSize: 13 }}>
        {v > 0 ? '+' : ''}{fmt(v)}
      </span>
    )},
    ...(canReadVentas ? [{
      key: '_venta',
      label: '',
      align: 'right',
      render: (_, row) => row.ordenId ? (
        <Btn
          variant="ghost"
          icon="shoppingCart"
          size="xs"
          onClick={(e) => { e.stopPropagation(); navigate(ventaPath(row.ordenId, user)) }}
        >
          Venta
        </Btn>
      ) : null,
    }] : []),
    ...(canDeleteCaja ? [{
      key: '_acc',
      label: '',
      align: 'right',
      render: (_, row) => (
        <Btn
          variant="danger"
          icon="trash"
          size="xs"
          onClick={(e) => { e.stopPropagation(); handleDeleteMovimiento(row) }}
          disabled={deleteMovimiento.isPending}
        >
          Eliminar
        </Btn>
      ),
    }] : []),
  ]

  const colsHist = [
    { key: 'fecha', label: 'Fecha', render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{new Date(v).toLocaleDateString('es-CL')}</span> : '—' },
    { key: 'tipo', label: 'Tipo', render: v => <Badge tone={v === 'Ingreso' ? 'green' : 'red'}>{v}</Badge> },
    { key: 'gastoTipo', label: 'Gasto', render: (_v, row) => gastoLabel(row) ? <Badge tone="amber">{gastoLabel(row)}</Badge> : <span style={{ color: 'var(--text-3)' }}>-</span> },
    { key: 'medioPago', label: 'Forma pago', render: v => <Badge tone="gray">{v}</Badge> },
    { key: 'nDoc', label: 'Doc.', render: (v, row) => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{[row.tipoDocumento, v].filter(Boolean).join(' ') || '—'}</span> },
    { key: 'referencia', label: 'Referencia', render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span> },
    { key: 'usuario', label: 'Usuario', render: v => <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{v || '—'}</span> },
    { key: 'eliminado', label: 'Estado', render: v => <Badge tone={v ? 'red' : 'green'}>{v ? 'Anulado' : 'Activo'}</Badge> },
    { key: 'monto', label: 'Monto', align: 'right', render: v => (
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: v > 0 ? 'var(--green-600)' : 'var(--red)', fontSize: 13 }}>
        {v > 0 ? '+' : ''}{fmt(v)}
      </span>
    )},
    ...(canReadVentas ? [{
      key: '_venta',
      label: '',
      align: 'right',
      render: (_, row) => row.ordenId ? (
        <Btn
          variant="ghost"
          icon="shoppingCart"
          size="xs"
          onClick={(e) => { e.stopPropagation(); navigate(ventaPath(row.ordenId, user)) }}
        >
          Venta
        </Btn>
      ) : null,
    }] : []),
    ...(canDeleteCaja ? [{
      key: '_reactivar',
      label: '',
      align: 'right',
      render: (_, row) => row.eliminado ? (
        <Btn
          variant="secondary"
          icon="refreshCw"
          size="xs"
          onClick={(e) => { e.stopPropagation(); handleReactivateMovimiento(row) }}
          disabled={reactivateMovimiento.isPending}
        >
          Reactivar
        </Btn>
      ) : null,
    }] : []),
  ]

  const TABS = [
    { id: 'hoy', label: 'Turno Actual' },
    { id: 'historico', label: `Histórico (${histResult.total.toLocaleString('es-CL')})` },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Caja"
        subtitle={turno ? `Turno abierto · Caja ${turno.caja?.nombre ?? ''}` : 'Sin turno activo'}
        breadcrumb={['Inicio', 'Caja']}
        actions={<>
          <BotonExportar onExportar={handleExport} />
          {turno ? (
            <>
              {canWriteCaja && <Btn variant="secondary" icon="printer" size="sm" onClick={handleCerrarTurno} disabled={cerrarTurno.isPending}>Cerrar Turno</Btn>}
              {canWriteCaja && <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/caja/nuevo')}>Nuevo Movimiento</Btn>}
            </>
          ) : (
            canWriteCaja && <Btn variant="primary" icon="unlock" size="sm" onClick={handleAbrirTurno} disabled={abrirTurno.isPending}>Abrir Turno</Btn>
          )}
        </>}
      />

      {tab === 'hoy' && (
        <div className="kpi-strip">
          <KpiCard label="Ingresos operativos" value={fmt(ingresos)} icon="trendingUp" tone="neutral" sublabel="Excluye movimientos referenciales" />
          <KpiCard label="Egresos operativos" value={fmt(egresos)} icon="trendingDown" tone="amber" sublabel="Excluye movimientos referenciales" />
          <KpiCard label="Saldo operativo" value={fmt(saldo)} icon="dollarSign" tone={saldo >= 0 ? 'neutral' : 'red'} sublabel="Base para el arqueo físico" />
          <KpiCard label="Movimientos" value={movimientos.length} icon="refreshCw" sublabel="Incluye referencias no contables" />
        </div>
      )}

      {tab === 'hoy' && turnoRequiereRevision && (
        <section role="status" aria-live="polite" style={{ marginBottom: 16, padding: '12px 16px', border: '1px solid var(--amber-300, #f2c66d)', borderRadius: 8, background: 'var(--amber-50, #fff9eb)', color: 'var(--text-1)' }}>
          <strong>Turno abierto hace {horasTurnoAbierto} horas.</strong>{' '}
          Revisa y realiza el arqueo antes de seguir registrando movimientos. El sistema conserva el turno abierto para no cerrar caja sin conteo físico.
        </section>
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
              <input value={histDesde} onChange={e => setHistDesde(e.target.value)} type="date" title="Desde" style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', width: 132 }} />
              <input value={histHasta} onChange={e => setHistHasta(e.target.value)} type="date" title="Hasta" style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', width: 132 }} />
              <select value={histTipoVenta} onChange={e => setHistTipoVenta(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
                <option value="">Todos los tipos venta</option>
                {TIPOS_VENTA.slice(1).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={histNDoc} onChange={e => setHistNDoc(e.target.value)} placeholder="N doc." style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', width: 110 }} />
              <select value={histEstado} onChange={e => setHistEstado(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
                <option value="activos">Activos</option>
                <option value="anulados">Anulados</option>
                <option value="todos">Todos</option>
              </select>
              <input value={nInterno} onChange={e => { setNInterno(e.target.value); if (!e.target.value) { urlParams.delete('nInterno'); setUrlParams(urlParams) } }} placeholder="N° Interno venta" type="number" style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', width: 140 }} />
              <SearchBar placeholder="Referencia, doc, usuario..." value={histSearch} onChange={setHistSearch} style={{ width: 200 }} />
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
            {turnoError ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--red)' }}>{turnoQueryError?.response?.data?.error || 'No se pudo cargar el turno activo'}</div>
            ) : isLoading ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
            ) : !turno ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Sin turno activo. Abre un turno para registrar movimientos.</div>
            ) : (
              <Table columns={colsHoy} rows={movimientos} emptyMessage="Sin movimientos en este turno" keyboard ariaLabel="Movimientos del turno de caja" getRowKey={(row, index) => row.id || index} />
            )}
          </>
        ) : (
          <>
            {histError ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--red)' }}>{histQueryError?.response?.data?.error || 'No se pudo cargar el historico de caja'}</div>
            ) : histLoading ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
            ) : (
              <Table columns={colsHist} rows={histResult.items} emptyMessage="Sin registros para este filtro" keyboard ariaLabel="Historico de caja" getRowKey={(row, index) => row.id || index} />
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
          <Pager page={histPage} pages={histPages} total={histResult.total} limit={histLimit} shown={(histResult.items ?? []).length} onChange={setHistPagerPage} disabled={histLoading} />
        )}
      </div>
      {cierreOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.35)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}>
          <section style={{ width: 'min(720px, 100%)', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Cierre de turno #{turno?.id}</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--text-3)', fontSize: 13 }}>Ingresa el conteo fisico por medio de pago antes de cerrar.</p>
            </div>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              {CIERRE_FIELDS.map(([key, label]) => (
                <label key={key} style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                  <span>{label}</span>
                  <input
                    type="number"
                    min="0"
                    value={cierreForm.conteo?.[key] ?? 0}
                    onChange={e => setCierreForm(f => ({ ...f, conteo: { ...f.conteo, [key]: Number(e.target.value || 0) } }))}
                    style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }}
                  />
                  <span style={{ color: 'var(--text-3)', fontSize: 11 }}>Sistema: {fmt(systemConteo[key])}</span>
                </label>
              ))}
              <label style={{ gridColumn: '1 / -1', display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                <span>Observacion</span>
                <textarea
                  value={cierreForm.obs}
                  onChange={e => setCierreForm(f => ({ ...f, obs: e.target.value }))}
                  rows={3}
                  style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 6, resize: 'vertical' }}
                />
              </label>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 13 }}>
                Sistema: <strong>{fmt(saldo)}</strong> · Contado: <strong>{fmt(countedTotal)}</strong> · Diferencia: <strong style={{ color: cierreDiferencia === 0 ? 'var(--green-600)' : 'var(--red)' }}>{fmt(cierreDiferencia)}</strong>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="secondary" size="sm" onClick={() => setCierreOpen(false)}>Cancelar</Btn>
                <Btn variant="primary" size="sm" onClick={handleConfirmarCierre} disabled={cerrarTurno.isPending}>Cerrar turno</Btn>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
