/**
 * Incorpora al CRM las licitaciones vigentes sin duplicar ni alterar su ficha
 * fuente. Cada oportunidad queda ligada por cotizacionLicitacionId.
 *
 * Dry-run: node scripts/sync-crm-licitaciones.mjs
 * Aplicar:  node scripts/sync-crm-licitaciones.mjs --apply --confirm=SYNC_CRM_LICITACIONES
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  CRM_CARTERA_CUTOFF,
  buildLegacyLicitacionCrmData,
  normalizeRut,
} from '../src/domain/crm/legacyLicitacionImport.js'

const APPLY = process.argv.includes('--apply')
const CONFIRM = process.argv.find(arg => arg.startsWith('--confirm='))?.slice('--confirm='.length)
if (APPLY && CONFIRM !== 'SYNC_CRM_LICITACIONES') throw new Error('Falta --confirm=SYNC_CRM_LICITACIONES')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

try {
  const now = new Date()
  const [licitaciones, clientes, existentes] = await Promise.all([
    prisma.cotizacionLicitacion.findMany({
      where: { fecha: { gte: CRM_CARTERA_CUTOFF, lte: now } },
      select: { id: true, idLicitacion: true, fecha: true, usuario: true, estado: true, rutCliente: true, obs: true, plazo: true, ordenCompra: true, ordenId: true },
      orderBy: { fecha: 'asc' },
    }),
    prisma.cliente.findMany({ select: { id: true, rut: true, nombre: true, razonSocial: true, email: true, telefono: true } }),
    prisma.crmRegistro.findMany({ where: { cotizacionLicitacionId: { not: null } }, select: { cotizacionLicitacionId: true } }),
  ])

  const clientesPorRut = new Map()
  for (const cliente of clientes) {
    const key = normalizeRut(cliente.rut)
    if (!key) continue
    const candidates = clientesPorRut.get(key) || []
    candidates.push(cliente)
    clientesPorRut.set(key, candidates)
  }
  const existentesIds = new Set(existentes.map(row => row.cotizacionLicitacionId))
  const pendientes = licitaciones.filter(row => !existentesIds.has(row.id))
  const toCreate = []
  let sinClienteUnico = 0

  for (const licitacion of pendientes) {
    const candidates = clientesPorRut.get(normalizeRut(licitacion.rutCliente)) || []
    // Vinculamos solo si el RUT identifica un único cliente: jamás elegimos
    // arbitrariamente entre duplicados de la base.
    const cliente = candidates.length === 1 ? candidates[0] : null
    if (!cliente) sinClienteUnico++
    const data = buildLegacyLicitacionCrmData(licitacion, cliente)
    if (data) toCreate.push(data)
  }

  const porEtapa = Object.fromEntries(['PENDIENTE_CLASIFICACION', 'COTIZACION_ENVIADA', 'SEGUIMIENTO', 'VENTA_APROBADA', 'CERRADO'].map(etapa => [etapa, 0]))
  for (const row of toCreate) porEtapa[row.etapaComercial]++
  console.log(`Licitaciones en cartera (${CRM_CARTERA_CUTOFF.toISOString().slice(0, 10)} a ${now.toISOString().slice(0, 10)}): ${licitaciones.length}`)
  console.log(`Ya vinculadas al CRM: ${existentesIds.size}`)
  console.log(`A crear: ${toCreate.length}`)
  console.log('Por etapa:', porEtapa)
  console.log(`Sin cliente unívoco por RUT: ${sinClienteUnico}`)
  console.log('Muestra:', toCreate.slice(0, 3).map(row => ({ ncotizacion: row.ncotizacion, etapa: row.etapaComercial, ejecutiva: row.ejecutiva, clienteId: row.clienteId })))

  if (!APPLY) {
    console.log('DRY-RUN: no se modificó ningún dato.')
    process.exit(0)
  }

  let created = 0
  for (let index = 0; index < toCreate.length; index += 300) {
    const batch = toCreate.slice(index, index + 300)
    const result = await prisma.crmRegistro.createMany({ data: batch, skipDuplicates: true })
    created += result.count
    process.stdout.write(`\r  ${created}/${toCreate.length}`)
  }
  console.log(`\nAplicado: ${created} oportunidades de licitación creadas en CRM.`)
} finally {
  await prisma.$disconnect()
}
