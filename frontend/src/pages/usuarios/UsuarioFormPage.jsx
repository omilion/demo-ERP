import { Fragment, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormSection, Input, Select } from '../../components/forms'
import { Badge, Btn } from '../../components/shared'
import { useCreateUsuario, useDeleteUsuario, useUpdateUsuario, useUpdateUsuarioPassword, useUsuario } from '../../api/usuarios'
import { useSucursales } from '../../api/locations'
import { useAuthStore } from '../../store/auth'
import { confirmDialog, toast } from '../../store/notif'
import { can } from '../../utils/permissions'
import { TIPO_VENTA_OPCIONES } from '../../utils/ventaEstados'

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

const PERMS = ['read', 'write', 'delete']
const MODULOS = [
  ['ventas', 'Ventas', [['crear', 'Crear venta'], ['editar', 'Editar venta y cargos'], ['entregas', 'Marcar entregas — bodega'], ['taller', 'Enviar orden a taller'], ['anular', 'Anular y reactivar']]],
  ['licitaciones', 'Licitaciones'],
  ['clientes', 'Clientes'],
  ['bodega', 'Bodega', [['movimientos', 'Entradas y salidas'], ['ajustes', 'Ajustes y mermas'], ['compras', 'OC a proveedores']]],
  ['catalogo', 'Catálogo'],
  ['proveedores', 'Proveedores'],
  ['despacho', 'Despacho', [['packing', 'Armar packing'], ['guias', 'Emitir y editar guías']]],
  ['taller', 'Taller / Bodega Taller / Telas', [['avance', 'Registrar avance y consumos'], ['gestion', 'Crear, editar y asignar OT'], ['cerrar', 'Cerrar y anular OT'], ['materiales', 'Materiales de taller']]],
  ['caja', 'Caja'],
  ['cobranza', 'Cobranza'],
  ['facturacion', 'Facturación electrónica', [['emitir', 'Emitir y enviar DTE'], ['anular', 'Notas de crédito y anulación'], ['folios', 'CAF y ajuste de folios']]],
  ['descuentos', 'Descuentos'],
  ['rrhh', 'RRHH'],
  ['costeo', 'Costeo de fabricación'],
  ['reportes', 'Reportes'],
  ['usuarios', 'Usuarios y accesos'],
  ['config', 'Configuración'],
  ['admin', 'Administración'],
  ['ai', 'Asistente IA'],
]

const VACIO = {
  email: '',
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
}

const desdeUsuario = user => ({
  email: user.email || '',
  nombre: user.nombre || '',
  role: user.role || 'vendedor',
  rut: user.rut || '',
  codigoVendedor: user.codigoVendedor || '',
  cargo: user.cargo || '',
  sucursalId: user.sucursalId == null ? '' : String(user.sucursalId),
  permisoDescuentos: Boolean(user.permisoDescuentos),
  permisoAprobarDescuentos: Boolean(user.permisoAprobarDescuentos),
  tiposVentaPermitidos: Array.isArray(user.tiposVentaPermitidos) ? user.tiposVentaPermitidos : null,
  activo: user.activo !== false,
})

const sameJson = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

