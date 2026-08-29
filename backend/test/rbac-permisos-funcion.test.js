// Permisos por funcion dentro de un modulo ('ventas.entregas', 'taller.avance').
//
// El permiso era modulo x nivel con tres niveles, demasiado grueso: dentro de un
// modulo conviven operaciones de areas distintas. Para que bodega marcara una
// entrega habia que darle ventas:write, que ademas la habilitaba a crear ventas.
//
// Regla: gana lo mas especifico. Si hay entrada para 'ventas.entregas' esa
// decide; si no la hay, cae al permiso del modulo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { can } from '../src/middleware/rbac.js'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function hasUsableDatabaseUrl() {
  try {
    const url = new URL(process.env.DATABASE_URL || '')
    return Boolean(url.hostname && url.username && url.password)
  } catch {
    return false
  }
}

const describeDb = hasUsableDatabaseUrl() ? describe : describe.skip

// Lo primero que hay que garantizar: nada de lo que hoy funciona deja de
// funcionar. Los roles no tienen entradas por funcion, asi que todo resuelve
// por modulo igual que antes.
describe('retrocompatibilidad', () => {
  it('un permiso de modulo sigue habilitando todas sus funciones', () => {
    expect(can('vendedor', 'ventas', 'write')).toBe(true)
    expect(can('vendedor', 'ventas.crear', 'write')).toBe(true)
    expect(can('vendedor', 'ventas.editar', 'write')).toBe(true)
    expect(can('vendedor', 'ventas.anular', 'write')).toBe(true)
  })

  it('lo que estaba negado sigue negado', () => {
    expect(can('vendedor', 'bodega', 'write')).toBe(false)
    expect(can('vendedor', 'bodega.movimientos', 'write')).toBe(false)
    expect(can('cajero', 'taller', 'write')).toBe(false)
  })

  it('admin puede cualquier funcion sin declararla', () => {
    expect(can('admin', 'facturacion.emitir', 'write')).toBe(true)
    expect(can('admin', 'cualquier.cosa', 'delete')).toBe(true)
  })

  it('un rol inexistente no obtiene nada', () => {
    expect(can('no_existe', 'ventas', 'read')).toBe(false)
    expect(can(undefined, 'ventas.crear', 'write')).toBe(false)
  })
})

// El caso que motiva todo esto: Diego Avila marca entregas desde bodega sin
// poder crear ni editar ventas. Funciona porque el rol bodeguero da ventas:read,
// de modo que la funcion suelta amplia sin abrir el modulo entero.
describe('acotar por funcion sobre un modulo de solo lectura', () => {
  const soloEntregas = { 'ventas.entregas': ['write'] }

  it('habilita la funcion concedida', () => {
    expect(can('bodeguero', 'ventas.entregas', 'write', soloEntregas)).toBe(true)
  })

  it('no abre el resto del modulo', () => {
    expect(can('bodeguero', 'ventas.crear', 'write', soloEntregas)).toBe(false)
    expect(can('bodeguero', 'ventas.anular', 'delete', soloEntregas)).toBe(false)
    expect(can('bodeguero', 'ventas', 'write', soloEntregas)).toBe(false)
  })

  it('conserva la lectura que ya daba el rol', () => {
    expect(can('bodeguero', 'ventas', 'read', soloEntregas)).toBe(true)
    expect(can('bodeguero', 'ventas.crear', 'read', soloEntregas)).toBe(true)
  })
})

// Los extras son aditivos: amplian lo que da el rol y nunca lo recortan. Asi,
// asignar una funcion suelta no puede dejar a alguien con menos acceso del que
// su rol ya le daba, que seria una forma silenciosa de romper a un usuario.
describe('los permisos extra son aditivos', () => {
  it('una funcion sin el nivel pedido no quita lo que da el rol', () => {
    expect(can('vendedor', 'ventas.crear', 'write', { 'ventas.crear': ['read'] })).toBe(true)
  })

  it('el comodin sigue funcionando', () => {
    expect(can('cajero', 'taller.avance', 'write', { '*': ['write'] })).toBe(true)
  })

  it('se pueden ignorar los extras cuando la ruta lo pide', () => {
    const extra = { 'ventas.entregas': ['write'] }
    expect(can('bodeguero', 'ventas.entregas', 'write', extra, { allowExtra: false })).toBe(false)
  })
})

