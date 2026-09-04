import fp from 'fastify-plugin'

const PERMISSIONS = {
  admin:        { '*': ['read', 'write', 'delete'] },
  vendedor:     {
    reportes:     ['read'],
    ventas:       ['read', 'write'],    licitaciones: ['read', 'write'],
    clientes:     ['read', 'write'],
    catalogo:     ['read'],
    despacho:     ['read'],
    taller:       ['read'],
    // Puede resolver sus propias ventas trabadas en taller sin heredar taller:write
    // completo (que le daria cerrar/anular OTs de cualquiera).
    'taller.excepciones': ['read', 'write'],
  },
  // Coordina la fuerza de venta: ademas de vender, responde por el avance
  // del equipo. Ya tenia visibilidad ampliada del CRM de todos los vendedores
  // (backend/src/routes/crm/index.js); `equipo_comercial` es la otra mitad: el
  // desempeno por vendedor.
  //
  // Es un modulo propio y no un permiso por funcion ('ventas.equipo') a
  // proposito: los permisos por funcion caen al modulo cuando el rol no tiene
  // entrada propia, asi que 'ventas.equipo' se lo habria regalado a todo el que
  // tiene ventas:read -vendedor, bodega, caja, solo_lectura- salvo negandolo
  // explicitamente en cada uno. Un modulo aparte no lo hereda nadie.
  coordinador_comercial: {
    reportes:     ['read'],
    ventas:       ['read', 'write'],    licitaciones: ['read', 'write'],
    clientes:     ['read', 'write'],
    catalogo:     ['read'],
    despacho:     ['read'],
    taller:       ['read'],
    equipo_comercial: ['read'],
    'taller.excepciones': ['read', 'write'],
  },
  bodeguero:    {
    reportes:    ['read'],
    bodega:      ['read', 'write'],
    catalogo:    ['read', 'write'],
    despacho:    ['read', 'write'],
    ventas:      ['read'],
    clientes:    ['read'],
    proveedores: ['read', 'write'],
    'caja.pagos_proveedores': ['read'],
  },
  cajero:       {
    reportes: ['read'],
    caja:     ['read', 'write'],
    cobranza: ['read', 'write'],
    clientes: ['read'],
    ventas:   ['read'],
  },
  // Jefe de taller. El nombre del rol es generico por historia, pero corresponde al
  // "Jefe de Taller" de los documentos del cliente: gestiona la OT, la cierra y
  // aprueba la calidad de lo que sale de SU taller.
  //
  // De que taller es jefe no se sabe por el rol -este da gestion sobre todos- sino
  // por `Taller.jefeId`. Sin esa distincion, el jefe de Corte aprobaria lo que sale
  // de Espumas.
  taller:       {
    reportes: ['read'],
    taller:   ['read', 'write'],
    catalogo: ['read'],
    bodega:   ['read'],
  },
  // Operario de taller: registra su avance, no gestiona la OT.
  //
  // No alcanza con darle el rol `taller` y quitarle funciones: los permisos
  // extra son aditivos, y ese rol otorga taller:write en bloque, de modo que
  // cualquier funcion cae al modulo y termina pudiendo cerrar y anular. Para
  // acotar DENTRO de un modulo, el rol no puede otorgar ese modulo entero.
  taller_operario: {
    reportes:        ['read'],
    taller:          ['read'],
    'taller.avance': ['read', 'write'],
    catalogo:        ['read'],
    bodega:          ['read'],
  },
  rrhh:         { rrhh: ['read', 'write'], reportes: ['read'] },
  solo_lectura: {
    reportes:     ['read'],
    ventas:       ['read'],
    bodega:       ['read'],
    clientes:     ['read'],
    catalogo:     ['read'],
    taller:       ['read'],
    caja:         ['read'],
    cobranza:     ['read'],
    despacho:     ['read'],
    licitaciones: ['read'],
    proveedores:  ['read'],
    rrhh:         ['read'],
    // Ver la nomina no es ver los sueldos. Una cuenta de observacion podia listar a
    // todo el personal con su sueldo liquido, y hay dos activas. Se niega explicito
    // porque los permisos por funcion heredan del modulo: sin esta linea, `rrhh:read`
    // le daria tambien la remuneracion.
    'rrhh.remuneracion': [],
  },
}

// Permisos por funcion dentro de un modulo: 'ventas.entregas', 'taller.avance'.
//
// El permiso era modulo x nivel con solo tres niveles, demasiado grueso porque
// dentro de un modulo conviven operaciones de areas distintas. Para que bodega
// marcara una entrega habia que darle ventas:write, lo que ademas la habilitaba
// a crear y editar ventas.
//
// Regla: gana lo mas especifico. Si hay una entrada para 'ventas.entregas' esa
// decide -puede otorgar o negar-; si no la hay, cae al permiso del modulo.
// Por eso ningun permiso vigente se rompe: quien hoy tiene ventas: [read,write]
// no tiene entradas por funcion, asi que todo resuelve por modulo como antes.
function separarFuncion(nombre) {
  const punto = String(nombre ?? '').indexOf('.')
  if (punto === -1) return { base: nombre, completo: null }
  return { base: String(nombre).slice(0, punto), completo: nombre }
}

// Devuelve true/false si la fuente opina sobre este permiso, o null si no dice
// nada. Distinguir "no opina" de "dice que no" es lo que permite la caida al
// modulo sin que una fuente silenciosa niegue.
function decidir(perms, { base, completo }, permission) {
  if (!perms || typeof perms !== 'object') return null
  if (completo && Array.isArray(perms[completo])) return perms[completo].includes(permission)
  if (Array.isArray(perms[base])) return perms[base].includes(permission)
  return null
}

export function can(role, module, permission, extraPerms = null, options = {}) {
  if (Array.isArray(module)) {
    return module.some(m => can(role, m, permission, extraPerms, options))
  }
  const allowExtra = options.allowExtra !== false
  const objetivo = separarFuncion(module)
  const rolePerms = PERMISSIONS[role]

  if (rolePerms?.['*']) return true
  if (decidir(rolePerms, objetivo, permission) === true) return true

  // G13: permisos extra por usuario. Son aditivos: amplian lo que da el rol,
  // nunca lo recortan, de modo que asignar una funcion suelta no puede dejar a
  // alguien con menos acceso del que su rol ya le daba.
  if (allowExtra && extraPerms && typeof extraPerms === 'object') {
    if (decidir(extraPerms, objetivo, permission) === true) return true
    if (Array.isArray(extraPerms['*']) && extraPerms['*'].includes(permission)) return true
  }
  return false
}

export default fp(async (fastify) => {
  // No-op: rbac decorator is applied synchronously in app.js via decorateRbac()
})

export function decorateRbac(app) {
  app.decorate('rbac', (module, permission, options = {}) => async (request, reply) => {
    const extra = request.user?.permisosExtra
    if (!request.user || !can(request.user.role, module, permission, extra, options)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  })
}
