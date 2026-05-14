import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useBitacoraTaller = (params = {}) =>
  useQuery({
    queryKey: ['bitacora-taller', params],
    queryFn: () => api.get('/bitacora-taller', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100 },
    staleTime: 60_000,
  })

export const useCreateBitacora = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/bitacora-taller', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bitacora-taller'] }),
  })
}

export const useUpdateBitacora = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/bitacora-taller/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bitacora-taller'] }),
  })
}

export const useDeleteBitacora = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/bitacora-taller/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bitacora-taller'] }),
  })
}