// Consecuencia del diseño aditivo, y es la que corrige el catalogo: para acotar
// a alguien DENTRO de un modulo, su rol no puede otorgar ese modulo en bloque.
// El rol `taller` da taller:[read,write], asi que una cortadora con ese rol
// puede cerrar y anular OT por caida al modulo, por mas extras que se le pongan.
// Por eso existe `taller_operario`.
describe('acotar dentro de un modulo exige que el rol no lo otorgue entero', () => {
  it('el rol taller alcanza todas las funciones del modulo', () => {
    expect(can('taller', 'taller.avance', 'write')).toBe(true)
    expect(can('taller', 'taller.cerrar', 'write')).toBe(true)
    expect(can('taller', 'taller.gestion', 'write')).toBe(true)
  })

  it('un extra por funcion no lo puede recortar', () => {
    expect(can('taller', 'taller.cerrar', 'write', { 'taller.avance': ['write'] })).toBe(true)
  })

  it('taller_operario registra avance pero no cierra ni anula', () => {
    expect(can('taller_operario', 'taller', 'read')).toBe(true)
    expect(can('taller_operario', 'taller.avance', 'write')).toBe(true)
    expect(can('taller_operario', 'taller.cerrar', 'write')).toBe(false)
    expect(can('taller_operario', 'taller.gestion', 'write')).toBe(false)
    expect(can('taller_operario', 'taller', 'write')).toBe(false)
  })
})

// El catalogo de asignacion es cerrado a proposito: si se acepta cualquier texto
// despues del punto, un typo crea un permiso asignable que no hace nada. Es el
// mismo defecto de los seis modulos fantasma eliminados en 54057ab.
describeDb('claves asignables desde la API de usuarios', () => {
  let app
  let token
  let creado
  const marca = `permfn-${Date.now()}`

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    const admin = await app.prisma.user.create({
      data: { email: `${marca}-admin@plastimar.cl`, passwordHash: 'x', role: 'admin', nombre: `${marca} Admin`, activo: true },
    })
    token = app.jwt.sign({
      id: admin.id, role: 'admin', nombre: admin.nombre, permisosExtra: null,
      scope: 'erp', aud: 'plastimar:erp', tokenType: 'access',
    })
    creado = admin
  })

  afterAll(async () => {
    await app.prisma.user.deleteMany({ where: { email: { contains: marca } } }).catch(() => {})
    await app.close()
  })

  const crear = permisosExtra => app.inject({
    method: 'POST', url: '/api/usuarios',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      email: `${marca}-${Math.random().toString(36).slice(2, 8)}@plastimar.cl`,
      password: 'Plastimar2026.', role: 'bodeguero', nombre: `${marca} Usuario`, permisosExtra,
    },
  })

  it('acepta una funcion del catalogo', async () => {
    const res = await crear({ 'ventas.entregas': ['write'] })
    expect(res.statusCode).toBe(201)
    expect(res.json().permisosExtra).toEqual({ 'ventas.entregas': ['write'] })
  })

  it('rechaza un typo en la funcion en vez de crear un permiso muerto', async () => {
    const res = await crear({ 'ventas.entergas': ['write'] })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/funcion invalida/i)
  })

  it('rechaza una funcion sobre un modulo que no las tiene', async () => {
    const res = await crear({ 'caja.arqueo': ['write'] })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/no tiene permisos por funcion/i)
  })

  it('sigue aceptando un permiso de modulo a secas', async () => {
    const res = await crear({ despacho: ['read', 'write'] })
    expect(res.statusCode).toBe(201)
  })
})


