import { useState, useEffect, useRef } from 'react'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table } from '../../components/shared'
import { useProveedores } from '../../api/proveedores'

export default function ProveedoresPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
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

  const fmt = n => n ? `${n}%` : '—'

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
          {row.razonSocial && row.razonSocial !== v && (
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{row.razonSocial}</div>
          )}
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
    {
      key: 'region', label: 'Región',
      render: v => <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{v || '—'}</span>
    },
  ]

  const conEmail = proveedores.filter(p => p.email).length
  const conMargen = proveedores.filter(p => p.porcVentaSala > 0 || p.porcMarco > 0).length
  const avgMgSala = proveedores.length > 0
    ? Math.round(proveedores.reduce((s, p) => s + (p.porcVentaSala || 0), 0) / proveedores.length)
    : 0

  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Proveedores"
        subtitle={`${total.toLocaleString('es-CL')} proveedores registrados`}
        breadcrumb={['Inicio', 'Catálogo', 'Proveedores']}
        actions={<Btn variant="secondary" icon="download" size="sm">Exportar</Btn>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total proveedores" value={total.toLocaleString('es-CL')} icon="truck" sublabel="En catálogo" />
        <KpiCard label="Con email" value={conEmail} icon="mail" sublabel="Contacto disponible" />
        <KpiCard label="Con margen configurado" value={conMargen} icon="percent" sublabel="Markup definido" />
        <KpiCard label="Mg. promedio sala" value={avgMgSala + '%'} icon="trendingUp" tone="neutral" sublabel="Margen venta directa" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            {total.toLocaleString('es-CL')} proveedores
          </span>
          <SearchBar placeholder="Nombre, RUT, razón social..." value={search} onChange={setSearch} style={{ width: 280 }} />
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={proveedores} emptyMessage="Sin proveedores" />
        }
        {total > (result.limit ?? 100) && (
          <div style={{ padding: '10px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
            Mostrando {result.limit} de {total.toLocaleString('es-CL')}. Usa el buscador para filtrar.
          </div>
        )}
      </div>
    </main>
  )
}
