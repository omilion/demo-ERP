import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useTurnoActivo = () =>
  useQuery({
    queryKey: ['caja', 'turno-activo'],
    queryFn: () => api.get('/caja/turno').then(r => r.data),
    staleTime: 10_000,
  })

export const useAbrirTurno = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/caja/turno', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja'] }),
  })
}

export const useCerrarTurno = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/caja/turno/${id}/cerrar`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja'] }),
  })
}

export const useCreateMovimiento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ turnoId, data }) =>
      api.post(`/caja/turno/${turnoId}/movimientos`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja'] }),
  })
}
