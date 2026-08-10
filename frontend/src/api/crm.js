import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useCrm = (params = {}) =>
  useQuery({
    queryKey: ['crm', params],
    queryFn: () => api.get('/crm', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 500 },
    staleTime: 60_000,
  })

export const useCrmEjecutivas = () =>
  useQuery({
    queryKey: ['crm', 'ejecutivas'],
    queryFn: () => api.get('/crm/ejecutivas').then(r => r.data),
    staleTime: 300_000,
  })

export const useCrmPatch = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/crm/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm'] }),
  })
}

export const useCrmCreate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: data => api.post('/crm', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm'] }),
  })
}

export const useCrmAsignarPendientes = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/crm/asignar-pendientes').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm'] }),
  })
}

export const useCrmOrdenLink = (id, enabled) =>
  useQuery({
    queryKey: ['crm', 'orden-link', id],
    queryFn: () => api.get(`/crm/${id}/orden`).then(r => r.data),
    enabled: !!id && enabled,
    staleTime: 60_000,
  })

export const useCrmConvertirCliente = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/crm/${id}/convertir-cliente`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['crm'] })
    },
  })
}

export const useCrmPendientesHoy = () =>
  useQuery({
    queryKey: ['crm', 'pendientes-hoy'],
    queryFn: () => api.get('/crm/pendientes-hoy').then(r => r.data),
    staleTime: 30_000,
  })

export const useCrmMetricas = (params = {}) =>
  useQuery({
    queryKey: ['crm', 'metricas', params],
    queryFn: () => api.get('/crm/metricas', { params }).then(r => r.data),
    staleTime: 60_000,
  })
