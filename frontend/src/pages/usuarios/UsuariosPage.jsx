import { useState } from 'react'
import { Badge, KpiCard, PageHeader, Btn, Table } from '../../components/shared'
import { useUsuarios, useCreateUsuario, useUpdateUsuario, useUpdatePermisos } from '../../api/usuarios'

const ROLES = ['admin', 'vendedor', 'bodeguero', 'cajero', 'taller', 'rrhh', 'solo_lectura']

const MODULOS = [
  'ventas', 'cotizaciones', 'licitaciones', 'clientes',
  'bodega', 'catalogo', 'despacho', 'taller',
  'caja', 'cobranza', 'rrhh',
]
const PERMS = ['read', 'write', 'delete']

export default function UsuariosPage() {
  const { data: usuarios = [], isLoading } = useUsuarios()
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)

  const cols = [
    { key: 'nombre', label: 'Nombre', render: v => <span style={{ fontWeight: 500, fontSize: 13 }}>{v}</span> },
    { key: 'email', label: 'Email', render: v => <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: 'var(--text-2)' }}>{v}</span> },
    { key: 'role', label: 'Rol', render: v => <Badge tone={v === 'admin' ? 'blue' : 'gray'}>{v}</Badge> },
    { key: 'rut', label: 'RUT', render: v => v ? <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: 'var(--text-3)' }}>{v}</span> : '—' },
    { key: 'permisosExtra', label: 'Permisos extra', render: v => {
      if (!v) return <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
      const count = Object.keys(v).length
      return <Badge tone="amber">{count} módulo{count !== 1 ? 's' : ''}</Badge>
    }},
    { key: 'activo', label: 'Estado', render: v => v ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Inactivo</Badge> },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => setEditing(row)} style={btnStyle}>Editar</button>
      </div>
    )},
  ]

  const activos = usuarios.filter(u => u.activo).length
  const admins = usuarios.filter(u => u.role === 'admin').length
  const conExtra = usuarios.filter(u => u.permisosExtra).length

  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        title="Usuarios"
        subtitle={`${usuarios.length} usuarios del sistema`}
        breadcrumb={['Inicio', 'Admin', 'Usuarios']}
        actions={<Btn variant="primary" icon="plusCircle" size="sm" onClick={() => setCreating(true)}>Nuevo Usuario</Btn>}
      />
      <div className="kpi-strip">
        <KpiCard label="Total" value={usuarios.length} icon="users" sublabel="Registrados" />
        <KpiCard label="Activos" value={activos} icon="check" tone="neutral" sublabel="Pueden ingresar" />
        <KpiCard label="Admins" value={admins} icon="key" sublabel="Acceso total" />
        <KpiCard label="Con permisos extra" value={conExtra} icon="settings" tone="amber" sublabel="Granulares" />
      </div>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>
          : <Table columns={cols} rows={usuarios} emptyMessage="Sin usuarios" />
        }
      </div>

      {editing && <EditUsuarioModal user={editing} onClose={() => setEditing(null)} />}
      {creating && <CreateUsuarioModal onClose={() => setCreating(false)} />}
    </main>
  )
}

const btnStyle = { padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }

function CreateUsuarioModal({ onClose }) {
  const createU = useCreateUsuario()
  const [form, setForm] = useState({ email: '', password: '', nombre: '', role: 'vendedor', rut: '', codigoVendedor: '', activo: true })

  function submit() {
    if (!form.email || !form.password || !form.nombre) { alert('Email, password y nombre requeridos'); return }
    createU.mutate(form, {
      onSuccess: () => onClose(),
      onError: e => alert(e.response?.data?.error || 'Error'),
    })
  }

  return (
    <Modal onClose={onClose} title="Nuevo usuario" width={500}>
      <Field label="Nombre"><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={inputStyle} /></Field>
      <Field label="Email"><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} /></Field>
      <Field label="Password"><input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={inputStyle} /></Field>
      <Field label="RUT"><input value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} style={inputStyle} /></Field>
      <Field label="Código vendedor"><input value={form.codigoVendedor} onChange={e => setForm({ ...form, codigoVendedor: e.target.value })} style={inputStyle} /></Field>
      <Field label="Rol">
        <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inputStyle}>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <Btn variant="secondary" size="sm" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" size="sm" onClick={submit} disabled={createU.isPending}>
          {createU.isPending ? 'Creando…' : 'Crear'}
        </Btn>
      </div>
    </Modal>
  )
}

