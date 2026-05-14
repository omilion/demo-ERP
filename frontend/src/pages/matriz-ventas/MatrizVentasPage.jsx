import { useState } from 'react'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table, Tabs } from '../../components/shared'
import { FormField, Input } from '../../components/forms'
import { useMatrizVentas, useMatrizTotales } from '../../api/matrizVentas'
import { downloadCsv } from '../../utils/csv'

const TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'venta-sala', label: 'Venta sala' },
  { id: 'venta-web', label: 'Venta web' },
  { id: 'convenio-marco', label: 'Convenio marco' },
  { id: 'licitacion', label: 'Licitaciones' },
]

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

export default function MatrizVentasPage() {
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [rut, setRut] = useState('')
  const [oc, setOc] = useState('')
  const [page, setPage] = useState(1)

  const params = { page: String(page) }
  if (tab !== 'all') params.tipo = tab
  if (search) params.search = search
  if (desde) params.desde = desde
  if (hasta) params.hasta = hasta
  if (rut) params.rut = rut
  if (oc) params.oc = oc

  const { data = { items: [], total: 0, totalMonto: 0 }, isLoading } = useMatrizVentas(params)
  const { data: tot } = useMatrizTotales({ desde, hasta })

  const cols = [
    { key: 'fecha', label: 'Fecha',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v ? new Date(v).toLocaleDateString('es-CL') : '—'}</span> },
    { key: 'tipo', label: 'Tipo',
      render: v => <Badge tone="blue">{v}</Badge> },
    { key: 'nInterno', label: 'N° Interno',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{v || '—'}</span> },
    { key: 'ref', label: 'Ref / OC',
      render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'cliente', label: 'Cliente',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{v || '—'}</span> },
    { key: 'estado', label: 'Estado',
      render: v => v ? <Badge tone="neutral">{v}</Badge> : '—' },
    { key: 'total', label: 'Total', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--green-700)' }}>{fmt(v)}</span> },
  ]

  const exportar = () => {
    downloadCsv(`matriz_ventas_${new Date().toISOString().slice(0,10)}`, data.items, [
      { key: 'fecha', label: 'Fecha', fmt: v => v ? new Date(v).toLocaleDateString('es-CL') : '' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'nInterno', label: 'N° Interno' },
      { key: 'ref', label: 'Ref' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'estado', label: 'Estado' },
      { key: 'total', label: 'Total' },
    ])
  }

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Matriz de Ventas"
        subtitle="Vista consolidada de todas las ventas"
        breadcrumb={['Inicio', 'Ventas', 'Matriz']}
        actions={<Btn variant="secondary" size="sm" onClick={exportar}>Exportar CSV</Btn>}
      />
      <div className="kpi-strip">
        <KpiCard label="Ventas sala/marco" value={tot?.ordenes?.count || 0} sublabel={fmt(tot?.ordenes?.total || 0)} icon="package" />
        <KpiCard label="Ventas web" value={tot?.ocOnline?.count || 0} sublabel={fmt(tot?.ocOnline?.total || 0)} icon="cloud" />
        <KpiCard label="Licitaciones" value={tot?.licitaciones?.count || 0} sublabel={fmt(tot?.licitaciones?.total || 0)} icon="briefcase" />
        <KpiCard label="Total período" value={fmt(tot?.gran || 0)} icon="dollarSign" tone="green" sublabel="Suma todos" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          <FormField label="Desde"><Input type="date" value={desde} onChange={setDesde} /></FormField>
          <FormField label="Hasta"><Input type="date" value={hasta} onChange={setHasta} /></FormField>
          <FormField label="RUT cliente"><Input value={rut} onChange={setRut} placeholder="11.111.111-1" /></FormField>
          <FormField label="OC / ID Licitación"><Input value={oc} onChange={setOc} /></FormField>
        </div>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1) }} />
          <SearchBar placeholder="Buscar libre…" value={search} onChange={setSearch} style={{ width: 280 }} />
        </div>
        {isLoading
          ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={data.items} emptyMessage="Sin ventas" />
        }
      </div>
    </main>
  )
}
