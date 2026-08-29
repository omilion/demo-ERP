import { can } from '../../middleware/rbac.js'
import { attachStockOperacional, computeEstado, computeEstadoOperacional, normalizeProductoFotos, sanitizeProductoCosto } from './helpers.js'
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
      ubicacionId,
      estadoInventario,
      estado,
      calidad,
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
    if (ubicacionId) {
      const parsedUbicacionId = parseInt(ubicacionId, 10)
      if (Number.isNaN(parsedUbicacionId)) return reply.code(400).send({ error: 'ubicacionId invalido' })
      const selectedUbicacion = await fastify.prisma.ubicacion.findFirst({
        where: { id: parsedUbicacionId, activo: true },
        select: { nombre: true },
      })
      if (selectedUbicacion?.nombre) {
        andFilters.push({
          OR: [
            { ubicacionId: parsedUbicacionId },
            { ubicacion: { contains: selectedUbicacion.nombre, mode: 'insensitive' } },
          ],
        })
      } else {
        where.ubicacionId = parsedUbicacionId
      }
    } else if (ubicacion) where.ubicacion = { contains: ubicacion, mode: 'insensitive' }
    if (estadoInventario) where.estadoInventario = estadoInventario
    if (codigoBarra) where.codigoBarra = { equals: codigoBarra, mode: 'insensitive' }
    if (codigoInterno) where.codigoInterno = { contains: codigoInterno, mode: 'insensitive' }
    const filterNombreInMemory = Boolean(nombre)
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
    // Mismos criterios que las tarjetas de "calidad de catalogo" del dashboard
    // (backend/src/routes/dashboard/stats.js) - deben coincidir para que el
    // click en el KPI muestre exactamente los productos que cuenta el numero.
    const CALIDAD_FILTROS = ['sin-codigo-barra', 'sin-codigo-interno', 'sin-categoria', 'sin-proveedor']
    if (calidad && !CALIDAD_FILTROS.includes(calidad)) {
      return reply.code(400).send({ error: `calidad debe ser una de: ${CALIDAD_FILTROS.join(', ')}` })
    }
    if (calidad === 'sin-codigo-barra') andFilters.push({ OR: [{ codigoBarra: null }, { codigoBarra: '' }] })
    else if (calidad === 'sin-codigo-interno') andFilters.push({ OR: [{ codigoInterno: null }, { codigoInterno: '' }] })
    else if (calidad === 'sin-categoria') where.categoriaId = null
    else if (calidad === 'sin-proveedor') where.proveedorId = null
    if (andFilters.length) where.AND = andFilters
    const statsWhere = JSON.parse(JSON.stringify(where))
    // estado computado: 'sin-stock' | 'critico' | 'normal'
    if (estado === 'critico') where.stockCritico = { gt: 0 }
    const LIMIT = 500
    const sortByNombre = sort === 'nombre'
    // Prisma no compara columnas en where; acotamos y filtramos la comparacion final en memoria.
    const fetchInMemory = ['critico', 'sin-stock'].includes(estado) || filterNombreInMemory
    const fetchTake = fetchInMemory ? 5000 : LIMIT
    const skip = fetchInMemory ? 0 : (parsedPage - 1) * LIMIT
    const [productos, total, statsRows] = await Promise.all([
      fastify.prisma.producto.findMany({
        where,
        orderBy: sortByNombre ? [{ nombre: 'asc' }] : [{ stock: 'desc' }, { nombre: 'asc' }],
        take: fetchTake,
        skip,
        include: { subcategoria: true, ubicacionCatalogo: true },
      }),
      fastify.prisma.producto.count({ where }),
      fastify.prisma.producto.findMany({
        where: statsWhere,
        select: { stock: true, stockReservado: true, stockDanado: true, stockCritico: true, precioLista: true },
      }),
    ])
    let items = await attachConsultaPreciosData(
      fastify.prisma,
      productos.map(p => {
        const item = attachStockOperacional(p)
        return normalizeProductoFotos({ ...item, estado: computeEstado(item), estadoOperacional: computeEstadoOperacional(item) })
      }),
    )
    if (estado === 'critico') items = items.filter(p => p.estado === 'Crítico').slice(0, LIMIT)
    if (estado === 'sin-stock') items = items.filter(p => p.estado === 'Sin stock').slice(0, LIMIT)
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
    const stats = statsRows.reduce((acc, p) => {
      const stockFisico = Number(p.stock || 0)
      const stockReservado = Number(p.stockReservado || 0)
      const stockDanado = Number(p.stockDanado || 0)
      const stock = Math.max(0, stockFisico - stockReservado - stockDanado)
      const stockCritico = Number(p.stockCritico || 0)
      acc.total += 1
      if (stock === 0) acc.sinStock += 1
      if (stock > 0 && stockCritico > 0 && stock <= stockCritico) acc.critico += 1
      acc.valorInventario += Number(p.precioLista || 0) * stock
      acc.stockFisico += stockFisico
      acc.stockReservado += stockReservado
      acc.stockDanado += stockDanado
      acc.stockDisponible += stock
      return acc
    }, { total: 0, critico: 0, sinStock: 0, valorInventario: 0, stockFisico: 0, stockReservado: 0, stockDanado: 0, stockDisponible: 0 })
    return {
      items,
      total: responseTotal,
      stats: canReadCosto ? stats : { ...stats, valorInventario: null },
      limit: LIMIT,
      page: parsedPage,
      pages: Math.max(1, Math.ceil(responseTotal / LIMIT)),
    }
  })
}
