import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Btn, KpiCard, PageHeader, SearchBar, Table } from '../../components/shared'
import { useHistoricoCorte, useHistoricoOrdenes } from '../../api/admin'

const fmtDate = value => value ? new Date(value).toLocaleDateString('es-CL') : '-'
const fmtDateTime = value => value ? new Date(value).toLocaleString('es-CL') : '-'

export default function HistoricoPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [rut, setRut] = useState('')
  const [nInterno, setNInterno] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [page, setPage] = useState(1)

  const params = { page: String(page) }
  if (search) params.search = search
  if (rut) params.rut = rut
  if (nInterno) params.nInterno = nInterno
  if (desde) params.desde = desde
  if (hasta) params.hasta = hasta

  const { data: resumen, isLoading: loadingResumen } = useHistoricoCorte()
  const { data = { items: [], total: 0, limit: 100 }, isLoading } = useHistoricoOrdenes(params)
  const corte = resumen?.corte
  const total = data.total ?? 0
  const limit = data.limit ?? 100
  const pages = Math.max(1, Math.ceil(total / limit))

  function limpiar() {
    setSearch('')
    setRut('')
    setNInterno('')
    setDesde('')
    setHasta('')
    setPage(1)
  }

  const cols = [
    { key: 'createdAt', label: 'Fecha', render: v => <span style={mono}>{fmtDate(v)}</span> },
    { key: 'nInterno', label: 'N interno', render: v => <span style={monoStrong}>{v || '-'}</span> },
    { key: 'tipo', label: 'Tipo', render: v => <Badge tone="gray">{v || '-'}</Badge> },
    { key: 'rutCliente', label: 'RUT', render: v => <span style={mono}>{v || '-'}</span> },
    { key: 'creadorNombre', label: 'Vendedor', render: v => v || '-' },
    { key: 'estadoPago', label: 'Pago', render: v => <Badge tone={v === 'Pagada' ? 'green' : v === 'Parcial' ? 'amber' : 'red'}>{v || '-'}</Badge> },
    { key: 'estadoEntrega', label: 'Entrega', render: v => <Badge tone={v === 'Entregada' ? 'green' : 'gray'}>{v || '-'}</Badge> },
    { key: '_count', label: 'Vinculos', render: v => (
      <span style={{ ...mono, fontSize: 11 }}>
        items {v?.items ?? 0} - caja {v?.movimientosCaja ?? 0} - guias {v?.guiasDespacho ?? 0}
      </span>
    ) },
    { key: 'id', label: 'Accion', render: v => <Btn size="xs" variant="secondary" onClick={() => navigate(`/ventas/${v}`)}>Ver</Btn> },
  ]

  return (
    <main className="page page-wide">
      <PageHeader
        title="Corte e Historico"
        subtitle={corte ? `Primer n interno valido: ${corte.nInterno} - ${fmtDateTime(corte.createdAt)}` : 'Sin primer n interno valido detectado'}
        breadcrumb={['Inicio', 'Admin', 'Historico']}
      />

      <div className="kpi-strip">
        <KpiCard label="Ordenes operacionales" value={loadingResumen ? '...' : resumen?.operacionalOrdenes ?? 0} icon="checkCircle" tone="neutral" />
        <KpiCard label="Ordenes historicas" value={loadingResumen ? '...' : resumen?.historicoOrdenes ?? 0} icon="history" tone="blue" />
        <KpiCard label="Sin n interno" value={loadingResumen ? '...' : resumen?.anomalasSinInterno ?? 0} icon="alertTriangle" tone={(resumen?.anomalasSinInterno ?? 0) > 0 ? 'amber' : 'neutral'} />
        <KpiCard label="Previas con n interno" value={loadingResumen ? '...' : resumen?.previasConInterno ?? 0} icon="info" tone={(resumen?.previasConInterno ?? 0) > 0 ? 'amber' : 'neutral'} />
      </div>

      <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {total.toLocaleString('es-CL')} registros historicos por regla: primer n interno valido por fecha de creacion.
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={pagerBtn(page <= 1)}>Anterior</button>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={pagerBtn(page >= pages)}>Siguiente</button>
          </div>
        </div>
        <Table
          columns={cols}
          rows={isLoading ? [] : data.items}
          emptyMessage="Sin registros historicos para este filtro"
          keyboard
          ariaLabel="Registros historicos"
          getRowKey={row => row.id}
          toolbarExtra={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>Desde</span>
                <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1) }} style={{ ...inputFilter, height: 28, width: 130 }} />
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>Hasta</span>
                <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1) }} style={{ ...inputFilter, height: 28, width: 130 }} />
              </div>
              <input value={rut} onChange={e => { setRut(e.target.value); setPage(1) }} placeholder="RUT" style={{ ...inputFilter, height: 28, width: 120 }} />
              <input type="number" value={nInterno} onChange={e => { setNInterno(e.target.value); setPage(1) }} placeholder="N interno" style={{ ...inputFilter, height: 28, width: 100 }} />
              <SearchBar placeholder="Buscar historico" value={search} onChange={v => { setSearch(v); setPage(1) }} style={{ width: 220, height: 28 }} />
              <Btn variant="secondary" size="sm" onClick={limpiar}>Limpiar</Btn>
            </div>
          }
        />
      </section>
    </main>
  )
}

const mono = { fontFamily: "'DM Mono', monospace" }
const monoStrong = { ...mono, fontWeight: 600 }
const inputFilter = { boxSizing: 'border-box', padding: '0 9px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff' }
const pagerBtn = disabled => ({
  padding: '5px 10px',
  fontSize: 12,
  borderRadius: 5,
  border: '1px solid var(--border)',
  background: '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
})
