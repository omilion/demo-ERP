import { parsePositiveInt } from './operational-utils.js'

export async function resolveOrdenForWrite(prisma, { ordenId, nInterno } = {}) {
  const hasOrdenId = ordenId !== undefined && ordenId !== null && ordenId !== ''
  const hasNInterno = nInterno !== undefined && nInterno !== null && nInterno !== ''

  let where = null
  if (hasOrdenId) {
    const parsedOrdenId = parsePositiveInt(ordenId)
    if (!parsedOrdenId) return { status: 400, error: 'ordenId invalido' }
    where = { id: parsedOrdenId }
  } else if (hasNInterno) {
    const parsedNInterno = parsePositiveInt(nInterno)
    if (!parsedNInterno) return { status: 400, error: 'nInterno invalido' }
    where = { nInterno: parsedNInterno }
  } else {
    return { status: 400, error: 'ordenId requerido' }
  }

  const orden = await prisma.orden.findUnique({
    where,
    select: { id: true, nInterno: true, clienteId: true },
  })
  if (!orden) return { status: 404, error: 'Orden no encontrada' }
  return { orden }
}

export async function resolveOdtForWrite(prisma, odtId) {
  const parsedOdtId = parsePositiveInt(odtId)
  if (!parsedOdtId) return { status: 400, error: 'odtId invalido' }

  const odt = await prisma.odt.findUnique({
    where: { id: parsedOdtId },
    select: { id: true, ordenId: true },
  })
  if (!odt) return { status: 404, error: 'ODT no encontrada' }
  if (!odt.ordenId) {
    return {
      status: 409,
      error: 'ODT legacy sin orden asociada: debe reconciliarse antes de recibir nuevos movimientos',
    }
  }
  return { odt }
}
