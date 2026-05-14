import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useDespachos = (params = {}) =>
  useQuery({
    queryKey: ['despachos', params],
    queryFn: () => api.get('/despachos', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100 },
    staleTime: 60_000,
  })

export const useDespacho = (id) =>
  useQuery({
    queryKey: ['despachos', id],
    queryFn: () => api.get(`/despachos/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateDespacho = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/despachos', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['despachos'] }),
  })
}

export const useUpdateDespacho = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/despachos/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['despachos'] }),
  })
}

export const useDeleteDespacho = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/despachos/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['despachos'] }),
  })
}

export const useGuias = (params = {}) =>
  useQuery({
    queryKey: ['guias', params],
    queryFn: () => api.get('/despachos/guias/list', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100 },
    staleTime: 60_000,
  })

export const useCreateGuia = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/despachos/guias', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guias'] }),
  })
}

export const useDeleteGuia = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/despachos/guias/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guias'] }),
  })
}
