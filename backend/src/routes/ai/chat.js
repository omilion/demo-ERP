import { can } from '../../middleware/rbac.js'
import { permisoDeHerramienta } from './tools/index.js'
import { randomUUID } from 'node:crypto'
import {
  isAiConfigured, buildSystemPrompt, AI_MODELS, selectAiMode, modelForMode,
  generateGeminiTurn, appendGeminiToolResults,
} from './llm.js'
import { getToolDefinitions, runTool } from './tools/index.js'
import { documentToolDefinitions, runDocumentTool, DOCUMENT_TOOL_NAMES } from './documents.js'
import { uiToolDefinitions, runUiTool, UI_TOOL_NAMES } from './ui-tools.js'
import { createAiRequestLimiter, getAiLimitConfig } from './limits.js'

const MAX_ITERATIONS = 4
const aiLimitConfig = getAiLimitConfig()
const aiRequestLimiter = createAiRequestLimiter(aiLimitConfig)

// Todas las definiciones de herramientas (consulta + documentos + UI) que ve el LLM.
export function allToolDefinitions() {
  return [...getToolDefinitions(), ...documentToolDefinitions, ...uiToolDefinitions]
}

// Ejecuta una herramienta por nombre, enrutando a consulta, documentos o UI.
export async function executeTool(name, input, ctx) {
  // Se resuelve por permiso y no por rol fijo: el catalogo ofrece 'ai' como
  // asignable, y con el rol hardcodeado ese permiso no hacia nada. Hoy da lo
  // mismo -solo admin lo alcanza, via su comodin- pero ahora si se asigna,
  // funciona.
  const puedeUsarHerramientas = can(ctx.user?.role, 'ai', 'read', ctx.user?.permisosExtra)
  // 'ai' es la puerta del asistente; el permiso del modulo lo valida runTool.
  if (!puedeUsarHerramientas && name !== 'consultar_documentacion' && name !== 'ajustar_pantalla') {
    return { error: 'Herramienta no disponible para tu rol' }
  }
  if (UI_TOOL_NAMES.has(name)) {
    return runUiTool(name, input)
  }
  if (DOCUMENT_TOOL_NAMES.has(name)) {
    const r = await runDocumentTool(name, input)
    return r || { error: `Documento no generado: ${name}` }
  }
  return runTool(name, input, ctx)
}

// Normaliza los mensajes entrantes del frontend a la forma del SDK.
function normalizeMessages(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content }))
    .slice(-20) // ventana de contexto acotada
}

