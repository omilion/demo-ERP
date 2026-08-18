import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useSugerenciasOC = (params = {}, options = {}) =>
  useQuery({
    queryKey: ['sugerencias-oc', params],
    queryFn: () => api.get('/ordenes-compra-proveedores/sugerencias', { params }).then(r => r.data),
    placeholderData: { items: [], kpis: {} },
    staleTime: 30_000,
    ...options,
  })

export const useOrdenesCompraProveedores = (params = {}) =>
  useQuery({
    queryKey: ['ordenes-compra-proveedores', params],
    queryFn: () => api.get('/ordenes-compra-proveedores', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 20, kpis: {} },
    staleTime: 30_000,
  })

export const useOrdenCompraProveedor = (id) =>
  useQuery({
    queryKey: ['ordenes-compra-proveedores', id],
    queryFn: () => api.get(`/ordenes-compra-proveedores/${id}`).then(r => r.data),
    enabled: Boolean(id),
    staleTime: 30_000,
  })

export const useCreateOCProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/ordenes-compra-proveedores', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra-proveedores'] })
      qc.invalidateQueries({ queryKey: ['sugerencias-oc'] })
    },
  })
}

export const useUpdateOCProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/ordenes-compra-proveedores/${id}`, data).then(r => r.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra-proveedores'] })
      qc.invalidateQueries({ queryKey: ['ordenes-compra-proveedores', variables.id] })
    },
  })
}

export const useAprobarOCProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/ordenes-compra-proveedores/${id}/aprobar`).then(r => r.data),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra-proveedores'] })
      qc.invalidateQueries({ queryKey: ['ordenes-compra-proveedores', id] })
    },
  })
}

export const useRechazarOCProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivoRechazo }) => api.post(`/ordenes-compra-proveedores/${id}/rechazar`, { motivoRechazo }).then(r => r.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra-proveedores'] })
      qc.invalidateQueries({ queryKey: ['ordenes-compra-proveedores', variables.id] })
    },
  })
}

export const useEnviarOCProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/ordenes-compra-proveedores/${id}/enviar`).then(r => r.data),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra-proveedores'] })
      qc.invalidateQueries({ queryKey: ['ordenes-compra-proveedores', id] })
    },
  })
}

export const useRecepcionarOCProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, cantidadesRecibidas = {} }) => api.post(`/ordenes-compra-proveedores/${id}/recepcionar`, { cantidadesRecibidas }).then(r => r.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra-proveedores'] })
      qc.invalidateQueries({ queryKey: ['ordenes-compra-proveedores', variables.id] })
      qc.invalidateQueries({ queryKey: ['productos'] })
    },
  })
}
