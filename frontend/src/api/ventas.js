import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useVentas = (params = {}) =>
  useQuery({
    queryKey: ['ventas', params],
    queryFn: () => api.get('/ventas', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useVenta = (id) =>
  useQuery({
    queryKey: ['ventas', id],
    queryFn: () => api.get(`/ventas/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateVenta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/ventas', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas'] }),
  })
}

export const useUpdateVenta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/ventas/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['matriz-ventas'] })
    },
  })
}

export const useDeleteVenta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/ventas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['matriz-ventas'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export const useAnularVenta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/ventas/${id}/anular`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['matriz-ventas'] })
    },
  })
}

export const useActivarVenta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/ventas/${id}/activar`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['matriz-ventas'] })
    },
  })
}

export const useVentaCargos = (ordenId) =>
  useQuery({
    queryKey: ['ventas', ordenId, 'cargos'],
    queryFn: () => api.get(`/ventas/${ordenId}/cargos`).then(r => r.data),
    enabled: !!ordenId,
  })

export const useAddCargo = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ordenId, nombre, valor }) => api.post(`/ventas/${ordenId}/cargos`, { nombre, valor }).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['ventas', vars.ordenId, 'cargos'] })
      qc.invalidateQueries({ queryKey: ['matriz-ventas'] })
    },
  })
}

export const useDeleteCargo = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cargoId }) => api.delete(`/ventas/cargos/${cargoId}`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['ventas', vars.ordenId, 'cargos'] })
      qc.invalidateQueries({ queryKey: ['matriz-ventas'] })
    },
  })
}

export const useUpdateItemEntregados = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, nEntregados }) => api.put(`/ventas/items/${itemId}/entregados`, { nEntregados }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['matriz-ventas'] })
    },
  })
}
