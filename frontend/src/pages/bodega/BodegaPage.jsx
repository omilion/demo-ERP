import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, Tabs } from '../../components/shared'
import { PRODUCTOS } from '../../data/productos'
import { getHistorial } from '../../data/precioHistorial'

export default function BodegaPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('inventario')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const byBodega = tab === 'taller' ? PRODUCTOS.filter(p => p.bodega === 'Taller') : PRODUCTOS.filter(p => p.bodega === 'Inventario')
  const displayed = byBodega
    .filter(p => filter === 'all' || (filter === 'critico' && (p.estado === 'Crítico' || p.estado === 'Sin stock')))
    .filter(p => !search || p.nombre.toLowerCase().includes(search.toLowerCase()) || p.cod.toLowerCase().includes(search.toLowerCase()))

  const cols = [
    { key: 'cod', label: 'Código', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v}</span> },
    { key: 'nombre', label: 'Producto', wrap: true },
    { key: 'cat', label: 'Categoría', render: v => <Badge tone="gray">{v}</Badge> },
    { key: 'stock', label: 'Stock', align: 'right', render: (v, row) => (
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: v === 0 ? 'var(--red)' : v < row.minimo ? 'var(--amber)' : 'var(--green-600)' }}>{v}</span>
    )},
    { key: 'minimo', label: 'Mínimo', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-3)', fontSize: 12 }}>{v}</span> },
    { key: 'estado', label: 'Estado', render: v => (
      <Badge tone={v === 'Sin stock' ? 'red' : v === 'Crítico' ? 'amber' : 'green'}>{v}</Badge>
    )},
    { key: 'precio', label: 'Precio', align: 'right', render: (v, row) => {
      const hist = getHistorial(row.cod)
      const recent = hist[0]
      const isRecent = recent && (Date.now() - new Date(recent.fecha).getTime()) < 90 * 24 * 60 * 60 * 1000
      const up = recent && Number(recent.pct) > 0
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600 }}>${v.toLocaleString('es-CL')}</span>
          {isRecent && (
            <span style={{ fontSize: 10, color: up ? 'var(--red)' : 'var(--green-600)', display: 'flex', alignItems: 'center', gap: 2 }}>
              {up ? '↑' : '↓'} {Math.abs(Number(recent.pct))}% · {new Date(recent.fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      )
    }},
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={e => { e.stopPropagation(); navigate('/bodega/' + row.cod + '/editar') }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}>Editar</button>
      </div>
    )},
  ]

  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Bodega"
        subtitle="Control de stock e inventario"
        breadcrumb={['Inicio', 'Bodega']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm">Exportar Excel</Btn>
          <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/bodega/nuevo')}>Ingreso Mercadería</Btn>
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total productos" value={PRODUCTOS.length} icon="package" sublabel="En ambas bodegas" />
        <KpiCard label="Stock Crítico" value={PRODUCTOS.filter(p=>p.estado==='Crítico').length} icon="alertTriangle" tone="amber" sublabel="Bajo mínimo" />
        <KpiCard label="Sin Stock" value={PRODUCTOS.filter(p=>p.estado==='Sin stock').length} icon="x" tone="red" sublabel="Requiere reposición urgente" />
        <KpiCard label="Valor Inventario" value="$18.4M" icon="dollarSign" sublabel="Aprox. valorizado" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
            <Tabs tabs={[
              { id: 'inventario', label: 'Bodega Inventario', count: PRODUCTOS.filter(p=>p.bodega==='Inventario').length },
              { id: 'taller', label: 'Bodega Taller', count: PRODUCTOS.filter(p=>p.bodega==='Taller').length },
            ]} active={tab} onChange={setTab} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', background: '#fff', cursor: 'pointer' }}>
                <option value="all">Todos</option>
                <option value="critico">Solo críticos</option>
              </select>
              <SearchBar placeholder="Buscar código o producto…" value={search} onChange={setSearch} style={{ width: 240 }} />
            </div>
          </div>
        </div>
        <Table columns={cols} rows={displayed} emptyMessage="No hay productos con ese criterio" />
      </div>
    </main>
  )
}
