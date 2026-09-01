import { toast, confirmDialog } from '../../store/notif'
import { Fragment, useState } from 'react'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, FilterSelect } from '../../components/shared'
import { useDeleteUsuario, useUsuarios, useCreateUsuario, useUpdateUsuario, useUpdatePermisos } from '../../api/usuarios'
import { useSucursales } from '../../api/locations'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { TIPO_VENTA_OPCIONES } from '../../utils/ventaEstados'

const ROLES = ['admin', 'vendedor', 'coordinador_comercial', 'bodeguero', 'cajero', 'taller', 'taller_operario', 'rrhh', 'solo_lectura']

// Espejo de MODULES y MODULE_FUNCTIONS en backend/src/routes/usuarios/index.js.
// Si se ofrece aca algo que el backend no acepta, guardar responde 400; si falta
// algo que el backend si exige, ese permiso no se puede delegar desde la UI.
// Ambas cosas pasaban: 'cotizaciones' ya no existe en el backend y 'usuarios',
// 'config', 'admin' y 'ai' no se ofrecian aunque el codigo los exige.
//
// El tercer elemento son las funciones delegables dentro del modulo. Sin marcar
// ninguna, el permiso del modulo cubre todas sus funciones, como siempre.
const MODULOS = [
  ['ventas', 'Ventas', [
    ['crear', 'Crear venta'],
    ['editar', 'Editar venta y cargos'],
    ['entregas', 'Marcar entregas — bodega'],
    ['taller', 'Enviar orden a taller'],
    ['anular', 'Anular y reactivar'],
  ]],
  ['licitaciones', 'Licitaciones'],
  ['clientes', 'Clientes'],
  ['bodega', 'Bodega', [
    ['movimientos', 'Entradas y salidas'],
    ['ajustes', 'Ajustes y mermas'],
    ['compras', 'OC a proveedores'],
  ]],
  ['catalogo', 'Catalogo'],
  ['proveedores', 'Proveedores'],
  ['despacho', 'Despacho', [
    ['packing', 'Armar packing'],
    ['guias', 'Emitir y editar guias'],
  ]],
  ['taller', 'Taller / Bodega Taller / Telas', [
    ['avance', 'Registrar avance y consumos'],
    ['gestion', 'Crear, editar y asignar OT'],
    ['cerrar', 'Cerrar y anular OT'],
    ['materiales', 'Materiales de taller'],
  ]],
  ['caja', 'Caja'],
  ['cobranza', 'Cobranza'],
  ['facturacion', 'Facturación electrónica', [
    ['emitir', 'Emitir y enviar DTE'],
    ['anular', 'Notas de credito y anulacion'],
    ['folios', 'CAF y ajuste de folios'],
  ]],
  ['descuentos', 'Descuentos'],
  ['rrhh', 'RRHH'],
  ['costeo', 'Costeo de fabricación'],
  ['reportes', 'Reportes'],
  ['usuarios', 'Usuarios y accesos'],
  ['config', 'Configuración'],
  ['admin', 'Administración'],
  ['ai', 'Asistente IA'],
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
    const haystack = [u.nombre, u.email, u.rut, u.codigoVendedor, u.cargo, u.sucursalNombre, u.role].filter(Boolean).join(' ').toLowerCase()
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
    { key: 'cargo', label: 'Cargo' },
    { key: 'rut', label: 'RUT', render: v => mono(v) },
    { key: 'permisoDescuentos', label: 'Descuentos', render: v => v ? <Badge tone="green">Si</Badge> : <Badge tone="gray">No</Badge> },
    { key: 'permisoAprobarDescuentos', label: 'Aprueba dctos.', render: v => v ? <Badge tone="green">Si</Badge> : <Badge tone="gray">No</Badge> },
    { key: '_permisos', label: 'Acceso', render: (_, row) => {
      const count = Object.keys(row.permisosExtra || {}).length
      return <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
        Rol {row.role}{count ? ` + ${count} extra` : ''}
      </span>
    }},
    { key: 'tiposVentaPermitidos', label: 'Tipos de venta', render: value => {
      if (!Array.isArray(value)) return <Badge tone="green">Todos</Badge>
      return <Badge tone="blue">{value.length} tipo{value.length !== 1 ? 's' : ''}</Badge>
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

  const hasActiveFilters = Boolean(roleFilter || estadoFilter !== 'all' || search)

  const resetAllFilters = () => {
    setRoleFilter('')
    setEstadoFilter('all')
    setSearch('')
  }

  const roleOptions = [
    { value: '', label: 'Todos' },
    ...ROLES.map(r => ({ value: r, label: r })),
  ]

  const estadoOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'activo', label: 'Activos' },
    { value: 'inactivo', label: 'Inactivos' },
  ]

  const toolbarExtra = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', width: '100%', padding: '2px 0' }}>
      <FilterSelect
        value={roleFilter}
        onChange={setRoleFilter}
        options={roleOptions}
        placeholder="Nivel"
        active={Boolean(roleFilter)}
        minMenuWidth={210}
      />
      <FilterSelect
        value={estadoFilter}
        onChange={setEstadoFilter}
        options={estadoOptions}
        placeholder="Estado"
        active={estadoFilter !== 'all'}
        minMenuWidth={160}
      />
      {hasActiveFilters && (
        <button
          type="button"
          onClick={resetAllFilters}
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 6,
            border: '1px solid var(--amber-300, #fcd34d)',
            background: 'var(--amber-50, #fffbeb)',
            color: 'var(--amber-900, #78350f)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'background 0.15s',
          }}
        >
          Limpiar filtros
        </button>
      )}
      <div style={{ marginLeft: 'auto' }}>
        <SearchBar
          placeholder="Buscar usuario, RUT, vendedor o sucursal..."
          value={search}
          onChange={setSearch}
          style={{ width: 320, height: 28 }}
        />
      </div>
    </div>
  )

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
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando...</div>
          : <Table
              columns={cols}
              rows={filtered}
              emptyMessage="Sin usuarios"
              keyboard
              onRowDoubleClick={row => setEditing(row)}
              ariaLabel="Usuarios"
              getRowKey={row => row.id}
              toolbarExtra={toolbarExtra}
            />
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
    cargo: '',
    sucursalId: '',
    permisoDescuentos: false,
    permisoAprobarDescuentos: false,
    tiposVentaPermitidos: null,
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
    cargo: user.cargo || '',
    sucursalId: user.sucursalId != null ? String(user.sucursalId) : '',
    permisoDescuentos: Boolean(user.permisoDescuentos),
    permisoAprobarDescuentos: Boolean(user.permisoAprobarDescuentos),
    tiposVentaPermitidos: Array.isArray(user.tiposVentaPermitidos) ? user.tiposVentaPermitidos : null,
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
        {[['datos', 'Datos'], ['efectivos', 'Permisos efectivos'], ['permisos', 'Permisos extra']].map(([id, label]) => (
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
          <div style={infoBoxStyle}>Estos permisos se suman al rol; no muestran lo que ya viene dado por el rol. Revisa la pestaña <strong>Permisos efectivos</strong> para ver el acceso completo.</div>
          <PermisosMatrix role={form.role} permisos={permisos} editable onToggle={togglePerm} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Btn variant="secondary" size="sm" onClick={() => setPermisos({})}>Limpiar todo</Btn>
            <Btn variant="secondary" size="sm" onClick={onClose}>Cancelar</Btn>
            <Btn variant="primary" size="sm" onClick={savePermisos} disabled={updateP.isPending}>{updateP.isPending ? 'Guardando...' : 'Guardar permisos'}</Btn>
          </div>
        </>
      )}

      {tab === 'efectivos' && (
        <>
          <div style={infoBoxStyle}>Vista de lectura: combina el rol <strong>{form.role}</strong> y los permisos extra guardados. Una marca indica acceso real.</div>
          <PermisosMatrix role={form.role} permisos={permisos} />
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
      <Field label="Cargo"><input value={form.cargo} onChange={e => set('cargo', e.target.value)} placeholder="Ej: Ejecutiva Mercado Publico" style={inputStyle} /></Field>
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
      <Field label="Puede aprobar o rechazar descuentos">
        <label style={checkStyle}><input type="checkbox" checked={form.permisoAprobarDescuentos} onChange={e => set('permisoAprobarDescuentos', e.target.checked)} /> Si</label>
      </Field>
      <div style={{ gridColumn: '1 / -1' }}>
        <Field label="Tipos de venta autorizados" hint={form.role === 'vendedor' ? 'Restringe los tipos que este ejecutivo puede consultar, crear y editar. Las ventas existentes no se modifican.' : 'Gerencia y Coordinacion Comercial tienen cobertura transversal por rol; esta matriz se configura para ejecutivos.'}>
          {form.role === 'vendedor' ? <TiposVentaField form={form} set={set} /> : <div style={{ ...infoBoxStyle, margin: 0 }}>Este control se aplica a cuentas con rol vendedor. Para los demas roles se mantiene la cobertura propia de su funcion.</div>}
        </Field>
      </div>
    </div>
  )
}

function TiposVentaField({ form, set }) {
  const sinRestriccion = !Array.isArray(form.tiposVentaPermitidos)
  const seleccionados = form.tiposVentaPermitidos || []
  const toggleTipo = tipo => set('tiposVentaPermitidos', seleccionados.includes(tipo)
    ? seleccionados.filter(item => item !== tipo)
    : [...seleccionados, tipo])
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px' }}>
      <label style={{ ...checkStyle, paddingTop: 0, fontWeight: 600 }}><input type="checkbox" checked={sinRestriccion} onChange={event => set('tiposVentaPermitidos', event.target.checked ? null : [])} /> Todos los tipos de venta</label>
      {!sinRestriccion && <>
        <div style={{ fontSize: 11, color: 'var(--text-3)', margin: '7px 0' }}>Seleccione al menos un tipo antes de guardar.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 12px' }}>
          {TIPO_VENTA_OPCIONES.map(tipo => <label key={tipo} style={{ ...checkStyle, paddingTop: 0 }}><input type="checkbox" checked={seleccionados.includes(tipo)} onChange={() => toggleTipo(tipo)} /> {tipo}</label>)}
        </div>
      </>}
    </div>
  )
}

