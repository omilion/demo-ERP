import { toast, confirmDialog, promptDialog } from '../../store/notif'
import { useState } from 'react'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table } from '../../components/shared'
import { useDeleteUsuario, useUsuarios, useCreateUsuario, useUpdateUsuario, useUpdatePermisos } from '../../api/usuarios'
import { useSucursales } from '../../api/locations'
import { useAuthStore } from '../../store/auth'

const ROLES = ['admin', 'vendedor', 'bodeguero', 'cajero', 'taller', 'rrhh', 'solo_lectura']

const MODULOS = [
  ['ventas', 'Ventas'],
  ['cotizaciones', 'Cotizaciones'],
  ['licitaciones', 'Licitaciones'],
  ['clientes', 'Clientes'],
  ['bodega', 'Bodega'],
  ['catalogo', 'Catalogo'],
  ['proveedores', 'Proveedores'],
  ['despacho', 'Despacho'],
  ['taller', 'Taller / Bodega Taller / Telas'],
  ['caja', 'Caja'],
  ['cobranza', 'Cobranza'],
  ['facturacion', 'Facturación electrónica'],
  ['descuentos', 'Descuentos'],
  ['rrhh', 'RRHH'],
  ['reportes', 'Reportes'],
]
const PERMS = ['read', 'write', 'delete']

export default function UsuariosPage() {
  const currentUser = useAuthStore(s => s.user)
  const { data: usuarios = [], isLoading } = useUsuarios()
  const { data: sucursales = [] } = useSucursales()
  const deleteU = useDeleteUsuario()
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('all')

  const filtered = usuarios.filter(u => {
    const haystack = [u.nombre, u.email, u.rut, u.codigoVendedor, u.sucursalNombre, u.role].filter(Boolean).join(' ').toLowerCase()
    const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase())
    const matchesRole = !roleFilter || u.role === roleFilter
    const matchesEstado = estadoFilter === 'all' || (estadoFilter === 'activo' ? u.activo : !u.activo)
    return matchesSearch && matchesRole && matchesEstado
  })

  const cols = [
    { key: 'nombre', label: 'Nombre', render: v => <span style={{ fontWeight: 600, fontSize: 13 }}>{v}</span> },
    { key: 'email', label: 'Usuario / Email', render: v => mono(v) },
    { key: 'role', label: 'Nivel', render: v => <Badge tone={v === 'admin' ? 'blue' : 'gray'}>{v}</Badge> },
    { key: 'sucursalNombre', label: 'Sucursal', render: v => v || '-' },
    { key: 'codigoVendedor', label: 'Cod Vendedor', render: v => mono(v) },
    { key: 'rut', label: 'RUT', render: v => mono(v) },
    { key: 'permisoDescuentos', label: 'Descuentos', render: v => v ? <Badge tone="green">Si</Badge> : <Badge tone="gray">No</Badge> },
    { key: 'permisosExtra', label: 'Permisos', render: v => {
      if (!v) return <span style={{ color: 'var(--text-3)', fontSize: 12 }}>-</span>
      const count = Object.keys(v).length
      return <Badge tone="amber">{count} modulo{count !== 1 ? 's' : ''}</Badge>
    }},
    { key: 'activo', label: 'Estado', render: v => v ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Inactivo</Badge> },
    { key: '_acc', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => setEditing(row)} style={btnStyle}>Editar</button>
        {row.id !== currentUser?.id && <button onClick={() => handleDelete(row)} style={{ ...btnStyle, color: 'var(--red)' }}>Baja</button>}
      </div>
    )},
  ]

  const handleDelete = async row => {
    if (!await confirmDialog({ title: 'Confirmar', detail: `Dar de baja al usuario ${row.nombre}?`, tone: 'danger' })) return
    deleteU.mutate(row.id, {
      onError: e => toast.error(e.response?.data?.error || 'No se pudo dar de baja'),
    })
  }

  const activos = usuarios.filter(u => u.activo).length
  const admins = usuarios.filter(u => u.role === 'admin').length
  const conExtra = usuarios.filter(u => u.permisosExtra).length

  return (
    <main className="page page-wide">
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
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchBar placeholder="Buscar usuario, RUT, vendedor o sucursal" value={search} onChange={setSearch} style={{ width: 320 }} />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={inputStyle}>
            <option value="">Todos los niveles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)} style={inputStyle}>
            <option value="all">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </div>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
          : <Table columns={cols} rows={filtered} emptyMessage="Sin usuarios" keyboard onRowDoubleClick={row => setEditing(row)} ariaLabel="Usuarios" getRowKey={row => row.id} />
        }
      </div>

      {editing && <EditUsuarioModal user={editing} sucursales={sucursales} onClose={() => setEditing(null)} />}
      {creating && <CreateUsuarioModal sucursales={sucursales} onClose={() => setCreating(false)} />}
    </main>
  )
}

