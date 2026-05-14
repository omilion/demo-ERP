import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useTelas = (params = {}) =>
  useQuery({
    queryKey: ['telas', params],
    queryFn: () => api.get('/telas', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useTela = (id) =>
  useQuery({
    queryKey: ['telas', id],
    queryFn: () => api.get(`/telas/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateTela = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/telas', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telas'] }),
  })
}

export const useUpdateTela = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/telas/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['telas'] })
      qc.invalidateQueries({ queryKey: ['telas', vars.id] })
    },
  })
}

export const useDeleteTela = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/telas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telas'] }),
  })
}

export const useCreateTelaMovimiento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.post(`/telas/${id}/movimientos`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['telas'] })
      qc.invalidateQueries({ queryKey: ['telas', vars.id] })
    },
  })
}
