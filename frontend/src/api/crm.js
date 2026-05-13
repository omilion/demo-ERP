import { useQuery } from '@tanstack/react-query'
import api from './client'

export const useCrm = (params = {}) =>
  useQuery({
    queryKey: ['crm', params],
    queryFn: () => api.get('/crm', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100 },
    staleTime: 60_000,
  })

export const useCrmEjecutivas = () =>
  useQuery({
    queryKey: ['crm', 'ejecutivas'],
    queryFn: () => api.get('/crm/ejecutivas').then(r => r.data),
    staleTime: 300_000,
  })
