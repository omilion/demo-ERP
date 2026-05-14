import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useTalleres = () =>
  useQuery({
    queryKey: ['talleres'],
    queryFn: () => api.get('/pasar-taller/talleres').then(r => r.data),
    staleTime: 300_000,
  })

export const useEnviarTaller = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/pasar-taller/enviar', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['odts'] })
    },
  })
}

export const useCreateTaller = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/pasar-taller/talleres', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['talleres'] }),
  })
}
