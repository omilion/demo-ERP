import { useState } from 'react'
import { PageHeader, Badge, SearchBar } from '../../components/shared'
import { useAuditoria } from '../../api/admin'

const METHOD_TONES = { POST: 'green', PUT: 'blue', PATCH: 'blue', DELETE: 'red' }

export default function AuditoriaPage() {
  const [method, setMethod] = useState('')
  const [entity, setEntity] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const limit = 100
  const { data, isLoading } = useAuditoria({
    method: method || undefined,
    entity: entity || undefined,
    q: q || undefined,
    limit,
    offset: page * limit,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / limit))

  return (
    <main style={{ maxWidth: 1500, margin: '0 auto', padding: 'clamp(12px, 2vw, 24px)' }}>
      <PageHeader
        title="Auditoría de Actividad"
        subtitle="Registro inmutable de todas las modificaciones por usuario. Solo administradores."
        breadcrumb={['Inicio', 'Admin', 'Auditoría']}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={method} onChange={e => { setMethod(e.target.value); setPage(0) }} style={selectStyle}>
          <option value="">Todos los métodos</option>
          <option value="POST">POST (crear)</option>
          <option value="PUT">PUT (actualizar)</option>
          <option value="PATCH">PATCH (modificar)</option>
          <option value="DELETE">DELETE (eliminar)</option>
        </select>
        <input value={entity} onChange={e => { setEntity(e.target.value); setPage(0) }} placeholder="Entidad (productos, ventas, clientes...)" style={inputStyle} />
        <SearchBar placeholder="Buscar ruta o email…" value={q} onChange={v => { setQ(v); setPage(0) }} style={{ width: 280 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>
          {total.toLocaleString('es-CL')} registros
        </span>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Fecha', 'Usuario', 'Rol', 'Método', 'Ruta', 'Entidad', 'ID', 'Status', 'IP'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</td></tr>}
              {!isLoading && items.length === 0 && <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>Sin actividad registrada</td></tr>}
              {items.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle}>{new Date(r.created_at).toLocaleString('es-CL')}</td>
                  <td style={tdStyle}>{r.user_nombre || r.user_email || '—'}</td>
                  <td style={tdStyle}>{r.role && <Badge tone="gray">{r.role}</Badge>}</td>
                  <td style={tdStyle}><Badge tone={METHOD_TONES[r.method] || 'gray'}>{r.method}</Badge></td>
                  <td style={{ ...tdStyle, fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{r.path}</td>
                  <td style={tdStyle}>{r.entity || '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: "'DM Mono', monospace" }}>{r.entity_id || '—'}</td>
                  <td style={tdStyle}>
                    <span style={{ color: r.status >= 400 ? 'var(--red)' : r.status >= 300 ? 'var(--amber)' : 'var(--green-600)', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{r.status}</span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>{r.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12 }}>
            <span style={{ color: 'var(--text-3)' }}>Página {page + 1} de {pages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={pageBtn(page === 0)}>← Anterior</button>
              <button disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)} style={pageBtn(page + 1 >= pages)}>Siguiente →</button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

const thStyle = { padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--border)' }
const tdStyle = { padding: '7px 12px', whiteSpace: 'nowrap', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }
const selectStyle = { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }
const inputStyle = { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, width: 220 }
const pageBtn = disabled => ({ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: disabled ? 'var(--bg)' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12, opacity: disabled ? 0.5 : 1 })
