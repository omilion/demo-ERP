import fp from 'fastify-plugin'

const PERMISSIONS = {
  admin:        { '*': ['read', 'write', 'delete'] },
  vendedor:     {
    ventas:       ['read', 'write'],
    cotizaciones: ['read', 'write'],
    licitaciones: ['read', 'write'],
    clientes:     ['read', 'write'],
    catalogo:     ['read'],
    taller:       ['read'],
  },
  bodeguero:    {
    bodega:   ['read', 'write', 'delete'],
    catalogo: ['read', 'write'],
    despacho: ['read', 'write'],
    ventas:   ['read'],
    clientes: ['read'],
  },
  cajero:       {
    caja:     ['read', 'write'],
    cobranza: ['read', 'write'],
    clientes: ['read'],
    ventas:   ['read'],
  },
  taller:       {
    taller:   ['read', 'write'],
    catalogo: ['read'],
    bodega:   ['read'],
  },
  rrhh:         { rrhh: ['read', 'write'] },
  solo_lectura: {
    ventas:       ['read'],
    bodega:       ['read'],
    clientes:     ['read'],
    catalogo:     ['read'],
    taller:       ['read'],
    caja:         ['read'],
    cobranza:     ['read'],
    licitaciones: ['read'],
  },
}

export function can(role, module, permission, extraPerms = null) {
  const rolePerms = PERMISSIONS[role]
  if (rolePerms) {
    if (rolePerms['*']) return true
    if ((rolePerms[module] || []).includes(permission)) return true
  }
  // G13: permisos extra por usuario (objeto { modulo: ['read', 'write', ...] })
  if (extraPerms && typeof extraPerms === 'object') {
    if (Array.isArray(extraPerms[module]) && extraPerms[module].includes(permission)) return true
    if (Array.isArray(extraPerms['*']) && extraPerms['*'].includes(permission)) return true
  }
  return false
}

export default fp(async (fastify) => {
  // No-op: rbac decorator is applied synchronously in app.js via decorateRbac()
})

export function decorateRbac(app) {
  app.decorate('rbac', (module, permission) => async (request, reply) => {
    const extra = request.user?.permisosExtra
    if (!can(request.user.role, module, permission, extra)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  })
}
