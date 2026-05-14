import { useQuery } from '@tanstack/react-query'
import api from './client'

export const useMatrizVentas = (params = {}) =>
  useQuery({
    queryKey: ['matriz-ventas', params],
    queryFn: () => api.get('/matriz-ventas', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100, totalMonto: 0 },
    staleTime: 60_000,
  })

export const useMatrizTotales = (params = {}) =>
  useQuery({
    queryKey: ['matriz-ventas', 'totales', params],
    queryFn: () => api.get('/matriz-ventas/totales', { params }).then(r => r.data),
    staleTime: 60_000,
  })
