import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

const K = ['gastos']

export const useGastos = () =>
  useQuery({ queryKey: K, queryFn: () => api.get('/gastos').then(r => r.data), staleTime: 300_000 })

export const useCreateGasto = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/gastos', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: K }),
  })
}

export const useUpdateGasto = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/gastos/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: K }),
  })
}

export const useDeleteGasto = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/gastos/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: K }),
  })
}
