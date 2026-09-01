import bcrypt from 'bcrypt'
import { TIPO_VENTA_VALUES, normalizeTipoVenta } from '../ventas/estados-normalize.js'

const ROLES = new Set(['admin', 'vendedor', 'coordinador_comercial', 'bodeguero', 'cajero', 'taller', 'taller_operario', 'rrhh', 'solo_lectura'])
const PERMISSIONS = new Set(['read', 'write', 'delete'])
// Catalogo de modulos delegables. Tiene que corresponder uno a uno con lo que
// el codigo exige via rbac() o can(): un modulo que se puede asignar y nadie
// exige es un permiso muerto, y uno que se exige y no se puede asignar deja esa
// parte del sistema reservada al admin sin que nadie lo haya decidido.
//
// Se quitaron 'cotizaciones', 'ordenes-compra', 'pagos-proveedores', 'telas',
// 'bodega-taller' y 'crm': ninguno tenia un solo uso real. Esas pantallas se
// protegen con el modulo de su area (ventas, proveedores, taller).
//
// Se agregaron los seis que el codigo si exige y no eran delegables. El caso que
// lo destapo: facturacion se exige en sus rutas, no estaba aca ni en ningun rol,
// asi que la encargada de facturacion no podia facturar sin ser admin.
const MODULES = new Set([
  'ventas', 'licitaciones', 'clientes',
  'bodega', 'catalogo', 'despacho', 'taller',
  'caja', 'cobranza', 'rrhh', 'reportes',
  'proveedores', 'descuentos',
  'facturacion', 'costeo', 'usuarios', 'config', 'admin', 'ai',
])

// Funciones delegables dentro de un modulo. El middleware resuelve cualquier
// 'modulo.funcion' cayendo al modulo, pero aca el catalogo es CERRADO a
// proposito: si se acepta cualquier texto despues del punto, un typo crea un
// permiso que se puede asignar y no hace nada. Es el mismo defecto que tenian
// los seis modulos fantasma que se eliminaron en 54057ab.
//
// Salen de agrupar los endpoints reales por la operacion de negocio que
// representan; el detalle esta en docs/PLAN_CATALOGO_PERMISOS.md.
const MODULE_FUNCTIONS = {
  // El caso que motiva todo esto: bodega marca entregas sin poder crear ventas.
  ventas: new Set(['crear', 'editar', 'entregas', 'taller', 'anular']),
  taller: new Set(['avance', 'gestion', 'cerrar', 'materiales']),
  facturacion: new Set(['emitir', 'anular', 'folios']),
  despacho: new Set(['packing', 'guias']),
  bodega: new Set(['movimientos', 'ajustes', 'compras']),
}

// Acepta 'ventas' y tambien 'ventas.entregas'. Devuelve el motivo del rechazo
// en vez de un booleano para poder decir que fue lo invalido.
function validarClavePermiso(clave) {
  const punto = clave.indexOf('.')
  if (punto === -1) {
    return MODULES.has(clave) ? null : `modulo de permiso invalido: ${clave}`
  }
  const base = clave.slice(0, punto)
  const funcion = clave.slice(punto + 1)
  if (!MODULES.has(base)) return `modulo de permiso invalido: ${base}`
  const funciones = MODULE_FUNCTIONS[base]
  if (!funciones) return `el modulo ${base} no tiene permisos por funcion`
  if (!funciones.has(funcion)) {
    return `funcion invalida en ${base}: ${funcion}. Validas: ${[...funciones].join(', ')}`
  }
  return null
}

const userSelect = {
  id: true,
  email: true,
  role: true,
  nombre: true,
  rut: true,
  codigoVendedor: true,
  cargo: true,
  permisoDescuentos: true,
  permisoAprobarDescuentos: true,
  permisosExtra: true,
  tiposVentaPermitidos: true,
  sucursalId: true,
  activo: true,
  createdAt: true,
}

function cleanText(value) {
  if (value === undefined) return undefined
  if (value === null) return null
  const text = String(value).trim()
  return text || null
}

