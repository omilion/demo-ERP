// Editor de sucursales / direcciones de un cliente.
//
// Funciona en dos modos:
//  - Con cliente ya creado: cada cambio se guarda de inmediato contra el API.
//  - Sin cliente todavia (alta): las sucursales se acumulan en una lista local
//    y el formulario que lo contiene las crea despues de crear el cliente.
//
// El segundo modo existe porque antes habia que guardar el cliente, volver a
// entrar a editarlo y recien ahi agregarle una sucursal. En una venta eso
// dejaba el selector de direccion de entrega vacio justo despues de crear el
// cliente.
import { useState } from 'react'
import { toast } from '../../store/notif'
import { FormField, FormDivider, Input, Select } from './index'
import { useCreateClienteSucursal, useUpdateClienteSucursal } from '../../api/clientes'
import { PAISES_LATAM, REGIONES_CHILE, COMUNAS_POR_REGION } from '../../data/geoLatam'

const VACIA = {
  nombre: '', direccion: '', region: '', comuna: '', pais: 'Chile',
  contacto: '', telefono: '', email: '', isPrincipal: false,
}

function withCurrentValue(options, current) {
  if (!current || options.includes(current)) return options
  return [...options, current]
}

// Deja fuera los campos vacios para no mandar cadenas en blanco al API.
// eslint-disable-next-line react-refresh/only-export-components
export function sucursalToPayload(form) {
  return Object.fromEntries(
    Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && !v.trim() ? undefined : v])
  )
}

export function SucursalesCliente({ cliente, borradores = [], onBorradoresChange }) {
  const [form, setForm] = useState(VACIA)
  const [editingId, setEditingId] = useState(null)
  const createSucursal = useCreateClienteSucursal()
  const updateSucursal = useUpdateClienteSucursal()

  const persistido = !!cliente?.id
  const sucursales = persistido ? (cliente.sucursales || []) : borradores
  const saving = createSucursal.isPending || updateSucursal.isPending

  const field = (key, value) => setForm(f => ({ ...f, [key]: value }))
  const reset = () => { setEditingId(null); setForm(VACIA) }

  function edit(s, indice) {
    setEditingId(persistido ? s.id : indice)
    setForm({
      nombre: s.nombre || '',
      direccion: s.direccion || '',
      region: s.region || '',
      comuna: s.comuna || '',
      pais: s.pais || 'Chile',
      contacto: s.contacto || '',
      telefono: s.telefono || '',
      email: s.email || '',
      isPrincipal: !!s.isPrincipal,
    })
  }

  function save() {
    if (!form.nombre.trim()) { toast.warning('Nombre de sucursal requerido'); return }

    // Sin cliente todavia: la sucursal queda en la lista local.
    if (!persistido) {
      const yaExiste = borradores.some((s, i) => i !== editingId && s.nombre.trim().toLowerCase() === form.nombre.trim().toLowerCase())
      if (yaExiste) { toast.warning('Ya agregaste una sucursal con ese nombre'); return }
      // Solo una puede ser la principal.
      const limpias = form.isPrincipal ? borradores.map(s => ({ ...s, isPrincipal: false })) : [...borradores]
      if (editingId === null) limpias.push({ ...form })
      else limpias[editingId] = { ...form }
      onBorradoresChange(limpias)
      reset()
      return
    }

    const data = sucursalToPayload(form)
    const onError = e => toast.error(e.response?.data?.error || 'Error al guardar sucursal')
    if (editingId) updateSucursal.mutate({ clienteId: cliente.id, sucursalId: editingId, data }, { onSuccess: reset, onError })
    else createSucursal.mutate({ clienteId: cliente.id, data }, { onSuccess: reset, onError })
  }

  function quitarBorrador(indice) {
    onBorradoresChange(borradores.filter((_, i) => i !== indice))
    if (editingId === indice) reset()
  }

  return (
    <>
      <FormDivider label={`Sucursales / direcciones (${sucursales.length})`} />
      {!persistido && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -6, marginBottom: 10 }}>
          Se crearán junto con el cliente al guardar.
        </div>
      )}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
        {sucursales.length === 0
          ? <div style={{ padding: 16, color: 'var(--text-3)', fontSize: 13 }}>Sin sucursales registradas.</div>
          : sucursales.map((s, i) => (
            <div key={persistido ? s.id : `borrador-${i}`} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: '#fff' }}>
              <button type="button" onClick={() => edit(s, i)} style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1fr', gap: 12, flex: 1, padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{s.nombre} {s.isPrincipal ? <span style={{ color: 'var(--green-700)', fontSize: 11 }}>(Principal)</span> : null}</span>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{[s.direccion, s.comuna, s.region].filter(Boolean).join(', ') || '-'}</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{s.contacto || s.telefono || '-'}</span>
              </button>
              {!persistido && (
                <button type="button" onClick={() => quitarBorrador(i)} title="Quitar" style={{ padding: '10px 14px', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 16 }}>×</button>
              )}
            </div>
          ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
        <FormField label="Nombre"><Input value={form.nombre} onChange={v => field('nombre', v)} placeholder="Casa matriz, sede norte..." /></FormField>
        <FormField label="Direccion"><Input value={form.direccion} onChange={v => field('direccion', v)} placeholder="Calle y numero" /></FormField>
        <FormField label="País">
          <Select value={form.pais} onChange={v => { field('pais', v); if (v !== 'Chile') { field('region', ''); field('comuna', '') } }} options={withCurrentValue(PAISES_LATAM, form.pais)} />
        </FormField>
        <FormField label="Región">
          {form.pais === 'Chile'
            ? <Select value={form.region} onChange={v => { field('region', v); field('comuna', '') }} options={['', ...withCurrentValue(REGIONES_CHILE, form.region)]} />
            : <Input value={form.region} onChange={v => field('region', v)} />}
        </FormField>
        <FormField label="Comuna">
          {form.pais === 'Chile'
            ? <Select value={form.comuna} onChange={v => field('comuna', v)} options={['', ...withCurrentValue(COMUNAS_POR_REGION[form.region] || [], form.comuna)]} disabled={!form.region} />
            : <Input value={form.comuna} onChange={v => field('comuna', v)} />}
        </FormField>
        <FormField label="Contacto"><Input value={form.contacto} onChange={v => field('contacto', v)} /></FormField>
        <FormField label="Telefono"><Input value={form.telefono} onChange={v => field('telefono', v)} /></FormField>
        <FormField label="Email"><Input type="email" value={form.email} onChange={v => field('email', v)} /></FormField>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center', gridColumn: 'span 2' }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-2)' }}>
            <input type="checkbox" checked={form.isPrincipal} onChange={e => field('isPrincipal', e.target.checked)} />
            Principal
          </label>
          <button type="button" onClick={save} disabled={saving} style={smallBtn('var(--green-700)', saving)}>
            {editingId !== null ? 'Actualizar' : 'Agregar'}
          </button>
          {editingId !== null && <button type="button" onClick={reset} style={smallBtn('var(--text-2)')}>Cancelar</button>}
        </div>
      </div>
    </>
  )
}

const smallBtn = (color, disabled = false) => ({
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: '#fff',
  color,
  fontSize: 12,
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
})