function EditUsuarioModal({ user, onClose }) {
  const updateU = useUpdateUsuario()
  const updateP = useUpdatePermisos()

  const [tab, setTab] = useState('datos')
  const [form, setForm] = useState({
    nombre: user.nombre || '',
    role: user.role || 'vendedor',
    rut: user.rut || '',
    codigoVendedor: user.codigoVendedor || '',
    password: '',
    activo: user.activo,
  })
  const [permisos, setPermisos] = useState(user.permisosExtra || {})

  function togglePerm(modulo, perm) {
    setPermisos(prev => {
      const next = { ...prev }
      const arr = next[modulo] || []
      if (arr.includes(perm)) {
        next[modulo] = arr.filter(p => p !== perm)
        if (next[modulo].length === 0) delete next[modulo]
      } else {
        next[modulo] = [...arr, perm]
      }
      return next
    })
  }

  function saveDatos() {
    const data = { ...form }
    if (!data.password) delete data.password
    updateU.mutate({ id: user.id, data }, {
      onSuccess: () => onClose(),
      onError: e => alert(e.response?.data?.error || 'Error'),
    })
  }

  function savePermisos() {
    updateP.mutate({ id: user.id, permisosExtra: Object.keys(permisos).length === 0 ? null : permisos }, {
      onSuccess: () => onClose(),
      onError: e => alert(e.response?.data?.error || 'Error'),
    })
  }

  return (
    <Modal onClose={onClose} title={`Editar ${user.nombre}`} width={620}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
        {[['datos', 'Datos'], ['permisos', 'Permisos extra']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            background: 'none', border: 'none',
            color: tab === id ? 'var(--green-700)' : 'var(--text-3)',
            borderBottom: tab === id ? '2px solid var(--green-700)' : '2px solid transparent',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'datos' && (
        <>
          <Field label="Email" hint="No editable"><input value={user.email} disabled style={{ ...inputStyle, background: 'var(--bg)' }} /></Field>
          <Field label="Nombre"><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={inputStyle} /></Field>
          <Field label="RUT"><input value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} style={inputStyle} /></Field>
          <Field label="Código vendedor"><input value={form.codigoVendedor} onChange={e => setForm({ ...form, codigoVendedor: e.target.value })} style={inputStyle} /></Field>
          <Field label="Rol">
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inputStyle}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Nueva password" hint="Dejar vacío para mantener actual">
            <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Estado">
            <label style={{ display: 'flex', gap: 6, fontSize: 13, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />
              Activo
            </label>
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Btn variant="secondary" size="sm" onClick={onClose}>Cancelar</Btn>
            <Btn variant="primary" size="sm" onClick={saveDatos} disabled={updateU.isPending}>
              {updateU.isPending ? 'Guardando…' : 'Guardar'}
            </Btn>
          </div>
        </>
      )}

      {tab === 'permisos' && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>
            Otorga permisos adicionales por módulo que se suman a los del rol <strong>{user.role}</strong>.
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase' }}>Módulo</th>
                  {PERMS.map(p => (
                    <th key={p} style={{ padding: '7px 8px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', width: 80 }}>{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULOS.map(mod => (
                  <tr key={mod} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 12px', fontWeight: 500 }}>{mod}</td>
                    {PERMS.map(p => (
                      <td key={p} style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <input type="checkbox"
                          checked={(permisos[mod] || []).includes(p)}
                          onChange={() => togglePerm(mod, p)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Btn variant="secondary" size="sm" onClick={() => setPermisos({})}>Limpiar todo</Btn>
            <Btn variant="secondary" size="sm" onClick={onClose}>Cancelar</Btn>
            <Btn variant="primary" size="sm" onClick={savePermisos} disabled={updateP.isPending}>
              {updateP.isPending ? 'Guardando…' : 'Guardar permisos'}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  )
}

function Modal({ onClose, title, width = 500, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 3, fontWeight: 500 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

const inputStyle = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }
