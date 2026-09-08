import { GoogleGenAI } from '@google/genai'

export const AI_MODELS = Object.freeze({
  documental: process.env.GEMINI_MODEL_DOCUMENTAL || 'gemini-3.5-flash-lite',
  contextual: process.env.GEMINI_MODEL_CONTEXTUAL || 'gemini-3.5-flash',
  gerencial: process.env.GEMINI_MODEL_GERENCIAL || 'gemini-3.6-flash',
})

// Compatibilidad con métricas y consumidores anteriores: representa el modelo
// de mayor capacidad, pero cada consulta registra el modelo realmente usado.
export const AI_MODEL = AI_MODELS.gerencial
export const AI_MAX_TOKENS = Math.min(Math.max(Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096), 256), 8192)
export const AI_REQUEST_TIMEOUT_MS = Math.min(Math.max(Number(process.env.AI_REQUEST_TIMEOUT_MS || 120_000), 10_000), 300_000)

let client = null

export function getGemini() {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('GEMINI_API_KEY no configurada')
    error.code = 'AI_NOT_CONFIGURED'
    throw error
  }
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  return client
}

export function isAiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY)
}

const ANALYTICAL_TERMS = /\b(informe|gerencial|directorio|tendencia|comparar|comparativa|margen|rentabilidad|proyecci[oó]n|resumen diario|kpi|indicador|causa|riesgo|an[aá]lisis)\b/i

export function selectAiMode({ user, requestedMode, context, messages = [] } = {}) {
  const lastQuestion = [...messages].reverse().find(message => message?.role === 'user')?.content || ''
  if (user?.role === 'admin' && (requestedMode === 'gerencial' || ANALYTICAL_TERMS.test(lastQuestion))) return 'gerencial'
  if (requestedMode === 'contextual' || context?.route || context?.entity?.type) return 'contextual'
  return 'documental'
}

export function modelForMode(mode) {
  return AI_MODELS[mode] || AI_MODELS.documental
}

function safeContext(context) {
  if (!context || typeof context !== 'object') return null
  const allowed = {
    route: String(context.route || '').slice(0, 240),
    title: String(context.title || '').slice(0, 160),
    module: String(context.module || '').slice(0, 80),
  }
  if (context.entity && typeof context.entity === 'object') {
    allowed.entity = {
      type: String(context.entity.type || '').slice(0, 80),
      id: String(context.entity.id || '').slice(0, 100),
      label: String(context.entity.label || '').slice(0, 200),
      status: String(context.entity.status || '').slice(0, 100),
    }
  }
  return allowed
}

function contextInstruction(context) {
  const safe = safeContext(context)
  if (!safe?.route) return ''
  return `\n\nCONTEXTO DE PANTALLA PROPORCIONADO POR EL ERP:\n${JSON.stringify(safe)}\nUsa este contexto solo para orientar la respuesta. No asumas datos que no estén presentes ni intentes ampliar permisos.`
}

export function buildSystemPromptDocs(user, context) {
  const hoy = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const nombre = user?.nombre || 'Usuario'
  return `Eres el copiloto de ayuda de Plastimar. Hoy es ${hoy}. Conversas con ${nombre}.
Tu función es enseñar a usar el ERP y orientar el siguiente paso de trabajo.

REGLAS FUNDAMENTALES:
1. Para explicar pantallas, pasos o flujos usa "consultar_documentacion" antes de responder.
2. No afirmes datos del negocio sin una herramienta autorizada. Cada herramienta respeta los permisos reales del usuario.
3. Entrega instrucciones breves, numeradas y adaptadas a la pantalla actual.
4. Cuando la documentación incluya una fuente o URL, cítala al final bajo "Fuente".
5. Si el tema no está documentado, dilo explícitamente. Nunca inventes rutas, botones ni estados.
6. Distingue siempre entre dato confirmado, interpretación y recomendación.
7. Responde en español, con tono claro, profesional y directo.
8. Nunca solicites contraseñas, claves API, tokens, datos bancarios ni información personal innecesaria.
9. Puedes proponer navegación o un borrador mediante "proponer_accion_segura". Nunca ejecutes ni propongas emitir DTE, anular documentos, cambiar stock, registrar pagos, aprobar descuentos, modificar remuneraciones o eliminar datos.` + contextInstruction(context)
}

