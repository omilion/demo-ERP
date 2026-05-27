import { can } from '../../middleware/rbac.js'
import { computeEstado, normalizeProductoFotos, sanitizeProductoCosto } from './helpers.js'
import { attachConsultaPreciosData } from './pricing.js'

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function matchesNormalizedContains(value, search) {
  return normalizeSearchText(value).includes(normalizeSearchText(search))
}

export default async function listProductos(fastify) {
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.rbac('catalogo', 'read')],
  }, async (request, reply) => {
    const {
      bodega,
      search,
      codigoBarra,
      codigoInterno,
      nombre,
      visibleWeb,
      destacadoWeb,
      categoria,
      categoriaId,
      subcategoriaId,
      subcategoria,
      proveedor,
      proveedorId,
      proveedorCodigo,
      idMarco,
      ubicacion,
      estadoInventario,
      estado,
      sort,
      page = '1',
    } = request.query
    if (bodega && !['Inventario', 'Taller'].includes(bodega)) {
      return reply.code(400).send({ error: 'bodega debe ser Inventario o Taller' })
    }
    const parsedPage = parseInt(page, 10)
    if (Number.isNaN(parsedPage) || parsedPage < 1) return reply.code(400).send({ error: 'page invalido' })
    const where = { activo: true }
    const andFilters = []
    if (bodega) where.bodega = bodega
    if (visibleWeb === 'true') where.visibleWeb = true
    else if (visibleWeb === 'false') where.visibleWeb = false
    if (destacadoWeb === 'true') where.destacadoWeb = true
    if (categoriaId) {
      const parsedCategoriaId = parseInt(categoriaId, 10)
      if (Number.isNaN(parsedCategoriaId)) return reply.code(400).send({ error: 'categoriaId invalido' })
      const selectedCategoria = await fastify.prisma.categoria.findFirst({
        where: { id: parsedCategoriaId, activo: true },
        select: { nombre: true },
      })
      if (selectedCategoria?.nombre) {
        andFilters.push({
          OR: [
            { categoriaId: parsedCategoriaId },
            { categoria: { contains: selectedCategoria.nombre, mode: 'insensitive' } },
          ],
        })
      } else {
        where.categoriaId = parsedCategoriaId
      }
    } else if (categoria) where.categoria = { contains: categoria, mode: 'insensitive' }
    if (subcategoriaId) {
      const parsedSubcategoriaId = parseInt(subcategoriaId, 10)
      if (Number.isNaN(parsedSubcategoriaId)) return reply.code(400).send({ error: 'subcategoriaId invalido' })
      where.subcategoriaId = parsedSubcategoriaId
    } else if (subcategoria) {
      where.subcategoria = { is: { nombre: { contains: subcategoria, mode: 'insensitive' } } }
    }
    if (proveedorId) {
      const parsedProveedorId = parseInt(proveedorId, 10)
      if (Number.isNaN(parsedProveedorId)) return reply.code(400).send({ error: 'proveedorId invalido' })
      const selectedProveedor = await fastify.prisma.proveedor.findFirst({
        where: { id: parsedProveedorId, activo: true },
        select: { id: true, codigoProveedor: true, nombre: true, razonSocial: true },
      })
      if (!selectedProveedor) {
        where.proveedorId = parsedProveedorId
      } else {
        const legacyValues = [
          selectedProveedor.codigoProveedor != null ? String(selectedProveedor.codigoProveedor) : '',
          selectedProveedor.nombre,
          selectedProveedor.razonSocial,
        ].filter(Boolean)
        andFilters.push({
          OR: [
            { proveedorId: parsedProveedorId },
            ...legacyValues.map(value => ({ proveedor: { contains: value, mode: 'insensitive' } })),
          ],
        })
      }
    } else if (proveedorCodigo) {
      const parsedProveedorCodigo = parseInt(proveedorCodigo, 10)
      if (Number.isNaN(parsedProveedorCodigo)) return reply.code(400).send({ error: 'proveedorCodigo invalido' })
      const proveedores = await fastify.prisma.proveedor.findMany({
        where: { codigoProveedor: parsedProveedorCodigo, activo: true },
        select: { id: true, nombre: true, razonSocial: true },
      })
      andFilters.push({
        OR: [
          ...proveedores.map(p => ({ proveedorId: p.id })),
          ...proveedores.flatMap(p => [p.nombre, p.razonSocial].filter(Boolean).map(v => ({ proveedor: { contains: v, mode: 'insensitive' } }))),
          { proveedor: { contains: proveedorCodigo, mode: 'insensitive' } },
        ],
      })
    } else if (proveedor) where.proveedor = { contains: proveedor, mode: 'insensitive' }
    if (idMarco) where.idMarco = { contains: idMarco, mode: 'insensitive' }
    if (ubicacion) where.ubicacion = { contains: ubicacion, mode: 'insensitive' }
    if (estadoInventario) where.estadoInventario = estadoInventario
    if (codigoBarra) where.codigoBarra = { equals: codigoBarra, mode: 'insensitive' }
    if (codigoInterno) where.codigoInterno = { contains: codigoInterno, mode: 'insensitive' }
    const filterNombreInMemory = Boolean(nombre)
    // estado computado: 'sin-stock' | 'critico' | 'normal'
    if (estado === 'sin-stock') where.stock = 0
    else if (estado === 'critico') {
      where.stock = { gt: 0 }
      where.stockCritico = { gt: 0 }
    }
    if (search) andFilters.push({
      OR: [
        { nombre: { contains: search, mode: 'insensitive' } },
        { codigoInterno: { contains: search, mode: 'insensitive' } },
        { codigoBarra: { contains: search, mode: 'insensitive' } },
        { idMarco: { contains: search, mode: 'insensitive' } },
        { proveedor: { contains: search, mode: 'insensitive' } },
        { categoria: { contains: search, mode: 'insensitive' } },
        { subcategoria: { is: { nombre: { contains: search, mode: 'insensitive' } } } },
      ],
    })
    if (andFilters.length) where.AND = andFilters
    const LIMIT = 500
    const sortByNombre = sort === 'nombre'
    // Prisma no compara columnas en where; acotamos y filtramos la comparacion final en memoria.
    const fetchInMemory = estado === 'critico' || filterNombreInMemory
    const fetchTake = fetchInMemory ? 5000 : LIMIT
    const skip = fetchInMemory ? 0 : (parsedPage - 1) * LIMIT
    const [productos, total] = await Promise.all([
      fastify.prisma.producto.findMany({
        where,
        orderBy: sortByNombre ? [{ nombre: 'asc' }] : [{ stock: 'desc' }, { nombre: 'asc' }],
        take: fetchTake,
        skip,
        include: { subcategoria: true },
      }),
      fastify.prisma.producto.count({ where }),
    ])
    let items = await attachConsultaPreciosData(
      fastify.prisma,
      productos.map(p => normalizeProductoFotos({ ...p, estado: computeEstado(p) })),
    )
    if (estado === 'critico') items = items.filter(p => p.estado === 'Crítico').slice(0, LIMIT)
    if (filterNombreInMemory) items = items.filter(p => matchesNormalizedContains(p.nombre, nombre))
    if (!sortByNombre) items.sort((a, b) => {
      const order = { 'Normal': 0, 'Crítico': 1, 'Sin stock': 2 }
      const diff = (order[a.estado] ?? 0) - (order[b.estado] ?? 0)
      if (diff !== 0) return diff
      if ((b.stock ?? 0) !== (a.stock ?? 0)) return (b.stock ?? 0) - (a.stock ?? 0)
      return a.nombre.localeCompare(b.nombre, 'es')
    })
    const responseTotal = fetchInMemory ? items.length : total
    if (filterNombreInMemory) items = items.slice((parsedPage - 1) * LIMIT, parsedPage * LIMIT)
    const canReadCosto = can(request.user?.role, 'bodega', 'read', request.user?.permisosExtra)
    items = items.map(item => sanitizeProductoCosto(item, canReadCosto))
    return {
      items,
      total: responseTotal,
      limit: LIMIT,
      page: parsedPage,
      pages: Math.max(1, Math.ceil(responseTotal / LIMIT)),
    }
  })
}
