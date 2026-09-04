import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast, confirmDialog } from '../../store/notif'
import { Badge, KpiCard, PageHeader, Btn, SearchBar, Table, FilterSelect } from '../../components/shared'
import { useDeleteUsuario, useUsuarios } from '../../api/usuarios'
import { useAuthStore } from '../../store/auth'

const ROLES = ['admin', 'vendedor', 'coordinador_comercial', 'bodeguero', 'cajero', 'taller', 'taller_operario', 'rrhh', 'solo_lectura']
const ROLE_LABELS = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
  coordinador_comercial: 'Coordinación comercial',
  bodeguero: 'Bodeguero',
  cajero: 'Cajero',
  taller: 'Taller',
  taller_operario: 'Operario de taller',
  rrhh: 'RRHH',
  solo_lectura: 'Solo lectura',
}

export default function UsuariosPage() {
  const navigate = useNavigate()
  const currentUser = useAuthStore(s => s.user)
  const { data: usuarios = [], isLoading } = useUsuarios()
  const deleteU = useDeleteUsuario()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('all')

  const filtered = usuarios.filter(user => {
    const haystack = [user.nombre, user.email, user.rut, user.codigoVendedor, user.cargo, user.sucursalNombre, user.role]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase())
    const matchesRole = !roleFilter || user.role === roleFilter
    const matchesEstado = estadoFilter === 'all' || (estadoFilter === 'activo' ? user.activo : !user.activo)
    return matchesSearch && matchesRole && matchesEstado
  })

  const handleDelete = async user => {
    if (!await confirmDialog({ title: 'Dar de baja usuario', detail: `Se bloqueará el acceso de ${user.nombre}. Sus registros históricos se conservan.`, tone: 'danger' })) return
    deleteU.mutate(user.id, {
      onSuccess: () => toast.success(`${user.nombre} quedó inactivo`),
      onError: error => toast.error(error.response?.data?.error || 'No se pudo dar de baja el usuario'),
    })
  }

  const cols = [
    { key: 'nombre', label: 'Nombre', render: (value, row) => <button type="button" onClick={() => navigate(`/usuarios/${row.id}`)} style={nameButtonStyle}>{value}</button> },
    { key: 'email', label: 'Usuario / Email', render: value => mono(value) },
    { key: 'role', label: 'Nivel', render: value => <Badge tone={value === 'admin' ? 'blue' : 'gray'}>{ROLE_LABELS[value] || value}</Badge> },
    { key: 'sucursalNombre', label: 'Sucursal', render: value => value || 'Sin sucursal' },
    { key: 'codigoVendedor', label: 'Cód. vendedor', render: value => mono(value) },
    { key: 'cargo', label: 'Cargo', render: value => value || '-' },
    { key: 'rut', label: 'RUT', render: value => mono(value) },
    { key: 'permisoDescuentos', label: 'Descuentos', render: value => value ? <Badge tone="green">Sí</Badge> : <Badge tone="gray">No</Badge> },
    { key: '_permisos', label: 'Acceso', render: (_, row) => {
      const count = Object.keys(row.permisosExtra || {}).length
      return <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Rol {row.role}{count ? ` + ${count} extra` : ''}</span>
    } },
    { key: 'tiposVentaPermitidos', label: 'Tipos de venta', render: value => !Array.isArray(value) ? <Badge tone="green">Todos</Badge> : <Badge tone="blue">{value.length} tipo{value.length !== 1 ? 's' : ''}</Badge> },
    { key: 'activo', label: 'Estado', render: value => value ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Inactivo</Badge> },
    { key: '_acc', label: 'Acciones', render: (_, row) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" onClick={() => navigate(`/usuarios/${row.id}`)} style={btnStyle}>Ver</button>
        <button type="button" onClick={() => navigate(`/usuarios/${row.id}/editar`)} style={btnStyle}>Editar</button>
        {row.id !== currentUser?.id && row.activo && <button type="button" onClick={() => handleDelete(row)} style={{ ...btnStyle, color: 'var(--red)' }}>Baja</button>}
      </div>
    ) },
  ]

  const activos = usuarios.filter(user => user.activo).length
  const admins = usuarios.filter(user => user.role === 'admin' && user.activo).length
  const conExtra = usuarios.filter(user => Object.keys(user.permisosExtra || {}).length > 0).length
  const hasActiveFilters = Boolean(roleFilter || estadoFilter !== 'all' || search)
  const resetAllFilters = () => {
    setRoleFilter('')
    setEstadoFilter('all')
    setSearch('')
  }

  const toolbarExtra = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', width: '100%', padding: '2px 0' }}>
      <FilterSelect value={roleFilter} onChange={setRoleFilter} options={[{ value: '', label: 'Todos los niveles' }, ...ROLES.map(role => ({ value: role, label: ROLE_LABELS[role] || role }))]} placeholder="Nivel" active={Boolean(roleFilter)} minMenuWidth={210} />
      <FilterSelect value={estadoFilter} onChange={setEstadoFilter} options={[{ value: 'all', label: 'Todos los estados' }, { value: 'activo', label: 'Activos' }, { value: 'inactivo', label: 'Inactivos' }]} placeholder="Estado" active={estadoFilter !== 'all'} minMenuWidth={160} />
      {hasActiveFilters && <button type="button" onClick={resetAllFilters} style={clearButtonStyle}>Limpiar filtros</button>}
      <div style={{ marginLeft: 'auto' }}>
        <SearchBar placeholder="Buscar usuario, RUT, vendedor o sucursal..." value={search} onChange={setSearch} style={{ width: 320, height: 28 }} />
      </div>
    </div>
  )

  return (
    <main className="page page-wide">
      <PageHeader title="Usuarios" actions={<Btn variant="primary" icon="plusCircle" size="sm" onClick={() => navigate('/usuarios/nuevo')}>Nuevo usuario</Btn>} />
      <div className="kpi-strip">
        <KpiCard label="Total" value={usuarios.length} icon="users" sublabel="Cuentas registradas" />
        <KpiCard label="Activos" value={activos} icon="check" tone="neutral" sublabel="Pueden ingresar" />
        <KpiCard label="Admins activos" value={admins} icon="key" sublabel="Acceso total" />
        <KpiCard label="Permisos extra" value={conExtra} icon="settings" tone="amber" sublabel="Con excepciones al rol" />
      </div>
      <div style={tablePanelStyle}>
        {isLoading
          ? <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando usuarios…</div>
          : <Table columns={cols} rows={filtered} emptyMessage="Sin usuarios para los filtros elegidos" keyboard onRowDoubleClick={row => navigate(`/usuarios/${row.id}`)} ariaLabel="Usuarios" getRowKey={row => row.id} toolbarExtra={toolbarExtra} />}
      </div>
    </main>
  )
}

const mono = value => value ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-2)' }}>{value}</span> : '-'
const nameButtonStyle = { border: 'none', background: 'none', padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--green-800)', cursor: 'pointer', textAlign: 'left' }
const btnStyle = { padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--green-700)', fontWeight: 500 }
const tablePanelStyle = { background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }
const clearButtonStyle = { height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--amber-300, #fcd34d)', background: 'var(--amber-50, #fffbeb)', color: 'var(--amber-900, #78350f)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
