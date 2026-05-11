import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Badge, KpiCard, PageHeader, Btn, SearchBar, Tabs } from '../../components/shared'
import { ODTS } from '../../data/odts'

const ESTADO_COLOR = {
  'Prioritaria': 'red',
  'Pendiente': 'amber',
  'En proceso': 'blue',
  'Terminada': 'green',
}

const TALLER_TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'Espumas', label: 'Espumas', count: ODTS.filter(o => o.tipo === 'Espumas').length },
  { id: 'Confecciones', label: 'Confecciones', count: ODTS.filter(o => o.tipo === 'Confecciones').length },
  { id: 'Madera', label: 'Madera', count: ODTS.filter(o => o.tipo === 'Madera').length },
]

const OdtCard = ({ odt, onSelect }) => {
  const [hov, setHov] = useState(false)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={() => onSelect(odt)} style={{
      background: '#fff', borderRadius: 10, border: `1px solid ${hov ? 'var(--green-100)' : 'var(--border)'}`,
      padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
      boxShadow: hov ? '0 4px 14px oklch(0 0 0 / 0.08)' : 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, color: 'var(--green-700)' }}>ODT #{odt.id}</span>
        <Badge tone={ESTADO_COLOR[odt.estado]}>{odt.estado}</Badge>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 5, lineHeight: 1.3 }}>{odt.cliente}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.4 }}>{odt.descripcion}</div>
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-3)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="calendar" size={12} /> {odt.creada}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: odt.estado === 'Prioritaria' ? 'var(--red)' : 'var(--text-3)' }}>
          <Icon name="clock" size={12} /> Plazo: {odt.plazo}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="user" size={12} /> {odt.responsable}
        </span>
      </div>
    </div>
  )
}

const OdtModal = ({ odt, onClose, onEdit }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'oklch(0 0 0 / 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 480, boxShadow: '0 20px 60px oklch(0 0 0 / 0.20)', animation: 'dropIn 0.18s ease' }}>
      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>ODT #{odt.id}</div>
        <button onClick={onClose} style={{ color: 'var(--text-3)', padding: 4 }}><Icon name="x" size={18} /></button>
      </div>
      <div style={{ padding: '20px 22px' }}>
        <Badge tone={ESTADO_COLOR[odt.estado]}>{odt.estado}</Badge>
        <div style={{ marginTop: 14, marginBottom: 6, fontSize: 12, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Cliente</div>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{odt.cliente}</div>
        <div style={{ marginTop: 14, marginBottom: 6, fontSize: 12, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Descripción</div>
        <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.5 }}>{odt.descripcion}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 18 }}>
          {[['Tipo', odt.tipo], ['Creada', odt.creada], ['Plazo', odt.plazo], ['Responsable', odt.responsable]].map(([l, v], i) => (
            <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>{l}</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <Btn variant="primary" icon="edit" onClick={onEdit}>Editar ODT</Btn>
        <Btn variant="secondary" icon="check">Marcar Terminada</Btn>
        <Btn variant="ghost" icon="printer">Imprimir</Btn>
      </div>
    </div>
  </div>
)

export default function TallerPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [estadoFilter, setEstadoFilter] = useState('all')

  const odts = ODTS
    .filter(o => tab === 'all' || o.tipo === tab)
    .filter(o => estadoFilter === 'all' || o.estado === estadoFilter)
    .filter(o => !search || o.cliente.toLowerCase().includes(search.toLowerCase()) || String(o.id).includes(search))

  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Taller — Órdenes de Trabajo"
        subtitle="ODTs activas por área de producción"
        breadcrumb={['Inicio', 'Taller', 'ODTs']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm">Exportar</Btn>
          <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/taller/nueva')}>Nueva ODT</Btn>
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Total ODTs" value={ODTS.length} icon="clipboard" sublabel="En todos los talleres" />
        <KpiCard label="Prioritarias" value={ODTS.filter(o=>o.estado==='Prioritaria').length} icon="zap" tone="red" sublabel="Atención urgente" />
        <KpiCard label="En Proceso" value={ODTS.filter(o=>o.estado==='En proceso').length} icon="refreshCw" tone="blue" sublabel="En producción ahora" />
        <KpiCard label="Pendientes" value={ODTS.filter(o=>o.estado==='Pendiente').length} icon="clock" tone="amber" sublabel="Sin iniciar" />
        <KpiCard label="Terminadas" value={ODTS.filter(o=>o.estado==='Terminada').length} icon="check" tone="neutral" sublabel="Este mes" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Tabs tabs={TALLER_TABS} active={tab} onChange={setTab} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}>
                <option value="all">Todos los estados</option>
                <option value="Prioritaria">Prioritarias</option>
                <option value="Pendiente">Pendientes</option>
                <option value="En proceso">En proceso</option>
                <option value="Terminada">Terminadas</option>
              </select>
              <SearchBar placeholder="Buscar ODT o cliente…" value={search} onChange={setSearch} style={{ width: 230 }} />
            </div>
          </div>
        </div>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {odts.length === 0 ? (
            <div style={{ gridColumn: '1/-1', padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>
              <Icon name="info" size={24} color="var(--border)" /><p style={{ marginTop: 12 }}>Sin ODTs con ese criterio</p>
            </div>
          ) : odts.map(o => <OdtCard key={o.id} odt={o} onSelect={setSelected} />)}
        </div>
      </div>

      {selected && <OdtModal odt={selected} onClose={() => setSelected(null)} onEdit={() => { navigate('/taller/' + selected.id + '/editar'); setSelected(null) }} />}
    </main>
  )
}
