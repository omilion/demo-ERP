export const ROLE_PERMISSIONS = {
  admin: { '*': ['read', 'write', 'delete'] },
  vendedor: {
    reportes: ['read'],
    ventas: ['read', 'write'],    licitaciones: ['read', 'write'],
    clientes: ['read', 'write'],
    catalogo: ['read'],
    despacho: ['read'],
    taller: ['read'],
  },
  // Igual que vendedor: la unica diferencia es visibilidad ampliada del CRM
  // de todos los vendedores, resuelta server-side (backend/src/routes/crm/index.js),
  // no un permiso de modulo distinto aqui.
  coordinador_comercial: {
    reportes: ['read'],
    ventas: ['read', 'write'],    licitaciones: ['read', 'write'],
    clientes: ['read', 'write'],
    catalogo: ['read'],
    despacho: ['read'],
    taller: ['read'],
  },
  bodeguero: {
    reportes: ['read'],
    bodega: ['read', 'write'],
    catalogo: ['read', 'write'],
    despacho: ['read', 'write'],
    ventas: ['read'],
    clientes: ['read'],
    proveedores: ['read', 'write'],
  },
  cajero: {
    reportes: ['read'],
    caja: ['read', 'write'],
    cobranza: ['read', 'write'],
    clientes: ['read'],
    ventas: ['read'],
  },
  taller: {
    reportes: ['read'],
    taller: ['read', 'write'],
    catalogo: ['read'],
    bodega: ['read'],
  },
  // Operario de taller: registra su avance, no gestiona la OT. No basta con
  // quitarle funciones al rol `taller`: los permisos extra son aditivos y ese
  // rol otorga taller:write en bloque, con lo que todo cae al modulo.
  taller_operario: {
    reportes: ['read'],
    taller: ['read'],
    'taller.avance': ['read', 'write'],
    catalogo: ['read'],
    bodega: ['read'],
  },
  rrhh: { rrhh: ['read', 'write'], reportes: ['read'] },
  solo_lectura: {
    reportes: ['read'],
    ventas: ['read'],
    bodega: ['read'],
    clientes: ['read'],
    catalogo: ['read'],
    taller: ['read'],
    caja: ['read'],
    cobranza: ['read'],
    despacho: ['read'],
    licitaciones: ['read'],
    proveedores: ['read'],
    rrhh: ['read'],
    // Debe coincidir con el backend: lectura de nomina no implica ver sueldos.
    'rrhh.remuneracion': [],
  },
}

export function getUserRole(user) {
  return user?.role || user?.rol || ''
}

function extraPerms(user) {
  return user?.permisosExtra || user?.permisos_extra || null
}

// Permisos por funcion dentro de un modulo: 'ventas.entregas', 'taller.avance'.
// Misma regla que el backend (backend/src/middleware/rbac.js): gana lo mas
// especifico, y si no hay entrada por funcion cae al permiso del modulo.
//
// Tiene que coincidir con el backend o las dos capas quedan en desacuerdo: el
// menu ofreceria pantallas que la API rechaza, o al reves.
function decidir(perms, moduleName, permission) {
  if (!perms || typeof perms !== 'object') return null
  const punto = String(moduleName).indexOf('.')
  if (punto !== -1 && Array.isArray(perms[moduleName])) return perms[moduleName].includes(permission)
  const base = punto === -1 ? moduleName : String(moduleName).slice(0, punto)
  if (Array.isArray(perms[base])) return perms[base].includes(permission)
  return null
}

export function can(user, moduleName, permission = 'read') {
  if (!user || !moduleName) return false

  const rolePerms = ROLE_PERMISSIONS[getUserRole(user)]
  if (rolePerms?.['*']) return true
  if (decidir(rolePerms, moduleName, permission) === true) return true

  // Los extra son aditivos: amplian el rol, nunca lo recortan.
  const extra = extraPerms(user)
  if (extra && typeof extra === 'object') {
    if (decidir(extra, moduleName, permission) === true) return true
    if (Array.isArray(extra['*']) && extra['*'].includes(permission)) return true
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

export function ventaPath(id) {
  const safeId = encodeURIComponent(String(id ?? ''))
  return `/ventas/${safeId}`
}

export function odtPath(id, user) {
  const safeId = encodeURIComponent(String(id ?? ''))
  return can(user, 'taller', 'write') ? `/taller/${safeId}/editar` : `/taller?search=${safeId}`
}
