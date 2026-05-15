import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table } from '../../components/shared'
import { ViewClientePanel } from '../../components/forms/FormCliente'
import { useClientes } from '../../api/clientes'
import { downloadFromBackend } from '../../utils/csv'

export default function ClientesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState('all')
  const [region, setRegion] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [segmento, setSegmento] = useState('')
  const [conDeuda, setConDeuda] = useState(false)
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const params = {}
  if (debouncedSearch) params.search = debouncedSearch
  if (tipoFilter !== 'all') params.tipo = tipoFilter
  if (region) params.region = region
  if (ciudad) params.ciudad = ciudad
  if (segmento) params.segmento = segmento
  if (conDeuda) params.conDeuda = 'true'
  const { data: result = { items: [], total: 0, limit: 500 }, isLoading } = useClientes(params)

  if (isLoading && !result.items?.length) return <main style={{ padding: 24 }}><p>Cargando...</p></main>

  const clientes = result.items ?? []
  const totalClientes = result.total ?? clientes.length
  const LIMIT = result.limit ?? 500

  const shown = clientes

  const tipos = ['Empresa', 'Institucional', 'Municipal', 'Gobierno', 'Distribuidor']
  const fmt = n => '$' + Number(n).toLocaleString('es-CL')

  const cols = [
    { key: 'rut', label: 'RUT', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v}</span> },
    { key: 'nombre', label: 'Cliente', wrap: true, render: v => <span style={{ fontWeight: 500, fontSize: 13 }}>{v}</span> },
    { key: 'ciudad', label: 'Ciudad' },
    { key: 'tipo', label: 'Tipo', render: v => {
      const tone = { Institucional: 'blue', Municipal: 'neutral', Gobierno: 'neutral', Distribuidor: 'amber', Empresa: 'gray' }[v] || 'gray'
      return <Badge tone={tone}>{v}</Badge>
    }},
    { key: 'limiteCredito', label: 'Límite crédito', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v != null ? fmt(v) : '—'}</span> },
    { key: 'saldo', label: 'Saldo deuda', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: v > 0 ? 700 : 400, color: v > 0 ? 'var(--red)' : 'var(--text-3)', fontSize: 12 }}>{v > 0 ? fmt(v) : '—'}</span> },
    { key: 'email', label: 'Email', render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v}</span> },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={e => { e.stopPropagation(); setSelected(row) }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}>Ver</button>
        <button onClick={e => { e.stopPropagation(); navigate('/clientes/' + row.id + '/editar') }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)', fontWeight: 500 }}>Editar</button>
      </div>
    )},
  ]

  const deudaTotal = clientes.reduce((s, c) => s + (c.saldo || 0), 0)

  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      <PageHeader title="Clientes" subtitle={`${shown.length} de ${totalClientes.toLocaleString('es-CL')} clientes`} breadcrumb={['Inicio', 'Clientes']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm"
            onClick={() => downloadFromBackend('/reportes/export/clientes', `clientes_${new Date().toISOString().slice(0, 10)}.csv`)}
          >Exportar CSV</Btn>
          <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/clientes/nuevo')}>Nuevo Cliente</Btn>
        </>}
      />
      <div className="kpi-strip">
        <KpiCard label="Total clientes" value={totalClientes.toLocaleString('es-CL')} icon="users" sublabel="Registrados en el sistema" />
        <KpiCard label="Con deuda activa" value={clientes.filter(c => c.saldo > 0).length} icon="dollarSign" tone="red" sublabel="Saldo pendiente" />
        <KpiCard label="Deuda total" value={'$' + (deudaTotal / 1_000_000).toFixed(1) + 'M'} icon="barChart2" tone="amber" sublabel="Suma de saldos" />
        <KpiCard label="Institucional / Gob." value={clientes.filter(c => ['Institucional', 'Gobierno', 'Municipal'].includes(c.tipo)).length} icon="clipboard" sublabel="Clientes públicos" />
      </div>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['all', ...tipos].map(t => (
                <button key={t} onClick={() => setTipoFilter(t)} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  background: tipoFilter === t ? 'var(--green-900)' : '#fff',
                  color: tipoFilter === t ? '#fff' : 'var(--text-2)',
                  border: `1px solid ${tipoFilter === t ? 'var(--green-900)' : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}>{t === 'all' ? 'Todos' : t}</button>
              ))}
            </div>
            <SearchBar placeholder="Buscar por nombre, RUT o ciudad…" value={search} onChange={setSearch} style={{ width: 280 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={region} onChange={e => setRegion(e.target.value)} placeholder="Región" style={miniInput} />
            <input value={ciudad} onChange={e => setCiudad(e.target.value)} placeholder="Ciudad" style={miniInput} />
            <select value={segmento} onChange={e => setSegmento(e.target.value)} style={{ ...miniInput, cursor: 'pointer' }}>
              <option value="">Segmento</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={conDeuda} onChange={e => setConDeuda(e.target.checked)} />
              Solo con deuda
            </label>
            {(region || ciudad || segmento || conDeuda) && (
              <button onClick={() => { setRegion(''); setCiudad(''); setSegmento(''); setConDeuda(false) }} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)' }}>Limpiar</button>
            )}
          </div>
        </div>
        <Table columns={cols} rows={shown} />
      </div>
      {selected && <ViewClientePanel cliente={selected} onClose={() => setSelected(null)} onEdit={() => { navigate('/clientes/' + selected.id + '/editar'); setSelected(null) }} />}
    </main>
  )
}

const miniInput = { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', width: 130 }
