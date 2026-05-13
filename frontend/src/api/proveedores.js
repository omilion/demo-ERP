import { useQuery } from '@tanstack/react-query'
import api from './client'

export const useProveedores = (params = {}) =>
  useQuery({
    queryKey: ['proveedores', params],
    queryFn: () => api.get('/proveedores', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100 },
    staleTime: 120_000,
  })
