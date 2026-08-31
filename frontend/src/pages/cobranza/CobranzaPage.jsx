import { toast } from '../../store/notif'
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Tabs } from '../../components/shared'
import { useVenta, useVentas } from '../../api/ventas'
import { useRegistrarPagoCobranza, useTurnoActivo } from '../../api/caja'
import { useCobranzaHistorico, useCobranzaEjecutivas, useCobranzaMeses } from '../../api/cobranzaHistorico'
import { downloadFromBackend } from '../../utils/csv'
import { useAuthStore } from '../../store/auth'
import { can, ventaPath } from '../../utils/permissions'
import CobranzaGestionPanel from './CobranzaGestionPanel'
import BotonExportar from '../../components/BotonExportar'

const MEDIOS_PAGO = ['Efectivo', 'Debito', 'Credito', 'Transferencia', 'Cheque dia', 'Cheque fecha', 'Webpay', 'Transbank']

const ESTADO_TABS = [
  { id: 'No pagada', label: 'No Pagadas' },
  { id: 'Parcial',   label: 'Con Abono Parcial' },
]

const MAIN_TABS = [
  { id: 'activo',     label: 'Por Cobrar' },
  { id: 'historico',  label: 'Historial de Cobro' },
  { id: 'gestion',    label: 'Gestión y Cartola' },
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

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isReferencialPago(pago) {
  return normalizeText(pago?.medioPago) === 'referencial'
}

function activeReferentialDocs(venta) {
  return (venta?.pagos || []).filter(p => isReferencialPago(p) && p.documento && p.nDoc && p.estadoDoc !== 'Nula')
}

function docPaidAmount(venta, doc) {
  return (venta?.pagos || [])
    .filter(p => !isReferencialPago(p) && p.tipo === 'Ingreso' && p.documento === doc.documento && p.nDoc === doc.nDoc)
    .reduce((sum, p) => sum + Math.abs(Number(p.monto || 0)), 0)
}

function docSaldo(venta, doc) {
  return Math.max(0, Math.abs(Number(doc?.monto || 0)) - docPaidAmount(venta, doc))
}

export default function CobranzaPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const ventaIdParam = searchParams.get('ventaId')
  const user = useAuthStore(s => s.user)
  const canWriteCobranza = can(user, 'cobranza', 'write')
  const canRegisterPayment = canWriteCobranza && can(user, 'caja', 'read') && can(user, 'caja', 'write')
  const [mainTab, setMainTab] = useState('activo')
  const [gestionTarget, setGestionTarget] = useState(null)
  const [estadoTab, setEstadoTab] = useState('No pagada')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [fechaDocDesde, setFechaDocDesde] = useState('')
  const [fechaDocHasta, setFechaDocHasta] = useState('')
  const [documento, setDocumento] = useState('')
  const [nDoc, setNDoc] = useState('')
  const [creador, setCreador] = useState('')
  const [cobranzaFiltro, setCobranzaFiltro] = useState('')
  const debounceRef = useRef(null)

  // Historico filters
  const [histEjecutiva, setHistEjecutiva] = useState('')
  const [histEstado, setHistEstado] = useState('')
  const [histMes, setHistMes] = useState('')
  const [histSearch, setHistSearch] = useState('')
  const [histFechaCampo, setHistFechaCampo] = useState('fechaFactura')
  const [histFechaDesde, setHistFechaDesde] = useState('')
  const [histFechaHasta, setHistFechaHasta] = useState('')
  const [histNdoc, setHistNdoc] = useState('')
  const [histInterno, setHistInterno] = useState('')
  const [histRut, setHistRut] = useState('')
  const [histCliente, setHistCliente] = useState('')
  const [histDebounced, setHistDebounced] = useState('')
  const histDebRef = useRef(null)
  const [paymentRow, setPaymentRow] = useState(null)
  const [paymentForm, setPaymentForm] = useState({
    monto: '',
    medioPago: 'Efectivo',
    documento: '',
    nDoc: '',
    tipoDocumento: '',
    cuotas: '',
    pagaCon: '',
    nMedioPago: '',
    origenMedioPago: '',
    referencia: '',
  })

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
  const activeParams = { orderBy: 'asc', limit: '500' }
  if (!cobranzaFiltro) activeParams.estadoPago = estadoTab
  if (cobranzaFiltro) activeParams.cobranzaFiltro = cobranzaFiltro
  if (debounced) activeParams.search = debounced
  if (fechaDesde) activeParams.fechaDesde = fechaDesde
  if (fechaHasta) activeParams.fechaHasta = fechaHasta
  if (fechaDocDesde) activeParams.fechaDocDesde = fechaDocDesde
  if (fechaDocHasta) activeParams.fechaDocHasta = fechaDocHasta
  if (documento) activeParams.documento = documento
  if (nDoc) activeParams.nDoc = nDoc
  if (creador) activeParams.creador = creador
  const { data: activeResult = { items: [], total: 0 }, isLoading, isError: activeError, error: activeQueryError } = useVentas(activeParams)
  const { data: turno } = useTurnoActivo(canRegisterPayment)
  const registrarPagoMut = useRegistrarPagoCobranza()
  const ventas = activeResult.items ?? []
  const total = activeResult.total ?? 0

  // Historico cobranza
  const histParams = {}
  if (histEjecutiva) histParams.ejecutiva = histEjecutiva
  if (histEstado) histParams.estado = histEstado
  if (histMes) histParams.mes = histMes
  if (histDebounced) histParams.search = histDebounced
  if (histFechaCampo) histParams.fechaCampo = histFechaCampo
  if (histFechaDesde) histParams.fechaDesde = histFechaDesde
  if (histFechaHasta) histParams.fechaHasta = histFechaHasta
  if (histNdoc) histParams.ndoc = histNdoc
  if (histInterno) histParams.interno = histInterno
  if (histRut) histParams.rut = histRut
  if (histCliente) histParams.cliente = histCliente
  const { data: histResult = { items: [], total: 0, stats: { cobrado: 0, pendiente: 0, n_canceladas: 0, n_pendientes: 0 } }, isLoading: histLoading, isError: histError, error: histQueryError } = useCobranzaHistorico(histParams)
  const { data: ejecutivas = [] } = useCobranzaEjecutivas()
  const { data: meses = [] } = useCobranzaMeses()

  const fmt = n => '$' + Math.abs(n || 0).toLocaleString('es-CL')
  const fmtM = n => '$' + (Math.abs(n || 0) / 1_000_000).toFixed(1) + 'M'
  const paymentSaldo = paymentRow ? Math.max(0, (paymentRow.total || 0) - (paymentRow.abono || 0)) : 0
  const paymentDocs = paymentRow ? activeReferentialDocs(paymentRow).filter(doc => docSaldo(paymentRow, doc) > 0) : []
  const selectedPaymentDocKey = paymentForm.documento && paymentForm.nDoc ? `${paymentForm.documento}|||${paymentForm.nDoc}` : ''
  const miniInput = { padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }

  const openPayment = (row) => {
    const saldo = Math.max(0, (row.total || 0) - (row.abono || 0))
    const doc = activeReferentialDocs(row).find(d => docSaldo(row, d) > 0) || activeReferentialDocs(row)[0]
    const saldoDoc = doc ? docSaldo(row, doc) : saldo
    setPaymentRow(row)
    setPaymentForm({
      monto: String(Math.min(saldo, saldoDoc || saldo)),
      medioPago: 'Efectivo',
      documento: doc?.documento || '',
      nDoc: doc?.nDoc || '',
      tipoDocumento: doc?.tipoDocumento || doc?.documento || '',
      cuotas: '',
      pagaCon: '',
      nMedioPago: '',
      origenMedioPago: '',
      referencia: row.nInterno ? `Pago venta N interno ${row.nInterno}` : `Pago venta #${row.id}`,
    })
  }

  // Deep-link desde Venta ("Cobrar") -> abre directo el modal de pago de esa venta.
  const { data: ventaDeepLink } = useVenta(ventaIdParam ? Number(ventaIdParam) : null)
  useEffect(() => {
    if (!ventaIdParam || !ventaDeepLink) return
    setSearchParams(params => { params.delete('ventaId'); return params }, { replace: true })
    const saldo = Math.max(0, (ventaDeepLink.total || 0) - (ventaDeepLink.abono || 0))
    if (saldo <= 0) {
      toast.warning('Esa venta no tiene saldo pendiente')
      return
    }
    const t = setTimeout(() => openPayment(ventaDeepLink), 0)
    return () => clearTimeout(t)
  }, [ventaIdParam, ventaDeepLink, setSearchParams])

  const submitPayment = () => {
    if (!paymentRow) return
    const monto = Number(paymentForm.monto)
    if (!monto || monto <= 0) return toast.warning('Monto invalido')
    if (monto > paymentSaldo) return toast.warning('El monto excede el saldo pendiente')
    if (!paymentForm.documento || !paymentForm.nDoc) return toast.warning('Selecciona un documento referencial activo antes de registrar el pago')
    if (!turno) return toast.warning('No hay turno activo. Abre un turno en caja antes de registrar pagos.')
    registrarPagoMut.mutate({
      ordenId: paymentRow.id,
      data: {
        monto,
        medioPago: paymentForm.medioPago,
        referencia: paymentForm.referencia || undefined,
        documento: paymentForm.documento || undefined,
        nDoc: paymentForm.nDoc || undefined,
        tipoDocumento: paymentForm.tipoDocumento || undefined,
        cuotas: paymentForm.cuotas ? Number(paymentForm.cuotas) : undefined,
        pagaCon: paymentForm.pagaCon ? Number(paymentForm.pagaCon) : undefined,
        nMedioPago: paymentForm.nMedioPago || undefined,
        origenMedioPago: paymentForm.origenMedioPago || undefined,
      },
    }, {
      onSuccess: () => {
        setPaymentRow(null)
        toast.success('Pago registrado en caja y saldo de venta actualizado')
      },
      onError: err => toast.error(err.response?.data?.error || 'Error al registrar abono'),
    })
  }

  // Active cobranza KPIs
  const montoPendiente = activeResult.stats?.montoPendiente ?? ventas.reduce((s, v) => s + Math.max(0, (v.total || 0) - (v.abono || 0)), 0)
  const masde30 = activeResult.stats?.masDe30 ?? ventas.filter(v => diasDesde(v.createdAt) > 30).length
  const conAbono = activeResult.stats?.conAbono ?? ventas.filter(v => (v.abono || 0) > 0).length

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
            {canRegisterPayment && (
            <button
              onClick={e => {
                e.stopPropagation()
                if (saldo <= 0) return toast.warning('La venta no tiene saldo pendiente')
                openPayment(row)
              }}
              disabled={registrarPagoMut.isPending || !turno}
              style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--green-700)', background: 'var(--green-700)', cursor: 'pointer', color: '#fff', fontWeight: 500, whiteSpace: 'nowrap' }}
              title={turno ? 'Registrar abono' : 'Requiere turno de caja abierto'}
            >Pagar</button>
            )}
            <button
              onClick={e => { e.stopPropagation(); navigate(ventaPath(row.id, user)) }}
              style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500, whiteSpace: 'nowrap' }}
            >{can(user, 'ventas', 'write') ? 'Gestionar' : 'Ver'}</button>
            {canWriteCobranza && (
              <button
                onClick={e => { e.stopPropagation(); setGestionTarget(row); setMainTab('gestion') }}
                style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--blue, #2563eb)', fontWeight: 500, whiteSpace: 'nowrap' }}
              >Seguimiento</button>
            )}
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
      key: 'nc', label: 'NC', align: 'right',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--amber)' }}>{fmt(v)}</span> : '-'
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
    {
      key: '_acc', label: '',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 4 }}>
          {row.ordenId && (
            <button
              onClick={e => { e.stopPropagation(); navigate(ventaPath(row.ordenId, user)) }}
              style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500, whiteSpace: 'nowrap' }}
            >Venta</button>
          )}
          {row.rut && (
            <button
              onClick={e => { e.stopPropagation(); navigate('/clientes?search=' + encodeURIComponent(row.rut)) }}
              style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--blue, #2563eb)', fontWeight: 500, whiteSpace: 'nowrap' }}
            >Cliente</button>
          )}
        </div>
      )
    },
  ]

  const toolbarExtraActivo = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchBar placeholder="Buscar cliente, RUT, N° interno..." value={search} onChange={setSearch} style={{ width: 220 }} />
        
        <select value={estadoTab} onChange={e => setEstadoTab(e.target.value)} style={miniInput}>
          {ESTADO_TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        <select value={cobranzaFiltro} onChange={e => setCobranzaFiltro(e.target.value)} style={miniInput}>
          <option value="">Todas las entregas</option>
          <option value="entregados_sin_factura">Entregados sin factura</option>
          <option value="entregados_con_saldo">Entregados con saldo</option>
        </select>

        <select value={documento} onChange={e => setDocumento(e.target.value)} style={miniInput}>
          <option value="">Todos los doc.</option>
          <option value="Factura">Factura</option>
          <option value="Boleta">Boleta</option>
          <option value="Guia Despacho">Guía Despacho</option>
        </select>

        <input type="text" placeholder="N° Doc" value={nDoc} onChange={e => setNDoc(e.target.value)} style={{ ...miniInput, width: 80 }} />
        <input type="text" placeholder="Creador" value={creador} onChange={e => setCreador(e.target.value)} style={{ ...miniInput, width: 90 }} />

        {(search || estadoTab !== 'No pagada' || cobranzaFiltro || documento || nDoc || creador || fechaDesde || fechaHasta || fechaDocDesde || fechaDocHasta) && (
          <Btn variant="secondary" size="xs" onClick={() => {
            setSearch('')
            setEstadoTab('No pagada')
            setCobranzaFiltro('')
            setDocumento('')
            setNDoc('')
            setCreador('')
            setFechaDesde('')
            setFechaHasta('')
            setFechaDocDesde('')
            setFechaDocHasta('')
          }}>Limpiar</Btn>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: 'var(--text-3)' }}>
        <span style={{ fontFamily: 'monospace' }}>Fecha Venc:</span>
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={miniInput} />
        <span>a</span>
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={miniInput} />

        <span style={{ marginLeft: 8, fontFamily: 'monospace' }}>Fecha Doc:</span>
        <input type="date" value={fechaDocDesde} onChange={e => setFechaDocDesde(e.target.value)} style={miniInput} />
        <span>a</span>
        <input type="date" value={fechaDocHasta} onChange={e => setFechaDocHasta(e.target.value)} style={miniInput} />
      </div>
    </div>
  )

  const toolbarExtraHistorico = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchBar placeholder="Buscar ejecutiva, cliente, banco..." value={histSearch} onChange={setHistSearch} style={{ width: 220 }} />

        <select value={histEjecutiva} onChange={e => setHistEjecutiva(e.target.value)} style={miniInput}>
          <option value="">Todas las ejecutivas</option>
          {ejecutivas.map(ej => <option key={ej.ejecutiva || ej} value={ej.ejecutiva || ej}>{ej.ejecutiva || ej}</option>)}
        </select>

        <select value={histEstado} onChange={e => setHistEstado(e.target.value)} style={miniInput}>
          <option value="">Todos los estados</option>
          <option value="Cancelada">Cancelada</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Nula">Nula</option>
        </select>

        <select value={histMes} onChange={e => setHistMes(e.target.value)} style={miniInput}>
          <option value="">Todos los períodos</option>
          {meses.map(m => <option key={m.mes_anio || m} value={m.mes_anio || m}>{m.mes_anio || m}</option>)}
        </select>

        {(histSearch || histEjecutiva || histEstado || histMes || histFechaDesde || histFechaHasta || histNdoc || histInterno || histRut || histCliente) && (
          <Btn variant="secondary" size="xs" onClick={() => {
            setHistSearch('')
            setHistEjecutiva('')
            setHistEstado('')
            setHistMes('')
            setHistFechaDesde('')
            setHistFechaHasta('')
            setHistNdoc('')
            setHistInterno('')
            setHistRut('')
            setHistCliente('')
          }}>Limpiar</Btn>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: 'var(--text-3)' }}>
        <select value={histFechaCampo} onChange={e => setHistFechaCampo(e.target.value)} style={miniInput}>
          <option value="fechaFactura">Fecha Factura</option>
          <option value="fechaPago">Fecha Pago</option>
        </select>
        <span>desde</span>
        <input type="date" value={histFechaDesde} onChange={e => setHistFechaDesde(e.target.value)} style={miniInput} />
        <span>hasta</span>
        <input type="date" value={histFechaHasta} onChange={e => setHistFechaHasta(e.target.value)} style={miniInput} />

        <input type="text" placeholder="N° Doc" value={histNdoc} onChange={e => setHistNdoc(e.target.value)} style={{ ...miniInput, width: 70 }} />
        <input type="text" placeholder="Interno" value={histInterno} onChange={e => setHistInterno(e.target.value)} style={{ ...miniInput, width: 70 }} />
        <input type="text" placeholder="RUT" value={histRut} onChange={e => setHistRut(e.target.value)} style={{ ...miniInput, width: 80 }} />
        <input type="text" placeholder="Cliente" value={histCliente} onChange={e => setHistCliente(e.target.value)} style={{ ...miniInput, width: 100 }} />
      </div>
    </div>
  )

  return (
    <main className="page page-wide">
      <PageHeader
        title="Cobranza"
        subtitle={mainTab === 'activo'
          ? `${total.toLocaleString('es-CL')} documentos por cobrar`
          : mainTab === 'historico'
            ? `${histResult.total.toLocaleString('es-CL')} registros históricos`
            : 'Seguimiento de compromisos y conciliación bancaria'}
        breadcrumb={['Inicio', 'Caja', 'Cobranza']}
        actions={mainTab !== 'gestion' ? <>
          <BotonExportar
            onExportar={archivo => {
              if (mainTab === 'activo') {
                const params = { estadoPago: estadoTab }
                if (debounced) params.search = debounced
                if (fechaDesde) params.fechaDesde = fechaDesde
                if (fechaHasta) params.fechaHasta = fechaHasta
                if (fechaDocDesde) params.fechaDocDesde = fechaDocDesde
                if (fechaDocHasta) params.fechaDocHasta = fechaDocHasta
                if (documento) params.documento = documento
                if (nDoc) params.nDoc = nDoc
                if (creador) params.creador = creador
                downloadFromBackend('/reportes/export/cobranza-activa', `cobranza_${new Date().toISOString().slice(0,10)}.${archivo}`, { ...params, archivo })
                  .catch(err => toast.error(err?.response?.data?.error || 'No se pudo exportar cobranza activa'))
              } else {
                const params = {}
                if (histEjecutiva) params.ejecutiva = histEjecutiva
                if (histEstado) params.estado = histEstado
                if (histMes) params.mes = histMes
                if (histDebounced) params.search = histDebounced
                if (histFechaCampo) params.fechaCampo = histFechaCampo
                if (histFechaDesde) params.fechaDesde = histFechaDesde
                if (histFechaHasta) params.fechaHasta = histFechaHasta
                if (histNdoc) params.ndoc = histNdoc
                if (histInterno) params.interno = histInterno
                if (histRut) params.rut = histRut
                if (histCliente) params.cliente = histCliente
                downloadFromBackend('/reportes/export/cobranza', `cobranza_historico_${new Date().toISOString().slice(0,10)}.${archivo}`, { ...params, archivo })
                  .catch(err => toast.error(err?.response?.data?.error || 'No se pudo exportar historico de cobranza'))
              }
            }}
          />
        </> : null}
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
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <Tabs tabs={MAIN_TABS} active={mainTab} onChange={t => setMainTab(t)} style={{ marginBottom: 0 }} />
        </div>

        {mainTab === 'activo' && (
          activeError
            ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--red)' }}>{activeQueryError?.response?.data?.error || 'No se pudo cargar cobranza activa'}</div>
            : isLoading
            ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
            : <Table
                columns={colsActivo}
                rows={ventas}
                onRowClick={row => navigate(ventaPath(row.id, user))}
                emptyMessage="Sin documentos pendientes de cobro"
                ariaLabel="Documentos pendientes de cobro"
                getRowKey={row => row.id}
                toolbarExtra={toolbarExtraActivo}
              />
        )}

        {mainTab === 'historico' && (
          histError
            ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--red)' }}>{histQueryError?.response?.data?.error || 'No se pudo cargar historico de cobranza'}</div>
            : histLoading
            ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
            : <Table
                columns={colsHist}
                rows={histResult.items}
                emptyMessage="Sin registros históricos para este filtro"
                keyboard
                ariaLabel="Historial de cobranza"
                getRowKey={row => row.id}
                toolbarExtra={toolbarExtraHistorico}
              />
        )}

        {mainTab === 'gestion' && (
          <CobranzaGestionPanel
            key={gestionTarget?.id || 'general'}
            canWrite={canWriteCobranza}
            initialTarget={gestionTarget}
          />
        )}

        {mainTab === 'historico' && histResult.total > histResult.limit && (
          <div style={{ padding: '10px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
            Mostrando {histResult.limit} de {histResult.total.toLocaleString('es-CL')} registros. Usa filtros para acotar.
          </div>
        )}
      </div>
      {paymentRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.35)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}>
          <section style={{ width: 'min(760px, 100%)', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Registrar pago venta #{paymentRow.id}</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--text-3)', fontSize: 13 }}>Saldo pendiente: {fmt(paymentSaldo)}</p>
            </div>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                <span>Monto</span>
                <input type="number" min="1" max={paymentSaldo} value={paymentForm.monto} onChange={e => setPaymentForm(f => ({ ...f, monto: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                <span>Medio de pago</span>
                <select value={paymentForm.medioPago} onChange={e => setPaymentForm(f => ({ ...f, medioPago: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }}>
                  {MEDIOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                <span>Documento</span>
                <select
                  value={selectedPaymentDocKey}
                  onChange={e => {
                    const doc = paymentDocs.find(d => `${d.documento}|||${d.nDoc}` === e.target.value)
                    setPaymentForm(f => ({
                      ...f,
                      documento: doc?.documento || '',
                      nDoc: doc?.nDoc || '',
                      tipoDocumento: doc?.tipoDocumento || doc?.documento || '',
                      monto: doc ? String(Math.min(paymentSaldo, docSaldo(paymentRow, doc))) : f.monto,
                    }))
                  }}
                  style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }}
                >
                  <option value="">Sin documento activo</option>
                  {paymentDocs.map(doc => (
                    <option key={doc.id} value={`${doc.documento}|||${doc.nDoc}`}>
                      {doc.documento} #{doc.nDoc} - saldo {fmt(docSaldo(paymentRow, doc))}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                <span>N doc / voucher</span>
                <input value={paymentForm.nDoc} disabled style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)' }} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                <span>Tipo documento</span>
                <input value={paymentForm.tipoDocumento} onChange={e => setPaymentForm(f => ({ ...f, tipoDocumento: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                <span>Cuotas</span>
                <input type="number" min="1" value={paymentForm.cuotas} onChange={e => setPaymentForm(f => ({ ...f, cuotas: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                <span>Paga con</span>
                <input type="number" min="0" value={paymentForm.pagaCon} onChange={e => setPaymentForm(f => ({ ...f, pagaCon: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                <span>N medio pago</span>
                <input value={paymentForm.nMedioPago} onChange={e => setPaymentForm(f => ({ ...f, nMedioPago: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                <span>Origen medio pago</span>
                <input value={paymentForm.origenMedioPago} onChange={e => setPaymentForm(f => ({ ...f, origenMedioPago: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }} />
              </label>
              <label style={{ gridColumn: '1 / -1', display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
                <span>Referencia</span>
                <input value={paymentForm.referencia} onChange={e => setPaymentForm(f => ({ ...f, referencia: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }} />
              </label>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="secondary" size="sm" onClick={() => setPaymentRow(null)}>Cancelar</Btn>
              <Btn variant="primary" size="sm" onClick={submitPayment} disabled={registrarPagoMut.isPending || !turno}>Registrar pago</Btn>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
