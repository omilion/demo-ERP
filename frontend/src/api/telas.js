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
