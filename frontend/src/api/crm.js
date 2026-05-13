import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useCrm = (params = {}) =>
  useQuery({
    queryKey: ['crm', params],
    queryFn: () => api.get('/crm', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 500 },
    staleTime: 60_000,
  })

export const useCrmEjecutivas = () =>
  useQuery({
    queryKey: ['crm', 'ejecutivas'],
    queryFn: () => api.get('/crm/ejecutivas').then(r => r.data),
    staleTime: 300_000,
  })

export const useCrmPatch = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/crm/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm'] }),
  })
}
