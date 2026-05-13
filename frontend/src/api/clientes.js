import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useClientes = (params = {}) =>
  useQuery({
    queryKey: ['clientes', params],
    queryFn: () => api.get('/clientes', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useCliente = (id) =>
  useQuery({
    queryKey: ['clientes', id],
    queryFn: () => api.get(`/clientes/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateCliente = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/clientes', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  })
}

export const useUpdateCliente = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/clientes/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  })
}
