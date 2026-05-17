import { useQuery } from '@tanstack/react-query'
import api from './client'

export function useIntegridadResumen() {
  return useQuery({
    queryKey: ['admin', 'integridad-resumen'],
    queryFn: () => api.get('/admin/integridad/resumen').then(r => r.data),
    staleTime: 60_000,
  })
}

export function useIntegridadDetalle(tipo, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'integridad', tipo],
    queryFn: () => api.get(`/admin/integridad/${tipo}`).then(r => r.data),
    enabled: !!tipo && enabled,
  })
}

export function useAuditoria(params = {}) {
  return useQuery({
    queryKey: ['admin', 'auditoria', params],
    queryFn: () => api.get('/admin/auditoria', { params }).then(r => r.data),
  })
}
