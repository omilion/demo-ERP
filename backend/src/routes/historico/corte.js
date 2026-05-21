export const ORDEN_SCOPES = new Set(['operacional', 'historico', 'todos'])

export function parseOrdenScope(value, fallback = 'operacional') {
  if (!value) return fallback
  const normalized = String(value).toLowerCase()
  return ORDEN_SCOPES.has(normalized) ? normalized : null
}

export async function getPrimerRegistroInterno(prisma) {
  return prisma.orden.findFirst({
    where: {
      eliminada: false,
      nInterno: { not: null, gt: 0 },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      nInterno: true,
      createdAt: true,
      tipo: true,
      rutCliente: true,
      clienteId: true,
      creadorNombre: true,
    },
  })
}

export function buildOrdenScopeWhere(scope, corte) {
  if (scope === 'todos') return {}
  if (!corte) {
    return scope === 'historico'
      ? { OR: [{ nInterno: null }, { nInterno: { lte: 0 } }] }
      : { nInterno: { not: null, gt: 0 } }
  }
  if (scope === 'historico') {
    return {
      OR: [
        { nInterno: null },
        { nInterno: { lte: 0 } },
        { createdAt: { lt: corte.createdAt } },
      ],
    }
  }
  return {
    nInterno: { not: null, gt: 0 },
    createdAt: { gte: corte.createdAt },
  }
}

export function mergeWhere(base, extra) {
  if (!extra || Object.keys(extra).length === 0) return base
  if (!base || Object.keys(base).length === 0) return extra
  return { AND: [base, extra] }
}

export async function buildCorteResumen(prisma) {
  const corte = await getPrimerRegistroInterno(prisma)
  const base = { eliminada: false }
  const [totalOrdenes, historicoOrdenes, operacionalOrdenes, anomalasSinInterno, previasConInterno] = await Promise.all([
    prisma.orden.count({ where: base }),
    prisma.orden.count({ where: mergeWhere(base, buildOrdenScopeWhere('historico', corte)) }),
    prisma.orden.count({ where: mergeWhere(base, buildOrdenScopeWhere('operacional', corte)) }),
    corte
      ? prisma.orden.count({
          where: {
            eliminada: false,
            createdAt: { gte: corte.createdAt },
            OR: [{ nInterno: null }, { nInterno: { lte: 0 } }],
          },
        })
      : prisma.orden.count({ where: { eliminada: false, OR: [{ nInterno: null }, { nInterno: { lte: 0 } }] } }),
    corte
      ? prisma.orden.count({
          where: {
            eliminada: false,
            createdAt: { lt: corte.createdAt },
            nInterno: { not: null, gt: 0 },
          },
        })
      : 0,
  ])

  return {
    corte,
    regla: 'primer_n_interno_valido_por_fecha_creacion',
    totalOrdenes,
    historicoOrdenes,
    operacionalOrdenes,
    anomalasSinInterno,
    previasConInterno,
  }
}
