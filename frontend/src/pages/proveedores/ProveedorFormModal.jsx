import { toast } from '../../store/notif'
import { useState } from 'react'
import { useCreateProveedor, useUpdateProveedor } from '../../api/proveedores'

export default function ProveedorFormModal({ proveedor, onClose }) {
  const isEdit = !!proveedor?.id
  const [form, setForm] = useState({
    nombre: proveedor?.nombre || '',
    razonSocial: proveedor?.razonSocial || '',
    rut: proveedor?.rut || '',
    giro: proveedor?.giro || '',
    email: proveedor?.email || '',
    telefono: proveedor?.telefono || '',
    direccion: proveedor?.direccion || '',
    region: proveedor?.region || '',
    comuna: proveedor?.comuna || '',
    codigoProveedor: proveedor?.codigoProveedor || '',
    porcVentaSala: proveedor?.porcVentaSala || '',
    porcMarco: proveedor?.porcMarco || '',
    porcLicitacion: proveedor?.porcLicitacion || '',
  })
  const create = useCreateProveedor()
  const update = useUpdateProveedor()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const requiredFields = ['nombre', 'razonSocial', 'rut', 'giro', 'email', 'telefono', 'direccion', 'region', 'comuna']
  const handleSave = () => {
    for (const field of requiredFields) {
      if (!String(form[field] || '').trim()) return toast.warning(`${field} requerido`)
    }
    if (form.nombre.trim().length < 4) return toast.warning('Nombre debe tener al menos 4 caracteres')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return toast.warning('Email invalido')
    const payload = { ...form }
    if (isEdit) update.mutate({ id: proveedor.id, ...payload }, { onSuccess: onClose, onError: err => toast.error(err?.response?.data?.error || 'No se pudo guardar') })
    else create.mutate(payload, { onSuccess: onClose, onError: err => toast.error(err?.response?.data?.error || 'No se pudo crear') })
  }
  const pending = create.isPending || update.isPending
  const inp = { width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'oklch(0 0 0 / 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 12, padding: '20px 22px' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>{isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          {[
            ['Nombre *', 'nombre'], ['Razon social *', 'razonSocial'],
            ['RUT *', 'rut'], ['Codigo', 'codigoProveedor'],
            ['Giro *', 'giro'], ['Email *', 'email'],
            ['Telefono *', 'telefono'], ['Direccion *', 'direccion'],
            ['Region *', 'region'], ['Comuna *', 'comuna'],
            ['Mg. Sala %', 'porcVentaSala'], ['Mg. Marco %', 'porcMarco'],
            ['Mg. Lic. %', 'porcLicitacion'],
          ].map(([label, key]) => (
            <div key={key}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>{label}</div>
              <input
                value={form[key]}
                onChange={e => set(key, e.target.value)}
                type={['codigoProveedor', 'porcVentaSala', 'porcMarco', 'porcLicitacion'].includes(key) ? 'number' : key === 'email' ? 'email' : 'text'}
                min={key === 'codigoProveedor' ? 1 : undefined}
                step="1"
                style={inp}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: 'var(--text-2)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={pending} style={{ padding: '7px 14px', background: 'var(--green-600)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{pending ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
