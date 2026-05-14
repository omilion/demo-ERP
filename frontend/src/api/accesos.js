import { useQuery } from '@tanstack/react-query'
import api from './client'

export const useAccesos = (params = {}) =>
  useQuery({
    queryKey: ['accesos', params],
    queryFn: () => api.get('/accesos', { params }).then(r => r.data),
    staleTime: 30_000,
  })
