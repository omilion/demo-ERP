// Editor de sucursales / direcciones de un cliente.
//
// Funciona en dos modos:
//  - Con cliente ya creado: cada cambio se guarda de inmediato contra el API.
//  - Sin cliente todavía (alta): las sucursales se acumulan en una lista local
//    y el formulario que lo contiene las crea después de crear el cliente.

import { useState } from 'react'
import { toast } from '../../store/notif'
import { FormField, Input, Select } from './index'
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

// eslint-disable-next-line react-refresh/only-export-components -- helper compartido por los formularios de cliente.
export function sucursalToPayload(form) {
  return Object.fromEntries(
    Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && !v.trim() ? undefined : v])
  )
}

export function SucursalesCliente({ cliente, borradores = [], onBorradoresChange }) {
  const [form, setForm] = useState(VACIA)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const createSucursal = useCreateClienteSucursal()
  const updateSucursal = useUpdateClienteSucursal()

  const persistido = !!cliente?.id
  const sucursales = persistido ? (cliente.sucursales || []) : borradores
  const saving = createSucursal.isPending || updateSucursal.isPending

  const field = (key, value) => setForm(f => ({ ...f, [key]: value }))
  const reset = () => { setEditingId(null); setForm(VACIA); setShowForm(false) }

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
    setShowForm(true)
  }

  function save() {
    if (!form.nombre.trim()) { toast.warning('Nombre de sucursal requerido'); return }

    // Sin cliente todavía: la sucursal queda en la lista local.
    if (!persistido) {
      const yaExiste = borradores.some((s, i) => i !== editingId && s.nombre.trim().toLowerCase() === form.nombre.trim().toLowerCase())
      if (yaExiste) { toast.warning('Ya agregaste una sucursal con ese nombre'); return }
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
    <div style={{ marginTop: 10 }}>
      {/* Cabecera del bloque de Sucursales */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
            Sucursales / Direcciones Adicionales ({sucursales.length})
          </div>
          {!persistido && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              Se crearán junto con el cliente al guardar.
            </div>
          )}
        </div>

        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 7,
              border: '1px solid var(--green-600)',
              background: '#fff',
              color: 'var(--green-800)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.15s',
            }}
          >
            + Agregar Sucursal
          </button>
        )}
      </div>

      {/* Lista de sucursales registradas o borradores */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: showForm ? 14 : 0, background: '#fff' }}>
        {sucursales.length === 0 ? (
          <div style={{ padding: '14px 16px', color: 'var(--text-3)', fontSize: 12 }}>
            Sin sucursales adicionales registradas. Haz clic en <strong>+ Agregar Sucursal</strong> si este cliente opera en más de una dirección.
          </div>
        ) : (
          sucursales.map((s, i) => (
            <div
              key={persistido ? s.id : `borrador-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                padding: '10px 14px',
                borderBottom: i === sucursales.length - 1 ? 'none' : '1px solid var(--border)',
                background: '#fff',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{s.nombre}</span>
                  {s.isPrincipal && <span style={{ color: 'var(--green-800)', fontSize: 10, fontWeight: 700, background: 'var(--green-100)', padding: '1px 6px', borderRadius: 4 }}>Principal</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {[s.direccion, s.comuna, s.region, s.pais].filter(Boolean).join(', ') || 'Sin dirección'}
                </div>
                {(s.contacto || s.telefono || s.email) && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {[s.contacto ? `Contacto: ${s.contacto}` : null, s.telefono ? `Fono: ${s.telefono}` : null, s.email].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => edit(s, i)}
                  style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--text-2)' }}
                >
                  Editar
                </button>
                {!persistido && (
                  <button
                    type="button"
                    onClick={() => quitarBorrador(i)}
                    title="Quitar sucursal"
                    style={{ padding: '4px 8px', fontSize: 11, fontWeight: 500, borderRadius: 5, border: '1px solid var(--red)', background: '#fff', cursor: 'pointer', color: 'var(--red)' }}
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Formulario colapsable para agregar / editar sucursal */}
      {showForm && (
        <div style={{ border: '1.5px solid var(--green-600)', borderRadius: 10, padding: '16px 18px', background: '#f0fdf4', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-900)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {editingId !== null ? 'Editar sucursal' : 'Nueva sucursal'}
            </span>
            <button type="button" onClick={reset} style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text-3)', cursor: 'pointer' }}>×</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
            <FormField label="Nombre de Sucursal" required>
              <Input value={form.nombre} onChange={v => field('nombre', v)} placeholder="Ej: Sede Norte, Casa Matriz..." />
            </FormField>

            <FormField label="Dirección">
              <Input value={form.direccion} onChange={v => field('direccion', v)} placeholder="Calle y número" />
            </FormField>

            <FormField label="País">
              <Select
                value={form.pais}
                onChange={v => { field('pais', v); if (v !== 'Chile') { field('region', ''); field('comuna', '') } }}
                options={withCurrentValue(PAISES_LATAM, form.pais)}
              />
            </FormField>

            <FormField label="Región">
              {form.pais === 'Chile' ? (
                <Select
                  value={form.region}
                  onChange={v => { field('region', v); field('comuna', '') }}
                  options={['', ...withCurrentValue(REGIONES_CHILE, form.region)]}
                />
              ) : (
                <Input value={form.region} onChange={v => field('region', v)} />
              )}
            </FormField>

            <FormField label="Comuna">
              {form.pais === 'Chile' ? (
                <Select
                  value={form.comuna}
                  onChange={v => field('comuna', v)}
                  options={['', ...withCurrentValue(COMUNAS_POR_REGION[form.region] || [], form.comuna)]}
                  disabled={!form.region}
                />
              ) : (
                <Input value={form.comuna} onChange={v => field('comuna', v)} />
              )}
            </FormField>

            <FormField label="Contacto responsable">
              <Input value={form.contacto} onChange={v => field('contacto', v)} placeholder="Nombre del encargado" />
            </FormField>

            <FormField label="Teléfono / Fono">
              <Input value={form.telefono} onChange={v => field('telefono', v)} placeholder="+56 9..." />
            </FormField>

            <FormField label="Email contacto">
              <Input type="email" value={form.email} onChange={v => field('email', v)} placeholder="sucursal@ejemplo.cl" />
            </FormField>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #bbf7d0' }}>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isPrincipal} onChange={e => field('isPrincipal', e.target.checked)} />
              Marcar como dirección principal
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={reset}
                style={{ padding: '6px 12px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-2)', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', background: 'var(--green-800)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}
              >
                {saving ? 'Guardando…' : (editingId !== null ? 'Actualizar Sucursal' : 'Guardar Sucursal')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
