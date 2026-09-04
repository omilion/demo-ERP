import { useEffect, useRef, useState } from 'react'
import { FormField, Input } from '../forms'
import { useProveedores } from '../../api/proveedores'

const normalizeRut = value => String(value || '').replace(/[^0-9kK]/g, '').toUpperCase()
const providerLabel = provider => provider?.razonSocial || provider?.nombre || 'Proveedor sin nombre'

export default function ProveedorAutocomplete({
  label = 'Proveedor',
  placeholder = 'Buscar por nombre o RUT…',
  required = false,
  selected = null,
  initialQuery = '',
  autoSelectRut = '',
  onSelect,
  onClear,
  disabled = false,
}) {
  const boxRef = useRef(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const { data, isFetching } = useProveedores(debounced.length >= 2 ? { search: debounced } : {})
  const items = debounced.length >= 2 ? data?.items || [] : []

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!initialQuery) return
    setQuery(initialQuery)
    setOpen(true)
  }, [initialQuery])

  useEffect(() => {
    const close = event => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    if (!autoSelectRut || selected || !items.length) return
    const match = items.find(item => normalizeRut(item.rut) === normalizeRut(autoSelectRut))
    if (!match) return
    onSelect?.(match)
    setQuery('')
    setOpen(false)
  }, [autoSelectRut, items, onSelect, selected])

  const select = item => {
    onSelect?.(item)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', minWidth: 0 }}>
      <FormField label={label} required={required} hint={selected ? undefined : 'Escriba al menos 2 caracteres para buscar'}>
        <Input
          value={query}
          onChange={value => { setQuery(value); setOpen(true) }}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={label}
          autoComplete="off"
        />
      </FormField>
      {selected && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 38, marginTop: -12, padding: '7px 9px', border: '1px solid var(--green-600)', borderRadius: 8, background: 'var(--green-50)', fontSize: 12 }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><strong>{providerLabel(selected)}</strong>{selected.rut ? ` · ${selected.rut}` : ''}</span>
          {!disabled && <button type="button" onClick={() => { onClear?.(); setQuery('') }} style={{ flexShrink: 0, padding: '2px 5px', borderRadius: 5, color: 'var(--green-700)', fontSize: 11, fontWeight: 700 }}>Cambiar</button>}
        </div>
      )}
      {open && debounced.length >= 2 && !selected && (
        <div role="listbox" aria-label={`${label}: resultados`} style={{ position: 'absolute', zIndex: 30, top: 62, left: 0, right: 0, maxHeight: 240, overflowY: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px oklch(0 0 0 / .12)' }}>
          {isFetching && <div style={{ padding: 10, color: 'var(--text-3)', fontSize: 12 }}>Buscando proveedores…</div>}
          {!isFetching && !items.length && <div style={{ padding: 10, color: 'var(--text-3)', fontSize: 12 }}>No hay proveedores que coincidan.</div>}
          {items.map(item => (
            <button key={item.id} type="button" role="option" aria-selected="false" onClick={() => select(item)} style={{ display: 'grid', width: '100%', gap: 2, padding: '9px 10px', textAlign: 'left', background: '#fff', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
              <b>{providerLabel(item)}</b>
              <small style={{ color: 'var(--text-3)' }}>{item.rut || 'Sin RUT'}{item.codigoProveedor ? ` · Código ${item.codigoProveedor}` : ''}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
