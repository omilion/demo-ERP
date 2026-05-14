import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

export const useUpdatePagoProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/pagos-proveedores/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['pagos-proveedores'] })
      qc.invalidateQueries({ queryKey: ['pagos-proveedores', vars.id] })
    },
  })
}
