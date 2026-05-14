import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useProveedores = (params = {}) =>
  useQuery({
    queryKey: ['proveedores', params],
    queryFn: () => api.get('/proveedores', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100 },
    staleTime: 120_000,
  })

export const useProveedor = (id) =>
  useQuery({
    queryKey: ['proveedores', id],
    queryFn: () => api.get(`/proveedores/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreatePagoProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ proveedorId, ...data }) => api.post(`/proveedores/${proveedorId}/pagos`, data).then(r => r.data),
    onSuccess: (_, { proveedorId }) => qc.invalidateQueries({ queryKey: ['proveedores', proveedorId] }),
  })
}

export const useUpdatePagoProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ proveedorId, pagoId, ...data }) => api.put(`/proveedores/${proveedorId}/pagos/${pagoId}`, data).then(r => r.data),
    onSuccess: (_, { proveedorId }) => qc.invalidateQueries({ queryKey: ['proveedores', proveedorId] }),
  })
}

export const useDeletePagoProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ proveedorId, pagoId }) => api.delete(`/proveedores/${proveedorId}/pagos/${pagoId}`),
    onSuccess: (_, { proveedorId }) => qc.invalidateQueries({ queryKey: ['proveedores', proveedorId] }),
  })
}
