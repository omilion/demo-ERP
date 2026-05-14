import { useState } from 'react'
import { PageHeader, Btn } from '../../components/shared'
import { useDescuentos, useCreateDescuento, useDeleteDescuento } from '../../api/descuentos'

export default function DescuentosPage() {
  const { data, isLoading } = useDescuentos()
  const createMut = useCreateDescuento()
  const deleteMut = useDeleteDescuento()

  if (isLoading) return <main style={{ padding: 24 }}>Cargando…</main>

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <PageHeader
        title="Descuentos"
        subtitle="Porcentajes de descuento aplicables en ventas"
        breadcrumb={['Inicio', 'Config', 'Descuentos']}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Catalog
          titulo="Descuentos normales"
          subtitulo="Aplican a ventas regulares"
          items={data?.normales ?? []}
          tipo="normales"
          onCreate={(valor) => createMut.mutate({ tipo: 'normales', valor })}
          onDelete={(id) => deleteMut.mutate({ tipo: 'normales', id })}
        />
        <Catalog
          titulo="Descuentos Convenio Marco"
          subtitulo="Aplican a licitaciones públicas"
          items={data?.marco ?? []}
          tipo="marco"
          onCreate={(valor) => createMut.mutate({ tipo: 'marco', valor })}
          onDelete={(id) => deleteMut.mutate({ tipo: 'marco', id })}
        />
      </div>
    </main>
  )
}

function Catalog({ titulo, subtitulo, items, onCreate, onDelete }) {
  const [valor, setValor] = useState('')
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{titulo}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{subtitulo}</div>
      </div>
      <div style={{ padding: 16 }}>
        <form
          onSubmit={e => {
            e.preventDefault()
            const v = parseFloat(valor)
            if (isNaN(v)) return
            onCreate(v)
            setValor('')
          }}
          style={{ display: 'flex', gap: 8, marginBottom: 12 }}
        >
          <input
            type="number"
            step="0.01"
            placeholder="Ej: 15"
            value={valor}
            onChange={e => setValor(e.target.value)}
            style={{ flex: 1, padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)' }}
          />
          <Btn type="submit" variant="primary" size="sm">+ Agregar</Btn>
        </form>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {items.length === 0 && <span style={{ color: 'var(--text-3)', fontSize: 13 }}>Sin descuentos definidos</span>}
          {items.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 10px', background: 'var(--bg-muted)', borderRadius: 16, fontSize: 13 }}>
              <strong style={{ fontFamily: "'DM Mono', monospace" }}>{d.valor}%</strong>
              <button
                onClick={() => onDelete(d.id)}
                title="Eliminar"
                style={{ background: 'transparent', border: 'none', color: 'var(--red-700)', cursor: 'pointer', fontWeight: 700, padding: 0, lineHeight: 1 }}
              >×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
