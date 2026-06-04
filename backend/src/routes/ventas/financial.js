import { isReferencialMedioPago } from '../caja/scope.js'
import { computeTotal } from './helpers.js'

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isNcText(text) {
  return text === 'nc' || text.startsWith('nc ') || text.startsWith('nc-') ||
    text === 'credito' || text.startsWith('nota credito') || text.startsWith('nota de credito')
}

function isNdText(text) {
  return text === 'nd' || text.startsWith('nd ') || text.startsWith('nd-') ||
    text === 'debito' || text.startsWith('nota debito') || text.startsWith('nota de debito')
}

export function isLegacySaldoAdjustmentDocument(documento, tipoDocumento = null) {
  return [documento, tipoDocumento]
    .map(normalizeText)
    .some(text => isNcText(text) || isNdText(text))
}

export function computeFinancialAdjustments({ movimientos = [], multas = [] } = {}) {
  const notas = (movimientos || [])
    .filter(mov => !mov.eliminado)
    .filter(mov => normalizeText(mov.estadoDoc || 'Activa') !== 'nula')
    .filter(mov => isReferencialMedioPago(mov.medioPago))
    .filter(mov => isLegacySaldoAdjustmentDocument(mov.documento, mov.tipoDocumento))
    .reduce((sum, mov) => sum + Math.abs(Number(mov.monto || 0)), 0)

  const multasTotal = (multas || [])
    .reduce((sum, multa) => sum + Math.abs(Number(multa.monto || 0)), 0)

  return notas + multasTotal
}

export function resolveEstadoPago({ total = 0, abono = 0, ajustesFinancieros = 0 } = {}) {
  const saldo = Math.max(0, Number(total || 0) - Number(abono || 0) - Number(ajustesFinancieros || 0))
  if (saldo <= 0 && Number(total || 0) > 0) return 'Pagada'
  if (Number(abono || 0) > 0 || Number(ajustesFinancieros || 0) > 0) return 'Parcial'
  return 'No pagada'
}

export function computeVentaFinancialState(orden, inputs = {}) {
  const total = computeTotal(orden.items || [], orden.descuentoPct, orden.cargos || [], orden.descuentoMonto)
  const abono = Number(orden.abono || 0)
  const ajustesFinancieros = computeFinancialAdjustments(inputs)
  const saldo = Math.max(0, total - abono - ajustesFinancieros)
  return {
    total,
    abono,
    ajustesFinancieros,
    saldo,
    estadoPago: resolveEstadoPago({ total, abono, ajustesFinancieros }),
  }
}

export async function fetchVentaFinancialInputs(prisma, ordenId) {
  if (!ordenId) return { movimientos: [], multas: [] }
  const [movimientos, multas] = await Promise.all([
    prisma.movimientoCaja.findMany({
      where: {
        ordenId,
        eliminado: false,
      },
      select: {
        id: true,
        monto: true,
        medioPago: true,
        documento: true,
        tipoDocumento: true,
        estadoDoc: true,
        eliminado: true,
      },
    }),
    prisma.multa.findMany({
      where: { ordenId },
      select: { id: true, monto: true },
    }),
  ])
  return { movimientos, multas }
}

export async function computeVentaFinancialStateFromDb(prisma, orden, options = {}) {
  const inputs = await fetchVentaFinancialInputs(prisma, orden.id, options.sucursalId)
  return computeVentaFinancialState(orden, inputs)
}

export async function syncOrdenFinancialState(prisma, ordenId, options = {}) {
  if (!ordenId) return null
  const orden = await prisma.orden.findUnique({
    where: { id: ordenId },
    include: { items: true, cargos: true },
  })
  if (!orden || orden.eliminada) return null

  const state = await computeVentaFinancialStateFromDb(prisma, orden, { sucursalId: options.sucursalId })
  const data = { estadoPago: state.estadoPago }
  if (options.userMod !== undefined) data.userMod = options.userMod
  if (options.fecha !== undefined) data.fecham = options.fecha

  await prisma.orden.update({
    where: { id: ordenId },
    data,
  })

  return state
}
