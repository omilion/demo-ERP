import aiChatRoute from './chat.js'

// Asistente Gerencial IA — endpoints bajo /api/ai. Gate admin-only vía
// rbac('ai', 'read'): solo el rol admin (que tiene '*') pasa, ya que ningún
// otro rol declara el módulo 'ai'.
export default async function aiRoutes(fastify) {
  fastify.register(aiChatRoute)
}
