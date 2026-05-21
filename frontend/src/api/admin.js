import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

export function useSaneamientoLegacyDryRun() {
  return useQuery({
    queryKey: ['admin', 'saneamiento-legacy', 'dry-run'],
    queryFn: () => api.get('/admin/integridad/resumen').then(r => r.data),
    staleTime: 30_000,
  })
}

export function useReasignarOrdenItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, producto_id }) => api.patch(`/admin/integridad/orden-item/${id}`, { producto_id }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }) },
  })
}

export function useEliminarOrdenItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/admin/integridad/orden-item/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }) },
  })
}

export function useReasignarOdtItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, producto_id }) => api.patch(`/admin/integridad/odt-item/${id}`, { producto_id }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }) },
  })
}

export function useEliminarOdtItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/admin/integridad/odt-item/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }) },
  })
}

export function useBackfillOdtsCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/admin/integridad/backfill-odts-cliente').then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }) },
  })
}

export function useAuditoria(params = {}) {
  return useQuery({
    queryKey: ['admin', 'auditoria', params],
    queryFn: () => api.get('/admin/auditoria', { params }).then(r => r.data),
  })
}

export function useHistoricoCorte() {
  return useQuery({
    queryKey: ['admin', 'historico', 'corte'],
    queryFn: () => api.get('/historico/corte').then(r => r.data),
    staleTime: 60_000,
  })
}

export function useHistoricoOrdenes(params = {}) {
  return useQuery({
    queryKey: ['admin', 'historico', 'ordenes', params],
    queryFn: () => api.get('/historico/ordenes', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100, page: 1, corte: null },
    staleTime: 30_000,
  })
}
