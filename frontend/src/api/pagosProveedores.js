import { useQuery } from '@tanstack/react-query'
import api from './client'

export const usePagosProveedores = (params = {}) =>
  useQuery({
    queryKey: ['pagos-proveedores', params],
    queryFn: () => api.get('/pagos-proveedores', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const usePagoProveedor = (id) =>
  useQuery({
    queryKey: ['pagos-proveedores', id],
    queryFn: () => api.get(`/pagos-proveedores/${id}`).then(r => r.data),
    enabled: !!id,
  })
