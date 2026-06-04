import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useProductos = (params = {}) =>
  useQuery({
    queryKey: ['productos', params],
    queryFn: () => api.get('/productos', { params }).then(r => r.data),
    staleTime: 30_000,
    placeholderData: { items: [], total: 0, limit: 500, stats: { total: 0, critico: 0, sinStock: 0, valorInventario: 0 } },
  })

export const useProducto = (id) =>
  useQuery({
    queryKey: ['productos', id],
    queryFn: () => api.get(`/productos/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateProducto = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/productos', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  })
}

export const useUpdateProducto = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/productos/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  })
}

export const useDeleteProducto = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/productos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  })
}

export const useHistorialPrecios = (productoId) =>
  useQuery({
    queryKey: ['historial-precios', productoId],
    queryFn: () => api.get(`/productos/${productoId}/historial-precios`).then(r => r.data),
    enabled: !!productoId,
  })

export const useAddPrecio = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productoId, data }) =>
      api.post(`/productos/${productoId}/historial-precios`, data).then(r => r.data),
    onSuccess: (_, { productoId }) =>
      qc.invalidateQueries({ queryKey: ['historial-precios', productoId] }),
  })
}

export const useMovimientos = (productoId) =>
  useQuery({
    queryKey: ['movimientos', productoId],
    queryFn: () => api.get(`/productos/${productoId}/movimientos`).then(r => r.data),
    enabled: !!productoId,
  })

export const useAddMovimiento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productoId, tipo, cantidad, motivo }) =>
      api.post(`/productos/${productoId}/movimientos`, { tipo, cantidad, motivo }).then(r => r.data),
    onSuccess: (_, { productoId }) => {
      qc.invalidateQueries({ queryKey: ['movimientos', productoId] })
      qc.invalidateQueries({ queryKey: ['productos'] })
    },
  })
}

export const useUploadProductoImagen = () =>
  useMutation({
    mutationFn: ({ dataUrl, size = 'chica' }) =>
      api.post('/productos/upload-imagen', { data: dataUrl, size }).then(r => r.data),
  })
