export function computeTotal(items, descuentoPct = 0) {
  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)
  return subtotal * (1 - descuentoPct / 100)
}

export async function attachCliente(fastify, orden) {
  if (!orden.clienteId) return { ...orden, cliente: null }
  const cliente = await fastify.prisma.cliente.findUnique({
    where: { id: orden.clienteId },
    select: { id: true, nombre: true, rut: true, email: true, telefono: true, ciudad: true, razonSocial: true, tipo: true },
  })
  const clienteSucursal = orden.clienteSucursalId
    ? await fastify.prisma.clienteSucursal.findFirst({
        where: { id: orden.clienteSucursalId },
        select: { id: true, nombre: true, direccion: true, comuna: true, ciudad: true, region: true, contacto: true, email: true, telefono: true, isPrincipal: true },
      })
    : null
  return { ...orden, cliente, clienteSucursal }
}

export async function attachProductos(fastify, items = []) {
  if (!items.length) return items
  const ids = [...new Set(items.map(i => i.productoId).filter(Boolean))]
  const productos = await fastify.prisma.producto.findMany({
    where: { id: { in: ids } },
    select: { id: true, nombre: true, codigoInterno: true },
  })
  const map = Object.fromEntries(productos.map(p => [p.id, p]))
  return items.map(i => ({ ...i, producto: map[i.productoId] || null }))
}

export async function attachClientes(fastify, ordenes) {
  const clienteIds = [...new Set(ordenes.map(o => o.clienteId).filter(Boolean))]
  if (clienteIds.length === 0) return ordenes.map(o => ({ ...o, cliente: null }))
  const clientes = await fastify.prisma.cliente.findMany({
    where: { id: { in: clienteIds } },
    select: { id: true, nombre: true, rut: true },
  })
  const map = Object.fromEntries(clientes.map(c => [c.id, c]))
  const sucursalIds = [...new Set(ordenes.map(o => o.clienteSucursalId).filter(Boolean))]
  const sucursales = sucursalIds.length
    ? await fastify.prisma.clienteSucursal.findMany({
        where: { id: { in: sucursalIds } },
        select: { id: true, nombre: true, direccion: true, comuna: true, ciudad: true, region: true },
      })
    : []
  const sucursalMap = Object.fromEntries(sucursales.map(s => [s.id, s]))
  return ordenes.map(o => ({
    ...o,
    cliente: o.clienteId ? (map[o.clienteId] || null) : null,
    clienteSucursal: o.clienteSucursalId ? (sucursalMap[o.clienteSucursalId] || null) : null,
  }))
}
