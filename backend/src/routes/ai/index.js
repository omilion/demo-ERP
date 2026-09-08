import aiChatRoute from './chat.js'
import aiConversacionesRoute from './conversaciones.js'
import aiInsightsRoutes from './insights.js'

// Asistente Gerencial IA — endpoints bajo /api/ai.
//
// El acceso a las herramientas de negocio se resuelve en chat.js con
// can(user, 'ai', 'read'). Hoy solo lo alcanza admin, por su comodín '*', pero
// el permiso 'ai' es asignable y ahora efectivamente habilita el asistente.
//
// Este comentario decía que el gate era un rbac('ai','read') en la ruta; no lo
// era: el control estaba en un role === 'admin' fijo dentro de chat.js, con lo
// que el permiso asignable no hacía nada.
export default async function aiRoutes(fastify) {
  fastify.register(aiChatRoute)
  fastify.register(aiConversacionesRoute)
  fastify.register(aiInsightsRoutes)
}
