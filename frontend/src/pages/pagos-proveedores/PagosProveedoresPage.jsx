import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from '../../store/notif'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { FormField, FormPanel, Input, Select, Textarea } from '../../components/forms'
import { downloadPagosProveedoresCsv, useCreatePagoProveedor, usePagosProveedores } from '../../api/pagosProveedores'
import { useProveedores } from '../../api/proveedores'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import ModalRegistrarAbono from './ModalRegistrarAbono'

const TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'Pendiente', label: 'Pendientes' },
  { id: 'Abonado', label: 'Abonados' },
  { id: 'Pagado', label: 'Pagados' },
  { id: 'Vencido', label: 'Vencidos' },
]

const ESTADO_TONE = {
  Pendiente: 'amber',
  Abonado: 'blue',
  Pagado: 'green',
  Vencido: 'red',
  Anulado: 'neutral',
}

const DOCUMENTOS = ['Factura', 'Boleta', 'Nota']
const ESTADOS = [
  { value: 'Pendiente', label: 'Pendiente' },
  { value: 'Pagado', label: 'Pagado' },
]
const fmt = n => '$' + Number(n || 0).toLocaleString('es-CL')
const dateFmt = v => v ? new Date(v).toLocaleDateString('es-CL') : '-'
const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = () => ({
  documento: 'Factura',
  nDoc: '',
  proveedorId: '',
  estado: 'Pendiente',
  total: '',
  fechaDoc: today(),
  fechaVencimiento: '',
  fechaPago: '',
  obs: '',
})

