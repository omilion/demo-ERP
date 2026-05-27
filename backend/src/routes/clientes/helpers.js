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
  const checks = []
  if (data.rut) checks.push({ rut: data.rut })
  if (data.email) checks.push({ email: { equals: data.email, mode: 'insensitive' } })
  if (checks.length === 0) return true

  const existing = await prisma.cliente.findFirst({
    where: {
      OR: checks,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, rut: true, email: true },
  })
  if (!existing) return true

  if (data.rut && existing.rut === data.rut) {
    reply.code(409).send({ error: 'Ya existe un cliente con ese RUT' })
    return false
  }
  reply.code(409).send({ error: 'Ya existe un cliente con ese email' })
  return false
}
