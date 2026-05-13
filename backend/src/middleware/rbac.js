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

export function can(role, module, permission) {
  const rolePerms = PERMISSIONS[role]
  if (!rolePerms) return false
  if (rolePerms['*']) return true
  return (rolePerms[module] || []).includes(permission)
}

export default fp(async (fastify) => {
  // No-op: rbac decorator is applied synchronously in app.js via decorateRbac()
})

export function decorateRbac(app) {
  app.decorate('rbac', (module, permission) => async (request, reply) => {
    if (!can(request.user.role, module, permission)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  })
}
