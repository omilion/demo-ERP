import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useHistorialMateriales = (params = {}) =>
  useQuery({
    queryKey: ['historial-materiales', params],
    queryFn: () => api.get('/historial-materiales', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100, totalEgreso: 0, totalIngreso: 0 },
    staleTime: 60_000,
  })

export const useCreateHistorialMaterial = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/historial-materiales', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['historial-materiales'] }),
  })
}

export const useDeleteHistorialMaterial = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/historial-materiales/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['historial-materiales'] }),
  })
}
