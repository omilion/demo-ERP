import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useUbicaciones = () =>
  useQuery({
    queryKey: ['ubicaciones'],
    queryFn: () => api.get('/ubicaciones').then(r => r.data),
    placeholderData: { items: [] },
    staleTime: 120_000,
  })

export const useCreateUbicacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/ubicaciones', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ubicaciones'] }),
  })
}
