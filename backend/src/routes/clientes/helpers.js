export async function computeSaldo(prisma, clienteId) {
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(SUM(
      COALESCE(t.subtotal, 0) + COALESCE(c.cargos, 0) - ROUND((COALESCE(t.subtotal, 0) + COALESCE(c.cargos, 0)) * COALESCE(o.descuento_pct, 0) / 100.0) - o.abono
    ), 0)::float AS saldo
    FROM ventas.ordenes o
    LEFT JOIN (
      SELECT orden_id, SUM(cantidad * precio_unitario) AS subtotal
      FROM ventas.orden_items
      GROUP BY orden_id
    ) t ON t.orden_id = o.id
    LEFT JOIN (
      SELECT orden_id, SUM(valor) AS cargos
      FROM ventas.orden_cargos
      GROUP BY orden_id
    ) c ON c.orden_id = o.id
    WHERE o.estado_pago != 'Pagada' AND o.cliente_id = ${clienteId}
  `
  return Number(rows[0]?.saldo ?? 0)
}

export function normalizeClienteText(value) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed || undefined
}

export function normalizeClientePayload(data = {}) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, normalizeClienteText(value)]),
  )
}

export function handleClienteUniqueError(error, reply) {
  if (error?.code !== 'P2002') return false
  const target = Array.isArray(error.meta?.target)
    ? error.meta.target.join(',')
    : String(error.meta?.target || '')
  if (target.toLowerCase().includes('email')) {
    reply.code(409).send({ error: 'Ya existe un cliente con ese email' })
    return true
  }
  if (target.toLowerCase().includes('rut')) {
    reply.code(409).send({ error: 'Ya existe un cliente con ese RUT' })
    return true
  }
  reply.code(409).send({ error: 'Ya existe un cliente con esos datos' })
  return true
}

export async function ensureClienteIdentifiersAvailable(prisma, data = {}, reply, excludeId = null) {
  if (!data.rut) return true

  const existing = await prisma.cliente.findFirst({
    where: {
      rut: data.rut,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, rut: true },
  })
  if (!existing) return true

  reply.code(409).send({ error: 'Ya existe un cliente registrado con ese RUT' })
  return false
}

// Resumen real de las ventas del cliente.
//
// El panel mostraba estos numeros contando la lista que trae el detalle, que
// viene acotada a las ultimas 50: un cliente con 5.157 ventas aparecia con 50 y
// un monto proporcionalmente equivocado. Aca se calculan sobre la tabla completa.
//
// La formula replica computeTotal() de ventas/helpers.js: base = items + cargos,
// y si hay descuento congelado en monto manda sobre el porcentaje.
export async function computeVentasResumen(prisma, clienteId) {
  const rows = await prisma.$queryRaw`
    WITH base AS (
      SELECT
        o.id,
        o.estado_pago,
        COALESCE(t.subtotal, 0) + COALESCE(c.cargos, 0) AS bruto,
        COALESCE(o.descuento_pct, 0) AS pct,
        COALESCE(o.descuento_monto, 0) AS monto_desc
      FROM ventas.ordenes o
      LEFT JOIN (
        SELECT orden_id, SUM(cantidad * precio_unitario) AS subtotal
        FROM ventas.orden_items GROUP BY orden_id
      ) t ON t.orden_id = o.id
      LEFT JOIN (
        SELECT orden_id, SUM(valor) AS cargos
        FROM ventas.orden_cargos GROUP BY orden_id
      ) c ON c.orden_id = o.id
      WHERE o.cliente_id = ${clienteId}
    )
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE estado_pago = 'No pagada')::int AS no_pagadas,
      COALESCE(SUM(
        CASE WHEN monto_desc > 0
          THEN GREATEST(0, bruto - monto_desc)
          ELSE bruto - ROUND(bruto * pct / 100.0)
        END
      ), 0)::float AS monto_total
    FROM base
  `
  const r = rows[0] || {}
  return { total: Number(r.total ?? 0), noPagadas: Number(r.no_pagadas ?? 0), montoTotal: Number(r.monto_total ?? 0) }
}