function cleanEmail(value) {
  const text = cleanText(value)
  return text ? text.toLowerCase() : null
}

function parseOptionalId(value, field) {
  if (value === undefined || value === null || value === '') return { provided: value !== undefined, value: null }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return { provided: true, error: `${field} invalido` }
  return { provided: true, value: parsed }
}

function sanitizePermisosExtra(value) {
  if (value === undefined || value === null || value === '') return { value: null }
  if (typeof value !== 'object' || Array.isArray(value)) return { error: 'permisosExtra debe ser un objeto' }
  const sanitized = {}
  for (const [module, permissions] of Object.entries(value)) {
    const motivo = validarClavePermiso(module)
    if (motivo) return { error: motivo }
    if (!Array.isArray(permissions)) return { error: `permisos de ${module} deben ser una lista` }
    const unique = [...new Set(permissions)]
    if (unique.some(permission => !PERMISSIONS.has(permission))) {
      return { error: `permiso invalido en ${module}` }
    }
    if (unique.length) sanitized[module] = unique
  }
  return { value: Object.keys(sanitized).length ? sanitized : null }
}

// null significa "todos los tipos" para no recortar ventas de cuentas ya
// existentes. Una lista es una restriccion explicita para ejecutivos.
function sanitizeTiposVentaPermitidos(value) {
  if (value === undefined || value === null || value === '') return { value: null }
  if (!Array.isArray(value)) return { error: 'tiposVentaPermitidos debe ser una lista' }
  const tipos = [...new Set(value.map(tipo => normalizeTipoVenta(tipo)).filter(Boolean))]
  if (tipos.length !== value.length || tipos.some(tipo => !TIPO_VENTA_VALUES.includes(tipo))) {
    return { error: 'tipo de venta invalido' }
  }
  if (!tipos.length) return { error: 'Seleccione al menos un tipo de venta o use todos los tipos' }
  return { value: tipos }
}

async function validateSucursal(prisma, sucursalId) {
  if (!sucursalId) return null
  const sucursal = await prisma.sucursal.findFirst({ where: { id: sucursalId, activo: true }, select: { id: true } })
  return sucursal ? null : 'Sucursal no encontrada'
}

async function validateDuplicates(prisma, { id = null, email, rut, codigoVendedor }) {
  const OR = []
  if (email) OR.push({ email: { equals: email, mode: 'insensitive' } })
  if (rut) OR.push({ rut: { equals: rut, mode: 'insensitive' } })
  if (codigoVendedor) OR.push({ codigoVendedor: { equals: codigoVendedor, mode: 'insensitive' } })
  if (!OR.length) return null
  const duplicate = await prisma.user.findFirst({
    where: { OR, ...(id ? { id: { not: id } } : {}) },
    select: { email: true, rut: true, codigoVendedor: true },
  })
  if (!duplicate) return null
  if (email && duplicate.email?.toLowerCase() === email.toLowerCase()) return 'email ya existe'
  if (rut && duplicate.rut?.toLowerCase() === rut.toLowerCase()) return 'rut ya existe'
  return 'codigoVendedor ya existe'
}

function uniqueErrorMessage(error) {
  const target = Array.isArray(error?.meta?.target) ? error.meta.target.join(',') : String(error?.meta?.target || '')
  if (target.includes('codigo_vendedor') || target.includes('codigoVendedor')) return 'codigoVendedor ya existe'
  if (target.includes('email')) return 'email ya existe'
  return 'dato unico ya existe'
}

async function ensureAdminSafety(prisma, requestUser, current, nextData) {
  const nextRole = nextData.role ?? current.role
  const nextActivo = nextData.activo ?? current.activo
  const isSelf = Number(requestUser?.id) === Number(current.id)
  if (isSelf && current.activo && nextActivo === false) return 'No puede desactivar su propio usuario'
  if (isSelf && current.role === 'admin' && nextRole !== 'admin') return 'No puede degradar su propio usuario admin'
  if (current.role === 'admin' && current.activo && (nextRole !== 'admin' || nextActivo === false)) {
    const otherAdmins = await prisma.user.count({ where: { id: { not: current.id }, role: 'admin', activo: true } })
    if (otherAdmins === 0) return 'Debe existir al menos un admin activo'
  }
  return null
}

