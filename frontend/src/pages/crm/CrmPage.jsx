import { useState, useEffect, useRef } from 'react'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table } from '../../components/shared'
import { useCrm, useCrmEjecutivas } from '../../api/crm'

// estado: 0=Pendiente, 1=En Gestión, 2=En Espera, 3=Cerrado
const ESTADO_LABEL = { 0: 'Pendiente', 1: 'En Gestión', 2: 'En Espera', 3: 'Cerrado' }
const ESTADO_TONE  = { 0: 'amber', 1: 'blue', 2: 'gray', 3: 'green' }

function prioridadTone(p) {
  if (!p) return 'gray'
  const l = p.toLowerCase()
  if (l === 'alta') return 'red'
  if (l === 'media') return 'amber'
  return 'gray'
}

export default function CrmPage() {
  const [ejecutiva, setEjecutiva] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('')
  const [prioridad, setPrioridad] = useState('')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    clearTimeout(ref.current)
    ref.current = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(ref.current)
  }, [search])

  const { data: ejecutivas = [] } = useCrmEjecutivas()

  const params = {}
  if (ejecutiva) params.ejecutiva = ejecutiva
  if (estadoFilter !== '') params.estado = estadoFilter
  if (prioridad) params.prioridad = prioridad
  if (debounced) params.search = debounced

  const { data: result = { items: [], total: 0 }, isLoading } = useCrm(params)
  const items = result.items ?? []
  const total = result.total ?? 0

  const pendientes = items.filter(c => c.estado === 0).length
  const enGestion  = items.filter(c => c.estado === 1).length
  const cerrados   = items.filter(c => c.estado === 3).length
  const altaPrioridad = items.filter(c => c.prioridad?.toLowerCase() === 'alta').length

  const cols = [
    {
      key: 'fecha', label: 'Fecha',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{new Date(v).toLocaleDateString('es-CL')}</span> : '—'
    },
    {
      key: 'ncotizacion', label: 'N° Cotización',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--green-700)', fontWeight: 600 }}>{v}</span> : '—'
    },
    {
      key: 'nombre', label: 'Contacto / Organismo', wrap: true,
      render: (v, row) => (
        <div style={{ maxWidth: 220 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{v || '—'}</div>
          {row.rsocial && row.rsocial !== v && (
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{row.rsocial}</div>
          )}
          {row.rut && <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>{row.rut}</div>}
        </div>
      )
    },
    {
      key: 'accion', label: 'Acción',
      render: v => v ? <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v}</span> : '—'
    },
    {
      key: 'resultado', label: 'Resultado',
      render: v => v ? <span style={{ fontSize: 12, color: 'var(--text-2)', fontStyle: 'italic' }}>{v}</span> : '—'
    },
    {
      key: 'ejecutiva', label: 'Ejecutiva',
      render: v => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v || '—'}</span>
    },
    {
      key: 'prioridad', label: 'Prioridad',
      render: v => v ? <Badge tone={prioridadTone(v)}>{v}</Badge> : '—'
    },
    {
      key: 'estado', label: 'Estado',
      render: v => <Badge tone={ESTADO_TONE[v] ?? 'gray'}>{ESTADO_LABEL[v] ?? v}</Badge>
    },
    {
      key: 'fechaProximo', label: 'Próximo',
      render: v => v ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{new Date(v).toLocaleDateString('es-CL')}</span> : '—'
    },
  ]

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="CRM — Seguimiento de Cotizaciones"
        subtitle={`${total.toLocaleString('es-CL')} registros de seguimiento`}
        breadcrumb={['Inicio', 'Ventas', 'CRM']}
        actions={<Btn variant="secondary" icon="download" size="sm">Exportar</Btn>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total registros" value={total.toLocaleString('es-CL')} icon="fileText" sublabel="Seguimientos CRM" />
        <KpiCard label="Pendientes" value={pendientes} icon="clock" tone="amber" sublabel="Sin cerrar en vista actual" />
        <KpiCard label="En gestión" value={enGestion} icon="phone" tone="blue" sublabel="Activamente gestionados" />
        <KpiCard label="Prioridad Alta" value={altaPrioridad} icon="alertTriangle" tone="red" sublabel="Requieren atención" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={ejecutiva} onChange={e => setEjecutiva(e.target.value)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
              <option value="">Todas las ejecutivas</option>
              {ejecutivas.map(e => <option key={e.ejecutiva} value={e.ejecutiva}>{e.ejecutiva} ({e.total})</option>)}
            </select>
            <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
              <option value="">Todos los estados</option>
              <option value="0">Pendiente</option>
              <option value="1">En Gestión</option>
              <option value="2">En Espera</option>
              <option value="3">Cerrado</option>
            </select>
            <select value={prioridad} onChange={e => setPrioridad(e.target.value)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-1)' }}>
              <option value="">Toda prioridad</option>
              <option value="Alta">Alta</option>
              <option value="Media">Media</option>
              <option value="Baja">Baja</option>
            </select>
          </div>
          <SearchBar placeholder="Contacto, organismo, RUT, cotización..." value={search} onChange={setSearch} style={{ width: 300 }} />
        </div>

        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={items} emptyMessage="Sin registros para este filtro" />
        }

        {total > result.limit && (
          <div style={{ padding: '10px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
            Mostrando {result.limit} de {total.toLocaleString('es-CL')} registros. Usa los filtros para acotar.
          </div>
        )}
      </div>
    </main>
  )
}