export default function PagosProveedoresPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const user = useAuthStore(s => s.user)
  const canPay = can(user, 'caja.pagos_proveedores', 'write')
  const canWriteProveedores = can(user, 'proveedores', 'write') || canPay

  const [tab, setTab] = useState(searchParams.get('estado') || 'all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [documento, setDocumento] = useState(searchParams.get('doc') || searchParams.get('documento') || '')
  const [bodega, setBodega] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [proveedorSearch, setProveedorSearch] = useState('')
  const [selectedPagoForAbono, setSelectedPagoForAbono] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const params = { page: String(page) }
  if (tab !== 'all') params.estado = tab
  if (debouncedSearch) params.search = debouncedSearch
  if (desde) params.desde = desde
  if (hasta) params.hasta = hasta
  if (documento) params.documento = documento
  if (bodega) params.bodega = bodega
  if (proveedor) params.proveedor = proveedor

  const { data: result = { items: [], total: 0, limit: 100, stats: {} }, isLoading, isError } = usePagosProveedores(params)
  const createMut = useCreatePagoProveedor()
  const { data: proveedores = { items: [] } } = useProveedores(proveedorSearch ? { search: proveedorSearch } : {})

  const items = useMemo(() => result.items ?? [], [result.items])
  const total = result.total ?? 0
  const limit = result.limit ?? 100
  const stats = result.stats || {}
  const pages = Math.max(1, Math.ceil(total / limit))

  const providerTotals = useMemo(() => {
    const totals = new Map()
    for (const item of items) {
      const name = item.proveedor?.nombre || 'Sin proveedor'
      totals.set(name, (totals.get(name) || 0) + Number(item.saldo ?? item.total ?? 0))
    }
    return [...totals.entries()].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total)
  }, [items])

  const handleExport = () => {
    const exportParams = { ...params }
    delete exportParams.page
    downloadPagosProveedoresCsv(exportParams, `pagos_proveedores_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const handleExportDetalle = () => {
    const exportParams = { ...params, detalle: '1' }
    delete exportParams.page
    downloadPagosProveedoresCsv(exportParams, `pagos_proveedores_detalle_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const saveSimpleDoc = () => {
    if (!form.proveedorId) return toast.warning('Proveedor requerido')
    if (!form.documento) return toast.warning('Documento requerido')
    if (!form.nDoc.trim()) return toast.warning('N Doc requerido')
    if (!form.fechaDoc) return toast.warning('Fecha documento requerida')
    if (!form.total || Number(form.total) <= 0) return toast.warning('Total requerido mayor a 0')
    createMut.mutate({
      ...form,
      proveedorId: Number(form.proveedorId),
      total: Number(form.total),
      bodega: 'No hay',
      ingresaStock: false,
    }, {
      onSuccess: () => {
        toast.success('Documento creado con éxito')
        setShowCreate(false)
        setForm(emptyForm())
      },
      onError: err => toast.error(err.response?.data?.error || 'No se pudo crear el documento'),
    })
  }

  const clearFilters = () => {
    setDesde('')
    setHasta('')
    setSearch('')
    setDocumento('')
    setBodega('')
    setProveedor('')
    setTab('all')
    setPage(1)
  }

  const cols = [
    {
      key: 'nDoc',
      label: 'N Doc',
      render: (v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v || '-'}</span>
          {row.documentoRecibidoId && (
            <a
              href={`/api/facturacion/recibidos/${row.documentoRecibidoId}/pdf`}
              target="_blank"
              rel="noreferrer"
              title="Ver PDF DTE Oficial"
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, background: '#e0f2fe', color: '#0369a1', textDecoration: 'none', fontWeight: 600 }}
            >
              DTE
            </a>
          )}
        </div>
      ),
    },
    { key: 'documento', label: 'Tipo', render: v => v ? <Badge tone="neutral">{v}</Badge> : '-' },
    {
      key: 'proveedor',
      label: 'Proveedor',
      wrap: true,
      render: v => v ? (
        <div style={{ maxWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nombre}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{v.rut || '-'}</div>
        </div>
      ) : '-',
    },
    { key: 'fechaDoc', label: 'Fecha doc', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{dateFmt(v)}</span> },
    { key: 'fechaVencimiento', label: 'Vencimiento', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-2)' }}>{dateFmt(v)}</span> },
    { key: 'total', label: 'Total Doc', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 500 }}>{fmt(v)}</span> },
    { key: 'montoPagado', label: 'Pagado', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--green-700)' }}>{fmt(v)}</span> },
    {
      key: 'saldo',
      label: 'Saldo',
      align: 'right',
      render: (v, row) => {
        const isVencido = row.estado === 'Vencido' || (row.fechaVencimiento && row.fechaVencimiento < today() && Number(v) > 0)
        return (
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontWeight: 700,
            color: isVencido ? 'var(--red, #dc2626)' : (Number(v) > 0 ? 'var(--amber-700, #b45309)' : 'var(--text-3)'),
          }}>
            {fmt(v)}
          </span>
        )
      },
    },
    { key: 'estado', label: 'Estado', render: v => <Badge tone={ESTADO_TONE[v] || 'gray'}>{v}</Badge> },
    { key: 'nc', label: 'NC', render: (v, row) => v ? <Badge tone="amber">{row.ncNumero || fmt(row.ncMonto) || 'Si'}</Badge> : '-' },
    {
      key: '_acc',
      label: 'Acciones',
      align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <Btn variant="secondary" size="xs" icon="eye" onClick={e => { e.stopPropagation(); navigate('/pagos-proveedores/' + row.id) }}>
            Ver
          </Btn>
          {canPay && Number(row.saldo || 0) > 0 && row.estado !== 'Anulado' && (
            <Btn
              variant="primary"
              size="xs"
              icon="creditCard"
              onClick={e => {
                e.stopPropagation()
                setSelectedPagoForAbono(row)
              }}
            >
              Pagar
            </Btn>
          )}
        </div>
      ),
    },
  ]

  const toolbarExtra = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1); setSearch('') }} style={{ marginBottom: 0 }} />
        <SearchBar placeholder="Buscar N doc, proveedor, RUT, código" value={search} onChange={setSearch} style={{ width: 300 }} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Fecha doc:</span>
        <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1) }} style={{ padding: '5px 8px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>-</span>
        <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1) }} style={{ padding: '5px 8px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)' }} />
        <select value={documento} onChange={e => { setDocumento(e.target.value); setPage(1) }} style={{ padding: '5px 8px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)' }}>
          <option value="">Documento</option>
          <option value="Factura">Factura</option>
          <option value="Boleta">Boleta</option>
          <option value="Nota">Nota de Crédito</option>
        </select>
        <input value={bodega} onChange={e => { setBodega(e.target.value); setPage(1) }} placeholder="Bodega" style={{ padding: '5px 8px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)' }} />
        <input value={proveedor} onChange={e => { setProveedor(e.target.value); setPage(1) }} placeholder="Proveedor / RUT" style={{ padding: '5px 8px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)' }} />
        {(desde || hasta || debouncedSearch || tab !== 'all' || documento || bodega || proveedor) && (
          <button onClick={clearFilters} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)' }}>
            Limpiar filtros
          </button>
        )}
      </div>
      {!!providerTotals.length && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>Saldo por proveedor:</span>
          {providerTotals.slice(0, 5).map(p => (
            <Badge key={p.nombre} tone="gray">{p.nombre}: {fmt(p.total)}</Badge>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <main className="page page-wide">
      <PageHeader
        title="Pagos a Proveedores"
        subtitle={`${total.toLocaleString('es-CL')} documentos registrados`}
        breadcrumb={['Inicio', 'Caja', 'Pagos a Proveedores']}
        actions={
          <>
            <Btn variant="secondary" icon="download" size="sm" onClick={handleExport} disabled={total === 0 && !isLoading}>
              Exportar CSV
            </Btn>
            <Btn variant="secondary" icon="download" size="sm" onClick={handleExportDetalle} disabled={total === 0 && !isLoading}>
              CSV detalle
            </Btn>
            {canWriteProveedores && (
              <Btn variant="secondary" icon="plus" size="sm" onClick={() => setShowCreate(true)}>
                Nueva factura/boleta
              </Btn>
            )}
            {canWriteProveedores && (
              <Btn variant="primary" icon="plus" size="sm" onClick={() => navigate('/stock-ingresos')}>
                Ingreso mercadería
              </Btn>
            )}
          </>
        }
      />

      {/* KPI Strip Gerencial de Tesorería */}
      <div className="kpi-strip">
        <KpiCard
          label="Saldo Total Pendiente"
          value={fmt(stats.saldoTotalPendiente)}
          icon="creditCard"
          tone="amber"
          sublabel="Exigible a proveedores"
        />
        <KpiCard
          label="Por Pagar Esta Semana"
          value={fmt(stats.estaSemanaTotal)}
          icon="calendar"
          tone="blue"
          sublabel={`${stats.estaSemanaCount || 0} doc(s) con vencimiento`}
        />
        <KpiCard
          label="Por Pagar Este Mes"
          value={fmt(stats.esteMesTotal)}
          icon="clock"
          tone="neutral"
          sublabel={`${stats.esteMesCount || 0} doc(s) en el mes`}
        />
        <KpiCard
          label="Vencidos"
          value={fmt(stats.vencidoTotal)}
          icon="alertTriangle"
          tone="red"
          sublabel={`${stats.vencidoCount || 0} doc(s) vencidos`}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '-6px 0 16px' }}>
        <Btn variant="secondary" size="sm" icon="alertTriangle" onClick={() => { setDocumento('Factura'); setTab('Pendiente'); setPage(1) }}>
          Facturas pendientes ({stats.facturasNoPagadas || 0})
        </Btn>
        <Btn variant="secondary" size="sm" icon="alertTriangle" onClick={() => { setDocumento('Boleta'); setTab('Pendiente'); setPage(1) }}>
          Boletas pendientes ({stats.boletasNoPagadas || 0})
        </Btn>
      </div>

      {/* Tabla protegida contra parpadeo y desmonte */}
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <Table
          columns={cols}
          rows={items}
          loading={isLoading}
          onRowClick={row => navigate('/pagos-proveedores/' + row.id)}
          emptyMessage={isError ? 'Error al cargar pagos a proveedores' : 'Sin documentos registrados'}
          ariaLabel="Pagos a proveedores"
          getRowKey={row => row.id}
          getRowStyle={row => {
            const todayStr = today()
            if (row.estado !== 'Pagado' && row.estado !== 'Anulado' && row.fechaVencimiento && row.fechaVencimiento < todayStr) {
              return { background: 'rgba(254, 226, 226, 0.4)' }
            }
            return {}
          }}
          toolbarExtra={toolbarExtra}
          pager={{ page, pages, total, limit, shown: items.length, onChange: setPage, disabled: isLoading }}
        />
      </div>

      {/* Modal de Registro de Abonos */}
      {selectedPagoForAbono && (
        <ModalRegistrarAbono
          pago={selectedPagoForAbono}
          onClose={() => setSelectedPagoForAbono(null)}
          onSuccess={() => setSelectedPagoForAbono(null)}
        />
      )}

      {/* Panel para crear nueva factura simple */}
      {showCreate && (
        <FormPanel
          title="Nueva boleta o factura proveedor"
          subtitle="Registro contable de documento sin ingreso de stock físico"
          width={720}
          onClose={() => setShowCreate(false)}
          onSave={saveSimpleDoc}
          saving={createMut.isPending}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <FormField label="Documento" required>
              <Select value={form.documento} onChange={v => setForm(f => ({ ...f, documento: v }))} options={DOCUMENTOS} />
            </FormField>
            <FormField label="N Doc" required>
              <Input value={form.nDoc} onChange={v => setForm(f => ({ ...f, nDoc: v }))} />
            </FormField>
            <FormField label="Buscar proveedor">
              <Input value={proveedorSearch} onChange={setProveedorSearch} placeholder="Nombre, RUT o código" />
            </FormField>
            <FormField label="Proveedor" required>
              <Select
                value={form.proveedorId}
                onChange={v => setForm(f => ({ ...f, proveedorId: v }))}
                options={[{ value: '', label: 'Seleccionar' }, ...(proveedores.items || []).map(p => ({ value: String(p.id), label: `${p.nombre} ${p.rut ? `(${p.rut})` : ''}` }))]}
              />
            </FormField>
            <FormField label="Total" required>
              <Input type="number" prefix="$" value={form.total} onChange={v => setForm(f => ({ ...f, total: v }))} />
            </FormField>
            <FormField label="Estado" required>
              <Select value={form.estado} onChange={v => setForm(f => ({ ...f, estado: v }))} options={ESTADOS} />
            </FormField>
            <FormField label="Fecha documento" required>
              <Input type="date" value={form.fechaDoc} onChange={v => setForm(f => ({ ...f, fechaDoc: v }))} />
            </FormField>
            <FormField label="Fecha vencimiento">
              <Input type="date" value={form.fechaVencimiento} onChange={v => setForm(f => ({ ...f, fechaVencimiento: v }))} />
            </FormField>
            <FormField label="Fecha pago">
              <Input type="date" value={form.fechaPago} onChange={v => setForm(f => ({ ...f, fechaPago: v }))} />
            </FormField>
          </div>
          <FormField label="Observaciones">
            <Textarea value={form.obs} onChange={v => setForm(f => ({ ...f, obs: v }))} rows={3} />
          </FormField>
        </FormPanel>
      )}
    </main>
  )
}
