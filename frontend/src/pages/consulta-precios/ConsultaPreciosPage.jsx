import { useState, useMemo } from 'react'
import { useProductos } from '../../api/productos'

const fmt = n => '$' + Number(n || 0).toLocaleString('es-CL')

export default function ConsultaPreciosPage() {
  const [search, setSearch] = useState('')
  const [bodega, setBodega] = useState('')
  const { data, isLoading } = useProductos({ search: search || undefined, bodega: bodega || undefined })

  const items = useMemo(() => data?.items ?? [], [data])

  return (
    <main style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Consulta de Precios</h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 0' }}>
          Búsqueda por código interno, código de barra o nombre. Solo lectura.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por código, código de barra o nombre…"
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-2)',
            color: 'var(--text-1)',
            fontSize: 14,
          }}
        />
        <select
          value={bodega}
          onChange={e => setBodega(e.target.value)}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-2)',
            color: 'var(--text-1)',
            fontSize: 14,
          }}
        >
          <option value="">Todas las bodegas</option>
          <option value="Inventario">Inventario</option>
          <option value="Taller">Taller</option>
        </select>
      </div>

      <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-2)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              {['', 'Código', 'Cód. Barra', 'Nombre', 'Categoría', 'Proveedor', 'Stock', 'Precio Lista', 'Precio Marco'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>Sin resultados</td></tr>
            )}
            {items.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 10px' }}>{p.fotoUrl
                  ? <img src={p.fotoUrl} alt="" loading="lazy" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} onError={e => { e.currentTarget.style.display = 'none' }} />
                  : <div style={{ width: 36, height: 36, borderRadius: 4, background: 'var(--border)' }} />}</td>
                <td style={{ padding: '9px 14px', fontFamily: "'DM Mono', monospace", color: 'var(--text-2)' }}>{p.codigoInterno}</td>
                <td style={{ padding: '9px 14px', fontFamily: "'DM Mono', monospace", color: 'var(--text-3)' }}>{p.codigoBarra || '—'}</td>
                <td style={{ padding: '9px 14px', color: 'var(--text-1)' }}>{p.nombre}</td>
                <td style={{ padding: '9px 14px', color: 'var(--text-3)' }}>{p.categoria || '—'}</td>
                <td style={{ padding: '9px 14px', color: 'var(--text-3)' }}>{p.proveedor || '—'}</td>
                <td style={{ padding: '9px 14px', fontFamily: "'DM Mono', monospace", textAlign: 'right' }}>{p.stock}</td>
                <td style={{ padding: '9px 14px', fontFamily: "'DM Mono', monospace", fontWeight: 600, textAlign: 'right' }}>{fmt(p.precioLista)}</td>
                <td style={{ padding: '9px 14px', fontFamily: "'DM Mono', monospace", textAlign: 'right', color: 'var(--text-2)' }}>{fmt(p.precioMarco)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 12 }}>
        {items.length} resultados {data?.total ? `de ${data.total}` : ''} {data?.limit ? `(límite ${data.limit})` : ''}
      </p>
    </main>
  )
}