export default async function aiChatRoute(fastify) {
  // Estado de configuración (para que el frontend sepa si mostrar el chat).
  fastify.get('/status', {
    preHandler: [fastify.authenticate],
  }, async () => ({ configured: isAiConfigured(), provider: 'google', model: AI_MODELS.gerencial, models: AI_MODELS }))

  // Chat principal — SSE. El loop de tool-use corre server-side; al cliente se
  // le envían eventos: tool (consultando), text (delta), done, error.
  fastify.post('/chat', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const requestId = randomUUID()
    const startedAt = Date.now()
    const messages = normalizeMessages(request.body?.messages)
    const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || ''
    const context = request.body?.context && typeof request.body.context === 'object' ? request.body.context : null
    const mode = selectAiMode({ user: request.user, requestedMode: request.body?.mode, context, messages })
    const selectedModel = modelForMode(mode)

    if (!isAiConfigured()) {
      reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
      const send = (event, data) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      send('error', { message: 'El asistente IA no está configurado (falta GEMINI_API_KEY).' })
      reply.raw.end()
      return reply
    }
    if (!messages.length) {
      return reply.code(400).send({ error: 'No hay mensajes para procesar.' })
    }

    const admission = aiRequestLimiter.acquire(request.user.id)
    if (!admission.ok) {
      return reply.code(429)
        .header('Retry-After', String(admission.retryAfterSeconds))
        .send({ error: admission.reason === 'concurrent' ? 'Ya hay una consulta IA en curso para este usuario.' : 'Se alcanzó el límite temporal de consultas IA.', retryAfterSeconds: admission.retryAfterSeconds })
    }
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    let queriesToday
    try {
      queriesToday = await fastify.prisma.aiQueryLog.count({
        where: { userId: request.user.id, createdAt: { gte: startOfDay } },
      })
    } catch (error) {
      admission.release()
      fastify.log.warn({ error }, 'ai daily quota lookup failed')
      return reply.code(503).send({ error: 'No fue posible validar la cuota IA. Intente nuevamente.' })
    }
    if (queriesToday >= aiLimitConfig.maxQueriesPerDay) {
      admission.release()
      return reply.code(429).send({ error: 'Se alcanzó el límite diario de consultas IA para este usuario.' })
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    const send = (event, data) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

    const ctx = { prisma: fastify.prisma, user: request.user }
    const usedTools = []
    let answerText = ''
    let totalUsage = { input_tokens: 0, output_tokens: 0 }
    let status = 'ok'
    let errorMsg = null

    try {
      const system = buildSystemPrompt(request.user, context, mode)
      // Dos filtros distintos: 'ai' habilita el asistente, y cada herramienta
      // exige ademas el permiso del modulo cuyos datos consulta. Ofrecerle al
      // modelo una que el usuario no puede usar solo produce un rechazo a mitad
      // de la conversacion.
      const puedeHerramientas = can(request.user?.role, 'ai', 'read', request.user?.permisosExtra)
      const tools = puedeHerramientas
        ? allToolDefinitions().filter(t => {
            const modulo = permisoDeHerramienta(t.name)
            return !modulo || can(request.user?.role, modulo, 'read', request.user?.permisosExtra)
          })
        : allToolDefinitions().filter(t => t.name === 'consultar_documentacion' || t.name === 'ajustar_pantalla')
      const convo = [...messages]
      send('meta', { provider: 'google', model: selectedModel, mode })

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const turn = await generateGeminiTurn({ model: selectedModel, system, messages: convo, tools })
        totalUsage.input_tokens += turn.usage.input_tokens || 0
        totalUsage.output_tokens += turn.usage.output_tokens || 0
        if (turn.text) {
          answerText += turn.text
          send('text', { delta: turn.text })
        }

        if (!turn.functionCalls.length) break

        const results = []
        for (const call of turn.functionCalls) {
          send('tool', { name: call.name })
          usedTools.push(call.name)
          const result = await executeTool(call.name, call.args, ctx)
          // Si es un documento generado, avisar al cliente del link.
          if (DOCUMENT_TOOL_NAMES.has(call.name) && result?.url) {
            send('document', { name: call.name, url: result.url, tipo: result.tipo })
          }
          // Si es una orden de UI, avisar al cliente para que ajuste el panel.
          if (UI_TOOL_NAMES.has(call.name) && result?.modo) {
            send('ui', { action: 'display_mode', modo: result.modo })
          }
          if (result?.actionProposal) send('action', result.actionProposal)
          results.push({ name: call.name, result })
        }
        appendGeminiToolResults(convo, turn.modelContent, results)

        if (i === MAX_ITERATIONS - 1) {
          send('text', { delta: '\n\n(Se alcanzó el límite de pasos de consulta.)' })
        }
      }

      send('done', { requestId })
    } catch (e) {
      status = 'error'
      errorMsg = e.message
      send('error', { message: e?.code === 'AI_NOT_CONFIGURED' ? 'Asistente no configurado.' : e?.code === 'AI_TIMEOUT' ? 'La consulta tardó demasiado. Intente una pregunta más acotada.' : 'Ocurrió un error procesando la consulta.' })
    } finally {
      admission.release()
      reply.raw.end()
      // Auditoría — no bloquea la respuesta.
      fastify.prisma.aiQueryLog.create({
        data: {
          requestId,
          userId: request.user?.id ?? null,
          userEmail: request.user?.email ?? null,
          userNombre: request.user?.nombre ?? null,
          role: request.user?.role ?? null,
          question: lastUser || '(vacío)',
          usedTools: usedTools.length ? usedTools : undefined,
          status,
          answerPreview: answerText ? answerText.slice(0, 500) : null,
          model: selectedModel,
          tokenUsage: totalUsage,
          latencyMs: Date.now() - startedAt,
          error: errorMsg,
          ip: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        },
      }).catch(err => fastify.log.warn({ err }, 'ai query_log insert failed'))
    }

    return reply
  })
}