export function buildSystemPrompt(user, context, mode = 'documental') {
  if (user?.role !== 'admin') return buildSystemPromptDocs(user, context)
  const hoy = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const nombre = user?.nombre || 'Gerencia'
  return `Eres el Copiloto Gerencial de Plastimar. Hoy es ${hoy}. Conversas con ${nombre}. Modo activo: ${mode}.

Plastimar opera ventas, taller, caja, CRM, inventario, despacho, facturación y RRHH.

REGLAS FUNDAMENTALES:
1. Solo afirmas cifras, fechas, nombres o estados devueltos por herramientas. Nunca inventes ni completes vacíos.
2. Consulta las herramientas antes de analizar datos del ERP y señala el período utilizado.
3. Lidera con la conclusión; luego separa "Datos confirmados", "Interpretación" y "Acciones recomendadas".
4. Informa cobertura y limitaciones cuando falten fechas, costos o trazabilidad.
5. Formatea montos en pesos chilenos y evita falsa precisión.
6. Para ayuda de uso consulta la documentación y cita su fuente o enlace.
7. Para documentos reúne primero los datos y después genera el archivo.
8. Puedes proponer navegación o borradores con "proponer_accion_segura". Toda acción se presenta para confirmación humana.
9. Nunca ejecutes ni propongas como acción automática: emitir o anular DTE, cambiar stock, registrar pagos, aprobar descuentos, modificar remuneraciones o eliminar datos.
10. Si una herramienta no entrega información, repórtalo tal cual.
11. El costo de compra es promedio histórico sin fecha: no construyas evolución temporal de margen con ese dato.
12. Los tiempos de taller pueden tener baja cobertura; debes indicarlo junto al resultado.` + contextInstruction(context)
}

function geminiContents(messages = []) {
  return messages.map(message => {
    if (message._geminiParts) return { role: 'model', parts: message._geminiParts }
    if (message._geminiFunctionResponses) return { role: 'user', parts: message._geminiFunctionResponses }
    return {
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }
  })
}

function geminiTools(tools = []) {
  if (!tools.length) return undefined
  return [{
    functionDeclarations: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    })),
  }]
}

function withTimeout(promise, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  let timeoutId
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error('La consulta IA excedió el tiempo máximo de espera.')
        error.code = 'AI_TIMEOUT'
        reject(error)
      }, timeoutMs)
    }),
  ]).finally(() => clearTimeout(timeoutId))
}

export async function generateGeminiTurn({ model, system, messages, tools }) {
  const ai = getGemini()
  const response = await withTimeout(ai.models.generateContent({
    model,
    contents: geminiContents(messages),
    config: {
      systemInstruction: system,
      maxOutputTokens: AI_MAX_TOKENS,
      temperature: 0.2,
      tools: geminiTools(tools),
    },
  }))

  const parts = response?.candidates?.[0]?.content?.parts || []
  const text = parts.filter(part => typeof part.text === 'string').map(part => part.text).join('')
  const functionCalls = parts
    .filter(part => part.functionCall?.name)
    .map(part => ({ name: part.functionCall.name, args: part.functionCall.args || {} }))
  const usage = response?.usageMetadata || {}

  return {
    text,
    functionCalls,
    modelContent: response?.candidates?.[0]?.content || { role: 'model', parts: text ? [{ text }] : [] },
    usage: {
      input_tokens: usage.promptTokenCount || 0,
      output_tokens: usage.candidatesTokenCount || 0,
      total_tokens: usage.totalTokenCount || 0,
    },
  }
}

export function appendGeminiToolResults(messages, modelContent, callsWithResults) {
  messages.push({
    role: 'assistant',
    content: '',
    _geminiParts: modelContent?.parts || [],
  })
  messages.push({
    role: 'user',
    content: '',
    _geminiFunctionResponses: callsWithResults.map(item => ({
      functionResponse: { name: item.name, response: item.result },
    })),
  })
}
