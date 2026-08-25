import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast, confirmDialog } from '../../store/notif'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table } from '../../components/shared'
import { ViewClientePanel } from '../../components/forms/FormCliente'
import { useClienteActivo, useClientes } from '../../api/clientes'
import { downloadFromBackend } from '../../utils/csv'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'

export default function ClientesPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canReadVentas = can(user, 'ventas')
  const canWriteClientes = can(user, 'clientes', 'write')
  const canDeleteClientes = can(user, 'clientes', 'delete')
  const [searchParams] = useSearchParams()
  const initialSearch = searchParams.get('search') || ''
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [pageState, setPageState] = useState({ key: '', page: 1 })
  const [tipoFilter, setTipoFilter] = useState('all')
  const [region, setRegion] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [email, setEmail] = useState('')
  const [segmento, setSegmento] = useState('')
  const [conDeuda, setConDeuda] = useState(false)
  const [estadoCliente, setEstadoCliente] = useState('activos')
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)
  const clienteActivo = useClienteActivo()

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const filterParams = {}
  if (debouncedSearch) filterParams.search = debouncedSearch
  if (tipoFilter !== 'all') filterParams.tipo = tipoFilter
  if (region) filterParams.region = region
  if (ciudad) filterParams.ciudad = ciudad
  if (email) filterParams.email = email
  if (segmento) filterParams.segmento = segmento
  if (conDeuda) filterParams.conDeuda = 'true'
  if (estadoCliente === 'inactivos') filterParams.estado = 'inactivo'
  if (estadoCliente === 'todos') filterParams.estado = 'todos'
  const filterKey = JSON.stringify(filterParams)
  const page = pageState.key === filterKey ? pageState.page : 1
  const setPagerPage = nextPage => setPageState({ key: filterKey, page: nextPage })
  const params = { ...filterParams, page: String(page) }
  const { data: result = { items: [], total: 0, limit: 500 }, isLoading } = useClientes(params)

  const clientes = result.items ?? []
  const totalClientes = result.total ?? clientes.length
  const limit = result.limit ?? 500
  const pages = result.pages ?? Math.max(1, Math.ceil(totalClientes / limit))
  const shown = clientes

  if (isLoading && !result.items?.length) return <main className="page page-wide"><p>Cargando...</p></main>

  const tipos = ['Empresa', 'Institucional', 'Municipal', 'Gobierno', 'Distribuidor']
  const fmt = n => '$' + Number(n).toLocaleString('es-CL')
  const getErrorMessage = err => err?.response?.data?.error || err?.message || 'No se pudo completar la accion'

  async function handleClienteActivo(cliente, activo) {
    const accion = activo ? 'reactivar' : 'dar de baja'
    const detalle = activo
      ? 'El cliente volvera a estar disponible para nuevas operaciones.'
      : 'El cliente dejara de aparecer en busquedas operativas. Su historial se conserva.'
    if (!(await confirmDialog({ title: `¿Confirmas ${accion}?`, detail: `¿Confirmas ${accion} al cliente "${cliente.nombre}"?\n\n${detalle}`, tone: activo ? 'primary' : 'danger' }))) return
    const razon = activo ? undefined : 'Baja operativa desde listado de clientes'
    clienteActivo.mutate(
      { id: cliente.id, activo, razon },
      {
        onSuccess: updated => {
          if (selected?.id === cliente.id) setSelected(updated)
        },
        onError: err => toast.error(getErrorMessage(err)),
      }
    )
  }

  const cols = [
    { key: 'rut', label: 'RUT', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v}</span> },
    { key: 'nombre', label: 'Cliente', wrap: true, render: v => <span style={{ fontWeight: 500, fontSize: 13 }}>{v}</span> },
    { key: 'email', label: 'Email', render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span> },
    { key: 'telefono', label: 'Fono', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span> },
    { key: 'direccion', label: 'Direccion', wrap: true, render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span> },
    { key: 'region', label: 'Region' },
    { key: 'comuna', label: 'Comuna' },
    { key: 'ciudad', label: 'Ciudad' },
    { key: 'pais', label: 'País', render: v => v || 'Chile' },
    { key: 'tipo', label: 'Tipo', render: v => {
      const tone = { Institucional: 'blue', Municipal: 'neutral', Gobierno: 'neutral', Distribuidor: 'amber', Empresa: 'gray' }[v] || 'gray'
      return <Badge tone={tone}>{v}</Badge>
    }},
    { key: 'activo', label: 'Estado', render: v => <Badge tone={v === false ? 'red' : 'green'}>{v === false ? 'Inactivo' : 'Activo'}</Badge> },
    { key: 'limiteCredito', label: 'Límite crédito', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v != null ? fmt(v) : '—'}</span> },
    { key: 'saldo', label: 'Saldo deuda', align: 'right', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: v > 0 ? 700 : 400, color: v > 0 ? 'var(--red)' : 'var(--text-3)', fontSize: 12 }}>{v > 0 ? fmt(v) : '—'}</span> },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={e => { e.stopPropagation(); setSelected(row) }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}>Ver</button>
        {canReadVentas && <button onClick={e => { e.stopPropagation(); navigate('/matriz-ventas?rut=' + encodeURIComponent(row.rut || '')) }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--blue, #2563eb)', fontWeight: 500 }} title="Ver ventas históricas">Ventas</button>}
        {canWriteClientes && <button onClick={e => { e.stopPropagation(); navigate('/clientes/' + row.id + '/editar') }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)', fontWeight: 500 }}>Editar</button>}
        {canDeleteClientes && <button
          disabled={clienteActivo.isPending}
          onClick={e => { e.stopPropagation(); handleClienteActivo(row, row.activo === false) }}
          style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: clienteActivo.isPending ? 'not-allowed' : 'pointer', color: row.activo === false ? 'var(--green-700)' : 'var(--red)', fontWeight: 500, opacity: clienteActivo.isPending ? 0.55 : 1 }}
        >
          {row.activo === false ? 'Reactivar' : 'Baja'}
        </button>}
      </div>
    )},
  ]

  const deudaTotal = clientes.reduce((s, c) => s + (c.saldo || 0), 0)

  const toolbarExtra = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
        <SearchBar placeholder="Buscar por nombre, RUT, email o ubicacion..." value={search} onChange={setSearch} style={{ width: 320 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={region} onChange={e => setRegion(e.target.value)} placeholder="Región" style={miniInput} />
        <input value={ciudad} onChange={e => setCiudad(e.target.value)} placeholder="Ciudad" style={miniInput} />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={{ ...miniInput, width: 180 }} />
        <select value={segmento} onChange={e => setSegmento(e.target.value)} style={{ ...miniInput, cursor: 'pointer' }}>
          <option value="">Segmento</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
        <select value={estadoCliente} onChange={e => setEstadoCliente(e.target.value)} style={{ ...miniInput, cursor: 'pointer' }}>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
          <option value="todos">Todos</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={conDeuda} onChange={e => setConDeuda(e.target.checked)} />
          Solo con deuda
        </label>
        {(region || ciudad || email || segmento || conDeuda || estadoCliente !== 'activos') && (
          <button onClick={() => { setRegion(''); setCiudad(''); setEmail(''); setSegmento(''); setConDeuda(false); setEstadoCliente('activos') }} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)' }}>Limpiar</button>
        )}
      </div>
    </div>
  )

  return (
    <main className="page page-wide">
      <PageHeader title="Clientes" subtitle={`${shown.length} de ${totalClientes.toLocaleString('es-CL')} clientes`} breadcrumb={['Inicio', 'Clientes']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm"
            onClick={() => downloadFromBackend('/reportes/export/clientes', `clientes_${new Date().toISOString().slice(0, 10)}.csv`, filterParams)}
          >Exportar CSV</Btn>
          {canWriteClientes && <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/clientes/nuevo')}>Nuevo Cliente</Btn>}
        </>}
      />
      <div className="kpi-strip">
        <KpiCard label="Total clientes" value={totalClientes.toLocaleString('es-CL')} icon="users" sublabel="Registrados en el sistema" />
        <KpiCard label="Con deuda activa" value={clientes.filter(c => c.saldo > 0).length} icon="dollarSign" tone="red" sublabel="Saldo pendiente" />
        <KpiCard label="Deuda total" value={'$' + (deudaTotal / 1_000_000).toFixed(1) + 'M'} icon="barChart2" tone="amber" sublabel="Suma de saldos" />
        <KpiCard label="Institucional / Gob." value={clientes.filter(c => ['Institucional', 'Gobierno', 'Municipal'].includes(c.tipo)).length} icon="clipboard" sublabel="Clientes públicos" />
      </div>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <Table
          columns={cols}
          rows={shown}
          emptyMessage="Sin clientes"
          keyboard
          onRowDoubleClick={row => setSelected(row)}
          ariaLabel="Clientes"
          getRowKey={row => row.id}
          toolbarExtra={toolbarExtra}
          pager={{ page, pages, total: totalClientes, limit, shown: shown.length, onChange: setPagerPage, disabled: isLoading }}
        />
      </div>
      {selected && <ViewClientePanel cliente={selected} canWrite={canWriteClientes} onClose={() => setSelected(null)} onEdit={() => { navigate('/clientes/' + selected.id + '/editar'); setSelected(null) }} />}
    </main>
  )
}

const miniInput = { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', width: 130 }
