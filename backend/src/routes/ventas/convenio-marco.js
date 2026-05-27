function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function isConvenioMarcoTipo(tipo) {
  return normalizeText(tipo) === 'convenio marco'
}

export function normalizeConvenioMarcoOc(value) {
  return String(value ?? '').replace(/\s+/g, '').trim()
}

export async function validateConvenioMarcoOcForWrite(prisma, { tipo, licitacion, excludeId } = {}) {
  if (!isConvenioMarcoTipo(tipo)) return { applies: false, licitacion }

  const normalized = normalizeConvenioMarcoOc(licitacion)
  if (!normalized) {
    return { applies: true, statusCode: 400, error: 'N OC requerido para Convenio Marco' }
  }

  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`venta-convenio-marco-oc:${normalized.toLowerCase()}`})::bigint)`

  const existing = await prisma.orden.findFirst({
    where: {
      tipo: 'Convenio Marco',
      licitacion: { equals: normalized, mode: 'insensitive' },
      ...(excludeId ? { id: { not: Number(excludeId) } } : {}),
    },
    select: { id: true, nInterno: true },
  })
  if (existing) {
    return {
      applies: true,
      statusCode: 409,
      error: 'La OC de Convenio Marco ya existe en otra venta',
      duplicateId: existing.id,
    }
  }

  return { applies: true, licitacion: normalized }
}
