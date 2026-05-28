import { useState } from 'react'
import { PageHeader, Btn, Icon } from '../../components/shared'
import { useDescuentos, useCreateDescuento, useUpdateDescuento, useDeleteDescuento } from '../../api/descuentos'

function parsePercent(value, { integerOnly = false } = {}) {
  if (value === null || value === undefined || String(value).trim() === '') return { error: 'Ingresa un porcentaje' }
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 100) return { error: 'El porcentaje debe estar entre 0 y 100' }
  if (integerOnly && !Number.isInteger(number)) return { error: 'El descuento normal debe ser entero' }
  return { value: number }
}

function apiError(error, fallback = 'No se pudo guardar') {
  return error?.response?.data?.error || fallback
}

export default function DescuentosPage() {
  const { data, isLoading } = useDescuentos()
  const createMut = useCreateDescuento()
  const updateMut = useUpdateDescuento()
  const deleteMut = useDeleteDescuento()

  if (isLoading) return <main style={{ padding: 24 }}>Cargando...</main>

  return (
    <main className="page page-wide">
      <PageHeader
        title="Descuentos"
        subtitle="Porcentajes de descuento aplicables en ventas"
        breadcrumb={['Inicio', 'Config', 'Descuentos']}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Catalog
          titulo="Descuentos normales"
          subtitulo="Aplican a ventas regulares"
          items={data?.normales ?? []}
          tipo="normales"
          integerOnly
          placeholder="Solo enteros sin puntos"
          pending={createMut.isPending || updateMut.isPending || deleteMut.isPending}
          onCreate={(valor) => createMut.mutateAsync({ tipo: 'normales', valor })}
          onUpdate={(id, valor) => updateMut.mutateAsync({ tipo: 'normales', id, valor })}
          onDelete={(id) => deleteMut.mutateAsync({ tipo: 'normales', id })}
        />
        <Catalog
          titulo="Descuentos Convenio Marco"
          subtitulo="Aplican al total de ventas Convenio Marco"
          items={data?.marco ?? []}
          tipo="marco"
          placeholder="Ej: 1.8"
          pending={createMut.isPending || updateMut.isPending || deleteMut.isPending}
          onCreate={(valor) => createMut.mutateAsync({ tipo: 'marco', valor })}
          onUpdate={(id, valor) => updateMut.mutateAsync({ tipo: 'marco', id, valor })}
          onDelete={(id) => deleteMut.mutateAsync({ tipo: 'marco', id })}
        />
      </div>
    </main>
  )
}

function Catalog({ titulo, subtitulo, items, onCreate, onUpdate, onDelete, pending = false, integerOnly = false, placeholder = 'Ej: 1.8' }) {
  const [valor, setValor] = useState('')
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [error, setError] = useState('')

  async function create(e) {
    e.preventDefault()
    setError('')
    const parsed = parsePercent(valor, { integerOnly })
    if (parsed.error) { setError(parsed.error); return }
    try {
      await onCreate(parsed.value)
      setValor('')
    } catch (err) {
      setError(apiError(err))
    }
  }

  async function saveEdit(e) {
    e.preventDefault()
    setError('')
    const parsed = parsePercent(editValue, { integerOnly })
    if (parsed.error) { setError(parsed.error); return }
    try {
      await onUpdate(editing, parsed.value)
      setEditing(null)
      setEditValue('')
    } catch (err) {
      setError(apiError(err))
    }
  }

  async function remove(item) {
    if (!window.confirm(`Eliminar descuento ${item.valor}%?`)) return
    setError('')
    try {
      await onDelete(item.id)
      if (editing === item.id) {
        setEditing(null)
        setEditValue('')
      }
    } catch (err) {
      setError(apiError(err, 'No se pudo eliminar'))
    }
  }

  function startEdit(item) {
    setError('')
    setEditing(item.id)
    setEditValue(String(item.valor))
  }

  return (
    <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{titulo}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{subtitulo}</div>
      </div>
      <div style={{ padding: 16 }}>
        <form onSubmit={create} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="number"
            min="0"
            max="100"
            step={integerOnly ? '1' : '0.01'}
            placeholder={placeholder}
            value={valor}
            onChange={e => setValor(e.target.value)}
            disabled={pending}
            style={{ flex: 1, padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit' }}
          />
          <Btn type="submit" variant="primary" size="sm" disabled={pending} icon="plus">Crear</Btn>
        </form>

        {error && (
          <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 6, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.length === 0 && <span style={{ color: 'var(--text-3)', fontSize: 13 }}>Sin descuentos definidos</span>}
          {items.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, fontSize: 13 }}>
              {editing === item.id ? (
                <form onSubmit={saveEdit} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    max="100"
                    step={integerOnly ? '1' : '0.01'}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    disabled={pending}
                    style={{ flex: 1, minWidth: 0, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, fontFamily: "'DM Mono', monospace" }}
                  />
                  <button type="submit" disabled={pending} title="Guardar" style={{ color: 'var(--green-700)', padding: 4, opacity: pending ? 0.45 : 1 }}>
                    <Icon name="check" size={16} />
                  </button>
                  <button type="button" disabled={pending} title="Cancelar" onClick={() => { setEditing(null); setEditValue('') }} style={{ color: 'var(--text-3)', padding: 4, opacity: pending ? 0.45 : 1 }}>
                    <Icon name="x" size={16} />
                  </button>
                </form>
              ) : (
                <>
                  <strong style={{ flex: 1, fontFamily: "'DM Mono', monospace", fontSize: 16 }}>{item.valor}%</strong>
                  <button onClick={() => startEdit(item)} disabled={pending} title="Modificar" style={{ color: 'var(--blue)', padding: 4, opacity: pending ? 0.45 : 1 }}>
                    <Icon name="edit" size={15} />
                  </button>
                  <button onClick={() => remove(item)} disabled={pending} title="Eliminar" style={{ color: 'var(--red)', padding: 4, opacity: pending ? 0.45 : 1 }}>
                    <Icon name="trash" size={15} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
