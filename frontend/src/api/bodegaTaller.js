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

export const useUpdateBodegaTaller = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/bodega-taller/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodega-taller'] }),
  })
}
