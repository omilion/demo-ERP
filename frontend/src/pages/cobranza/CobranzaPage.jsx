import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Tabs } from '../../components/shared'
import { useVentas } from '../../api/ventas'

const TABS = [
  { id: 'all',       label: 'Todas' },
  { id: 'No pagada', label: 'No Pagadas' },
  { id: 'Parcial',   label: 'Parciales' },
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

export default function CobranzaPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const params = {}
  if (tab !== 'all') params.estadoPago = tab
  if (debouncedSearch) params.search = debouncedSearch

  const { data: result = { items: [], total: 0 }, isLoading } = useVentas(params)
  const ventas = result.items ?? []
  const total = result.total ?? 0

  const fmt = n => '$' + Math.abs(n || 0).toLocaleString('es-CL')

  const montoPendiente = ventas.reduce((s, v) => s + Math.max(0, (v.total || 0) - (v.abono || 0)), 0)
  const masde30 = ventas.filter(v => diasDesde(v.createdAt) > 30).length
  const conAbono = ventas.filter(v => (v.abono || 0) > 0).length

  const cols = [
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
      key: 'estadoPago', label: 'Estado Pago',
      render: v => {
        const tone = v === 'No pagada' ? 'red' : v === 'Parcial' ? 'amber' : 'green'
        return <Badge tone={tone}>{v}</Badge>
      }
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
      render: (_, row) => (
        <button
          onClick={e => { e.stopPropagation(); navigate('/ventas/' + row.id + '/editar') }}
          style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500, whiteSpace: 'nowrap' }}
        >
          Gestionar
        </button>
      )
    },
  ]

  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Cobranza"
        subtitle={`${total.toLocaleString('es-CL')} documentos por cobrar`}
        breadcrumb={['Inicio', 'Caja', 'Cobranza']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm">Exportar</Btn>
          <Btn variant="primary" icon="send" size="sm">Enviar Recordatorios</Btn>
        </>}
      />

      <div className="kpi-strip">
        <KpiCard
          label="Saldo total pendiente"
          value={'$' + (montoPendiente / 1_000_000).toFixed(1) + 'M'}
          icon="dollarSign" tone="red"
          sublabel="Suma de saldos sin cobrar"
        />
        <KpiCard
          label="Documentos"
          value={total.toLocaleString('es-CL')}
          icon="fileText"
          sublabel="Ventas no pagadas o parciales"
        />
        <KpiCard
          label="Más de 30 días"
          value={masde30}
          icon="alertTriangle" tone="amber"
          sublabel="Gestión urgente requerida"
        />
        <KpiCard
          label="Con abono parcial"
          value={conAbono}
          icon="check"
          sublabel="Pago parcial recibido"
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setSearch('') }} />
          <SearchBar placeholder="Buscar cliente, N° venta…" value={search} onChange={setSearch} style={{ width: 260, marginBottom: 10 }} />
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={ventas} onRowClick={row => navigate('/ventas/' + row.id + '/editar')} emptyMessage="Sin documentos pendientes de cobro" />
        }
      </div>
    </main>
  )
}