function PermisosMatrix({ role, permisos, editable = false, onToggle }) {
  const user = { role, permisosExtra: permisos }
  const checked = (clave, permiso) => editable
    ? (permisos[clave] || []).includes(permiso)
    : can(user, clave, permiso)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={{ background: 'var(--bg)' }}><th style={thStyle}>Modulo</th>{PERMS.map(p => <th key={p} style={{ ...thStyle, textAlign: 'center', width: 82 }}>{p}</th>)}</tr></thead>
        <tbody>{MODULOS.map(([mod, label, funciones = []]) => (
          <Fragment key={mod}>
            <PermisosRow label={label} clave={mod} checked={checked} editable={editable} onToggle={onToggle} />
            {funciones.map(([fn, fnLabel]) => <PermisosRow key={`${mod}.${fn}`} label={fnLabel} clave={`${mod}.${fn}`} checked={checked} editable={editable} onToggle={onToggle} nested />)}
          </Fragment>
        ))}</tbody>
      </table>
    </div>
  )
}

function PermisosRow({ label, clave, checked, editable, onToggle, nested = false }) {
  return <tr style={{ borderTop: '1px solid var(--border)' }}>
    <td style={{ padding: nested ? '5px 12px 5px 30px' : '7px 12px', fontWeight: nested ? 400 : 500, fontSize: nested ? 12 : undefined, color: nested ? 'var(--text-2)' : undefined }}>{label}</td>
    {PERMS.map(permiso => <td key={permiso} style={{ padding: nested ? '5px 8px' : '7px 8px', textAlign: 'center' }}><input type="checkbox" checked={checked(clave, permiso)} disabled={!editable} onChange={editable ? () => onToggle(clave, permiso) : undefined} /></td>)}
  </tr>
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
const infoBoxStyle = { marginBottom: 12, padding: '9px 10px', borderRadius: 7, background: 'var(--green-50, #f0fdf4)', color: 'var(--text-2)', fontSize: 12, lineHeight: 1.4 }
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
