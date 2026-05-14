import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useOdts = (params = {}) =>
  useQuery({
    queryKey: ['odts', params],
    queryFn: () => api.get('/odts', { params }).then(r => r.data),
    staleTime: 30_000,
    placeholderData: { items: [], total: 0, limit: 100 },
  })

export const useOdt = (id) =>
  useQuery({
    queryKey: ['odts', id],
    queryFn: () => api.get(`/odts/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateOdt = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/odts', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['odts'] }),
  })
}

export const useUpdateOdt = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/odts/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['odts'] }),
  })
}

export const useOdtEstado = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, estado }) => api.put(`/odts/${id}`, { estado }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['odts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export const useAddBitacora = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ odtId, texto }) => api.post(`/odts/${odtId}/bitacora`, { texto }).then(r => r.data),
    onSuccess: (_, { odtId }) => qc.invalidateQueries({ queryKey: ['odts', odtId] }),
  })
}

export const useDeleteBitacora = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ odtId, entryId }) => api.delete(`/odts/${odtId}/bitacora/${entryId}`),
    onSuccess: (_, { odtId }) => qc.invalidateQueries({ queryKey: ['odts', odtId] }),
  })
}
