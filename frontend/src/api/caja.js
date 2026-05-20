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

export const useCajaHistorico = (params = {}) =>
  useQuery({
    queryKey: ['caja', 'historico', params],
    queryFn: () => api.get('/caja/historico', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100, stats: { totalIngresos: 0, totalEgresos: 0 } },
    staleTime: 60_000,
  })

export const useCajaHistoricoYears = () =>
  useQuery({
    queryKey: ['caja', 'historico-years'],
    queryFn: () => api.get('/caja/historico/years').then(r => r.data),
    staleTime: 300_000,
  })

export const useCreateMovimiento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ turnoId, data }) =>
      api.post(`/caja/turno/${turnoId}/movimientos`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja'] }),
  })
}

export const useRegistrarPagoCobranza = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ordenId, data }) =>
      api.post(`/caja/cobranza/orden/${ordenId}/pago`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja'] })
      qc.invalidateQueries({ queryKey: ['ventas'] })
    },
  })
}

export const useDeleteMovimiento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/caja/movimientos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja'] }),
  })
}

export const useGastos = () =>
  useQuery({
    queryKey: ['gastos'],
    queryFn: () => api.get('/gastos').then(r => r.data),
    staleTime: 300_000,
  })

export const useCierreTurno = (turnoId) =>
  useQuery({
    queryKey: ['caja', 'cierre', turnoId],
    queryFn: () => api.get(`/caja/turno/${turnoId}/cierre`).then(r => r.data),
    enabled: !!turnoId,
  })
