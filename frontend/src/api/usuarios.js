import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useUsuarios = () =>
  useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/usuarios').then(r => r.data),
    staleTime: 30_000,
  })

export const useUsuario = (id) =>
  useQuery({
    queryKey: ['usuarios', id],
    queryFn: () => api.get(`/usuarios/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateUsuario = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/usuarios', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  })
}

export const useUpdateUsuario = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/usuarios/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  })
}

export const useUpdatePermisos = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, permisosExtra }) => api.put(`/usuarios/${id}/permisos`, { permisosExtra }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  })
}

export const useDeleteUsuario = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/usuarios/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  })
}
