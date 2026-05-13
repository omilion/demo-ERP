import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Badge, KpiCard, PageHeader, Btn, SearchBar, Tabs } from '../../components/shared'
import { useOdts, useOdtEstado } from '../../api/odts'

const ESTADO_TONE = {
  Prioritaria: 'red',
  'En proceso': 'blue',
  Pendiente:   'amber',
  Terminada:   'green',
}

const TALLER_TABS = [
  { id: 'all',          label: 'Todos' },
  { id: 'Espumas',      label: 'Espumas' },
  { id: 'Confecciones', label: 'Confecciones' },
  { id: 'Madera',       label: 'Madera' },
]

const TAB_PARAMS = {
  Espumas:      { tipo: 'Espumas' },
  Confecciones: { tipo: 'Confecciones' },
  Madera:       { tipo: 'Madera' },
}

const OdtCard = ({ odt, onSelect }) => {
  const [hov, setHov] = useState(false)
  const isPrioritaria = odt.estado === 'Prioritaria'
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onSelect(odt)}
      style={{
        background: '#fff',
        borderRadius: 10,
        border: `1.5px solid ${isPrioritaria ? 'var(--red)' : hov ? 'var(--green-100)' : 'var(--border)'}`,
        padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
        boxShadow: hov ? '0 4px 14px oklch(0 0 0 / 0.08)' : 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, color: 'var(--green-700)' }}>
          ODT #{odt.id}
        </span>
        <div style={{ display: 'flex', gap: 5 }}>
          {odt.prioridad && odt.prioridad !== 'normal' && (
            <Badge tone={odt.prioridad === 'urgente' ? 'red' : 'amber'} style={{ fontSize: 10 }}>{odt.prioridad}</Badge>
          )}
          <Badge tone={ESTADO_TONE[odt.estado]}>{odt.estado}</Badge>
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 5, lineHeight: 1.3 }}>
        {odt.clienteNombre || '—'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.4 }}>
        {odt.descripcion}
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-3)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="calendar" size={12} /> {new Date(odt.createdAt).toLocaleDateString('es-CL')}
        </span>
        {odt.tipo && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="tag" size={12} /> {odt.tipo}
          </span>
        )}
        <span style={{
          display: 'flex', alignItems: 'center', gap: 4,
          color: odt.plazo && new Date(odt.plazo) < new Date() && odt.estado !== 'Terminada' ? 'var(--red)' : 'var(--text-3)',
        }}>
          <Icon name="clock" size={12} /> {odt.plazo ? new Date(odt.plazo).toLocaleDateString('es-CL') : '—'}
        </span>
      </div>
    </div>
  )
}

