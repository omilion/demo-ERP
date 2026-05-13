import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useVentas = (params = {}) =>
  useQuery({
    queryKey: ['ventas', params],
    queryFn: () => api.get('/ventas', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useVenta = (id) =>
  useQuery({
    queryKey: ['ventas', id],
    queryFn: () => api.get(`/ventas/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateVenta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/ventas', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas'] }),
  })
}

export const useUpdateVenta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/ventas/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas'] }),
  })
}
