import { useQuery } from '@tanstack/react-query'
import api from './client'

export const useSucursales = () =>
  useQuery({
    queryKey: ['sucursales'],
    queryFn: () => api.get('/locations/sucursales').then(r => r.data),
    staleTime: 120_000,
  })