function OdtModal({ odt, onClose, onEdit, onEstadoChange }) {
  const [confirming, setConfirming] = useState(false)

  const estadoActions = [
    { from: ['Pendiente'], to: 'En proceso', label: 'Iniciar trabajo', tone: 'blue' },
    { from: ['Pendiente', 'En proceso'], to: 'Prioritaria', label: 'Marcar Prioritaria', tone: 'red' },
    { from: ['Prioritaria'], to: 'En proceso', label: 'Volver a En proceso', tone: 'blue' },
    { from: ['Pendiente', 'En proceso', 'Prioritaria'], to: 'Terminada', label: 'Marcar Terminada', tone: 'green' },
    { from: ['Terminada'], to: 'Pendiente', label: 'Reabrir ODT', tone: 'amber' },
  ]
  const available = estadoActions.filter(a => a.from.includes(odt.estado))

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'oklch(0 0 0 / 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px oklch(0 0 0 / 0.20)', animation: 'dropIn 0.18s ease' }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>ODT #{odt.id}</span>
            {odt.prioridad && odt.prioridad !== 'normal' && (
              <Badge tone={odt.prioridad === 'urgente' ? 'red' : 'amber'}>{odt.prioridad}</Badge>
            )}
            <Badge tone={ESTADO_TONE[odt.estado]}>{odt.estado}</Badge>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-3)', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ padding: '20px 22px' }}>
          <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Cliente</div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>{odt.clienteNombre || '—'}</div>

          <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Descripción</div>
          <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.6, marginBottom: 18, background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
            {odt.descripcion}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            {[
              ['Tipo',      odt.tipo || '—'],
              ['Prioridad', odt.prioridad || 'normal'],
              ['Creada',    new Date(odt.createdAt).toLocaleDateString('es-CL')],
              ['Plazo',     odt.plazo ? new Date(odt.plazo).toLocaleDateString('es-CL') : '—'],
            ].map(([l, v], i) => (
              <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>{l}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Estado transitions */}
          {available.length > 0 && (
            <div style={{ marginTop: 18, padding: '12px 14px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                Cambiar estado
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {available.map(a => (
                  <button
                    key={a.to}
                    onClick={() => { onEstadoChange(odt.id, a.to); onClose() }}
                    style={{
                      padding: '6px 14px', fontSize: 12, borderRadius: 7, cursor: 'pointer', fontWeight: 600,
                      background: a.tone === 'green' ? 'var(--green-600)' : a.tone === 'red' ? 'var(--red)' : a.tone === 'blue' ? 'var(--blue)' : 'var(--amber)',
                      color: '#fff', border: 'none',
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <Btn variant="primary" icon="edit" onClick={onEdit}>Editar ODT</Btn>
          <Btn variant="ghost" icon="printer">Imprimir</Btn>
        </div>
      </div>
    </div>
  )
}

export default function TallerPage() {
  const navigate = useNavigate()
  const [tab, setTab]               = useState('all')
  const [search, setSearch]         = useState('')
  const [debouncedSearch, setDeb]   = useState('')
  const [estadoFilter, setEst]      = useState('all')
  const [selected, setSelected]     = useState(null)
  const debRef = useRef(null)
  const cambiarEstado = useOdtEstado()

  useEffect(() => {
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => setDeb(search), 400)
    return () => clearTimeout(debRef.current)
  }, [search])

  const apiParams = { ...TAB_PARAMS[tab] }
  if (estadoFilter !== 'all') apiParams.estado = estadoFilter
  if (debouncedSearch) apiParams.search = debouncedSearch

  const { data: odtResult = { items: [], total: 0, limit: 100 }, isLoading } = useOdts(apiParams)
  const odts  = odtResult.items ?? []
  const total = odtResult.total ?? 0
  const LIMIT = odtResult.limit ?? 100

  const prioritarias = odts.filter(o => o.estado === 'Prioritaria').length
  const enProceso    = odts.filter(o => o.estado === 'En proceso').length
  const pendientes   = odts.filter(o => o.estado === 'Pendiente').length
  const terminadas   = odts.filter(o => o.estado === 'Terminada').length

  function handleEstadoChange(id, estado) {
    cambiarEstado.mutate({ id, estado }, {
      onSuccess: updated => {
        if (selected?.id === id) setSelected(updated)
      },
    })
  }

  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Taller — Órdenes de Trabajo"
        subtitle={`${total.toLocaleString('es-CL')} ODTs en total`}
        breadcrumb={['Inicio', 'Taller', 'ODTs']}
        actions={<>
          <Btn variant="secondary" icon="download" size="sm">Exportar</Btn>
          <Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/taller/nueva')}>Nueva ODT</Btn>
        </>}
      />

      <div className="kpi-strip">
        <KpiCard label="Prioritarias" value={isLoading ? '…' : prioritarias.toLocaleString('es-CL')} icon="zap" tone={prioritarias > 0 ? 'red' : 'neutral'} sublabel="Urgencia máxima" onClick={() => setEst('Prioritaria')} />
        <KpiCard label="En Proceso"   value={isLoading ? '…' : enProceso.toLocaleString('es-CL')}    icon="tool"  tone="blue"   sublabel="Trabajos activos"   onClick={() => setEst('En proceso')} />
        <KpiCard label="Pendientes"   value={isLoading ? '…' : pendientes.toLocaleString('es-CL')}   icon="clock" tone="amber"  sublabel="Por iniciar"       onClick={() => setEst('Pendiente')} />
        <KpiCard label="Terminadas"   value={isLoading ? '…' : terminadas.toLocaleString('es-CL')}   icon="checkCircle" tone="neutral" sublabel="Completadas en vista" onClick={() => setEst('Terminada')} />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Tabs tabs={TALLER_TABS} active={tab} onChange={t => { setTab(t); setSearch('') }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <select
                value={estadoFilter}
                onChange={e => setEst(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}
              >
                <option value="all">Todos los estados</option>
                <option value="Prioritaria">🔴 Prioritarias</option>
                <option value="En proceso">🔵 En proceso</option>
                <option value="Pendiente">🟡 Pendientes</option>
                <option value="Terminada">🟢 Terminadas</option>
              </select>
              <SearchBar placeholder="Buscar N°, cliente, descripción…" value={search} onChange={setSearch} style={{ width: 260 }} />
            </div>
          </div>
        </div>

        {total > LIMIT && (
          <div style={{ padding: '7px 16px', background: '#fffbeb', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)' }}>
            Mostrando las {LIMIT} primeras de {total.toLocaleString('es-CL')}. Usa el buscador o filtros para encontrar ODTs específicas.
          </div>
        )}

        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {isLoading ? (
            <div style={{ gridColumn: '1/-1', padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>
              Cargando ODTs…
            </div>
          ) : odts.length === 0 ? (
            <div style={{ gridColumn: '1/-1', padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>
              <Icon name="info" size={24} color="var(--border)" />
              <p style={{ marginTop: 12 }}>Sin ODTs con ese criterio</p>
            </div>
          ) : (
            odts.map(o => <OdtCard key={o.id} odt={o} onSelect={setSelected} />)
          )}
        </div>
      </div>

      {selected && (
        <OdtModal
          odt={selected}
          onClose={() => setSelected(null)}
          onEdit={() => { navigate('/taller/' + selected.id + '/editar'); setSelected(null) }}
          onEstadoChange={handleEstadoChange}
        />
      )}
    </main>
  )
}
