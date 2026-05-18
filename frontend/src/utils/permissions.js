export const ROLE_PERMISSIONS = {
  admin: { '*': ['read', 'write', 'delete'] },
  vendedor: {
    ventas: ['read', 'write'],
    cotizaciones: ['read', 'write'],
    licitaciones: ['read', 'write'],
    clientes: ['read', 'write'],
    catalogo: ['read'],
    despacho: ['read'],
    taller: ['read'],
  },
  bodeguero: {
    bodega: ['read', 'write', 'delete'],
    catalogo: ['read', 'write'],
    despacho: ['read', 'write'],
    ventas: ['read'],
    clientes: ['read'],
    proveedores: ['read', 'write'],
  },
  cajero: {
    caja: ['read', 'write'],
    cobranza: ['read', 'write'],
    clientes: ['read'],
    ventas: ['read'],
  },
  taller: {
    taller: ['read', 'write'],
    catalogo: ['read'],
    bodega: ['read'],
  },
  rrhh: { rrhh: ['read', 'write'] },
  solo_lectura: {
    ventas: ['read'],
    bodega: ['read'],
    clientes: ['read'],
    catalogo: ['read'],
    taller: ['read'],
    caja: ['read'],
    cobranza: ['read'],
    despacho: ['read'],
    licitaciones: ['read'],
    rrhh: ['read'],
  },
}

export function getUserRole(user) {
  return user?.role || user?.rol || ''
}

function extraPerms(user) {
  return user?.permisosExtra || user?.permisos_extra || null
}

function includesPermission(perms, moduleName, permission) {
  return Array.isArray(perms?.[moduleName]) && perms[moduleName].includes(permission)
}

export function can(user, moduleName, permission = 'read') {
  if (!user || !moduleName) return false

  const rolePerms = ROLE_PERMISSIONS[getUserRole(user)]
  if (rolePerms?.['*']) return true
  if (includesPermission(rolePerms, moduleName, permission)) return true

  const extra = extraPerms(user)
  if (extra && typeof extra === 'object') {
    if (includesPermission(extra, moduleName, permission)) return true
    if (includesPermission(extra, '*', permission)) return true
  }

  return false
}

export function canAny(user, requirements = []) {
  return requirements.some(req => {
    if (Array.isArray(req)) return can(user, req[0], req[1] || 'read')
    return can(user, req.module, req.permission || 'read')
  })
}

export function hasRole(user, roles = []) {
  return roles.includes(getUserRole(user))
}

export function ventaPath(id, user) {
  const safeId = encodeURIComponent(String(id ?? ''))
  return can(user, 'ventas', 'write') ? `/ventas/${safeId}/editar` : `/ventas?search=${safeId}`
}

export function odtPath(id, user) {
  const safeId = encodeURIComponent(String(id ?? ''))
  return can(user, 'taller', 'write') ? `/taller/${safeId}/editar` : `/taller?search=${safeId}`
}
