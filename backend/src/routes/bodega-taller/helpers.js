import { getUserSucursalId } from '../caja/scope.js'

export function parsePositiveIntValue(value, field) {
  if (value === undefined) return { provided: false, value: null }
  if (value === null || value === '') return { provided: true, value: null }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return { provided: true, error: `${field} invalido` }
  return { provided: true, value: parsed }
}

export function isStockCriticoFilter(value) {
  return ['true', '1', 'si', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}

function addAnd(where, condition) {
  if (!condition) return
  if (!where.AND) where.AND = []
  where.AND.push(condition)
}

async function proveedorSearchIds(prisma, value) {
  const text = String(value ?? '').trim()
  if (!text) return []
  const or = [
    { nombre: { contains: text, mode: 'insensitive' } },
    { razonSocial: { contains: text, mode: 'insensitive' } },
  ]
  const codigo = Number.parseInt(text, 10)
  if (Number.isInteger(codigo)) or.push({ codigoProveedor: codigo })
  const proveedores = await prisma.proveedor.findMany({
    where: { activo: true, OR: or },
    select: { id: true },
    take: 200,
  })
  return proveedores.map(p => p.id)
}

export async function buildBodegaTallerWhere(prisma, query = {}, user = null) {
  const {
    search,
    codigoInterno,
    codigoBarra,
    nombre,
    categoriaId,
    subcategoriaId,
    proveedor,
    proveedorId,
    sucursalId,
    stockCritico,
    page = '1',
  } = query

  const parsedPage = Number.parseInt(page, 10)
  if (!Number.isInteger(parsedPage) || parsedPage <= 0) return { error: 'page invalido' }

  const where = { activo: true }
  const userSucursalId = getUserSucursalId(user)
  if (userSucursalId) {
    addAnd(where, { OR: [{ sucursalId: userSucursalId }, { sucursalId: null }] })
  } else {
    const parsedSucursal = parsePositiveIntValue(sucursalId, 'sucursalId')
    if (parsedSucursal.error) return { error: parsedSucursal.error }
    if (parsedSucursal.provided) where.sucursalId = parsedSucursal.value
  }

  const parsedCategoria = parsePositiveIntValue(categoriaId, 'categoriaId')
  const parsedSubcategoria = parsePositiveIntValue(subcategoriaId, 'subcategoriaId')
  const parsedProveedor = parsePositiveIntValue(proveedorId, 'proveedorId')
  if (parsedCategoria.error) return { error: parsedCategoria.error }
  if (parsedSubcategoria.error) return { error: parsedSubcategoria.error }
  if (parsedProveedor.error) return { error: parsedProveedor.error }
  if (parsedCategoria.provided) where.categoriaId = parsedCategoria.value
  if (parsedSubcategoria.provided) where.subcategoriaId = parsedSubcategoria.value
  if (parsedProveedor.provided) where.proveedorId = parsedProveedor.value

  if (codigoInterno) where.codigoInterno = { contains: String(codigoInterno).trim(), mode: 'insensitive' }
  if (codigoBarra) where.codigoBarra = { contains: String(codigoBarra).trim(), mode: 'insensitive' }
  if (nombre) where.nombre = { contains: String(nombre).trim(), mode: 'insensitive' }

  if (!parsedProveedor.provided && proveedor) {
    const ids = await proveedorSearchIds(prisma, proveedor)
    addAnd(where, ids.length ? { proveedorId: { in: ids } } : { proveedorId: -1 })
  }

  if (search) {
    const providerIds = await proveedorSearchIds(prisma, search)
    addAnd(where, {
      OR: [
        { codigoInterno: { contains: String(search).trim(), mode: 'insensitive' } },
        { nombre: { contains: String(search).trim(), mode: 'insensitive' } },
        { codigoBarra: { contains: String(search).trim(), mode: 'insensitive' } },
        ...(providerIds.length ? [{ proveedorId: { in: providerIds } }] : []),
      ],
    })
  }

  return {
    where,
    page: parsedPage,
    stockCritico: isStockCriticoFilter(stockCritico),
  }
}

function mapById(rows) {
  return new Map(rows.map(row => [row.id, row]))
}

export async function enrichBodegaTallerItems(prisma, items = []) {
  const categoriaIds = [...new Set(items.map(i => i.categoriaId).filter(Boolean))]
  const subcategoriaIds = [...new Set(items.map(i => i.subcategoriaId).filter(Boolean))]
  const proveedorIds = [...new Set(items.map(i => i.proveedorId).filter(Boolean))]
  const sucursalIds = [...new Set(items.map(i => i.sucursalId).filter(Boolean))]

  const [categorias, subcategorias, proveedores, sucursales] = await Promise.all([
    categoriaIds.length
      ? prisma.categoriaBodegaTaller.findMany({ where: { id: { in: categoriaIds } }, select: { id: true, nombre: true } })
      : [],
    subcategoriaIds.length
      ? prisma.subcategoriaBodegaTaller.findMany({ where: { id: { in: subcategoriaIds } }, select: { id: true, nombre: true } })
      : [],
    proveedorIds.length
      ? prisma.proveedor.findMany({ where: { id: { in: proveedorIds } }, select: { id: true, nombre: true, razonSocial: true, codigoProveedor: true } })
      : [],
    sucursalIds.length
      ? prisma.sucursal.findMany({ where: { id: { in: sucursalIds } }, select: { id: true, nombre: true } })
      : [],
  ])

  const categoriaMap = mapById(categorias)
  const subcategoriaMap = mapById(subcategorias)
  const proveedorMap = mapById(proveedores)
  const sucursalMap = mapById(sucursales)

  return items.map(item => {
    const proveedor = item.proveedorId ? proveedorMap.get(item.proveedorId) : null
    return {
      ...item,
      categoriaNombre: item.categoriaId ? categoriaMap.get(item.categoriaId)?.nombre ?? null : null,
      subcategoriaNombre: item.subcategoriaId ? subcategoriaMap.get(item.subcategoriaId)?.nombre ?? null : null,
      proveedorNombre: proveedor ? (proveedor.nombre || proveedor.razonSocial || `Proveedor #${proveedor.id}`) : null,
      proveedorCodigo: proveedor?.codigoProveedor ?? null,
      sucursalNombre: item.sucursalId ? sucursalMap.get(item.sucursalId)?.nombre ?? `Sucursal #${item.sucursalId}` : null,
    }
  })
}

export function filterStockCriticoItems(items = []) {
  return items.filter(item => Number(item.stock || 0) <= Number(item.stockCritico || 0))
}
