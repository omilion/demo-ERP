import { useAuthStore } from '../store/auth'

// Streaming SSE contra POST /api/ai/chat. fetch + ReadableStream (EventSource no
// soporta POST). Llama a los callbacks por cada evento del backend:
// onText(delta), onTool({name}), onDocument({name,url,tipo}), onUi({action,modo}),
// onDone(), onError(msg).
export async function streamChat({ messages, signal, onText, onTool, onDocument, onUi, onDone, onError }) {
  const token = useAuthStore.getState().token
  let res
  try {
    res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages }),
      signal,
    })
  } catch (e) {
    if (e.name !== 'AbortError') onError?.('No se pudo conectar con el asistente.')
    return
  }

  if (!res.ok || !res.body) {
    if (res.status === 403) onError?.('No tienes acceso al asistente IA.')
    else if (res.status === 429) {
      let detail = null
      try { detail = await res.json() } catch {}
      onError?.(detail?.error || 'Alcanzaste el límite de consultas IA. Espera un momento e inténtalo de nuevo.')
    }
    else onError?.('El asistente no está disponible en este momento.')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // Procesar bloques SSE completos (separados por línea en blanco).
      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        let event = 'message'
        let dataLine = ''
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLine += line.slice(5).trim()
        }
        if (!dataLine) continue
        let data
        try { data = JSON.parse(dataLine) } catch { continue }
        if (event === 'text') onText?.(data.delta)
        else if (event === 'tool') onTool?.(data)
        else if (event === 'document') onDocument?.(data)
        else if (event === 'ui') onUi?.(data)
        else if (event === 'done') onDone?.(data)
        else if (event === 'error') onError?.(data.message)
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') onError?.('Se interrumpió la respuesta.')
  }
}

export async function fetchAiStatus() {
  const token = useAuthStore.getState().token
  try {
    const res = await fetch('/api/ai/status', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) return { configured: false }
    return await res.json()
  } catch {
    return { configured: false }
  }
}

// ── Conversaciones persistentes (historial del RAG) ──────────────────────────
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useConversaciones = () =>
  useQuery({
    queryKey: ['ai-conversaciones'],
    queryFn: () => api.get('/ai/conversaciones').then(r => r.data),
    staleTime: 10_000,
  })

export const useConversacion = (id) =>
  useQuery({
    queryKey: ['ai-conversaciones', id],
    queryFn: () => api.get(`/ai/conversaciones/${id}`).then(r => r.data),
    enabled: id != null,
  })

export const useCrearConversacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/ai/conversaciones', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-conversaciones'] }),
  })
}

export const useGuardarMensajes = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, mensajes }) => api.post(`/ai/conversaciones/${id}/mensajes`, { mensajes }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-conversaciones'] }),
  })
}

export const useRenombrarConversacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, titulo }) => api.put(`/ai/conversaciones/${id}`, { titulo }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-conversaciones'] }),
  })
}

export const useEliminarConversacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/ai/conversaciones/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-conversaciones'] }),
  })
}