// La prueba de aceptacion del catalogo: los dos endpoints etiquetados quedan
// alcanzables por quien realmente hace el trabajo, sin abrirle el modulo entero.
describe('endpoints etiquetados: efecto sobre las personas reales', () => {
  // Diego Avila, bodega. Marca entregas; no crea ni edita ventas.
  const bodegaEntregas = { 'ventas.entregas': ['write'] }
  it('bodega marca la entrega de un item', () => {
    expect(can('bodeguero', 'ventas.entregas', 'write', bodegaEntregas)).toBe(true)
  })
  it('y no puede crear ni anular ventas', () => {
    expect(can('bodeguero', 'ventas', 'write', bodegaEntregas)).toBe(false)
    expect(can('bodeguero', 'ventas', 'delete', bodegaEntregas)).toBe(false)
  })

  // Dyan Cortes, coordinacion de taller. Empuja ordenes a taller.
  const coordTaller = { 'ventas.taller': ['write'] }
  it('el coordinador de taller empuja la orden a taller', () => {
    expect(can('bodeguero', 'ventas.taller', 'write', coordTaller)).toBe(true)
  })
  it('sin quedar habilitado a crear ventas', () => {
    expect(can('bodeguero', 'ventas', 'write', coordTaller)).toBe(false)
  })

  // Y lo esencial: el vendedor no pierde nada de lo que ya hacia.
  it('el vendedor conserva ambas funciones por caida al modulo', () => {
    expect(can('vendedor', 'ventas.entregas', 'write')).toBe(true)
    expect(can('vendedor', 'ventas.taller', 'write')).toBe(true)
  })
})

// Taller etiquetado: la cortadora registra avance y consumo, la supervisora
// gestiona y cierra. Es el escenario de Jenifer y Mercedes contra Zalma.
describe('taller: operario frente a supervisora', () => {
  it('la cortadora registra avance, consumo y mueve el estado del item', () => {
    expect(can('taller_operario', 'taller.avance', 'write')).toBe(true)
  })

  it('pero no crea, edita, cierra ni anula la OT', () => {
    expect(can('taller_operario', 'taller.gestion', 'write')).toBe(false)
    expect(can('taller_operario', 'taller.cerrar', 'write')).toBe(false)
    expect(can('taller_operario', 'taller.cerrar', 'delete')).toBe(false)
    expect(can('taller_operario', 'taller.gestion', 'delete')).toBe(false)
  })

  it('ni toca los materiales de taller', () => {
    expect(can('taller_operario', 'taller.materiales', 'delete')).toBe(false)
  })

  it('sigue viendo la OT y el kanban', () => {
    expect(can('taller_operario', 'taller', 'read')).toBe(true)
    expect(can('taller_operario', 'taller.avance', 'read')).toBe(true)
  })

  it('la supervisora conserva todo lo que ya podia, por caida al modulo', () => {
    expect(can('taller', 'taller.avance', 'write')).toBe(true)
    expect(can('taller', 'taller.gestion', 'write')).toBe(true)
    expect(can('taller', 'taller.cerrar', 'write')).toBe(true)
  })

  // Hallazgo preexistente, verificado contra el arbol limpio: el rol `taller`
  // tiene [read, write] pero NO delete, de modo que anular o eliminar una OT
  // -y borrar materiales- solo lo puede un admin. La supervisora nunca pudo.
  // Queda igual que antes; si Plastimar espera que Zalma pueda anular, hay que
  // decidirlo y agregarle delete al rol o la funcion `taller.cerrar`.
  it('anular y eliminar siguen fuera del alcance del rol taller', () => {
    expect(can('taller', 'taller.cerrar', 'delete')).toBe(false)
    expect(can('taller', 'taller.materiales', 'delete')).toBe(false)
    expect(can('admin', 'taller.cerrar', 'delete')).toBe(true)
  })
})

// El asistente exponia 14 herramientas de negocio -sueldos, comisiones, caja-
// tras un `role === 'admin'` fijo, mientras el catalogo ofrecia 'ai' como
// permiso asignable que no hacia nada. Ahora el permiso es el que manda.
describe('el permiso ai gobierna el asistente', () => {
  it('admin lo alcanza por su comodin, como antes', () => {
    expect(can('admin', 'ai', 'read')).toBe(true)
  })

  it('ningun otro rol lo tiene por defecto: el acceso no se amplia', () => {
    for (const rol of ['vendedor', 'bodeguero', 'cajero', 'taller', 'taller_operario', 'rrhh', 'solo_lectura']) {
      expect(can(rol, 'ai', 'read')).toBe(false)
    }
  })

  // Lo que cambia: asignar el permiso ahora si habilita el asistente.
  it('asignarlo como permiso extra ahora funciona', () => {
    expect(can('vendedor', 'ai', 'read', { ai: ['read'] })).toBe(true)
  })
})
