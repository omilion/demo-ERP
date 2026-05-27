import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { FormField, FormPanel, Input, Select, Textarea } from '../../components/forms'
import { downloadPagosProveedoresCsv, useCreatePagoProveedor, usePagosProveedores, useUpdatePagoProveedor } from '../../api/pagosProveedores'
import { useProveedores } from '../../api/proveedores'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

const TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'Pendiente', label: 'Pendientes' },
  { id: 'Pagado', label: 'Pagados' },
  { id: 'Vencido', label: 'Vencidos' },
]

const ESTADO_TONE = {
  Pendiente: 'amber',
  Pagado: 'green',
  Vencido: 'red',
  Anulado: 'neutral',
}

const DOCUMENTOS = ['Factura', 'Boleta']
const ESTADOS = [
  { value: 'Pendiente', label: 'No pagada' },
  { value: 'Pagado', label: 'Pagada' },
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
  const canWriteProveedores = can(user, 'proveedores', 'write')
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

  const { data: result = { items: [], total: 0, limit: 100, stats: {} }, isLoading } = usePagosProveedores(params)
  const updateMut = useUpdatePagoProveedor()
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
      totals.set(name, (totals.get(name) || 0) + Number(item.total || 0))
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
    if (!form.proveedorId) return alert('Proveedor requerido')
    if (!form.documento) return alert('Documento requerido')
    if (!form.nDoc.trim()) return alert('N Doc requerido')
    if (!form.fechaDoc) return alert('Fecha documento requerida')
    if (!form.total || Number(form.total) <= 0) return alert('Total requerido')
    createMut.mutate({
      ...form,
      proveedorId: Number(form.proveedorId),
      total: Number(form.total),
      bodega: 'No hay',
      ingresaStock: false,
    }, {
      onSuccess: () => {
        setShowCreate(false)
        setForm(emptyForm())
      },
      onError: err => alert(err.response?.data?.error || 'No se pudo crear el documento'),
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
    { key: 'nDoc', label: 'N Doc', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v || '-'}</span> },
    { key: 'documento', label: 'Tipo', render: v => v ? <Badge tone="neutral">{v}</Badge> : '-' },
    { key: 'proveedor', label: 'Proveedor', wrap: true, render: v => v ? (
      <div style={{ maxWidth: 240 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nombre}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{v.rut || '-'}</div>
      </div>
    ) : '-' },
    { key: 'fechaDoc', label: 'Fecha doc', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{dateFmt(v)}</span> },
    { key: 'fechaVencimiento', label: 'Vencimiento', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-2)' }}>{dateFmt(v)}</span> },
    { key: 'fechaPago', label: 'Pago', render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--green-700)' }}>{dateFmt(v)}</span> : '-' },
    { key: 'createdAt', label: 'Creacion', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{dateFmt(v)}</span> },
    { key: 'usuario', label: 'Creada por', render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '-'}</span> },
    { key: 'bodega', label: 'Bodega', render: v => v ? <Badge tone="blue">{v}</Badge> : '-' },
    { key: 'total', label: 'Total', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmt(v)}</span> },
    { key: 'estado', label: 'Estado', render: v => <Badge tone={ESTADO_TONE[v] || 'gray'}>{v}</Badge> },
    { key: 'nc', label: 'NC', render: (v, row) => v ? <Badge tone="amber">{row.ncNumero || fmt(row.ncMonto) || 'Si'}</Badge> : '-' },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <Btn variant="secondary" size="xs" icon="eye" onClick={e => { e.stopPropagation(); navigate('/pagos-proveedores/' + row.id) }}>Ver</Btn>
        {canWriteProveedores && row.estado !== 'Pagado' && row.estado !== 'Anulado' && (
          <Btn
            variant="primary"
            size="xs"
            icon="check"
            onClick={e => {
              e.stopPropagation()
              if (!confirm(`Marcar pago ${row.nDoc || row.id} como pagado hoy?`)) return
              updateMut.mutate({ id: row.id, data: { estado: 'Pagado', fechaPago: new Date().toISOString().slice(0, 10) } }, {
                onError: err => alert(err.response?.data?.error || 'Error'),
              })
            }}
            disabled={updateMut.isPending}
          >Pagar</Btn>
        )}
      </div>
    ) },
  ]

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Pagos a Proveedores"
        subtitle={`${total.toLocaleString('es-CL')} pagos registrados`}
        breadcrumb={['Inicio', 'Proveedores', 'Pagos']}
        actions={
          <>
            <Btn variant="secondary" icon="download" size="sm" onClick={handleExport} disabled={!items.length}>Exportar CSV</Btn>
            <Btn variant="secondary" icon="download" size="sm" onClick={handleExportDetalle} disabled={!items.length}>CSV detalle</Btn>
            {canWriteProveedores && <Btn variant="secondary" icon="plus" size="sm" onClick={() => setShowCreate(true)}>Nueva boleta/factura</Btn>}
            {canWriteProveedores && <Btn variant="primary" icon="plus" size="sm" onClick={() => navigate('/stock-ingresos')}>Nuevo doc bodega</Btn>}
          </>
        }
      />
      <div className="kpi-strip">
        <KpiCard label="Total pagos" value={total.toLocaleString('es-CL')} icon="creditCard" sublabel="Filtrado" />
        <KpiCard label="Pendientes" value={stats.Pendiente || 0} icon="clock" tone="amber" sublabel={fmt(stats.montoPendiente)} />
        <KpiCard label="Vencidos" value={stats.Vencido || 0} icon="alertTriangle" tone="red" sublabel={fmt(stats.montoVencido)} />
        <KpiCard label="Monto total" value={fmt(stats.montoTotal)} icon="dollarSign" tone="blue" sublabel="Suma filtrada" />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '-6px 0 16px' }}>
        <Btn variant="secondary" size="sm" icon="alertTriangle" onClick={() => { setDocumento('Factura'); setTab('Pendiente'); setPage(1) }}>
          Facturas no pagadas ({stats.facturasNoPagadas || 0})
        </Btn>
        <Btn variant="secondary" size="sm" icon="alertTriangle" onClick={() => { setDocumento('Boleta'); setTab('Pendiente'); setPage(1) }}>
          Boletas no pagadas ({stats.boletasNoPagadas || 0})
        </Btn>
      </div>

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1); setSearch('') }} />
          <SearchBar placeholder="Buscar N doc, proveedor, codigo" value={search} onChange={setSearch} style={{ width: 300, marginBottom: 10 }} />
        </div>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Fecha doc:</span>
          <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1) }} style={{ padding: '5px 8px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>-</span>
          <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1) }} style={{ padding: '5px 8px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)' }} />
          <select value={documento} onChange={e => { setDocumento(e.target.value); setPage(1) }} style={{ padding: '5px 8px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)' }}>
            <option value="">Documento</option>
            <option value="Factura">Factura</option>
            <option value="Boleta">Boleta</option>
            <option value="Nota">Nota</option>
          </select>
          <input value={bodega} onChange={e => { setBodega(e.target.value); setPage(1) }} placeholder="Bodega" style={{ padding: '5px 8px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)' }} />
          <input value={proveedor} onChange={e => { setProveedor(e.target.value); setPage(1) }} placeholder="Proveedor/RUT" style={{ padding: '5px 8px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)' }} />
          {(desde || hasta || debouncedSearch || tab !== 'all' || documento || bodega || proveedor) && (
            <button onClick={clearFilters} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)' }}>Limpiar</button>
          )}
        </div>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>Anterior</button>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: page >= pages ? 'not-allowed' : 'pointer' }}>Siguiente</button>
        </div>
        {!!providerTotals.length && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>Total proveedor:</span>
            {providerTotals.slice(0, 6).map(p => (
              <Badge key={p.nombre} tone="gray">{p.nombre}: {fmt(p.total)}</Badge>
            ))}
          </div>
        )}
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
          : <Table columns={cols} rows={items} onRowClick={row => navigate('/pagos-proveedores/' + row.id)} emptyMessage="Sin pagos" />
        }
      </div>
      {showCreate && (
        <FormPanel title="Nueva boleta o factura proveedor" subtitle="Registro simple sin ingreso de stock" width={720} onClose={() => setShowCreate(false)} onSave={saveSimpleDoc} saving={createMut.isPending}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <FormField label="Documento" required><Select value={form.documento} onChange={v => setForm(f => ({ ...f, documento: v }))} options={DOCUMENTOS} /></FormField>
            <FormField label="N Doc" required><Input value={form.nDoc} onChange={v => setForm(f => ({ ...f, nDoc: v }))} /></FormField>
            <FormField label="Buscar proveedor"><Input value={proveedorSearch} onChange={setProveedorSearch} placeholder="Nombre, RUT o codigo" /></FormField>
            <FormField label="Proveedor" required>
              <Select value={form.proveedorId} onChange={v => setForm(f => ({ ...f, proveedorId: v }))} options={[{ value: '', label: 'Seleccionar' }, ...(proveedores.items || []).map(p => ({ value: String(p.id), label: `${p.nombre} ${p.rut ? `(${p.rut})` : ''}` }))]} />
            </FormField>
            <FormField label="Total" required><Input type="number" prefix="$" value={form.total} onChange={v => setForm(f => ({ ...f, total: v }))} /></FormField>
            <FormField label="Estado" required><Select value={form.estado} onChange={v => setForm(f => ({ ...f, estado: v }))} options={ESTADOS} /></FormField>
            <FormField label="Fecha documento" required><Input type="date" value={form.fechaDoc} onChange={v => setForm(f => ({ ...f, fechaDoc: v }))} /></FormField>
            <FormField label="Fecha vencimiento"><Input type="date" value={form.fechaVencimiento} onChange={v => setForm(f => ({ ...f, fechaVencimiento: v }))} /></FormField>
            <FormField label="Fecha pago"><Input type="date" value={form.fechaPago} onChange={v => setForm(f => ({ ...f, fechaPago: v }))} /></FormField>
          </div>
          <FormField label="Observaciones"><Textarea value={form.obs} onChange={v => setForm(f => ({ ...f, obs: v }))} rows={3} /></FormField>
        </FormPanel>
      )}
    </main>
  )
}
