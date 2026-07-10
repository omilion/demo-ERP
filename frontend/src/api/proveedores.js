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

export const useProveedorProductos = (id, params = {}) =>
  useQuery({
    queryKey: ['proveedores', id, 'productos', params],
    queryFn: () => api.get(`/proveedores/${id}/productos`, { params }).then(r => r.data),
    enabled: !!id,
    placeholderData: prev => prev,
    staleTime: 120_000,
  })

export const useCreateProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/proveedores', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedores'] }),
  })
}

export const useUpdateProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/proveedores/${id}`, data).then(r => r.data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      qc.invalidateQueries({ queryKey: ['proveedores', id] })
    },
  })
}

export const useDeleteProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/proveedores/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedores'] }),
  })
}

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
