import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table } from '../../components/shared'
import { useProveedores } from '../../api/proveedores'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import ProveedorFormModal from './ProveedorFormModal'
import BotonExportar from '../../components/BotonExportar'

const fmt = n => n ? `${n}%` : '—'

// ── Main Page ───────────────────────────────────────────────────────────────────
export default function ProveedoresPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const canWriteProveedores = can(user, 'proveedores', 'write')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [creating, setCreating] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    clearTimeout(ref.current)
    ref.current = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(ref.current)
  }, [search])

  const params = {}
  if (debounced) params.search = debounced

  const { data: result = { items: [], total: 0 }, isLoading } = useProveedores(params)
  const proveedores = result.items ?? []
  const total = result.total ?? 0

  const hasActiveFilters = Boolean(search)
  const clearFilters = () => setSearch('')

  const cols = [
    {
      key: 'codigoProveedor', label: 'Código',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--green-700)', fontWeight: 600 }}>{v}</span> : '—'
    },
    {
      key: 'nombre', label: 'Proveedor', wrap: true,
      render: (v, row) => (
        <div style={{ maxWidth: 220 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{v}</div>
          {row.razonSocial && row.razonSocial !== v && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{row.razonSocial}</div>}
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{row.rut}</div>
        </div>
      )
    },
    { key: 'giro', label: 'Giro', render: v => <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{v || '—'}</span> },
    { key: 'email', label: 'Email', render: v => v ? <a href={`mailto:${v}`} style={{ fontSize: 12, color: 'var(--green-700)' }}>{v}</a> : '—' },
    { key: 'telefono', label: 'Teléfono', render: v => <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace" }}>{v || '—'}</span> },
    {
      key: 'porcVentaSala', label: 'Mg. Sala',
      render: v => <Badge tone={v >= 50 ? 'green' : v >= 30 ? 'amber' : 'gray'}>{fmt(v)}</Badge>
    },
    {
      key: 'porcMarco', label: 'Mg. Marco',
      render: v => <Badge tone={v >= 40 ? 'green' : v >= 20 ? 'amber' : 'gray'}>{fmt(v)}</Badge>
    },
    {
      key: 'porcLicitacion', label: 'Mg. Lic.',
      render: v => <Badge tone={v >= 30 ? 'green' : v >= 15 ? 'amber' : 'gray'}>{fmt(v)}</Badge>
    },
    { key: 'region', label: 'Región', render: v => <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{v || '—'}</span> },
  ]

  const conEmail  = proveedores.filter(p => p.email).length
  const conMargen = proveedores.filter(p => p.porcVentaSala > 0 || p.porcMarco > 0).length
  const avgMgSala = proveedores.length > 0
    ? Math.round(proveedores.reduce((s, p) => s + (p.porcVentaSala || 0), 0) / proveedores.length)
    : 0

  return (
    <main className="page page-wide">
      <PageHeader
        title="Proveedores"
        subtitle={`${total.toLocaleString('es-CL')} proveedores registrados`}
        breadcrumb={['Inicio', 'Catálogo', 'Proveedores']}
        actions={<div style={{ display: 'flex', gap: 8 }}>
          <BotonExportar
            url="/reportes/export/proveedores"
            nombre={`proveedores_${new Date().toISOString().slice(0, 10)}`}
            params={params}
            label="Exportar"
          />
          <Btn variant="secondary" icon="printer" size="sm" onClick={() => window.print()}>PDF/Imprimir</Btn>
          {canWriteProveedores && <Btn variant="primary" icon="plus" size="sm" onClick={() => setCreating(true)}>Nuevo proveedor</Btn>}
        </div>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total proveedores"       value={total.toLocaleString('es-CL')} icon="truck"      sublabel="En catálogo" />
        <KpiCard label="Con email"               value={conEmail}                       icon="mail"       sublabel="Contacto disponible" />
        <KpiCard label="Con margen configurado"  value={conMargen}                      icon="percent"    sublabel="Markup definido" />
        <KpiCard label="Mg. promedio sala"       value={avgMgSala + '%'}                icon="trendingUp" tone="neutral" sublabel="Margen venta directa" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            {total.toLocaleString('es-CL')} proveedores
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  height: 28,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid var(--amber-300, #fcd34d)',
                  background: 'var(--amber-50, #fffbeb)',
                  color: 'var(--amber-900, #78350f)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'background 0.15s',
                }}
              >
                Limpiar
              </button>
            )}
            <SearchBar placeholder="Buscar por nombre, RUT, razón social o código..." value={search} onChange={setSearch} style={{ width: 300, height: 28 }} />
          </div>
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={proveedores} emptyMessage="Sin proveedores" onRowClick={row => navigate(`/proveedores/${row.id}`)} ariaLabel="Proveedores" getRowKey={row => row.id} />
        }
      </div>
      {creating && <ProveedorFormModal onClose={() => setCreating(false)} />}
    </main>
  )
}