function CreateUsuarioModal({ sucursales, onClose }) {
  const createU = useCreateUsuario()
  const [form, setForm] = useState({
    email: '',
    password: '',
    nombre: '',
    role: 'vendedor',
    rut: '',
    codigoVendedor: '',
    sucursalId: '',
    permisoDescuentos: false,
    activo: true,
  })

  function submit() {
    if (!form.email || !form.password || !form.nombre) { toast.warning('Email, password y nombre requeridos'); return }
    createU.mutate(form, {
      onSuccess: () => onClose(),
      onError: e => toast.error(e.response?.data?.error || 'Error'),
    })
  }

  return (
    <Modal onClose={onClose} title="Nuevo usuario" width={560}>
      <Field label="Usuario / Email"><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} /></Field>
      <UserFields form={form} setForm={setForm} sucursales={sucursales} showPassword />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <Btn variant="secondary" size="sm" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" size="sm" onClick={submit} disabled={createU.isPending}>{createU.isPending ? 'Creando...' : 'Crear'}</Btn>
      </div>
    </Modal>
  )
}

function EditUsuarioModal({ user, sucursales, onClose }) {
  const updateU = useUpdateUsuario()
  const updateP = useUpdatePermisos()
  const [tab, setTab] = useState('datos')
  const [form, setForm] = useState({
    nombre: user.nombre || '',
    role: user.role || 'vendedor',
    rut: user.rut || '',
    codigoVendedor: user.codigoVendedor || '',
    sucursalId: user.sucursalId != null ? String(user.sucursalId) : '',
    permisoDescuentos: Boolean(user.permisoDescuentos),
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
      onError: e => toast.error(e.response?.data?.error || 'Error'),
    })
  }

  function savePermisos() {
    updateP.mutate({ id: user.id, permisosExtra: Object.keys(permisos).length === 0 ? null : permisos }, {
      onSuccess: () => onClose(),
      onError: e => toast.error(e.response?.data?.error || 'Error'),
    })
  }

  return (
    <Modal onClose={onClose} title={`Editar ${user.nombre}`} width={760}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
        {[['datos', 'Datos'], ['permisos', 'Permisos extra']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={tabBtn(tab === id)}>{label}</button>
        ))}
      </div>

      {tab === 'datos' && (
        <>
          <Field label="Usuario / Email" hint="No editable"><input value={user.email} disabled style={{ ...inputStyle, background: 'var(--bg)' }} /></Field>
          <UserFields form={form} setForm={setForm} sucursales={sucursales} passwordHint="Dejar vacio para mantener actual" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Btn variant="secondary" size="sm" onClick={onClose}>Cancelar</Btn>
            <Btn variant="primary" size="sm" onClick={saveDatos} disabled={updateU.isPending}>{updateU.isPending ? 'Guardando...' : 'Guardar'}</Btn>
          </div>
        </>
      )}

      {tab === 'permisos' && (
        <>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={thStyle}>Modulo</th>
                  {PERMS.map(p => <th key={p} style={{ ...thStyle, textAlign: 'center', width: 82 }}>{p}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODULOS.map(([mod, label]) => (
                  <tr key={mod} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 12px', fontWeight: 500 }}>{label}</td>
                    {PERMS.map(p => (
                      <td key={p} style={{ padding: '7px 8px', textAlign: 'center' }}>
                        <input type="checkbox" checked={(permisos[mod] || []).includes(p)} onChange={() => togglePerm(mod, p)} />
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
            <Btn variant="primary" size="sm" onClick={savePermisos} disabled={updateP.isPending}>{updateP.isPending ? 'Guardando...' : 'Guardar permisos'}</Btn>
          </div>
        </>
      )}
    </Modal>
  )
}

function UserFields({ form, setForm, sucursales, showPassword = false, passwordHint }) {
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
      <Field label="Nombre"><input value={form.nombre} onChange={e => set('nombre', e.target.value)} style={inputStyle} /></Field>
      <Field label="Nivel">
        <select value={form.role} onChange={e => set('role', e.target.value)} style={inputStyle}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
      </Field>
      {showPassword && <Field label="Password"><input type="password" value={form.password} onChange={e => set('password', e.target.value)} style={inputStyle} /></Field>}
      {!showPassword && <Field label="Nueva password" hint={passwordHint}><input type="password" value={form.password} onChange={e => set('password', e.target.value)} style={inputStyle} /></Field>}
      <Field label="RUT"><input value={form.rut} onChange={e => set('rut', e.target.value)} style={inputStyle} /></Field>
      <Field label="Codigo vendedor"><input value={form.codigoVendedor} onChange={e => set('codigoVendedor', e.target.value)} style={inputStyle} /></Field>
      <Field label="Sucursal">
        <select value={form.sucursalId} onChange={e => set('sucursalId', e.target.value)} style={inputStyle}>
          <option value="">Sin sucursal</option>
          {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </Field>
      <Field label="Estado">
        <label style={checkStyle}><input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} /> Activo</label>
      </Field>
      <Field label="Permite hacer descuentos">
        <label style={checkStyle}><input type="checkbox" checked={form.permisoDescuentos} onChange={e => set('permisoDescuentos', e.target.checked)} /> Si</label>
      </Field>
    </div>
  )
}

function Modal({ onClose, title, width = 500, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto' }}>
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

const mono = value => value ? <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: 'var(--text-2)' }}>{value}</span> : '-'
const btnStyle = { padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }
const inputStyle = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }
const checkStyle = { display: 'flex', gap: 6, fontSize: 13, alignItems: 'center', cursor: 'pointer', paddingTop: 7 }
const thStyle = { padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }
const tabBtn = active => ({
  padding: '7px 14px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  color: active ? 'var(--green-700)' : 'var(--text-3)',
  borderBottom: active ? '2px solid var(--green-700)' : '2px solid transparent',
})
