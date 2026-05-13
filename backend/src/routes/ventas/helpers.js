export function computeTotal(items, descuentoPct = 0) {
  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)
  return subtotal * (1 - descuentoPct / 100)
}

export async function attachCliente(fastify, orden) {
  if (!orden.clienteId) return { ...orden, cliente: null }
  const cliente = await fastify.prisma.cliente.findUnique({
    where: { id: orden.clienteId },
    select: { id: true, nombre: true, rut: true },
  })
  return { ...orden, cliente }
}

export async function attachClientes(fastify, ordenes) {
  const clienteIds = [...new Set(ordenes.map(o => o.clienteId).filter(Boolean))]
  if (clienteIds.length === 0) return ordenes.map(o => ({ ...o, cliente: null }))
  const clientes = await fastify.prisma.cliente.findMany({
    where: { id: { in: clienteIds } },
    select: { id: true, nombre: true, rut: true },
  })
  const map = Object.fromEntries(clientes.map(c => [c.id, c]))
  return ordenes.map(o => ({ ...o, cliente: o.clienteId ? (map[o.clienteId] || null) : null }))
}
