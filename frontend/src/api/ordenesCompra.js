import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

export const useUpdateOrdenCompra = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/ordenes-compra/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra'] })
      qc.invalidateQueries({ queryKey: ['ordenes-compra', vars.id] })
    },
  })
}

export const useUpdateOrdenCompraItems = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, items }) => api.put(`/ordenes-compra/${id}/items`, { items }).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra'] })
      qc.invalidateQueries({ queryKey: ['ordenes-compra', vars.id] })
      qc.invalidateQueries({ queryKey: ['crm'] })
    },
  })
}

export const useProcesarOrdenCompraVenta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.post(`/ordenes-compra/${id}/procesar-venta`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra'] })
      qc.invalidateQueries({ queryKey: ['ordenes-compra', vars.id] })
      qc.invalidateQueries({ queryKey: ['ventas'] })
    },
  })
}

export const useDeleteOrdenCompra = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/ordenes-compra/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ordenes-compra'] }),
  })
}

export const ordenesCompraExportUrl = () => '/ordenes-compra/export'
