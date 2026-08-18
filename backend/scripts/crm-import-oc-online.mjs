// Importa OC Online legacy al CRM. Por defecto solo simula.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  buildLegacyOcCrmData,
  legacySellerName,
  normalizeLegacySellerCode,
} from '../src/domain/crm/legacyOcImport.js'

const DEFAULT_CUTOFF = '2025-01-01'
const APPLY_CONFIRMATION = 'IMPORTAR_OC_2025'

function parseArg(prefix, fallback = null) {
  const arg = process.argv.find(value => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : fallback
}

function parseCutoff(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('El corte debe usar formato YYYY-MM-DD')
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) throw new Error('Fecha de corte inválida')
  return date
}

function chunks(values, size) {
  const result = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function cleanKey(value) {
  return String(value || '').trim()
}

function addToMap(map, key, value) {
  if (!map.has(key)) map.set(key, [])
  map.get(key).push(value)
}

async function loadExisting(prisma, ocRows) {
  const byId = new Map()
  const quoteNumbers = [...new Set(ocRows.map(row => cleanKey(row.nCompra)).filter(Boolean))]
  const ocIds = ocRows.map(row => row.id)
  const select = {
    id: true,
    ncotizacion: true,
    ordenCompraOnlineId: true,
    ejecutiva: true,
    canalVenta: true,
    tipoVenta: true,
    resultado: true,
    accion: true,
    etapaComercial: true,
    estado: true,
    resultadoCierre: true,
    ultimaGestionAt: true,
    fechaCotizacion: true,
    fecha: true,
    estadoCambiadoAt: true,
    updatedAt: true,
    cerradoAt: true,
    ventaAprobadaAt: true,
    confirmacionTipo: true,
    confirmacionReferencia: true,
    motivoPerdida: true,
    motivoPerdidaDetalle: true,
  }

  for (const group of chunks(quoteNumbers, 500)) {
    const rows = await prisma.crmRegistro.findMany({ where: { ncotizacion: { in: group } }, select })
    for (const row of rows) byId.set(row.id, row)
  }
  for (const group of chunks(ocIds, 500)) {
    const rows = await prisma.crmRegistro.findMany({ where: { ordenCompraOnlineId: { in: group } }, select })
    for (const row of rows) byId.set(row.id, row)
  }
  return [...byId.values()]
}

function buildPlan(ocRows, existingRows) {
  const byQuote = new Map()
  const byOcId = new Map()
  for (const crm of existingRows) {
    const key = cleanKey(crm.ncotizacion)
    if (key) addToMap(byQuote, key, crm)
    if (crm.ordenCompraOnlineId) byOcId.set(crm.ordenCompraOnlineId, crm)
  }

  const creates = []
  const updates = []
  const conflicts = []
  let duplicateRows = 0
  const statusCounts = {}
  const sellerCounts = {}

  for (const oc of ocRows) {
    const key = cleanKey(oc.nCompra)
    statusCounts[oc.estadoCompra || 'SIN_ESTADO'] = (statusCounts[oc.estadoCompra || 'SIN_ESTADO'] || 0) + 1
    const sellerCode = normalizeLegacySellerCode(oc.codigoVendedor) || 'SIN_CODIGO'
    sellerCounts[sellerCode] = (sellerCounts[sellerCode] || 0) + 1

    const matches = [...(byQuote.get(key) || [])]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || b.id - a.id)
    duplicateRows += Math.max(0, matches.length - 1)
    const existing = byOcId.get(oc.id) || matches[0] || null

    if (existing?.ordenCompraOnlineId && existing.ordenCompraOnlineId !== oc.id) {
      conflicts.push({ ocId: oc.id, nCompra: key, crmId: existing.id, linkedOcId: existing.ordenCompraOnlineId })
      continue
    }

    const data = buildLegacyOcCrmData(oc, existing)
    if (existing) updates.push({ id: existing.id, data })
    else creates.push(data)
  }

  return { creates, updates, conflicts, duplicateRows, statusCounts, sellerCounts }
}

async function applyPlan(prisma, plan) {
  let updated = 0
  let created = 0
  for (const group of chunks(plan.updates, 50)) {
    await prisma.$transaction(group.map(item => prisma.crmRegistro.update({ where: { id: item.id }, data: item.data })))
    updated += group.length
  }
  for (const group of chunks(plan.creates, 200)) {
    const result = await prisma.crmRegistro.createMany({ data: group })
    created += result.count
  }
  return { updated, created }
}

async function run() {
  const cutoffText = parseArg('--cutoff=', DEFAULT_CUTOFF)
  const cutoff = parseCutoff(cutoffText)
  const apply = process.argv.includes('--apply')
  const confirmation = parseArg('--confirm=')
  if (apply && confirmation !== APPLY_CONFIRMATION) {
    throw new Error(`Para aplicar agrega --confirm=${APPLY_CONFIRMATION}`)
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })
  try {
    const now = new Date()
    const ocRows = await prisma.ordenCompraOnline.findMany({
      where: { fechaHora: { gte: cutoff, lte: now } },
      orderBy: [{ fechaHora: 'asc' }, { id: 'asc' }],
    })
    const futureExcluded = await prisma.ordenCompraOnline.count({ where: { fechaHora: { gt: now } } })
    const existingRows = await loadExisting(prisma, ocRows)
    const plan = buildPlan(ocRows, existingRows)

    const report = {
      mode: apply ? 'apply' : 'dry-run',
      cutoff: cutoffText,
      evaluatedAt: now.toISOString(),
      candidates: ocRows.length,
      create: plan.creates.length,
      updateOrLink: plan.updates.length,
      duplicateCrmRowsPreserved: plan.duplicateRows,
      conflicts: plan.conflicts.length,
      futureRowsExcluded: futureExcluded,
      statuses: plan.statusCounts,
      sellers: Object.fromEntries(Object.entries(plan.sellerCounts).map(([code, total]) => [code, { total, nombre: legacySellerName(code) }])),
    }
    console.log(JSON.stringify(report, null, 2))

    if (!apply) {
      console.log(`DRY-RUN: no se modificaron registros. Para aplicar usa --apply --confirm=${APPLY_CONFIRMATION}`)
      return
    }
    if (plan.conflicts.length) throw new Error(`Se detectaron ${plan.conflicts.length} conflictos de relación; no se aplicó la importación`)
    const applied = await applyPlan(prisma, plan)
    console.log(JSON.stringify({ applied, cutoff: cutoffText }, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
