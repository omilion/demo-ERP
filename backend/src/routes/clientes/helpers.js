export async function computeSaldo(prisma, clienteId) {
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(SUM(
      COALESCE(t.subtotal, 0) * (1 - o.descuento_pct / 100.0) - o.abono
    ), 0)::float AS saldo
    FROM ventas.ordenes o
    LEFT JOIN (
      SELECT orden_id, SUM(cantidad * precio_unitario) AS subtotal
      FROM ventas.orden_items
      GROUP BY orden_id
    ) t ON t.orden_id = o.id
    WHERE o.estado_pago != 'Pagada' AND o.cliente_id = ${clienteId}
  `
  return Number(rows[0]?.saldo ?? 0)
}
