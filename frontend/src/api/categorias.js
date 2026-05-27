import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

const KEY = ['categorias']

export const useCategorias = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => api.get('/categorias').then(r => r.data),
    staleTime: 60_000,
  })

export const useCreateCategoria = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/categorias', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useUpdateCategoria = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/categorias/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useDeleteCategoria = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/categorias/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useCreateSubcategoria = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ categoriaId, data }) =>
      api.post(`/categorias/${categoriaId}/subcategorias`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useUpdateSubcategoria = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) =>
      api.put(`/categorias/subcategorias/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useDeleteSubcategoria = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/categorias/subcategorias/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