export default async function usuariosRoutes(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('usuarios', 'read', { allowExtra: false })],
  }, async () => {
    const users = await fastify.prisma.user.findMany({
      orderBy: { nombre: 'asc' },
      select: userSelect,
    })
    const sucursalIds = [...new Set(users.map(u => u.sucursalId).filter(Boolean))]
    const sucursales = sucursalIds.length
      ? await fastify.prisma.sucursal.findMany({ where: { id: { in: sucursalIds } }, select: { id: true, nombre: true } })
      : []
    const sucursalMap = new Map(sucursales.map(s => [s.id, s.nombre]))
    return users.map(u => ({
      ...u,
      sucursalNombre: u.sucursalId ? (sucursalMap.get(u.sucursalId) || `Sucursal #${u.sucursalId}`) : null,
    }))
  })

  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('usuarios', 'read', { allowExtra: false })],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const u = await fastify.prisma.user.findUnique({ where: { id }, select: userSelect })
    if (!u) return reply.code(404).send({ error: 'no encontrado' })
    return u
  })

  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rbac('usuarios', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const b = request.body || {}
    const email = cleanEmail(b.email)
    const nombre = cleanText(b.nombre)
    const password = cleanText(b.password)
    const role = cleanText(b.role)
    if (!email || !password || !role || !nombre) {
      return reply.code(400).send({ error: 'email, password, role, nombre requeridos' })
    }
    if (!ROLES.has(role)) return reply.code(400).send({ error: 'role invalido' })
    const rut = cleanText(b.rut)
    const codigoVendedor = cleanText(b.codigoVendedor)
    const cargo = cleanText(b.cargo)
    const parsedSucursal = parseOptionalId(b.sucursalId, 'sucursalId')
    if (parsedSucursal.error) return reply.code(400).send({ error: parsedSucursal.error })
    const sucursalError = await validateSucursal(fastify.prisma, parsedSucursal.value)
    if (sucursalError) return reply.code(404).send({ error: sucursalError })
    const permisos = sanitizePermisosExtra(b.permisosExtra)
    if (permisos.error) return reply.code(400).send({ error: permisos.error })
    const tiposVenta = sanitizeTiposVentaPermitidos(b.tiposVentaPermitidos)
    if (tiposVenta.error) return reply.code(400).send({ error: tiposVenta.error })
    const duplicate = await validateDuplicates(fastify.prisma, { email, rut, codigoVendedor })
    if (duplicate) return reply.code(409).send({ error: duplicate })

    const passwordHash = await bcrypt.hash(password, 10)
    try {
      const u = await fastify.prisma.user.create({
        data: {
          email,
          passwordHash,
          role,
          nombre,
          rut,
          codigoVendedor,
          cargo,
          permisoDescuentos: Boolean(b.permisoDescuentos),
          permisoAprobarDescuentos: Boolean(b.permisoAprobarDescuentos),
          permisosExtra: permisos.value,
          tiposVentaPermitidos: tiposVenta.value,
          sucursalId: parsedSucursal.value,
          activo: b.activo !== false,
        },
        select: userSelect,
      })
      return reply.code(201).send(u)
    } catch (e) {
      if (e.code === 'P2002') return reply.code(409).send({ error: uniqueErrorMessage(e) })
      throw e
    }
  })

  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('usuarios', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const b = request.body || {}
    const current = await fastify.prisma.user.findUnique({ where: { id }, select: { ...userSelect, passwordHash: true } })
    if (!current) return reply.code(404).send({ error: 'no encontrado' })
    const data = {}

    if (b.nombre !== undefined) {
      const nombre = cleanText(b.nombre)
      if (!nombre) return reply.code(400).send({ error: 'nombre requerido' })
      data.nombre = nombre
    }
    if (b.role !== undefined) {
      const role = cleanText(b.role)
      if (!ROLES.has(role)) return reply.code(400).send({ error: 'role invalido' })
      data.role = role
    }
    if (b.rut !== undefined) data.rut = cleanText(b.rut)
    if (b.codigoVendedor !== undefined) data.codigoVendedor = cleanText(b.codigoVendedor)
    if (b.cargo !== undefined) data.cargo = cleanText(b.cargo)
    if (b.permisoDescuentos !== undefined) data.permisoDescuentos = Boolean(b.permisoDescuentos)
    if (b.permisoAprobarDescuentos !== undefined) data.permisoAprobarDescuentos = Boolean(b.permisoAprobarDescuentos)
    if (b.activo !== undefined) data.activo = Boolean(b.activo)
    if (b.permisosExtra !== undefined) {
      const permisos = sanitizePermisosExtra(b.permisosExtra)
      if (permisos.error) return reply.code(400).send({ error: permisos.error })
      data.permisosExtra = permisos.value
    }
    if (b.tiposVentaPermitidos !== undefined) {
      const tiposVenta = sanitizeTiposVentaPermitidos(b.tiposVentaPermitidos)
      if (tiposVenta.error) return reply.code(400).send({ error: tiposVenta.error })
      data.tiposVentaPermitidos = tiposVenta.value
    }
    if (b.sucursalId !== undefined) {
      const parsedSucursal = parseOptionalId(b.sucursalId, 'sucursalId')
      if (parsedSucursal.error) return reply.code(400).send({ error: parsedSucursal.error })
      const sucursalError = await validateSucursal(fastify.prisma, parsedSucursal.value)
      if (sucursalError) return reply.code(404).send({ error: sucursalError })
      data.sucursalId = parsedSucursal.value
    }
    if (b.password) data.passwordHash = await bcrypt.hash(String(b.password), 10)

    const duplicate = await validateDuplicates(fastify.prisma, {
      id,
      rut: data.rut,
      codigoVendedor: data.codigoVendedor,
    })
    if (duplicate) return reply.code(409).send({ error: duplicate })

    const safetyError = await ensureAdminSafety(fastify.prisma, request.user, current, data)
    if (safetyError) return reply.code(409).send({ error: safetyError })

    try {
      const u = await fastify.prisma.user.update({ where: { id }, data, select: userSelect })
      if (data.passwordHash || data.role !== undefined || data.activo === false || data.permisosExtra !== undefined || data.tiposVentaPermitidos !== undefined) {
        await fastify.prisma.session.deleteMany({ where: { userId: id } })
      }
      return u
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' })
      if (e.code === 'P2002') return reply.code(409).send({ error: uniqueErrorMessage(e) })
      throw e
    }
  })

  fastify.put('/:id/permisos', {
    preHandler: [fastify.authenticate, fastify.rbac('usuarios', 'write', { allowExtra: false })],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const permisos = sanitizePermisosExtra(request.body?.permisosExtra)
    if (permisos.error) return reply.code(400).send({ error: permisos.error })
    try {
      const u = await fastify.prisma.user.update({
        where: { id },
        data: { permisosExtra: permisos.value },
        select: { id: true, permisosExtra: true },
      })
      await fastify.prisma.session.deleteMany({ where: { userId: id } })
      return u
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'no encontrado' })
      throw e
    }
  })

  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.rbac('usuarios', 'delete', { allowExtra: false })],
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: 'ID invalido' })
    const current = await fastify.prisma.user.findUnique({ where: { id }, select: userSelect })
    if (!current) return reply.code(404).send({ error: 'no encontrado' })
    const safetyError = await ensureAdminSafety(fastify.prisma, request.user, current, { activo: false })
    if (safetyError) return reply.code(409).send({ error: safetyError })
    await fastify.prisma.$transaction([
      fastify.prisma.session.deleteMany({ where: { userId: id } }),
      fastify.prisma.user.update({ where: { id }, data: { activo: false } }),
    ])
    return reply.code(204).send()
  })
}