export default function UsuarioFormPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const currentUser = useAuthStore(state => state.user)
  const logout = useAuthStore(state => state.logout)

  const esNuevo = !id
  const userId = Number(id)
  const userQuery = useUsuario(esNuevo ? null : userId)
  const usuario = userQuery.data

  const [isEditing, setIsEditing] = useState(Boolean(esNuevo || location.pathname.endsWith('/editar')))
  const soloLectura = !esNuevo && !isEditing

  const { data: sucursales = [] } = useSucursales()
  const crear = useCreateUsuario()
  const actualizar = useUpdateUsuario()
  const cambiarPassword = useUpdateUsuarioPassword()
  const deleteU = useDeleteUsuario()

  const [tab, setTab] = useState('datos')
  const [form, setForm] = useState(VACIO)
  const [permisos, setPermisos] = useState({})
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  const sucursalOptions = useMemo(() => [
    { value: '', label: 'Sin sucursal asignada' },
    ...sucursales.map(s => ({ value: String(s.id), label: s.nombre })),
  ], [sucursales])

  // Sincronizar formulario con datos de usuario
  useEffect(() => {
    if (!usuario) return
    setForm(desdeUsuario(usuario))
    setPermisos(usuario.permisosExtra || {})
    setPassword('')
    setPasswordConfirm('')
  }, [usuario])

  // Sincronizar si la ruta cambia explícitamente a /editar
  useEffect(() => {
    if (location.pathname.endsWith('/editar')) {
      setIsEditing(true)
    }
  }, [location.pathname])

  const set = (campo, valor) => setForm(actual => ({ ...actual, [campo]: valor }))
  const setRole = role => setForm(actual => ({
    ...actual,
    role,
    tiposVentaPermitidos: role === 'vendedor' ? actual.tiposVentaPermitidos : null,
  }))

  const guardando = crear.isPending || actualizar.isPending || cambiarPassword.isPending

  const togglePermiso = (modulo, permiso) => {
    setPermisos(actual => {
      const siguiente = { ...actual }
      const permisosModulo = siguiente[modulo] || []
      if (permisosModulo.includes(permiso)) {
        const restantes = permisosModulo.filter(item => item !== permiso)
        if (restantes.length) siguiente[modulo] = restantes
        else delete siguiente[modulo]
      } else {
        siguiente[modulo] = [...permisosModulo, permiso]
      }
      return siguiente
    })
  }

  const validarPassword = (esRequerido = false) => {
    if (!esRequerido && !password && !passwordConfirm) return true
    if (!password || !passwordConfirm) {
      toast.warning('Ingrese la contraseña y su confirmación')
      return false
    }
    if (password.length < 6) {
      toast.warning('La contraseña debe tener al menos 6 caracteres')
      return false
    }
    if (password !== passwordConfirm) {
      toast.warning('La confirmación de contraseña no coincide')
      return false
    }
    if (password !== password.trim()) {
      toast.warning('La contraseña no debe comenzar ni terminar con espacios')
      return false
    }
    return true
  }

  const validarFormulario = () => {
    if (!form.nombre.trim() || !form.role) {
      toast.warning('Nombre y nivel/rol son obligatorios')
      return false
    }
    if (esNuevo) {
      if (!form.email.trim()) {
        toast.warning('El usuario / email es obligatorio')
        return false
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(form.email.trim())) {
        toast.warning('Ingrese un correo electrónico válido')
        return false
      }
      if (!validarPassword(true)) return false
    } else {
      if ((password || passwordConfirm) && !validarPassword(false)) return false
    }

    if (form.role === 'vendedor' && Array.isArray(form.tiposVentaPermitidos) && !form.tiposVentaPermitidos.length) {
      toast.warning('Seleccione al menos un tipo de venta o autorice todos los tipos')
      return false
    }
    return true
  }

  const activarEdicion = () => {
    setIsEditing(true)
    if (usuario) {
      setForm(desdeUsuario(usuario))
      setPermisos(usuario.permisosExtra || {})
    }
    setPassword('')
    setPasswordConfirm('')
  }

  const cancelarEdicion = () => {
    if (esNuevo) {
      navigate('/usuarios')
      return
    }
    if (usuario) {
      setForm(desdeUsuario(usuario))
      setPermisos(usuario.permisosExtra || {})
    }
    setPassword('')
    setPasswordConfirm('')
    setIsEditing(false)
    if (location.pathname.endsWith('/editar')) {
      navigate(`/usuarios/${userId}`, { replace: true })
    }
  }

  const handleDarDeBaja = async () => {
    if (!usuario) return
    const ok = await confirmDialog({
      title: 'Dar de baja usuario',
      detail: `Se bloqueará el acceso al sistema de ${usuario.nombre}. Los registros históricos de ventas y operaciones se conservan.`,
      tone: 'danger',
    })
    if (!ok) return

    deleteU.mutate(usuario.id, {
      onSuccess: () => {
        toast.success(`${usuario.nombre} quedó inactivo`)
        userQuery.refetch()
      },
      onError: error => toast.error(error.response?.data?.error || 'No se pudo dar de baja al usuario'),
    })
  }

  const guardar = async () => {
    if (!validarFormulario()) return

    const payload = {
      nombre: form.nombre.trim(),
      role: form.role,
      rut: form.rut.trim() || null,
      codigoVendedor: form.codigoVendedor.trim() || null,
      cargo: form.cargo.trim() || null,
      sucursalId: form.sucursalId ? Number(form.sucursalId) : null,
      permisoDescuentos: form.permisoDescuentos,
      permisoAprobarDescuentos: form.permisoAprobarDescuentos,
      activo: form.activo,
    }

    if (esNuevo) {
      payload.email = form.email.trim().toLowerCase()
      payload.password = password
      payload.permisosExtra = Object.keys(permisos).length ? permisos : null
      payload.tiposVentaPermitidos = form.role === 'vendedor' ? form.tiposVentaPermitidos : null
    } else {
      if (!sameJson(permisos, usuario.permisosExtra || {})) {
        payload.permisosExtra = Object.keys(permisos).length ? permisos : null
      }
      if (!sameJson(form.tiposVentaPermitidos, Array.isArray(usuario.tiposVentaPermitidos) ? usuario.tiposVentaPermitidos : null)) {
        payload.tiposVentaPermitidos = form.role === 'vendedor' ? form.tiposVentaPermitidos : null
      }
      // CRÍTICO: Incluir la contraseña si fue ingresada al guardar
      if (password) {
        payload.password = password.trim()
      }
    }

    try {
      if (esNuevo) {
        const nuevoUsuario = await crear.mutateAsync(payload)
        toast.success('Usuario creado exitosamente')
        navigate(`/usuarios/${nuevoUsuario.id}`, { replace: true })
      } else {
        await actualizar.mutateAsync({ id: userId, data: payload })
        const passwordCambiada = Boolean(password)
        setPassword('')
        setPasswordConfirm('')
        setIsEditing(false)

        if (passwordCambiada && Number(currentUser?.id) === userId) {
          toast.success('Contraseña actualizada. Inicia sesión nuevamente con tu nueva contraseña.')
          logout()
          navigate('/login', { replace: true })
          return
        }

        if (Number(currentUser?.id) === userId) {
          useAuthStore.getState().updateUser({
            nombre: payload.nombre,
            cargo: payload.cargo,
            rut: payload.rut,
          })
        }

        toast.success(passwordCambiada ? 'Usuario y contraseña actualizados correctamente' : 'Usuario actualizado correctamente')
        if (location.pathname.endsWith('/editar')) {
          navigate(`/usuarios/${userId}`, { replace: true })
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'No se pudo guardar el usuario')
    }
  }

  // Acción directa para actualizar solo contraseña
  const guardarSoloPassword = async () => {
    if (!validarPassword(true)) return
    try {
      await cambiarPassword.mutateAsync({ id: userId, password: password.trim() })
      setPassword('')
      setPasswordConfirm('')
      if (Number(currentUser?.id) === userId) {
        logout()
        toast.success('Contraseña actualizada. Inicia sesión nuevamente con la nueva contraseña.')
        navigate('/login', { replace: true })
        return
      }
      toast.success('Contraseña actualizada con éxito. Las sesiones activas de este usuario fueron cerradas.')
    } catch (error) {
      toast.error(error.response?.data?.error || 'No se pudo actualizar la contraseña')
    }
  }

  if (!esNuevo && userQuery.isLoading) {
    return (
      <main style={{ maxWidth: 1360, margin: '0 auto', padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)' }}>
        Cargando ficha de usuario…
      </main>
    )
  }

  if (!esNuevo && (!usuario || userQuery.isError)) {
    return (
      <main style={{ maxWidth: 1360, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>Usuario no encontrado</div>
        <Btn variant="ghost" onClick={() => navigate('/usuarios')}>← Volver a la lista de usuarios</Btn>
      </main>
    )
  }

  const titulo = esNuevo ? 'Nuevo usuario' : (isEditing ? `Editar: ${usuario.nombre}` : usuario.nombre)

  const headerActions = soloLectura ? (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Btn variant="ghost" onClick={() => navigate('/usuarios')}>← Volver a usuarios</Btn>
      {usuario?.id !== currentUser?.id && usuario?.activo && (
        <Btn variant="secondary" onClick={handleDarDeBaja} style={{ color: 'var(--red-700, #b91c1c)' }}>
          Dar de baja
        </Btn>
      )}
      <Btn variant="primary" icon="edit" onClick={activarEdicion}>
        Editar usuario
      </Btn>
    </div>
  ) : (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Btn variant="ghost" onClick={cancelarEdicion} disabled={guardando}>
        Cancelar
      </Btn>
      <Btn variant="primary" icon={guardando ? 'refreshCw' : 'check'} onClick={guardar} disabled={guardando}>
        {guardando ? 'Guardando…' : esNuevo ? 'Crear usuario' : 'Guardar cambios'}
      </Btn>
    </div>
  )

  const footerActions = headerActions

  return (
    <FormPage title={titulo} headerActions={headerActions} footerActions={footerActions}>
      {!esNuevo && usuario && (
        <UserIdentityCard usuario={usuario} sucursales={sucursales} soloLectura={soloLectura} onEditar={activarEdicion} />
      )}

      {isEditing && !esNuevo && (
        <div style={modeNoticeStyle}>
          <span style={{ fontSize: 14 }}>✏️</span>
          <div>
            <strong>Modo edición activo.</strong> Puedes modificar la información del usuario, cambiar su contraseña o ajustar sus permisos. Al finalizar, haz clic en <strong>Guardar cambios</strong>.
          </div>
        </div>
      )}

      <div style={tabsStyle}>
        <Tab active={tab === 'datos'} onClick={() => setTab('datos')}>Datos y acceso</Tab>
        <Tab active={tab === 'permisos'} onClick={() => setTab('permisos')}>
          {soloLectura ? 'Permisos efectivos' : 'Matriz de permisos'}
        </Tab>
      </div>

      {tab === 'datos' && (
        <>
          {soloLectura ? (
            <ReadOnlyUserView usuario={usuario} sucursales={sucursales} />
          ) : (
            <>
              <FormSection title="Identidad y organización">
                <div style={gridStyle}>
                  <FormField
                    label="Usuario / Email"
                    required={esNuevo}
                    hint={esNuevo ? 'Será la credencial de ingreso y no se podrá modificar posteriormente.' : 'Identificador de acceso (no modificable por trazabilidad de operaciones).'}
                  >
                    <Input
                      type="email"
                      value={form.email}
                      onChange={value => set('email', value)}
                      placeholder="nombre.apellido@plastimar.cl"
                      disabled={!esNuevo}
                      autoComplete="username"
                    />
                  </FormField>

                  <FormField label="Nombre completo" required>
                    <Input
                      value={form.nombre}
                      onChange={value => set('nombre', value)}
                      placeholder="Ej. Juan Pérez"
                    />
                  </FormField>

                  <FormField label="Nivel / Rol" required hint="Determina los accesos y atribuciones base en el sistema.">
                    <Select
                      value={form.role}
                      onChange={setRole}
                      options={ROLES.map(role => ({ value: role, label: ROLE_LABELS[role] || role }))}
                    />
                  </FormField>

                  <FormField label="Cargo">
                    <Input
                      value={form.cargo}
                      onChange={value => set('cargo', value)}
                      placeholder="Ej. Ejecutiva Mercado Público"
                    />
                  </FormField>

                  <FormField label="RUT">
                    <Input
                      value={form.rut}
                      onChange={value => set('rut', value)}
                      placeholder="12.345.678-9"
                    />
                  </FormField>

                  <FormField label="Código de vendedor" hint="Vincula comisiones y asignación en órdenes de venta.">
                    <Input
                      value={form.codigoVendedor}
                      onChange={value => set('codigoVendedor', value)}
                      placeholder="Ej. 1058"
                    />
                  </FormField>

                  <FormField label="Sucursal">
                    <Select
                      value={form.sucursalId}
                      onChange={value => set('sucursalId', value)}
                      options={sucursalOptions}
                    />
                  </FormField>

                  <FormField label="Estado de la cuenta" hint="Un usuario inactivo no podrá iniciar sesión.">
                    <label style={checkboxStyle}>
                      <input
                        type="checkbox"
                        checked={form.activo}
                        onChange={event => set('activo', event.target.checked)}
                      />
                      <span>Usuario activo</span>
                    </label>
                  </FormField>
                </div>
              </FormSection>

              <FormSection title="Atribuciones comerciales" tone="inventory">
                <div style={gridStyle}>
                  <FormField label="Descuentos en ventas">
                    <label style={checkboxStyle}>
                      <input
                        type="checkbox"
                        checked={form.permisoDescuentos}
                        onChange={event => set('permisoDescuentos', event.target.checked)}
                      />
                      <span>Permite solicitar o aplicar descuentos</span>
                    </label>
                  </FormField>

                  <FormField label="Aprobación de descuentos">
                    <label style={checkboxStyle}>
                      <input
                        type="checkbox"
                        checked={form.permisoAprobarDescuentos}
                        onChange={event => set('permisoAprobarDescuentos', event.target.checked)}
                      />
                      <span>Puede autorizar o rechazar solicitudes de descuento</span>
                    </label>
                  </FormField>
                </div>

                <FormField
                  label="Tipos de venta autorizados"
                  hint={form.role === 'vendedor' ? 'Restringe qué canales de venta puede gestionar este ejecutivo.' : `No aplica para el rol ${ROLE_LABELS[form.role] || form.role} (cobertura total por rol).`}
                >
                  {form.role === 'vendedor' ? (
                    <TiposVentaField form={form} set={set} disabled={false} />
                  ) : (
                    <div style={infoBoxStyle}>
                      El rol <strong>{ROLE_LABELS[form.role] || form.role}</strong> no restringe canales de venta; la cobertura se rige por las atribuciones de su rol base.
                    </div>
                  )}
                </FormField>
              </FormSection>

              <FormSection title="Credenciales de acceso" tone="price">
                <div style={gridStyle}>
                  <FormField
                    label={esNuevo ? 'Contraseña inicial' : 'Nueva contraseña'}
                    required={esNuevo}
                    hint="Mínimo 6 caracteres. Si no deseas cambiarla, déjala en blanco."
                  >
                    <Input
                      type="password"
                      value={password}
                      onChange={setPassword}
                      placeholder={esNuevo ? 'Ingrese contraseña segura' : 'Dejar en blanco para mantener la actual'}
                      disabled={cambiarPassword.isPending}
                      autoComplete="new-password"
                    />
                  </FormField>

                  <FormField
                    label="Confirmar contraseña"
                    required={esNuevo || Boolean(password)}
                    hint="Vuelva a escribir la contraseña para confirmar."
                  >
                    <Input
                      type="password"
                      value={passwordConfirm}
                      onChange={setPasswordConfirm}
                      placeholder="Repita la contraseña"
                      disabled={cambiarPassword.isPending}
                      autoComplete="new-password"
                    />
                  </FormField>
                </div>

                {!esNuevo && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      💡 La contraseña se actualiza automáticamente al pulsar <strong>Guardar cambios</strong>. Si prefieres cambiar únicamente la clave sin guardar otros campos, pulsa el botón a la derecha.
                    </div>
                    <Btn
                      variant="secondary"
                      size="sm"
                      onClick={guardarSoloPassword}
                      disabled={cambiarPassword.isPending || (!password && !passwordConfirm)}
                    >
                      {cambiarPassword.isPending ? 'Actualizando…' : 'Actualizar solo contraseña'}
                    </Btn>
                  </div>
                )}
              </FormSection>
            </>
          )}
        </>
      )}

      {tab === 'permisos' && (
        <FormSection title="Matriz de acceso efectivo">
          <div style={{ ...infoBoxStyle, marginBottom: 16 }}>
            {soloLectura ? (
              <>
                <strong>Vista de lectura de permisos.</strong> Las casillas marcadas indican el acceso real que posee el usuario. Las etiquetas <strong>Rol</strong> indican permisos heredados del rol base; las etiquetas <strong>+Extra</strong> indican excepciones específicas asignadas a este usuario.
              </>
            ) : (
              <>
                <strong>Configuración de permisos adicionales.</strong> El rol asigna el acceso base. Agrega casillas para conceder permisos adicionales. Los permisos provistos por el rol se marcan como <strong>Rol</strong> y no pueden ser desactivados individualmente.
              </>
            )}
          </div>

          {!soloLectura && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Los permisos adicionales se guardan junto con los datos del usuario.</span>
              <Btn variant="ghost" size="sm" onClick={() => setPermisos({})}>Limpiar permisos extra</Btn>
            </div>
          )}

          <PermisosMatrix role={form.role} permisos={permisos} editable={!soloLectura} onToggle={togglePermiso} />
        </FormSection>
      )}
    </FormPage>
  )
}

function UserIdentityCard({ usuario, sucursales, soloLectura, onEditar }) {
  const sucursalNombre = sucursales.find(s => s.id === usuario.sucursalId)?.nombre || (usuario.sucursalId ? `Sucursal #${usuario.sucursalId}` : 'Sin sucursal asignada')
  const inicial = (usuario.nombre || usuario.email || '?').trim().slice(0, 1).toUpperCase()

  return (
    <div style={identityCardStyle}>
      <div style={avatarStyle}>{inicial}</div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{usuario.nombre}</span>
          <Badge tone={usuario.activo ? 'green' : 'red'}>{usuario.activo ? 'Activo' : 'Inactivo'}</Badge>
          <Badge tone={usuario.role === 'admin' ? 'blue' : 'neutral'}>{ROLE_LABELS[usuario.role] || usuario.role}</Badge>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>📧 <strong>{usuario.email}</strong></span>
          <span>🏢 {sucursalNombre}</span>
          {usuario.cargo && <span>💼 {usuario.cargo}</span>}
          {usuario.rut && <span>🆔 {usuario.rut}</span>}
        </div>
      </div>
      {soloLectura && (
        <Btn variant="primary" icon="edit" size="sm" onClick={onEditar}>
          Editar
        </Btn>
      )}
    </div>
  )
}

function ReadOnlyUserView({ usuario, sucursales }) {
  const sucursalNombre = sucursales.find(s => s.id === usuario.sucursalId)?.nombre || (usuario.sucursalId ? `Sucursal #${usuario.sucursalId}` : 'Sin sucursal asignada')
  const sinRestriccionVentas = !Array.isArray(usuario.tiposVentaPermitidos)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={detailSectionStyle}>
        <div style={detailSectionTitleStyle}>Información general y organización</div>
        <div style={detailGridStyle}>
          <DetailItem label="Usuario / Email" value={usuario.email} isMono />
          <DetailItem label="Nombre completo" value={usuario.nombre} />
          <DetailItem label="Nivel / Rol" value={ROLE_LABELS[usuario.role] || usuario.role} isBadge tone={usuario.role === 'admin' ? 'blue' : 'neutral'} />
          <DetailItem label="Estado de cuenta" value={usuario.activo ? 'Activo' : 'Inactivo'} isBadge tone={usuario.activo ? 'green' : 'red'} />
          <DetailItem label="Cargo" value={usuario.cargo || '—'} />
          <DetailItem label="RUT" value={usuario.rut || '—'} isMono />
          <DetailItem label="Código de vendedor" value={usuario.codigoVendedor || '—'} isMono />
          <DetailItem label="Sucursal asignada" value={sucursalNombre} />
        </div>
      </div>

      <div style={detailSectionStyle}>
        <div style={detailSectionTitleStyle}>Atribuciones comerciales</div>
        <div style={detailGridStyle}>
          <DetailItem
            label="Descuentos en ventas"
            value={usuario.permisoDescuentos ? 'Autorizado para solicitar / aplicar' : 'Sin permiso para descuentos'}
            isBadge
            tone={usuario.permisoDescuentos ? 'green' : 'gray'}
          />
          <DetailItem
            label="Aprobación de descuentos"
            value={usuario.permisoAprobarDescuentos ? 'Puede aprobar o rechazar' : 'No puede aprobar'}
            isBadge
            tone={usuario.permisoAprobarDescuentos ? 'green' : 'gray'}
          />
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Canales de venta autorizados
            </div>
            {usuario.role === 'vendedor' ? (
              sinRestriccionVentas ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge tone="green">Todos los tipos de venta autorizados</Badge>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Este ejecutivo puede crear y atender cualquier tipo de venta.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {usuario.tiposVentaPermitidos.map(t => (
                    <Badge key={t} tone="blue">{t}</Badge>
                  ))}
                </div>
              )
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                No aplica restricción para el rol <strong>{ROLE_LABELS[usuario.role] || usuario.role}</strong> (cobertura global por rol).
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={detailSectionStyle}>
        <div style={detailSectionTitleStyle}>Seguridad y credenciales</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
              🔒 Contraseña protegida mediante hash criptográfico (bcrypt)
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Por seguridad, las contraseñas nunca se muestran en texto plano. Para cambiar la contraseña de este usuario, utiliza el botón <strong>Editar usuario</strong> en la parte superior.
            </div>
          </div>
          <Badge tone="green">Cifrada</Badge>
        </div>
      </div>
    </div>
  )
}

function DetailItem({ label, value, isMono = false, isBadge = false, tone = 'neutral' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      {isBadge ? (
        <div><Badge tone={tone}>{value}</Badge></div>
      ) : isMono ? (
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{value}</span>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{value}</span>
      )}
    </div>
  )
}

function TiposVentaField({ form, set, disabled }) {
  const sinRestriccion = !Array.isArray(form.tiposVentaPermitidos)
  const seleccionados = form.tiposVentaPermitidos || []
  const toggle = tipo => {
    set('tiposVentaPermitidos', seleccionados.includes(tipo)
      ? seleccionados.filter(item => item !== tipo)
      : [...seleccionados, tipo])
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', background: '#fff' }}>
      <label style={{ ...checkboxStyle, padding: 0, fontWeight: 600, opacity: disabled ? 0.65 : 1 }}>
        <input
          type="checkbox"
          checked={sinRestriccion}
          onChange={event => set('tiposVentaPermitidos', event.target.checked ? null : [])}
          disabled={disabled}
        />
        <span>Todos los tipos de venta autorizados</span>
      </label>

      {!sinRestriccion && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 10px' }}>
            Seleccione uno o más tipos de venta autorizados para este vendedor:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 14px' }}>
            {TIPO_VENTA_OPCIONES.map(tipo => (
              <label key={tipo} style={{ ...checkboxStyle, padding: 0, opacity: disabled ? 0.65 : 1 }}>
                <input
                  type="checkbox"
                  checked={seleccionados.includes(tipo)}
                  onChange={() => toggle(tipo)}
                  disabled={disabled}
                />
                <span>{tipo}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function PermisosMatrix({ role, permisos, editable, onToggle }) {
  const getCellState = (clave, permiso) => {
    const fromRole = can({ role }, clave, permiso)
    const isExtra = (permisos[clave] || []).includes(permiso)
    return { fromRole, isExtra, checked: fromRole || isExtra }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto', background: '#fff' }}>
      <table style={{ minWidth: 640, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            <th style={thStyle}>Módulo / Función</th>
            {PERMS.map(permiso => (
              <th key={permiso} style={{ ...thStyle, textAlign: 'center', width: 90 }}>
                {permiso.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULOS.map(([modulo, label, funciones = []]) => (
            <Fragment key={modulo}>
              <PermisosRow
                label={label}
                clave={modulo}
                getCellState={getCellState}
                editable={editable}
                onToggle={onToggle}
              />
              {funciones.map(([funcion, funcionLabel]) => (
                <PermisosRow
                  key={`${modulo}.${funcion}`}
                  label={funcionLabel}
                  clave={`${modulo}.${funcion}`}
                  getCellState={getCellState}
                  editable={editable}
                  onToggle={onToggle}
                  nested
                />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PermisosRow({ label, clave, getCellState, editable, onToggle, nested = false }) {
  return (
    <tr style={{ borderTop: '1px solid var(--border)', background: nested ? 'var(--bg-subtle, #fcfcfc)' : '#fff' }}>
      <td style={{ padding: nested ? '5px 12px 5px 32px' : '8px 14px', fontWeight: nested ? 400 : 600, color: nested ? 'var(--text-2)' : 'var(--text-1)' }}>
        {label}
      </td>
      {PERMS.map(permiso => {
        const { fromRole, isExtra, checked } = getCellState(clave, permiso)
        const canEdit = editable && !fromRole

        return (
          <td key={permiso} style={{ padding: nested ? '5px 8px' : '8px 8px', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!canEdit}
                onChange={canEdit ? () => onToggle(clave, permiso) : undefined}
                style={{ cursor: canEdit ? 'pointer' : 'default' }}
              />
              {fromRole && <span style={roleMarkStyle} title="Otorgado por el rol base">Rol</span>}
              {isExtra && !fromRole && <span style={extraMarkStyle} title="Permiso adicional">+Extra</span>}
            </div>
          </td>
        )
      })}
    </tr>
  )
}

function Tab({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 16px',
        border: 'none',
        borderBottom: active ? '2px solid var(--green-700)' : '2px solid transparent',
        background: 'none',
        color: active ? 'var(--green-700)' : 'var(--text-3)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        transition: 'all 0.15s ease',
      }}
    >
      {children}
    </button>
  )
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: '12px 18px',
}

const tabsStyle = {
  display: 'flex',
  gap: 8,
  borderBottom: '1px solid var(--border)',
  margin: '8px 0 20px',
}

const checkboxStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 38,
  fontSize: 13,
  color: 'var(--text-1)',
  cursor: 'pointer',
  userSelect: 'none',
}

const infoBoxStyle = {
  padding: '12px 14px',
  borderRadius: 8,
  background: 'var(--green-50, #f0fdf4)',
  border: '1px solid var(--green-200, #bbf7d0)',
  color: 'var(--text-2)',
  fontSize: 12,
  lineHeight: 1.5,
}

const modeNoticeStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  background: 'var(--amber-50, #fffbeb)',
  border: '1px solid var(--amber-200, #fde68a)',
  borderRadius: 8,
  color: 'var(--amber-900, #78350f)',
  fontSize: 12,
  marginBottom: 16,
}

const identityCardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '16px 20px',
  borderRadius: 12,
  background: 'var(--bg, #f8fafc)',
  border: '1px solid var(--border)',
  marginBottom: 16,
  flexWrap: 'wrap',
}

const avatarStyle = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  background: 'var(--green-100, #dcfce7)',
  color: 'var(--green-800, #166534)',
  display: 'grid',
  placeItems: 'center',
  fontWeight: 800,
  fontSize: 18,
  flexShrink: 0,
}

const detailSectionStyle = {
  background: '#fff',
  borderRadius: 10,
  border: '1px solid var(--border)',
  padding: '18px 20px',
}

const detailSectionTitleStyle = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--text-1)',
  marginBottom: 14,
  borderBottom: '1px solid var(--border-subtle, #f1f5f9)',
  paddingBottom: 8,
}

const detailGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: '16px 20px',
}

const thStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

const roleMarkStyle = {
  fontSize: 10,
  color: 'var(--text-3)',
  fontWeight: 700,
  padding: '1px 4px',
  borderRadius: 3,
  background: 'var(--bg)',
}

const extraMarkStyle = {
  fontSize: 10,
  color: 'var(--blue, #2563eb)',
  fontWeight: 700,
  padding: '1px 4px',
  borderRadius: 3,
  background: 'var(--blue-50, #eff6ff)',
}
