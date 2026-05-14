import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useEmpresa = () =>
  useQuery({
    queryKey: ['config', 'empresa'],
    queryFn: () => api.get('/config/empresa').then(r => r.data),
    staleTime: 60_000,
  })

export const useUpdateEmpresa = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.put('/config/empresa', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'empresa'] }),
  })
}

export const useFirmas = () =>
  useQuery({
    queryKey: ['config', 'firmas'],
    queryFn: () => api.get('/config/firmas').then(r => r.data),
    staleTime: 60_000,
  })

export const useCreateFirma = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/config/firmas', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'firmas'] }),
  })
}

export const useUpdateFirma = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/config/firmas/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'firmas'] }),
  })
}

export const useDeleteFirma = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/config/firmas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'firmas'] }),
  })
}

export const useBloqueos = () =>
  useQuery({
    queryKey: ['config', 'bloqueos'],
    queryFn: () => api.get('/config/bloqueos').then(r => r.data),
    staleTime: 60_000,
  })

export const useUpdateBloqueo = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ modulo, ...data }) => api.put(`/config/bloqueos/${modulo}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'bloqueos'] }),
  })
}
