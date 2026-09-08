import { can } from '../../middleware/rbac.js'
import { runTool } from './tools/index.js'

const PRIORITY = { critica: 0, alta: 1, media: 2, informativa: 3 }

async function collectTool(prisma, user, name, input, module, coverage) {
  if (!can(user?.role, module, 'read', user?.permisosExtra)) return null
  const result = await runTool(name, input, { prisma, user })
  if (result?.error) {
    coverage.push({ module, ok: false, error: result.error })
    return null
  }
  coverage.push({ module, ok: true })
  return result
}

export async function buildOperationalInsights(prisma, user) {
  const coverage = []
  const [stock, taller, despachos, crm] = await Promise.all([
    collectTool(prisma, user, 'consultar_stock', {}, 'bodega', coverage),
    collectTool(prisma, user, 'consultar_taller', { taller: 'todos' }, 'taller', coverage),
    collectTool(prisma, user, 'ventas_despacho_incompleto', { periodo: 'ultimos_30_dias' }, 'ventas', coverage),
    collectTool(prisma, user, 'consultar_crm', {}, 'ventas', coverage),
  ])

  const alerts = []
  if (stock?.sinStock > 0) alerts.push({ id: 'stock-sin-stock', priority: 'alta', module: 'Bodega', title: `${stock.sinStock} productos activos sin stock`, detail: `${stock.criticos || 0} productos adicionales están bajo su stock crítico.`, route: '/bodega', metric: stock.sinStock })
  else if (stock) alerts.push({ id: 'stock-ok', priority: 'informativa', module: 'Bodega', title: 'Sin quiebres de stock detectados', detail: `${stock.criticos || 0} productos bajo stock crítico.`, route: '/bodega', metric: stock.criticos || 0 })

  if (taller?.atrasadas > 0) alerts.push({ id: 'taller-atrasadas', priority: taller.atrasadas >= 10 ? 'critica' : 'alta', module: 'Taller', title: `${taller.atrasadas}${taller.atrasadasTruncado ? '+' : ''} ODT atrasadas`, detail: `${taller.abiertas || 0} ODT permanecen abiertas.${taller.atrasadasTruncado ? ' El número de atrasadas es un piso: hay más ODT abiertas de las que se pudieron revisar en detalle.' : ''}`, route: '/taller', metric: taller.atrasadas })
  else if (taller) alerts.push({ id: 'taller-ok', priority: 'informativa', module: 'Taller', title: 'Sin ODT atrasadas detectadas', detail: `${taller.abiertas || 0} ODT abiertas.`, route: '/taller', metric: taller.abiertas || 0 })

  if (despachos?.pendientes > 0) alerts.push({ id: 'despachos-pendientes', priority: despachos.pendientes >= 20 ? 'alta' : 'media', module: 'Despacho', title: `${despachos.pendientes} ventas con despacho incompleto`, detail: 'Corresponden a los últimos 30 días.', route: '/despachos', metric: despachos.pendientes })
  // consultar_crm.total es historico completo (sin filtro de estado): la
  // herramienta no distingue "cerrado" de "en gestion" a nivel de datos, asi
  // que no se presenta como "pipeline activo" hasta tener esa definicion.
  if (crm) alerts.push({ id: 'crm-historico', priority: 'informativa', module: 'Ventas', title: `${crm.total || 0} registros históricos en CRM`, detail: 'Incluye todo el historial, no solo lo pendiente de gestión.', route: '/crm', metric: crm.total || 0 })

  alerts.sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority] || b.metric - a.metric)
  const urgent = alerts.filter(alert => ['critica', 'alta'].includes(alert.priority)).length
  return {
    generatedAt: new Date().toISOString(),
    headline: urgent ? `${urgent} situación${urgent === 1 ? '' : 'es'} requiere${urgent === 1 ? '' : 'n'} atención prioritaria.` : 'No se detectaron situaciones críticas en los módulos disponibles.',
    alerts,
    coverage,
    disclaimer: 'Bandeja calculada con datos en vivo y limitada por los permisos del usuario.',
  }
}

export default async function aiInsightsRoutes(fastify) {
  fastify.get('/insights', { preHandler: [fastify.authenticate] }, async request => {
    return buildOperationalInsights(fastify.prisma, request.user)
  })

  // Registra la decisión humana. El plugin global de auditoría guarda usuario,
  // fecha, propuesta y resultado; este endpoint no modifica datos de negocio.
  fastify.post('/actions/decision', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { decision, proposal } = request.body || {}
    if (!['accepted', 'rejected'].includes(decision)) return reply.code(400).send({ error: 'Decisión inválida.' })
    if (!proposal || !['navegar', 'checklist', 'borrador'].includes(proposal.tipo)) return reply.code(400).send({ error: 'Propuesta inválida.' })
    if (proposal.tipo === 'navegar' && (!String(proposal.ruta || '').startsWith('/') || String(proposal.ruta).startsWith('//'))) {
      return reply.code(400).send({ error: 'Ruta no permitida.' })
    }
    return { ok: true, decision }
  })
}
