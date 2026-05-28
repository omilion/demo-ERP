import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useBodegaTaller = (params = {}) =>
  useQuery({
    queryKey: ['bodega-taller', params],
    queryFn: () => api.get('/bodega-taller', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useBodegaTallerItem = (id) =>
  useQuery({
    queryKey: ['bodega-taller', id],
    queryFn: () => api.get(`/bodega-taller/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useBodegaTallerAutocomplete = (q, enabled = true) =>
  useQuery({
    queryKey: ['bodega-taller-autocomplete', q],
    queryFn: () => api.get('/bodega-taller/autocomplete', { params: { q } }).then(r => r.data),
    enabled: enabled && String(q || '').trim().length >= 2,
    staleTime: 30_000,
  })

export const useCreateBodegaTaller = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/bodega-taller', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodega-taller'] }),
  })
}

export const useUpdateBodegaTaller = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/bodega-taller/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodega-taller'] }),
  })
}

export const useDeleteBodegaTaller = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/bodega-taller/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodega-taller'] }),
  })
}
