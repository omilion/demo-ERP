import { can } from '../../middleware/rbac.js'

const TEXT_FIELDS = ['nombre', 'razonSocial', 'rut', 'giro', 'email', 'telefono', 'direccion', 'region', 'comuna']
const REQUIRED_CREATE_FIELDS = ['nombre', 'razonSocial', 'rut', 'giro', 'email', 'telefono', 'direccion', 'region', 'comuna']
const INTEGER_FIELDS = ['codigoProveedor', 'porcVentaSala', 'porcMarco', 'porcLicitacion']

function cleanText(value) {
  if (value === undefined) return undefined
  if (value === null) return null
  const text = String(value).trim()
  return text || null
}

export function normalizeRut(value) {
  return String(value || '').replace(/[.\-\s]/g, '').trim().toUpperCase()
}

export function formatRut(value) {
  const normalized = normalizeRut(value)
  if (!/^\d{1,8}[0-9K]$/.test(normalized)) return cleanText(value)
  const body = normalized.slice(0, -1)
  const dv = normalized.slice(-1)
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

export function isValidRut(value) {
  const rut = normalizeRut(value)
  if (!/^\d{1,8}[0-9K]$/.test(rut)) return false
  const body = rut.slice(0, -1)
  const dv = rut.slice(-1)
  if (/^0+$/.test(body)) return false

  let sum = 0
  let factor = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const expected = 11 - (sum % 11)
  const expectedDv = expected === 11 ? '0' : expected === 10 ? 'K' : String(expected)
  return expectedDv === dv
}

function normalizeComparableText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('es-CL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function parseInteger(value, field) {
  if (value === undefined) return { omitted: true }
  if (value === null || value === '') return { value: field === 'codigoProveedor' ? null : 0 }
  const n = Number(value)
  if (!Number.isInteger(n) || n < (field === 'codigoProveedor' ? 1 : 0)) {
    return { error: `${field} debe ser un entero ${field === 'codigoProveedor' ? 'mayor a 0' : 'mayor o igual a 0'}` }
  }
  return { value: n }
}

export function cleanProveedorPayload(body = {}, { partial = false } = {}) {
  const data = {}
  const errors = []

  for (const field of TEXT_FIELDS) {
    if (body[field] === undefined) continue
    data[field] = field === 'rut' && cleanText(body[field]) ? formatRut(body[field]) : cleanText(body[field])
  }

  for (const field of INTEGER_FIELDS) {
    const parsed = parseInteger(body[field], field)
    if (parsed.error) errors.push(parsed.error)
    else if (!parsed.omitted) data[field] = parsed.value
  }

  if (!partial) {
    for (const field of ['porcVentaSala', 'porcMarco', 'porcLicitacion']) {
      if (data[field] === undefined) data[field] = 0
    }
  }

  return { data, error: errors[0] || null }
}

export function validateProveedorPayload(data, { partial = false } = {}) {
  if (!partial) {
    for (const field of REQUIRED_CREATE_FIELDS) {
      if (!data[field]) return `${field} requerido`
    }
  }

  if (!partial || data.nombre !== undefined) {
    if (!data.nombre || data.nombre.length < 4) return 'nombre debe tener al menos 4 caracteres'
  }

  if (!partial || data.rut !== undefined) {
    if (!data.rut) return 'rut requerido'
    if (!isValidRut(data.rut)) return 'rut invalido'
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'email invalido'
  return null
}

export function proveedorOrderBy() {
  return [{ razonSocial: { sort: 'asc', nulls: 'last' } }, { nombre: 'asc' }]
}

function addTextFilter(where, field, value) {
  const text = cleanText(value)
  if (!text) return
  where.AND ||= []
  where.AND.push({ [field]: { contains: text, mode: 'insensitive' } })
}

export function buildProveedorWhere(query = {}) {
  const where = { activo: true }
  const search = cleanText(query.search)
  if (search) {
    const OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { rut: { contains: search, mode: 'insensitive' } },
      { razonSocial: { contains: search, mode: 'insensitive' } },
      { giro: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { telefono: { contains: search, mode: 'insensitive' } },
    ]
    const codigo = Number(search)
    if (Number.isInteger(codigo) && codigo > 0) OR.push({ codigoProveedor: codigo })
    where.AND = [{ OR }]
  }

  addTextFilter(where, 'nombre', query.nombre)
  addTextFilter(where, 'rut', query.rut)

  if (query.codigoProveedor !== undefined && query.codigoProveedor !== '') {
    const codigo = Number(query.codigoProveedor)
    where.AND ||= []
    where.AND.push(Number.isInteger(codigo) && codigo > 0 ? { codigoProveedor: codigo } : { id: -1 })
  }

  return where
}

export function canReadProveedorSensitive(user) {
  return can(user?.role, 'proveedores', 'read', user?.permisosExtra)
    || can(user?.role, 'bodega', 'read', user?.permisosExtra)
}

export function sanitizeProveedor(proveedor, includeSensitive = true) {
  if (!proveedor || includeSensitive) return proveedor
  const { porcVentaSala, porcMarco, porcLicitacion, pagoFactura, pagos, ...safe } = proveedor
  return safe
}

export async function nextCodigoProveedor(prisma) {
  const latest = await prisma.proveedor.findFirst({
    where: { codigoProveedor: { not: null } },
    orderBy: { codigoProveedor: 'desc' },
    select: { codigoProveedor: true },
  })
  return Number(latest?.codigoProveedor || 0) + 1
}

export async function ensureProveedorUnique(prisma, data = {}, excludeId = null) {
  if (data.rut) {
    const normalizedRut = normalizeRut(data.rut)
    const rutMatches = excludeId
      ? await prisma.$queryRaw`
          SELECT id
          FROM catalogo.proveedores
          WHERE regexp_replace(upper(rut), '[^0-9K]', '', 'g') = ${normalizedRut}
            AND id <> ${excludeId}
          LIMIT 1
        `
      : await prisma.$queryRaw`
          SELECT id
          FROM catalogo.proveedores
          WHERE regexp_replace(upper(rut), '[^0-9K]', '', 'g') = ${normalizedRut}
          LIMIT 1
        `
    if (rutMatches.length) return 'rut ya existe'
  }

  const clauses = []
  if (data.nombre) clauses.push({ nombre: { equals: data.nombre, mode: 'insensitive' } })
  if (data.rut) clauses.push({ rut: { equals: data.rut, mode: 'insensitive' } })
  if (data.codigoProveedor != null) clauses.push({ codigoProveedor: data.codigoProveedor })
  if (!clauses.length) return null

  const existing = await prisma.proveedor.findFirst({
    where: {
      OR: clauses,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, nombre: true, rut: true, codigoProveedor: true },
  })
  if (!existing) return null

  if (data.rut && normalizeRut(existing.rut) === normalizeRut(data.rut)) return 'rut ya existe'
  if (data.codigoProveedor != null && existing.codigoProveedor === data.codigoProveedor) return 'codigoProveedor ya existe'
  if (data.nombre && normalizeComparableText(existing.nombre) === normalizeComparableText(data.nombre)) return 'nombre ya existe'
  return 'proveedor ya existe'
}

export function handleProveedorUniqueError(error, reply) {
  if (error?.code !== 'P2002') return false
  const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target || '')
  if (target.toLowerCase().includes('rut')) {
    reply.code(409).send({ error: 'rut ya existe' })
    return true
  }
  reply.code(409).send({ error: 'proveedor ya existe' })
  return true
}
