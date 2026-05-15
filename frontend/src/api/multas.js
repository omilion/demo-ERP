import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useMultas = (params = {}) =>
  useQuery({
    queryKey: ['multas', params],
    queryFn: () => api.get('/multas', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useCreateMulta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/multas', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['multas'] }),
  })
}

export const useUpdateMulta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/multas/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['multas'] }),
  })
}

export const useDeleteMulta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/multas/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['multas'] }),
  })
}
