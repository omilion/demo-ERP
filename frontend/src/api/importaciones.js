import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useImportaciones = (params = {}) =>
  useQuery({
    queryKey: ['importaciones', params],
    queryFn: () => api.get('/importaciones', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 20, kpis: {} },
    staleTime: 30_000,
  })

export const useImportacion = (id) =>
  useQuery({
    queryKey: ['importaciones', id],
    queryFn: () => api.get(`/importaciones/${id}`).then(r => r.data),
    enabled: Boolean(id),
    staleTime: 30_000,
  })

export const useResumenTransito = () =>
  useQuery({
    queryKey: ['importaciones-resumen-transito'],
    queryFn: () => api.get('/importaciones/resumen-transito').then(r => r.data),
    placeholderData: { items: [], totalItemsEnTransito: 0 },
    staleTime: 30_000,
  })

export const useCreateImportacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/importaciones', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['importaciones'] })
      qc.invalidateQueries({ queryKey: ['importaciones-resumen-transito'] })
    },
  })
}

export const useUpdateImportacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/importaciones/${id}`, data).then(r => r.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['importaciones'] })
      qc.invalidateQueries({ queryKey: ['importaciones', variables.id] })
      qc.invalidateQueries({ queryKey: ['importaciones-resumen-transito'] })
    },
  })
}

export const useSumarStockImportacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload = {} }) => api.post(`/importaciones/${id}/sumar-stock`, payload).then(r => r.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['importaciones'] })
      qc.invalidateQueries({ queryKey: ['importaciones', variables.id] })
      qc.invalidateQueries({ queryKey: ['importaciones-resumen-transito'] })
      qc.invalidateQueries({ queryKey: ['productos'] })
    },
  })
}

export const useDeleteImportacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/importaciones/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['importaciones'] })
      qc.invalidateQueries({ queryKey: ['importaciones-resumen-transito'] })
    },
  })
}
