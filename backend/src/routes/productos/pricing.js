function toNumber(value) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function lowerKey(value) {
  return String(value ?? '').trim().toLowerCase()
}

function withIva(net) {
  return net + Math.round(net * 19 / 100)
}

function legacyMarkedPrice(base, pct) {
  return base + Math.round(base * toNumber(pct) / 100)
}

function providerDisplayName(proveedor) {
  if (!proveedor) return ''
  return proveedor.nombre || proveedor.razonSocial || ''
}

function findProveedor(producto, providers) {
  if (!producto) return null
  if (producto.proveedorId && providers.byId.has(producto.proveedorId)) return providers.byId.get(producto.proveedorId)
  const raw = lowerKey(producto.proveedor)
  if (!raw) return null
  if (providers.byCodigo.has(raw)) return providers.byCodigo.get(raw)
  if (providers.byNombre.has(raw)) return providers.byNombre.get(raw)
  if (providers.byRazon.has(raw)) return providers.byRazon.get(raw)
  return null
}

function findCategoria(producto, categories) {
  if (!producto) return null
  if (producto.categoriaId && categories.byId.has(producto.categoriaId)) return categories.byId.get(producto.categoriaId)
  const raw = lowerKey(producto.categoria)
  if (!raw) return null
  return categories.byNombre.get(raw) || null
}

function mapProviders(proveedores) {
  const mapped = { byId: new Map(), byCodigo: new Map(), byNombre: new Map(), byRazon: new Map() }
  for (const proveedor of proveedores) {
    mapped.byId.set(proveedor.id, proveedor)
    if (proveedor.codigoProveedor != null) mapped.byCodigo.set(String(proveedor.codigoProveedor), proveedor)
    if (proveedor.nombre) mapped.byNombre.set(lowerKey(proveedor.nombre), proveedor)
    if (proveedor.razonSocial) mapped.byRazon.set(lowerKey(proveedor.razonSocial), proveedor)
  }
  return mapped
}

function mapCategories(categorias) {
  const mapped = { byId: new Map(), byNombre: new Map() }
  for (const categoria of categorias) {
    mapped.byId.set(categoria.id, categoria)
    if (categoria.nombre) mapped.byNombre.set(lowerKey(categoria.nombre), categoria)
  }
  return mapped
}

export function computeConsultaPrecios(producto, categoria, proveedor) {
  const precioBase = toNumber(producto.precioLista)
  const pctSala = toNumber(proveedor?.porcVentaSala)
  const pctLicitacion = toNumber(proveedor?.porcLicitacion)
  const porcDescCategoria = toNumber(categoria?.porcDesc)
  const porcDescProducto = toNumber(producto.porcDesc)
  const precioSalaNeto = legacyMarkedPrice(precioBase, pctSala)
  const descuentoNeto = Math.round(precioSalaNeto * (porcDescCategoria + porcDescProducto) / 100)
  const precioConDescuentoNeto = Math.max(0, precioSalaNeto - descuentoNeto)

  return {
    categoriaNombre: categoria?.nombre || producto.categoria || '',
    subcategoriaNombre: producto.subcategoria?.nombre || '',
    proveedorNombre: providerDisplayName(proveedor) || producto.proveedor || '',
    proveedorCodigo: proveedor?.codigoProveedor ?? null,
    porcDescCategoria,
    porcDescProducto,
    precioNormalSalaVentaIva: withIva(precioSalaNeto),
    precioConDescuento: withIva(precioConDescuentoNeto),
    precioConvMarco: toNumber(producto.precioMarco),
    precioLicitacion: legacyMarkedPrice(precioBase, pctLicitacion),
  }
}

export async function attachConsultaPreciosData(prisma, productos) {
  if (!productos.length) return productos
  const [categorias, proveedores] = await Promise.all([
    prisma.categoria.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, porcDesc: true },
    }),
    prisma.proveedor.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        razonSocial: true,
        codigoProveedor: true,
        porcVentaSala: true,
        porcLicitacion: true,
      },
    }),
  ])
  const categoryMap = mapCategories(categorias)
  const providerMap = mapProviders(proveedores)

  return productos.map(producto => {
    const categoria = findCategoria(producto, categoryMap)
    const proveedor = findProveedor(producto, providerMap)
    return {
      ...producto,
      consultaPrecios: computeConsultaPrecios(producto, categoria, proveedor),
    }
  })
}
