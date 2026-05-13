export async function computeSaldo(prisma, clienteId) {
  const ordenes = await prisma.orden.findMany({
    where: { clienteId, estadoPago: { not: 'Pagada' } },
    include: { items: true },
  })
  return ordenes.reduce((sum, o) => {
    const total = o.items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0) * (1 - o.descuentoPct / 100)
    return sum + (total - o.abono)
  }, 0)
}
