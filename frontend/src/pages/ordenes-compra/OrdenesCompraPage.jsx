import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast, confirmDialog } from '../../store/notif'
import { Badge, KpiCard, PageHeader, SearchBar, Table } from '../../components/shared'
import { useOrdenesCompra, useUpdateOrdenCompra, ordenesCompraExportUrl } from '../../api/ordenesCompra'
import { downloadFromBackend } from '../../utils/csv'
import BotonExportar from '../../components/BotonExportar'

const ESTADO_TONE = {
  'Procesada':  'green', 'Pendiente':  'amber', 'Entregada': 'green',
  'Anulada':    'red',   'En proceso': 'blue',
}

const fmt = n => '$' + (n || 0).toLocaleString('es-CL')

export default function OrdenesCompraPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState(searchParams.get('estado') || '')
  const [canal, setCanal] = useState(searchParams.get('canal') || '')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const params = { page: String(page) }
  if (debouncedSearch) params.search = debouncedSearch
  if (estado) params.estado = estado
  if (canal) params.canal = canal

  const { data: result = { items: [], total: 0, limit: 100 }, isLoading } = useOrdenesCompra(params)
  const updateMut = useUpdateOrdenCompra()
  const items = result.items ?? []
  const total = result.total ?? 0
  const limit = result.limit ?? 100
  const pages = Math.max(1, Math.ceil(total / limit))

  const cols = [
    { key: 'nCompra', label: 'N° Compra',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--green-700)' }}>{v}</span> },
    { key: 'fechaHora', label: 'Fecha',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{v ? new Date(v).toLocaleString('es-CL') : '—'}</span> },
    { key: 'emailComprador', label: 'Email comprador', wrap: true,
      render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'total', label: 'Total', align: 'right',
      render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmt(v)}</span> },
    { key: 'canal', label: 'Canal',
      render: v => v ? <Badge tone="neutral">{v}</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'tipoDocumento', label: 'Doc',
      render: v => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
    { key: 'codigoVendedor', label: 'Vendedor',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{v}</span> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'estadoCompra', label: 'Estado',
      render: v => v ? <Badge tone={ESTADO_TONE[v] || 'gray'}>{v}</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: '_acc', label: '',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={e => { e.stopPropagation(); navigate('/ordenes-compra/' + row.id) }}
            style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}
          >Ver</button>
          {row.estadoCompra !== 'Recepcionada' && row.estadoCompra !== 'Anulada' && (
            <button
              onClick={async e => {
                e.stopPropagation()
                if (!(await confirmDialog({ title: 'Confirmar Recepción', detail: `¿Marcar OC ${row.nCompra || row.id} como recepcionada?` }))) return
                updateMut.mutate({ id: row.id, data: { estadoCompra: 'Recepcionada' } }, {
                  onError: err => toast.error(err.response?.data?.error || 'Error'),
                })
              }}
              disabled={updateMut.isPending}
              style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--green-700)', background: 'var(--green-700)', cursor: 'pointer', color: '#fff', fontWeight: 500 }}
              title="Marcar recepcionada"
            >Recepcionar</button>
          )}
        </div>
      ) },
  ]

  const montoTotal = items.reduce((s, i) => s + (i.total || 0), 0)

  const toolbarExtra = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <SearchBar placeholder="Buscar N compra, email..." value={search} onChange={setSearch} style={{ width: 300 }} />
      <select value={estado} onChange={e => { setEstado(e.target.value); setPage(1) }} style={filterSelect}>
        <option value="">Todos los estados</option>
        {['Pendiente', 'En proceso', 'Recepcionada', 'Procesada', 'Despachada', 'Entregada', 'Pagada', 'Cancelada', 'Anulada'].map(e => <option key={e} value={e}>{e}</option>)}
      </select>
      <select value={canal} onChange={e => { setCanal(e.target.value); setPage(1) }} style={filterSelect}>
        <option value="">Todos los canales</option>
        {['Web', 'Convenio Marco', 'Venta Sala', 'Telefónica'].map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  )

  return (
    <main className="page page-wide">
      <PageHeader
        title="Órdenes de Compra Online"
        subtitle={`${total.toLocaleString('es-CL')} órdenes desde el sitio web`}
        breadcrumb={['Inicio', 'Ventas', 'OC Online']}
        actions={<BotonExportar
          onExportar={archivo => downloadFromBackend(ordenesCompraExportUrl(), `ordenes_compra_online_${new Date().toISOString().slice(0, 10)}.${archivo}`, { ...params, archivo })}
        />}
      />
      <div className="kpi-strip">
        <KpiCard label="Total OC" value={total.toLocaleString('es-CL')} icon="shoppingCart" sublabel="Histórico" />
        <KpiCard label="En página" value={items.length} icon="list" sublabel={`Página ${page} de ${pages}`} />
        <KpiCard label="Monto página" value={fmt(montoTotal)} icon="dollarSign" tone="blue" sublabel="Suma página actual" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table
              columns={cols}
              rows={items}
              onRowClick={row => navigate('/ordenes-compra/' + row.id)}
              emptyMessage="Sin órdenes"
              ariaLabel="Ordenes de compra"
              getRowKey={row => row.id}
              toolbarExtra={toolbarExtra}
              pager={{ page, pages, total, limit, shown: items.length, onChange: setPage, disabled: isLoading }}
            />
        }
      </div>
    </main>
  )
}

const filterSelect = {
  padding: '5px 8px',
  fontSize: 12,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: '#fff',
  color: 'var(--text-1)',
}
