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
    mutationFn: ({ productoId, tipo, cantidad, motivo, motivoCategoria }) =>
      api.post(`/productos/${productoId}/movimientos`, { tipo, cantidad, motivo, motivoCategoria }).then(r => r.data),
    onSuccess: (_, { productoId }) => {
      qc.invalidateQueries({ queryKey: ['movimientos', productoId] })
      qc.invalidateQueries({ queryKey: ['productos'] })
    },
  })
}

export const useProductoProveedores = (productoId) =>
  useQuery({
    queryKey: ['producto-proveedores', productoId],
    queryFn: () => api.get(`/productos/${productoId}/proveedores`).then(r => r.data),
    enabled: !!productoId,
  })

export const useUpsertProductoProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productoId, proveedorId, costo, cantidad, codigoProveedor }) =>
      api.post(`/productos/${productoId}/proveedores`, { proveedorId, costo, cantidad, codigoProveedor }).then(r => r.data),
    onSuccess: (_, { productoId }) => {
      qc.invalidateQueries({ queryKey: ['producto-proveedores', productoId] })
      qc.invalidateQueries({ queryKey: ['productos'] })
    },
  })
}

// Cruce de codigos: dado el codigo que trae la factura del proveedor,
// resuelve el producto real ya sea por mapeo guardado o por coincidencia
// directa de codigoInterno. Se dispara a demanda (blur del campo), no en
// cada tecla — mutation en vez de useQuery por diseño.
export const useResolverCodigoProveedor = () =>
  useMutation({
    mutationFn: ({ proveedorId, codigo }) =>
      api.get('/productos/mapeo-proveedor', { params: { proveedorId, codigo } }).then(r => r.data),
  })

export const useAutocompleteProductos = () =>
  useMutation({
    mutationFn: (q) => api.get('/productos/autocomplete', { params: { q } }).then(r => r.data),
  })

export const useUpdateProductoProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productoId, proveedorId, costo, cantidad }) =>
      api.put(`/productos/${productoId}/proveedores/${proveedorId}`, { costo, cantidad }).then(r => r.data),
    onSuccess: (_, { productoId }) => {
      qc.invalidateQueries({ queryKey: ['producto-proveedores', productoId] })
      qc.invalidateQueries({ queryKey: ['productos'] })
    },
  })
}

export const useDeleteProductoProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productoId, proveedorId }) =>
      api.delete(`/productos/${productoId}/proveedores/${proveedorId}`).then(r => r.data),
    onSuccess: (_, { productoId }) => {
      qc.invalidateQueries({ queryKey: ['producto-proveedores', productoId] })
      qc.invalidateQueries({ queryKey: ['productos'] })
    },
  })
}

export const useUploadProductoImagen = () =>
  useMutation({
    mutationFn: ({ dataUrl, size = 'chica' }) =>
      api.post('/productos/upload-imagen', { data: dataUrl, size }).then(r => r.data),
  })
