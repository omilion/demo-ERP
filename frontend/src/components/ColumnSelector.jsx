/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState } from 'react'
import { Btn, Icon } from './shared'

function storageKey(key, user) {
  const userKey = user?.id || user?.email || user?.nombre || user?.role || 'anon'
  return `plastimar.columns.${userKey}.${key}`
}

function readSavedColumns(key, user, columns) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey(key, user))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const allowed = new Set(columns.map(c => c.key))
    return parsed.filter(k => allowed.has(k))
  } catch {
    return null
  }
}

function saveColumns(key, user, selected) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(key, user), JSON.stringify(selected))
  } catch {
    // Preference only. If local storage is blocked, keep the table usable.
  }
}

export function useColumnPreferences(key, columns, user) {
  const defaultKeys = useMemo(
    () => columns.filter(col => !col.defaultHidden).map(col => col.key),
    [columns],
  )
  const required = useMemo(
    () => new Set(columns.filter(col => col.required).map(col => col.key)),
    [columns],
  )
  const [selected, setSelected] = useState(() => readSavedColumns(key, user, columns) || defaultKeys)

  const selectedSet = useMemo(() => new Set([...selected, ...required]), [selected, required])
  const visibleColumns = useMemo(
    () => columns.filter(col => selectedSet.has(col.key)),
    [columns, selectedSet],
  )

  const updateSelected = next => {
    const clean = columns
      .map(col => col.key)
      .filter(colKey => next.includes(colKey) || required.has(colKey))
    setSelected(clean)
    saveColumns(key, user, clean)
  }

  const reset = () => updateSelected(defaultKeys)

  return { selected: [...selectedSet], setSelected: updateSelected, reset, visibleColumns, required }
}

export function ColumnSelector({ columns, selected, onChange, onReset, required = new Set() }) {
  const [open, setOpen] = useState(false)
  const selectedSet = new Set(selected)

  const toggle = key => {
    if (required.has(key)) return
    const next = selectedSet.has(key)
      ? selected.filter(k => k !== key)
      : [...selected, key]
    onChange(next)
  }

  return (
    <div style={{ position: 'relative' }}>
      <Btn variant="secondary" icon="list" size="sm" onClick={() => setOpen(o => !o)}>
        Columnas
      </Btn>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: 320,
          maxWidth: '88vw',
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 14px 36px oklch(0 0 0 / 0.16)',
          zIndex: 50,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Columnas visibles</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>La vista queda guardada para este usuario.</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ color: 'var(--text-3)', padding: 4 }}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', padding: 8 }}>
            {columns.filter(col => col.label).map(col => {
              const locked = required.has(col.key)
              return (
                <label key={col.key} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8px 9px',
                  borderRadius: 7,
                  cursor: locked ? 'default' : 'pointer',
                  color: locked ? 'var(--text-3)' : 'var(--text-1)',
                  fontSize: 13,
                }}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(col.key)}
                    disabled={locked}
                    onChange={() => toggle(col.key)}
                  />
                  <span style={{ flex: 1 }}>{col.label}</span>
                  {locked && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>fija</span>}
                </label>
              )
            })}
          </div>
          <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <Btn variant="ghost" size="sm" onClick={onReset}>Restaurar base</Btn>
            <Btn variant="primary" size="sm" onClick={() => setOpen(false)}>Guardar</Btn>
          </div>
        </div>
      )}
    </div>
  )
}
