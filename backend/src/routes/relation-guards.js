import { parsePositiveInt } from './operational-utils.js'
import { getUserSucursalId } from './caja/scope.js'

function normalizeState(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export async function resolveOrdenForWrite(prisma, { ordenId, nInterno } = {}, options = {}) {
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

  const select = options.requireActive
    ? { id: true, nInterno: true, clienteId: true, sucursalId: true, estado: true, eliminada: true }
    : { id: true, nInterno: true, clienteId: true, sucursalId: true }
  const sucursalId = getUserSucursalId(options.user)
  const orden = sucursalId
    ? await prisma.orden.findFirst({
      where: { ...where, OR: [{ sucursalId }, { sucursalId: null }] },
      select,
    })
    : await prisma.orden.findUnique({ where, select })
  if (!orden) return { status: 404, error: 'Orden no encontrada' }
  if (options.requireActive && (orden.eliminada === true || (orden.estado != null && normalizeState(orden.estado) !== 'activa'))) {
    return { status: 409, error: 'Orden no activa o eliminada' }
  }
  return { orden }
}

export async function resolveOdtForWrite(prisma, odtId, options = {}) {
  const parsedOdtId = parsePositiveInt(odtId)
  if (!parsedOdtId) return { status: 400, error: 'odtId invalido' }

  const baseSelect = { id: true, ordenId: true }
  if (options.includeSucursal) baseSelect.sucursalId = true
  const select = options.requireActive
    ? { id: true, ordenId: true, sucursalId: true, estado: true, eliminado: true }
    : baseSelect
  const sucursalId = getUserSucursalId(options.user)
  const odt = sucursalId
    ? await prisma.odt.findFirst({
      where: { id: parsedOdtId, OR: [{ sucursalId }, { sucursalId: null }] },
      select,
    })
    : await prisma.odt.findUnique({
      where: { id: parsedOdtId },
      select,
    })
  if (!odt) return { status: 404, error: 'ODT no encontrada' }
  if (options.requireActive && (odt.eliminado === true || (odt.estado != null && normalizeState(odt.estado) === 'anulada'))) {
    return { status: 409, error: 'ODT no activa o eliminada' }
  }
  if (!odt.ordenId && !options.allowWithoutOrden) {
    return {
      status: 409,
      error: 'ODT legacy sin orden asociada: debe reconciliarse antes de recibir nuevos movimientos',
    }
  }
  return { odt }
}
