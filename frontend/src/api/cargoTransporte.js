import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

const K = ['cargo-transporte']

export const useCargosTransporte = () =>
  useQuery({ queryKey: K, queryFn: () => api.get('/cargo-transporte').then(r => r.data), staleTime: 300_000 })

export const useCreateCargoTransporte = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/cargo-transporte', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: K }),
  })
}

export const useUpdateCargoTransporte = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/cargo-transporte/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: K }),
  })
}

export const useDeleteCargoTransporte = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/cargo-transporte/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: K }),
  })
}
