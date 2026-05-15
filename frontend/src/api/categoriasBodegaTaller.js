import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

const KEY = ['categorias-bodega-taller']

export const useCategoriasBodegaTaller = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => api.get('/categorias-bodega-taller').then(r => r.data),
    staleTime: 60_000,
  })

export const useCreateCategoriaBT = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/categorias-bodega-taller', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useUpdateCategoriaBT = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/categorias-bodega-taller/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useDeleteCategoriaBT = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/categorias-bodega-taller/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useCreateSubcategoriaBT = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ categoriaId, data }) =>
      api.post(`/categorias-bodega-taller/${categoriaId}/subcategorias`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useUpdateSubcategoriaBT = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) =>
      api.put(`/categorias-bodega-taller/subcategorias/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useDeleteSubcategoriaBT = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/categorias-bodega-taller/subcategorias/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
