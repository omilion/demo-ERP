import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast, confirmDialog } from '../../store/notif'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table } from '../../components/shared'
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
  const [segmento, setSegmento] = useState('')
  const [conDeuda, setConDeuda] = useState(false)
  const [estadoCliente, setEstadoCliente] = useState('activos')
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
  if (segmento) filterParams.segmento = segmento
  if (conDeuda) filterParams.conDeuda = 'true'
  if (estadoCliente === 'inactivos') filterParams.estado = 'inactivo'
  if (estadoCliente === 'todos') filterParams.estado = 'todos'

  const filterKey = JSON.stringify(filterParams)
  const page = pageState.key === filterKey ? pageState.page : 1
  const setPagerPage = nextPage => setPageState({ key: filterKey, page: nextPage })
  const params = { ...filterParams, page: String(page) }
  const { data: result = { items: [], total: 0, limit: 500, stats: null }, isLoading } = useClientes(params)

  const clientes = result.items ?? []
  const totalClientes = result.total ?? clientes.length
  const limit = result.limit ?? 500
  const pages = result.pages ?? Math.max(1, Math.ceil(totalClientes / limit))
  const shown = clientes

  if (isLoading && !result.items?.length) return <main className="page page-wide"><p>Cargando...</p></main>

  const tipos = ['Empresa', 'Institucional', 'Municipal', 'Gobierno', 'Distribuidor']
  const fmt = n => '$' + Number(n).toLocaleString('es-CL')
  const getErrorMessage = err => err?.response?.data?.error || err?.message || 'No se pudo completar la accion'

  const totalDeudores = result.stats?.totalDeudores ?? clientes.filter(c => c.saldo > 0).length
  const totalDeudaGlobal = result.stats?.totalDeuda ?? clientes.reduce((s, c) => s + (c.saldo || 0), 0)

  const hasActiveFilters = Boolean(
    search || debouncedSearch || tipoFilter !== 'all' || segmento || conDeuda || estadoCliente !== 'activos'
  )

  function limpiarFiltros() {
    setSearch('')
    setDebouncedSearch('')
    setTipoFilter('all')
    setSegmento('')
    setConDeuda(false)
    setEstadoCliente('activos')
  }

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
        onError: err => toast.error(getErrorMessage(err)),
      }
    )
  }

  const cols = [
    { key: 'rut', label: 'RUT', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v}</span> },
    { key: 'nombre', label: 'Cliente', wrap: true, render: v => <span style={{ fontWeight: 500, fontSize: 13 }}>{v}</span> },
    { key: 'email', label: 'Email', render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span> },
    { key: 'telefono', label: 'Fono', render: v => <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span> },
    { key: 'direccion', label: 'Dirección', wrap: true, render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span> },
    { key: 'region', label: 'Región' },
    { key: 'comuna', label: 'Comuna' },
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
        <button onClick={e => { e.stopPropagation(); navigate(`/clientes/${row.id}`) }} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }}>Ver</button>
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

  const toolbarExtra = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, width: '100%' }}>
      {/* Pills de tipo */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {['all', ...tipos].map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTipoFilter(t)}
            style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              background: tipoFilter === t ? 'var(--green-900)' : '#fff',
              color: tipoFilter === t ? '#fff' : 'var(--text-2)',
              border: `1px solid ${tipoFilter === t ? 'var(--green-900)' : 'var(--border)'}`,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {t === 'all' ? 'Todos los tipos' : t}
          </button>
        ))}
      </div>

      <div style={{ height: 16, width: 1, background: 'var(--border)', margin: '0 2px' }} />

      {/* Selects de segmento y estado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>Segmento:</span>
        <select value={segmento} onChange={e => setSegmento(e.target.value)} style={selectInputStyle}>
          <option value="">Todos los segmentos</option>
          <option value="A">Segmento A</option>
          <option value="B">Segmento B</option>
          <option value="C">Segmento C</option>
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>Estado:</span>
        <select value={estadoCliente} onChange={e => setEstadoCliente(e.target.value)} style={selectInputStyle}>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-2)', cursor: 'pointer', userSelect: 'none' }}>
        <input type="checkbox" checked={conDeuda} onChange={e => setConDeuda(e.target.checked)} style={{ cursor: 'pointer' }} />
        Solo con deuda activa
      </label>

      {/* Buscador General a la derecha antes de paginador/controles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        <SearchBar
          placeholder="Buscar por nombre, RUT, email, comuna..."
          value={search}
          onChange={setSearch}
          style={{ width: 260, height: 30 }}
        />
        {hasActiveFilters && (
          <button
            type="button"
            onClick={limpiarFiltros}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: '1px solid var(--red)',
              background: '#fff',
              color: 'var(--red)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="Restablecer todos los filtros"
          >
            ✕ Limpiar
          </button>
        )}
      </div>
    </div>
  )

  return (
    <main className="page page-wide">
      <PageHeader
        title="Clientes"
        subtitle={`${shown.length} de ${totalClientes.toLocaleString('es-CL')} clientes`}
        breadcrumb={['Inicio', 'Clientes']}
        actions={<>
          <Btn
            variant="secondary"
            icon="download"
            size="sm"
            onClick={() => downloadFromBackend('/reportes/export/clientes', `clientes_${new Date().toISOString().slice(0, 10)}.csv`, filterParams)}
          >
            Exportar CSV
          </Btn>
          {canWriteClientes && (
            <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/clientes/nuevo')}>
              Nuevo Cliente
            </Btn>
          )}
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total clientes" value={totalClientes.toLocaleString('es-CL')} icon="users" sublabel="Registrados en el sistema" />
        <KpiCard
          label="Con deuda activa"
          value={totalDeudores.toLocaleString('es-CL')}
          icon="dollarSign"
          tone="red"
          active={conDeuda}
          onClick={() => setConDeuda(prev => !prev)}
          sublabel={conDeuda ? 'Filtro activo: mostrando deudores' : 'Haz clic para filtrar deudores'}
        />
        <KpiCard
          label="Deuda total"
          value={'$' + (totalDeudaGlobal / 1_000_000).toFixed(1) + 'M'}
          icon="barChart2"
          tone="amber"
          sublabel="Suma de saldos de la base de datos"
        />
        <KpiCard
          label="Institucional / Gob."
          value={clientes.filter(c => ['Institucional', 'Gobierno', 'Municipal'].includes(c.tipo)).length}
          icon="clipboard"
          sublabel="Clientes públicos en la página"
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <Table
          columns={cols}
          rows={shown}
          emptyMessage="Sin clientes"
          keyboard
          onRowDoubleClick={row => navigate(`/clientes/${row.id}`)}
          ariaLabel="Clientes"
          getRowKey={row => row.id}
          toolbarExtra={toolbarExtra}
          pager={{ page, pages, total: totalClientes, limit, shown: shown.length, onChange: setPagerPage, disabled: isLoading }}
        />
      </div>
    </main>
  )
}

const selectInputStyle = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  fontSize: 11,
  fontFamily: 'inherit',
  background: '#fff',
  color: 'var(--text-1)',
  cursor: 'pointer',
}
