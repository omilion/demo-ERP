import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

const cleanParams = (params = {}) => Object.fromEntries(
  Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
)

export const useDespachos = (params = {}) => {
  const queryParams = cleanParams(params)
  return useQuery({
    queryKey: ['despachos', queryParams],
    queryFn: () => api.get('/despachos', { params: queryParams }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100 },
    staleTime: 60_000,
  })
}

export const useDespachoMatriz = (params = {}) => {
  const queryParams = cleanParams(params)
  return useQuery({
    queryKey: ['despachos', 'matriz', queryParams],
    queryFn: () => api.get('/despachos/matriz', { params: queryParams }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100, stats: {} },
    staleTime: 60_000,
  })
}

export const useDespacho = (id) =>
  useQuery({
    queryKey: ['despachos', id],
    queryFn: () => api.get(`/despachos/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateDespacho = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/despachos', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['despachos'] }),
  })
}

export const useUpdateDespacho = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/despachos/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['despachos'] }),
  })
}

export const useDeleteDespacho = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload) => {
      const id = typeof payload === 'object' ? payload.id : payload
      const motivo = typeof payload === 'object' ? payload.motivo : undefined
      return api.delete(`/despachos/${id}`, { data: { motivo } }).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['despachos'] }),
  })
}

export const useGuias = (params = {}) => {
  const queryParams = cleanParams(params)
  return useQuery({
    queryKey: ['guias', queryParams],
    queryFn: () => api.get('/despachos/guias/list', { params: queryParams }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100 },
    staleTime: 60_000,
  })
}

export const useCreateGuia = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/despachos/guias', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guias'] })
      qc.invalidateQueries({ queryKey: ['despachos'] })
    },
  })
}

export const useUpdateGuia = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/despachos/guias/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guias'] })
      qc.invalidateQueries({ queryKey: ['despachos'] })
    },
  })
}

export const useDeleteGuia = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload) => {
      const id = typeof payload === 'object' ? payload.id : payload
      const motivo = typeof payload === 'object' ? payload.motivo : undefined
      return api.delete(`/despachos/guias/${id}`, { data: { motivo } }).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guias'] })
      qc.invalidateQueries({ queryKey: ['despachos'] })
    },
  })
}
