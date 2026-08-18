// Automatización CRM comercial. Por seguridad corre en simulación salvo --apply.
// Programar mediante cron del SO con TZ=America/Santiago.
import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { CRM_ETAPAS } from '../domain/crm/constants.js'
import { businessDaysBetween, transitionCrm } from '../domain/crm/service.js'

export async function evaluateCrmAutomation(prisma, { now = new Date() } = {}) {
  const candidates = await prisma.crmRegistro.findMany({
    where: {
      etapaComercial: CRM_ETAPAS.COTIZACION_ENVIADA,
      tipoVenta: { not: 'COMPRA_AGIL' },
      esHistorico: false,
    },
    select: {
      id: true,
      etapaComercial: true,
      estado: true,
      ncotizacion: true,
      tipoVenta: true,
      ultimaGestionAt: true,
      fechaCotizacion: true,
      estadoCambiadoAt: true,
      createdAt: true,
    },
  })

  return candidates
    .map(crm => {
      const base = crm.ultimaGestionAt || crm.fechaCotizacion || crm.estadoCambiadoAt || crm.createdAt
      return { crm, diasSinGestion: businessDaysBetween(base, now) }
    })
    .filter(item => item.diasSinGestion >= 3)
    .map(item => ({
      crmId: item.crm.id,
      desde: CRM_ETAPAS.COTIZACION_ENVIADA,
      hacia: CRM_ETAPAS.SEGUIMIENTO,
      diasSinGestion: item.diasSinGestion,
      motivo: 'Regla automática: cotización sin gestión por 3 días hábiles',
    }))
}

export async function runCrmAutomation({ prisma, apply = false, now = new Date(), logger = console, disconnect = false } = {}) {
  const actions = await evaluateCrmAutomation(prisma, { now })
  const results = []
  try {
    for (const action of actions) {
      if (!apply) {
        results.push({ ...action, applied: false })
        continue
      }
      try {
        await transitionCrm(prisma, action.crmId, { etapa: action.hacia, motivo: action.motivo }, { nombre: 'Job CRM' }, { isAdmin: true, origen: 'job_3_dias', now })
        results.push({ ...action, applied: true })
      } catch (error) {
        results.push({ ...action, applied: false, error: error.message })
      }
    }
    logger.log(`[crmAutomation ${now.toISOString()}] modo=${apply ? 'apply' : 'dry-run'} candidatos=${actions.length} aplicados=${results.filter(r => r.applied).length} errores=${results.filter(r => r.error).length}`)
    return { apply, actions: results }
  } finally {
    if (disconnect) await prisma.$disconnect()
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (executedPath === import.meta.url) {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })
  runCrmAutomation({ prisma, apply: process.argv.includes('--apply'), disconnect: true })
    .then(result => {
      console.log(JSON.stringify(result, null, 2))
      process.exit(0)
    })
    .catch(error => {
      console.error(error)
      process.exit(1)
    })
}
