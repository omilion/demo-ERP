import { normalizeProductoFotos } from '../productos/helpers.js'

export async function attachOdtItemProductos(prisma, odts) {
  const list = Array.isArray(odts) ? odts : [odts]
  const productoIds = [...new Set(list.flatMap(odt => odt?.items || []).map(item => item.productoId).filter(Boolean))]
  if (!productoIds.length) return Array.isArray(odts) ? list : list[0]

  const productos = await prisma.producto.findMany({
    where: { id: { in: productoIds } },
    select: { id: true, codigoInterno: true, nombre: true, fotoUrl: true, fotoUrlGrande: true, fotosGaleria: true },
  })
  const byId = new Map(productos.map(producto => [producto.id, normalizeProductoFotos(producto)]))
  const enriched = list.map(odt => ({
    ...odt,
    items: (odt.items || []).map(item => ({
      ...item,
      producto: byId.get(item.productoId) || null,
    })),
  }))
  return Array.isArray(odts) ? enriched : enriched[0]
}
