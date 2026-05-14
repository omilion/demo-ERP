import { useQuery } from '@tanstack/react-query'
import api from './client'

export const useOrdenesCompra = (params = {}) =>
  useQuery({
    queryKey: ['ordenes-compra', params],
    queryFn: () => api.get('/ordenes-compra', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useOrdenCompra = (id) =>
  useQuery({
    queryKey: ['ordenes-compra', id],
    queryFn: () => api.get(`/ordenes-compra/${id}`).then(r => r.data),
    enabled: !!id,
  })
