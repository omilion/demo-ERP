import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useNotasInternas = (ordenId) => useQuery({
  queryKey: ['notas-internas', Number(ordenId)],
  queryFn: () => api.get('/notas-internas', { params: { ordenId } }).then(response => response.data),
  enabled: !!ordenId,
})

export const useCrearNotaInterna = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: data => api.post('/notas-internas', data).then(response => response.data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notas-internas', Number(variables.ordenId)] })
      queryClient.invalidateQueries({ queryKey: ['ventas', Number(variables.ordenId)] })
      queryClient.invalidateQueries({ queryKey: ['ventas'] })
      queryClient.invalidateQueries({ queryKey: ['productos'] })
    },
  })
}

export const useAnularNotaInterna = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }) => api.post(`/notas-internas/${id}/anular`, { motivo }).then(response => response.data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notas-internas'] })
      queryClient.invalidateQueries({ queryKey: ['ventas'] })
      queryClient.invalidateQueries({ queryKey: ['productos'] })
      if (variables.ordenId) queryClient.invalidateQueries({ queryKey: ['ventas', Number(variables.ordenId)] })
    },
  })
}
